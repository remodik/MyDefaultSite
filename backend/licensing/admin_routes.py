"""Admin API for the licensing subsystem (JWT admin auth, separate from keys).

Covers projects & files, clients & licenses, per-license module overrides,
access logs, security events, and a small dashboard. Also serves the
self-contained admin panel HTML at ``GET /licensing/admin``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from licensing import crypto
from licensing.deps import get_current_admin
from licensing.models import (
    LicAccessLog,
    LicClient,
    LicLicense,
    LicModuleOverride,
    LicProject,
    LicProjectFile,
    LicSecurityFlag,
)
from licensing.runtime import runtime
from licensing.schemas import (
    ClientCreate,
    ClientUpdate,
    LicenseCreate,
    LicenseExtend,
    LicenseStatusUpdate,
    ModuleOverrideUpdate,
    ProjectCreate,
    ProjectFileToggle,
    ProjectFilesUpload,
    ProjectUpdate,
    SecurityFlagResolve,
    dt_iso,
)
from licensing.security import monitor

admin_router = APIRouter(
    prefix="/api/v1/licensing/admin",
    tags=["licensing-admin"],
    dependencies=[Depends(get_current_admin)],
)

_STATIC_DIR = Path(__file__).resolve().parent / "static"


def _plan_expiry(plan: str, base: datetime | None = None) -> datetime | None:
    base = base or datetime.now()
    if plan == "month":
        return base + timedelta(days=30)
    if plan == "year":
        return base + timedelta(days=365)
    return None  # lifetime


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
def _project_dict(p: LicProject, file_count: int | None = None, active: int | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "description": p.description or "",
        "created_at": dt_iso(p.created_at),
        "file_count": file_count,
        "active_licenses": active,
    }


@admin_router.get("/projects")
async def list_projects(session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    projects = (await session.execute(select(LicProject).order_by(LicProject.created_at.desc()))).scalars().all()
    out: list[dict[str, Any]] = []
    for p in projects:
        fc = await session.scalar(
            select(func.count()).select_from(LicProjectFile).where(LicProjectFile.project_id == p.id)
        )
        ac = await session.scalar(
            select(func.count()).select_from(LicLicense).where(
                LicLicense.project_id == p.id, LicLicense.status == "active"
            )
        )
        out.append(_project_dict(p, fc, ac))
    return out


@admin_router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    exists = await session.scalar(select(LicProject).where(LicProject.slug == body.slug))
    if exists:
        raise HTTPException(status_code=409, detail="A project with this slug already exists")
    project = LicProject(name=body.name, slug=body.slug, description=body.description, created_at=datetime.now())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return _project_dict(project, 0, 0)


@admin_router.get("/projects/{project_id}")
async def get_project(project_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    project = await session.get(LicProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    files = (
        await session.execute(
            select(LicProjectFile)
            .where(LicProjectFile.project_id == project_id)
            .order_by(LicProjectFile.relative_path)
        )
    ).scalars().all()
    data = _project_dict(project, len(files))
    data["files"] = [_file_dict(f) for f in files]
    return data


@admin_router.patch("/projects/{project_id}")
async def update_project(project_id: int, body: ProjectUpdate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    project = await session.get(LicProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    await session.commit()
    return _project_dict(project)


@admin_router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, session: AsyncSession = Depends(get_session)) -> None:
    project = await session.get(LicProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await session.delete(project)
    await session.commit()
    runtime.invalidate_project(project_id)


# --------------------------------------------------------------------------- #
# Project files
# --------------------------------------------------------------------------- #
def _file_dict(f: LicProjectFile, content: str | None = None) -> dict[str, Any]:
    return {
        "id": f.id,
        "project_id": f.project_id,
        "relative_path": f.relative_path,
        "checksum": f.checksum,
        "version": f.version,
        "is_enabled": f.is_enabled,
        "updated_at": dt_iso(f.updated_at),
        "content": content,
    }


@admin_router.post("/projects/{project_id}/files")
async def upload_files(project_id: int, body: ProjectFilesUpload, session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    """Upload (create or replace) one or more files, preserving package paths.

    Re-uploading an existing ``relative_path`` bumps its version.
    """
    project = await session.get(LicProject, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = {
        f.relative_path: f
        for f in (
            await session.execute(select(LicProjectFile).where(LicProjectFile.project_id == project_id))
        ).scalars().all()
    }

    saved: list[LicProjectFile] = []
    for item in body.files:
        checksum = crypto.checksum(item.content)
        enc = crypto.encrypt_at_rest(item.content)
        if item.relative_path in existing:
            f = existing[item.relative_path]
            if f.checksum != checksum:
                f.content_enc = enc
                f.checksum = checksum
                f.version += 1
                f.updated_at = datetime.now()
        else:
            f = LicProjectFile(
                project_id=project_id,
                relative_path=item.relative_path,
                content_enc=enc,
                checksum=checksum,
                version=1,
                is_enabled=True,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(f)
        saved.append(f)

    await session.commit()
    for f in saved:
        await session.refresh(f)
    runtime.invalidate_project(project_id)
    return [_file_dict(f) for f in saved]


@admin_router.get("/files/{file_id}")
async def get_file(file_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Return a single file *with decrypted plaintext* (for the editor)."""
    f = await session.get(LicProjectFile, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return _file_dict(f, content=crypto.decrypt_at_rest(f.content_enc))


@admin_router.patch("/files/{file_id}")
async def toggle_file(file_id: int, body: ProjectFileToggle, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Enable/disable a file globally for the whole project."""
    f = await session.get(LicProjectFile, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    f.is_enabled = body.is_enabled
    await session.commit()
    runtime.invalidate_project(f.project_id)
    return _file_dict(f)


@admin_router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(file_id: int, session: AsyncSession = Depends(get_session)) -> None:
    f = await session.get(LicProjectFile, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    project_id = f.project_id
    await session.delete(f)
    await session.commit()
    runtime.invalidate_project(project_id)


# --------------------------------------------------------------------------- #
# Clients
# --------------------------------------------------------------------------- #
def _client_dict(c: LicClient, license_count: int | None = None) -> dict[str, Any]:
    return {
        "id": c.id,
        "name": c.name,
        "contact": c.contact,
        "created_at": dt_iso(c.created_at),
        "license_count": license_count,
    }


@admin_router.get("/clients")
async def list_clients(session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    clients = (await session.execute(select(LicClient).order_by(LicClient.created_at.desc()))).scalars().all()
    out = []
    for c in clients:
        lc = await session.scalar(
            select(func.count()).select_from(LicLicense).where(LicLicense.client_id == c.id)
        )
        out.append(_client_dict(c, lc))
    return out


@admin_router.post("/clients", status_code=status.HTTP_201_CREATED)
async def create_client(body: ClientCreate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    client = LicClient(name=body.name, contact=body.contact, created_at=datetime.now())
    session.add(client)
    await session.commit()
    await session.refresh(client)
    return _client_dict(client, 0)


@admin_router.patch("/clients/{client_id}")
async def update_client(client_id: int, body: ClientUpdate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    client = await session.get(LicClient, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if body.name is not None:
        client.name = body.name
    if body.contact is not None:
        client.contact = body.contact
    await session.commit()
    return _client_dict(client)


@admin_router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(client_id: int, session: AsyncSession = Depends(get_session)) -> None:
    client = await session.get(LicClient, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await session.delete(client)
    await session.commit()


# --------------------------------------------------------------------------- #
# Licenses
# --------------------------------------------------------------------------- #
async def _license_dict(session: AsyncSession, lic: LicLicense) -> dict[str, Any]:
    client = await session.get(LicClient, lic.client_id)
    project = await session.get(LicProject, lic.project_id)
    return {
        "id": lic.id,
        "client_id": lic.client_id,
        "client_name": client.name if client else None,
        "project_id": lic.project_id,
        "project_slug": project.slug if project else None,
        "key_last4": lic.key_last4,
        "status": lic.status,
        "plan": lic.plan,
        "hardware_fingerprint": lic.hardware_fingerprint,
        "expires_at": dt_iso(lic.expires_at),
        "note": lic.note,
        "created_at": dt_iso(lic.created_at),
    }


@admin_router.get("/licenses")
async def list_licenses(
    session: AsyncSession = Depends(get_session),
    client_id: int | None = Query(None),
    project_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    query = select(LicLicense).order_by(LicLicense.created_at.desc())
    if client_id is not None:
        query = query.where(LicLicense.client_id == client_id)
    if project_id is not None:
        query = query.where(LicLicense.project_id == project_id)
    if status_filter:
        query = query.where(LicLicense.status == status_filter)
    licenses = (await session.execute(query)).scalars().all()
    return [await _license_dict(session, lic) for lic in licenses]


@admin_router.post("/licenses", status_code=status.HTTP_201_CREATED)
async def create_license(body: LicenseCreate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    client = await session.get(LicClient, body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    project = await session.get(LicProject, body.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Generate a unique key (retry on the astronomically-unlikely hash clash).
    for _ in range(10):
        license_key = crypto.generate_license_key()
        key_hash = crypto.hash_license_key(license_key)
        if not await session.scalar(select(LicLicense).where(LicLicense.key_hash == key_hash)):
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate a unique license key")

    lic = LicLicense(
        client_id=body.client_id,
        project_id=body.project_id,
        key_hash=key_hash,
        key_last4=license_key[-4:],
        status="active",
        plan=body.plan,
        hardware_fingerprint=body.hardware_fingerprint,
        expires_at=_plan_expiry(body.plan),
        note=body.note,
        created_at=datetime.now(),
    )
    session.add(lic)
    await session.commit()
    await session.refresh(lic)

    data = await _license_dict(session, lic)
    data["license_key"] = license_key  # shown exactly once
    return data


@admin_router.patch("/licenses/{license_id}/status")
async def update_license_status(license_id: int, body: LicenseStatusUpdate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    lic = await session.get(LicLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.status = body.status
    lic.note = f"manual: {body.status}"
    await session.commit()
    # Any non-active status must not keep serving from a warm cache.
    if body.status in ("suspended", "revoked"):
        runtime.invalidate_license(license_id)
    if body.status == "active":
        monitor.reset(lic.key_hash)  # clear stale anomaly windows on reactivation
    return await _license_dict(session, lic)


@admin_router.patch("/licenses/{license_id}/extend")
async def extend_license(license_id: int, body: LicenseExtend, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    lic = await session.get(LicLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    if body.expires_at is not None:
        try:
            lic.expires_at = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid expires_at") from exc
    elif body.plan is not None:
        base = lic.expires_at if (lic.expires_at and lic.expires_at > datetime.now()) else datetime.now()
        lic.plan = body.plan
        lic.expires_at = _plan_expiry(body.plan, base)
    await session.commit()
    return await _license_dict(session, lic)


@admin_router.delete("/licenses/{license_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_license(license_id: int, session: AsyncSession = Depends(get_session)) -> None:
    lic = await session.get(LicLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    await session.delete(lic)
    await session.commit()
    runtime.invalidate_license(license_id)


# --- per-license module overrides ------------------------------------------ #
@admin_router.get("/licenses/{license_id}/modules")
async def list_license_modules(license_id: int, session: AsyncSession = Depends(get_session)) -> list[dict[str, Any]]:
    lic = await session.get(LicLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    files = (
        await session.execute(
            select(LicProjectFile)
            .where(LicProjectFile.project_id == lic.project_id)
            .order_by(LicProjectFile.relative_path)
        )
    ).scalars().all()
    overrides = {
        o.project_file_id: o.is_enabled
        for o in (
            await session.execute(select(LicModuleOverride).where(LicModuleOverride.license_id == license_id))
        ).scalars().all()
    }
    out = []
    for f in files:
        override = overrides.get(f.id)
        effective = f.is_enabled and (override is not False)
        out.append({
            "project_file_id": f.id,
            "relative_path": f.relative_path,
            "global_enabled": f.is_enabled,
            "override": override,  # None / True / False
            "effective_enabled": effective,
        })
    return out


@admin_router.patch("/licenses/{license_id}/modules")
async def set_license_module(license_id: int, body: ModuleOverrideUpdate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    lic = await session.get(LicLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    f = await session.get(LicProjectFile, body.project_file_id)
    if not f or f.project_id != lic.project_id:
        raise HTTPException(status_code=404, detail="File not found in this project")

    existing = await session.scalar(
        select(LicModuleOverride).where(
            LicModuleOverride.license_id == license_id,
            LicModuleOverride.project_file_id == body.project_file_id,
        )
    )
    if existing:
        existing.is_enabled = body.is_enabled
    else:
        session.add(
            LicModuleOverride(
                license_id=license_id,
                project_file_id=body.project_file_id,
                is_enabled=body.is_enabled,
            )
        )
    await session.commit()
    runtime.invalidate_license(license_id)
    return {"license_id": license_id, "project_file_id": body.project_file_id, "is_enabled": body.is_enabled}


@admin_router.delete("/licenses/{license_id}/modules/{project_file_id}")
async def clear_license_module(license_id: int, project_file_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Remove a per-license override (fall back to the global setting)."""
    await session.execute(
        delete(LicModuleOverride).where(
            LicModuleOverride.license_id == license_id,
            LicModuleOverride.project_file_id == project_file_id,
        )
    )
    await session.commit()
    runtime.invalidate_license(license_id)
    return {"license_id": license_id, "project_file_id": project_file_id, "override": None}


# --------------------------------------------------------------------------- #
# Access logs
# --------------------------------------------------------------------------- #
@admin_router.get("/logs")
async def list_logs(
    session: AsyncSession = Depends(get_session),
    license_id: int | None = Query(None),
    project_id: int | None = Query(None),
    success: bool | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    query = select(LicAccessLog)
    count_q = select(func.count()).select_from(LicAccessLog)

    if license_id is not None:
        query = query.where(LicAccessLog.license_id == license_id)
        count_q = count_q.where(LicAccessLog.license_id == license_id)
    if project_id is not None:
        sub = select(LicLicense.id).where(LicLicense.project_id == project_id)
        query = query.where(LicAccessLog.license_id.in_(sub))
        count_q = count_q.where(LicAccessLog.license_id.in_(sub))
    if success is not None:
        query = query.where(LicAccessLog.success.is_(success))
        count_q = count_q.where(LicAccessLog.success.is_(success))
    for bound, op in ((date_from, ">="), (date_to, "<=")):
        if bound:
            try:
                dt = datetime.fromisoformat(bound.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid date filter") from exc
            cond = LicAccessLog.requested_at >= dt if op == ">=" else LicAccessLog.requested_at <= dt
            query = query.where(cond)
            count_q = count_q.where(cond)

    total = await session.scalar(count_q)
    rows = (
        await session.execute(
            query.order_by(LicAccessLog.requested_at.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()

    return {
        "total": total or 0,
        "items": [
            {
                "id": r.id,
                "license_id": r.license_id,
                "project_file_id": r.project_file_id,
                "attempted_key_last4": r.attempted_key_last4,
                "mode": r.mode,
                "entrypoint": r.entrypoint,
                "requested_at": dt_iso(r.requested_at),
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "hardware_fingerprint": r.hardware_fingerprint,
                "success": r.success,
                "reason": r.reason,
            }
            for r in rows
        ],
    }


# --------------------------------------------------------------------------- #
# Security events
# --------------------------------------------------------------------------- #
@admin_router.get("/security-events")
async def list_security_events(
    session: AsyncSession = Depends(get_session),
    resolved: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    query = select(LicSecurityFlag).order_by(LicSecurityFlag.detected_at.desc()).limit(limit)
    if resolved is not None:
        query = query.where(LicSecurityFlag.resolved.is_(resolved))
    rows = (await session.execute(query)).scalars().all()
    out = []
    for r in rows:
        lic = await session.get(LicLicense, r.license_id)
        out.append({
            "id": r.id,
            "license_id": r.license_id,
            "license_last4": lic.key_last4 if lic else None,
            "flag_type": r.flag_type,
            "detected_at": dt_iso(r.detected_at),
            "details": r.details,
            "auto_action": r.auto_action,
            "resolved": r.resolved,
            "resolution": r.resolution,
            "resolved_at": dt_iso(r.resolved_at),
        })
    return out


@admin_router.patch("/security-events/{flag_id}")
async def resolve_security_event(flag_id: int, body: SecurityFlagResolve, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Confirm (revoke the license) or dismiss (reactivate) a flagged event."""
    flag = await session.get(LicSecurityFlag, flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Security event not found")
    lic = await session.get(LicLicense, flag.license_id)
    if lic:
        if body.resolution == "revoke":
            lic.status = "revoked"
            lic.note = "revoked via security event"
            runtime.invalidate_license(lic.id)
        else:  # dismiss → treat as false positive, reactivate
            lic.status = "active"
            lic.note = "reactivated via security event"
            monitor.reset(lic.key_hash)
    flag.resolved = True
    flag.resolution = body.resolution
    flag.resolved_at = datetime.now()
    await session.commit()
    return {"id": flag.id, "resolved": True, "resolution": body.resolution}


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
@admin_router.get("/dashboard")
async def dashboard(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    # Active licenses per project.
    projects = (await session.execute(select(LicProject))).scalars().all()
    per_project = []
    for p in projects:
        counts: dict[str, int] = {}
        rows = (
            await session.execute(
                select(LicLicense.status, func.count())
                .where(LicLicense.project_id == p.id)
                .group_by(LicLicense.status)
            )
        ).all()
        for stat, cnt in rows:
            counts[stat] = cnt
        per_project.append({
            "project_id": p.id,
            "slug": p.slug,
            "name": p.name,
            "active": counts.get("active", 0),
            "suspended": counts.get("suspended", 0),
            "revoked": counts.get("revoked", 0),
            "unlocked": counts.get("unlocked", 0),
        })

    recent = (
        await session.execute(select(LicAccessLog).order_by(LicAccessLog.requested_at.desc()).limit(20))
    ).scalars().all()

    # Anomaly hints: failing IPs in the last hour, and keys hitting many
    # distinct fingerprints.
    since = datetime.now() - timedelta(hours=1)
    failing_ips = (
        await session.execute(
            select(LicAccessLog.ip_address, func.count())
            .where(LicAccessLog.success.is_(False), LicAccessLog.requested_at >= since)
            .group_by(LicAccessLog.ip_address)
            .having(func.count() >= 5)
            .order_by(func.count().desc())
        )
    ).all()
    multi_fp = (
        await session.execute(
            select(LicAccessLog.license_id, func.count(func.distinct(LicAccessLog.hardware_fingerprint)))
            .where(
                LicAccessLog.requested_at >= since,
                LicAccessLog.license_id.is_not(None),
                LicAccessLog.hardware_fingerprint.is_not(None),
            )
            .group_by(LicAccessLog.license_id)
            .having(func.count(func.distinct(LicAccessLog.hardware_fingerprint)) >= 2)
        )
    ).all()
    open_flags = await session.scalar(
        select(func.count()).select_from(LicSecurityFlag).where(LicSecurityFlag.resolved.is_(False))
    )

    return {
        "projects": per_project,
        "recent_access": [
            {
                "id": r.id,
                "license_id": r.license_id,
                "mode": r.mode,
                "entrypoint": r.entrypoint,
                "requested_at": dt_iso(r.requested_at),
                "ip_address": r.ip_address,
                "success": r.success,
                "reason": r.reason,
            }
            for r in recent
        ],
        "anomalies": {
            "failing_ips": [{"ip": ip, "failures": cnt} for ip, cnt in failing_ips],
            "keys_multi_fingerprint": [{"license_id": lid, "fingerprints": cnt} for lid, cnt in multi_fp],
            "open_security_flags": open_flags or 0,
        },
    }


# --------------------------------------------------------------------------- #
# Admin panel (self-contained HTML)
# --------------------------------------------------------------------------- #
ui_router = APIRouter(tags=["licensing-admin-ui"])


@ui_router.get("/licensing/admin", response_class=HTMLResponse, include_in_schema=False)
async def admin_panel() -> HTMLResponse:
    html_path = _STATIC_DIR / "admin.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Admin panel not built")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
