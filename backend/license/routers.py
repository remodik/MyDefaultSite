from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.license.models import License, LicenseLog
from backend.license.schemas import (
    ActivateRequest,
    ActivateResponse,
    CheckRequest,
    CheckResponse,
    GenerateKeyResponse,
    LicenseListItem,
    LicenseListResponse,
)
from backend.license.utils import (
    dt_to_iso,
    dt_to_ms,
    generate_license_key,
    generate_offline_token,
    sign_response,
)

limiter = Limiter(key_func=get_remote_address)

LICENSE_OFFLINE_DAYS = 30

license_router = APIRouter(prefix="/api", tags=["license"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _log(
    session: AsyncSession,
    event: str,
    hwid: str | None = None,
    key: str | None = None,
    ip: str | None = None,
    details: dict | None = None,
) -> None:
    log = LicenseLog(
        event=event,
        hwid=hwid,
        key=key,
        ip=ip,
        details=json.dumps(details, ensure_ascii=False) if details else None,
        created_at=datetime.now(),
    )
    session.add(log)


def _get_admin_secret() -> str:
    secret = os.getenv("LICENSE_ADMIN_SECRET", "")
    if not secret:
        raise RuntimeError("LICENSE_ADMIN_SECRET не задан")
    return secret


@license_router.post(
    "/activate",
    response_model=ActivateResponse,
    summary="Активация лицензионного ключа",
)
@limiter.limit("5/minute")
async def activate_license(
    request: Request,
    body: ActivateRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    ip = _client_ip(request)

    result = await session.execute(
        select(License).where(License.key == body.code)
    )
    lic = result.scalar_one_or_none()

    if lic is None:
        await _log(session, "activate_fail", body.hwid, body.code, ip,
                   {"reason": "key_not_found"})
        await session.commit()
        payload = {"success": False, "message": "Неверный ключ"}
        return {**payload, "sig": sign_response(payload)}

    if lic.used and lic.hwid != body.hwid:
        await _log(session, "activate_fail", body.hwid, body.code, ip,
                   {"reason": "key_used", "bound_hwid": lic.hwid})
        await session.commit()
        payload = {"success": False, "message": "Ключ уже использован"}
        return {**payload, "sig": sign_response(payload)}

    now = datetime.now()
    expires_at = now + timedelta(days=LICENSE_OFFLINE_DAYS)
    expires_ms = dt_to_ms(expires_at)
    offline_token = generate_offline_token(body.hwid, expires_ms)

    lic.used = True
    lic.hwid = body.hwid
    lic.activated_at = now
    lic.expires_at = expires_at
    lic.offline_token = offline_token

    await _log(session, "activate", body.hwid, body.code, ip)
    await session.commit()

    payload = {
        "success": True,
        "message": "Лицензия активирована",
        "offlineToken": offline_token,
        "expiresAt": expires_ms,
    }
    return {**payload, "sig": sign_response(payload)}


@license_router.post(
    "/check",
    response_model=CheckResponse,
    summary="Онлайн-проверка лицензии по HWID",
)
@limiter.limit("5/minute")
async def check_license(
    request: Request,
    body: CheckRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    ip = _client_ip(request)

    result = await session.execute(
        select(License).where(
            License.hwid == body.hwid,
            License.used.is_(True),
        )
    )
    lic = result.scalar_one_or_none()

    now = datetime.now()
    valid = bool(
        lic
        and lic.expires_at
        and lic.expires_at > now
    )

    if not valid:
        await _log(session, "check_fail", body.hwid, None, ip)
    else:
        await _log(session, "check", body.hwid, lic.key, ip)

    await session.commit()

    payload = {
        "valid": valid,
        "expires_at": dt_to_iso(lic.expires_at) if lic else None,
    }
    return {**payload, "sig": sign_response(payload)}


@license_router.get(
    "/generate_key",
    response_model=GenerateKeyResponse,
    summary="Генерация нового лицензионного ключа",
)
async def generate_key(
    request: Request,
    admin_secret: str = Query(..., alias="admin_secret",
                              description="Секрет администратора"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    expected = _get_admin_secret()
    if admin_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный admin_secret",
        )

    for _ in range(10):
        key = generate_license_key()
        exists = await session.execute(
            select(License).where(License.key == key)
        )
        if not exists.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать уникальный ключ")

    lic = License(key=key, used=False, created_at=datetime.now())
    session.add(lic)
    await session.commit()

    return {"key": key}


@license_router.get(
    "/admin/licenses",
    response_model=LicenseListResponse,
    summary="Список всех ключей (только для администратора)",
)
async def list_licenses(
    request: Request,
    admin_secret: str = Query(..., alias="admin_secret"),
    used: bool | None = Query(None, description="Фильтр: true=использованные, false=свободные"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    expected = _get_admin_secret()
    if admin_secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Неверный admin_secret")

    query = select(License).order_by(License.created_at.desc())
    if used is not None:
        query = query.where(License.used.is_(used))

    result = await session.execute(query)
    licenses = result.scalars().all()

    items = [
        LicenseListItem(
            id=lic.id,
            key=lic.key,
            used=lic.used,
            hwid=lic.hwid,
            activated_at=dt_to_iso(lic.activated_at),
            expires_at=dt_to_iso(lic.expires_at),
            created_at=dt_to_iso(lic.created_at),
        )
        for lic in licenses
    ]

    return {"items": items, "total": len(items)}
