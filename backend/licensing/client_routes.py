"""Public, client-facing endpoints called by the ``licensed_loader`` library.

* ``POST /api/v1/project/fetch``   — Mode A: encrypted project archive.
* ``POST /api/v1/project/execute`` — Mode B: remote execution, result only.
* ``POST /api/v1/project/validate``— lightweight license re-check.

Denials return a **generic** 403 ("Access denied") so an attacker cannot tell
*why* a request failed; the real reason is recorded in ``lic_access_logs``.
Per-IP flooding is capped by slowapi; per-key abuse (scraping, leaked keys,
failure bursts) is handled by :mod:`licensing.security`, which can auto-suspend.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from licensing import crypto, service
from licensing.models import LicLicense, LicProject
from licensing.runtime import (
    EXEC_TIMEOUT_SECONDS,
    EntrypointError,
    ExecutionError,
    ExecutionTimeout,
    ModuleDisabledError,
    runtime,
    signature_for,
)
from licensing.schemas import (
    ExecuteRequest,
    ExecuteResponse,
    FetchRequest,
    FetchResponse,
    ValidateRequest,
    ValidateResponse,
)
from licensing.security import monitor
from licensing import security

client_router = APIRouter(prefix="/api/v1/project", tags=["licensing-client"])

limiter = Limiter(key_func=get_remote_address)

REVALIDATE_AFTER_SECONDS = 15 * 60

# Reasons that count as an authentication/permission failure for the
# repeated-failures auto-suspend heuristic.
_FAILURE_REASONS = {"fingerprint_mismatch", "entrypoint_error", "module_disabled", "bad_payload"}

_GENERIC_DENY = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _authorise(
    session: AsyncSession,
    *,
    license_key: str,
    project_slug: str,
    fingerprint: str | None,
    mode: str,
    request: Request,
    entrypoint: str | None = None,
) -> tuple[LicLicense, LicProject]:
    """Resolve + validate a request, or raise a generic 403 (having logged why).

    On return, ``(license, project)`` are guaranteed valid and matched.
    """
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")
    key_hash = crypto.hash_license_key(license_key)
    last4 = license_key[-4:]

    monitor.record_request(key_hash)

    license_row = await service.resolve_license(session, license_key)
    if license_row is None:
        monitor.record_failure(key_hash)
        await service.log_access(
            session, success=False, reason="key_not_found",
            attempted_key_last4=last4, mode=mode, entrypoint=entrypoint,
            ip_address=ip, user_agent=ua, hardware_fingerprint=fingerprint,
        )
        await session.commit()
        raise _GENERIC_DENY

    project = await service.get_project_by_slug(session, project_slug)
    if project is None or project.id != license_row.project_id:
        await service.log_access(
            session, success=False, reason="project_mismatch",
            license_id=license_row.id, attempted_key_last4=last4, mode=mode,
            entrypoint=entrypoint, ip_address=ip, user_agent=ua,
            hardware_fingerprint=fingerprint,
        )
        await session.commit()
        raise _GENERIC_DENY

    monitor.record_fingerprint(key_hash, fingerprint)

    if monitor.over_rate_limit(key_hash):
        await service.log_access(
            session, success=False, reason="rate_limited",
            license_id=license_row.id, mode=mode, entrypoint=entrypoint,
            ip_address=ip, user_agent=ua, hardware_fingerprint=fingerprint,
        )
        await security.evaluate(session, license_row)
        await session.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests")

    # Anomaly evaluation may flip status to suspended *before* the validity check.
    await security.evaluate(session, license_row)

    reason = service.validity_reason(license_row, now=datetime.now(), fingerprint=fingerprint)
    if reason is not None:
        if reason in _FAILURE_REASONS:
            monitor.record_failure(key_hash)
            await security.evaluate(session, license_row)
        await service.log_access(
            session, success=False, reason=reason,
            license_id=license_row.id, mode=mode, entrypoint=entrypoint,
            ip_address=ip, user_agent=ua, hardware_fingerprint=fingerprint,
        )
        await session.commit()
        raise _GENERIC_DENY

    return license_row, project


@client_router.post("/fetch", response_model=FetchResponse)
@limiter.limit("30/minute")
async def fetch_project(
    request: Request,
    body: FetchRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Mode A: return the license's effective files as one encrypted archive."""
    license_row, project = await _authorise(
        session,
        license_key=body.license_key,
        project_slug=body.project_slug,
        fingerprint=body.hardware_fingerprint,
        mode="local",
        request=request,
    )

    files = await service.get_effective_files(session, license_row)
    sources = service.decrypt_sources(files)
    manifest = json.dumps(
        {"project_slug": project.slug, "files": sources, "generated_at": datetime.now().isoformat()},
        ensure_ascii=False,
    ).encode("utf-8")
    envelope = crypto.encrypt_archive(manifest, body.license_key, project.slug)

    await service.log_access(
        session, success=True, reason="ok", license_id=license_row.id,
        mode="local", ip_address=_client_ip(request),
        user_agent=request.headers.get("User-Agent", ""),
        hardware_fingerprint=body.hardware_fingerprint,
    )
    await session.commit()

    return {
        "project_slug": project.slug,
        "archive": envelope,
        "files": [
            {"relative_path": f.relative_path, "checksum": f.checksum, "version": f.version}
            for f in files
        ],
        "revalidate_after_seconds": REVALIDATE_AFTER_SECONDS,
    }


@client_router.post("/execute", response_model=ExecuteResponse)
@limiter.limit("240/minute")
async def execute_project(
    request: Request,
    body: ExecuteRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Mode B: run ``entrypoint`` server-side and return only the result."""
    license_row, project = await _authorise(
        session,
        license_key=body.license_key,
        project_slug=body.project_slug,
        fingerprint=body.hardware_fingerprint,
        mode="remote",
        request=request,
        entrypoint=body.entrypoint,
    )

    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")
    key_hash = crypto.hash_license_key(body.license_key)

    effective = await service.get_effective_files(session, license_row)
    all_files = await service.get_all_project_files(session, project.id)
    effective_map = service.module_path_map(effective)
    all_map = service.module_path_map(all_files)
    file_by_path = {f.relative_path: f for f in effective}
    sources = service.decrypt_sources(effective)

    compiled = runtime.get_or_build(
        license_row.id, project.id, signature_for(effective), sources, effective_map
    )

    async def _deny(reason: str, code: int = status.HTTP_403_FORBIDDEN, detail: str = "Access denied"):
        if reason in _FAILURE_REASONS:
            monitor.record_failure(key_hash)
            await security.evaluate(session, license_row)
        await service.log_access(
            session, success=False, reason=reason, license_id=license_row.id,
            mode="remote", entrypoint=body.entrypoint, ip_address=ip, user_agent=ua,
            hardware_fingerprint=body.hardware_fingerprint,
        )
        await session.commit()
        raise HTTPException(status_code=code, detail=detail)

    try:
        result = await runtime.call(compiled, body.entrypoint, body.args, all_map, EXEC_TIMEOUT_SECONDS)
    except ModuleDisabledError:
        await _deny("module_disabled")
    except EntrypointError:
        await _deny("entrypoint_error")
    except ExecutionTimeout:
        await _deny("timeout", code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Execution timed out")
    except ExecutionError:
        # A bug in the owner's own code — not a security event. Generic 500.
        await _deny("exec_error", code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Execution failed")
    except TypeError:
        # Bad args (e.g. wrong kwargs) — treat as a bad payload.
        await _deny("bad_payload")

    module_dotted = body.entrypoint.rpartition(".")[0]
    entry_file = file_by_path.get(effective_map.get(module_dotted, ""))
    await service.log_access(
        session, success=True, reason="ok", license_id=license_row.id,
        project_file_id=entry_file.id if entry_file else None,
        mode="remote", entrypoint=body.entrypoint, ip_address=ip, user_agent=ua,
        hardware_fingerprint=body.hardware_fingerprint,
    )
    await session.commit()
    return {"ok": True, "result": result}


@client_router.post("/validate", response_model=ValidateResponse)
@limiter.limit("60/minute")
async def validate_license(
    request: Request,
    body: ValidateRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Lightweight re-check used by the client's periodic revalidation loop.

    Unlike fetch/execute this returns ``valid: false`` instead of raising, so
    the client can tell "server says no" apart from "server unreachable" — but
    it still never says *why*.
    """
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")
    key_hash = crypto.hash_license_key(body.license_key)
    monitor.record_request(key_hash)

    license_row = await service.resolve_license(session, body.license_key)
    project = await service.get_project_by_slug(session, body.project_slug)
    valid = False
    stat: str | None = None
    expires: str | None = None

    if license_row is not None and project is not None and project.id == license_row.project_id:
        monitor.record_fingerprint(key_hash, body.hardware_fingerprint)
        await security.evaluate(session, license_row)
        reason = service.validity_reason(
            license_row, now=datetime.now(), fingerprint=body.hardware_fingerprint
        )
        valid = reason is None
        stat = license_row.status
        expires = license_row.expires_at.isoformat() if license_row.expires_at else None
        await service.log_access(
            session, success=valid, reason="ok" if valid else reason,
            license_id=license_row.id, mode=None, ip_address=ip, user_agent=ua,
            hardware_fingerprint=body.hardware_fingerprint,
        )
    else:
        await service.log_access(
            session, success=False, reason="key_not_found",
            attempted_key_last4=body.license_key[-4:], ip_address=ip, user_agent=ua,
            hardware_fingerprint=body.hardware_fingerprint,
        )

    await session.commit()
    return {
        "valid": valid,
        "status": stat,
        "expires_at": expires,
        "revalidate_after_seconds": REVALIDATE_AFTER_SECONDS,
    }
