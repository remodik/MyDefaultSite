"""Self-service portal for licence holders (the client's own cabinet).

The client signs in with the **license key they already have** — the same
credential their bot uses — and sees the projects tied to them, each with its
status, its price, and (once the owner has confirmed payment and unlocked it)
the sources to browse and download.

Flow, end to end:

1. Owner sets a price on a license      → ``payment_status = "unpaid"``
2. Client pays out of band, presses     → ``payment_status = "pending"``
   "I paid" here                           + webhook alert to the owner
3. Owner verifies the money arrived and  → ``payment_status = "paid"``
   confirms in the admin panel             + ``status = "unlocked"``
4. Client can now read/download the code from this portal.

Unlike the bot-facing API in :mod:`licensing.client_routes`, denials here are
*explanatory* rather than deliberately vague: this is the client's own
cabinet, reached with their own key, so telling them "pay first" is the point.
The anti-enumeration rule still applies — a license belonging to someone else
is reported as 404, never 403.

Note that "paid" is an assertion by the owner, not a payment-gateway fact:
nothing here touches money. Confirming is a manual, human step.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from licensing import crypto, security, service
from licensing.deps import PORTAL_TOKEN_TTL_HOURS, create_portal_token, get_current_portal_client
from licensing.models import LicClient, LicLicense, LicProject, LicProjectFile
from licensing.schemas import (
    PortalLoginRequest,
    PortalPaymentClaim,
    dt_iso,
)

portal_router = APIRouter(prefix="/api/v1/licensing/portal", tags=["licensing-portal"])

limiter = Limiter(key_func=get_remote_address)

_STATIC_DIR = Path(__file__).resolve().parent / "static"

# Only a fully delivered license exposes its sources.
DOWNLOADABLE_STATUSES = ("unlocked",)

_PAYWALL_MESSAGE = (
    "Исходники станут доступны после того, как владелец подтвердит оплату."
)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #
@portal_router.post("/login")
@limiter.limit("10/minute")
async def portal_login(
    request: Request,
    body: PortalLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Exchange a license key for a portal session token.

    Rate-limited per IP: the key is the only credential, so this endpoint is
    the one place where guessing keys would be attempted.
    """
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")

    license_row = await service.resolve_license(session, body.license_key)
    if license_row is None:
        await service.log_access(
            session,
            success=False,
            reason="portal_key_not_found",
            attempted_key_last4=body.license_key[-4:],
            mode="portal",
            ip_address=ip,
            user_agent=ua,
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный лицензионный ключ"
        )

    client = await session.get(LicClient, license_row.client_id)
    if client is None:
        # Orphaned license (client deleted) — nothing sensible to show.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный лицензионный ключ"
        )

    # Any valid key gets in, including a suspended or revoked one: seeing
    # *why* their bot stopped working is exactly what a client comes here for.
    await service.log_access(
        session,
        success=True,
        reason="portal_login",
        license_id=license_row.id,
        mode="portal",
        ip_address=ip,
        user_agent=ua,
    )
    await session.commit()

    return {
        "token": create_portal_token(client.id),
        "client_id": client.id,
        "client_name": client.name,
        "expires_in": PORTAL_TOKEN_TTL_HOURS * 3600,
    }


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
async def _owned_license(
    session: AsyncSession, client: LicClient, license_id: int
) -> LicLicense:
    """Fetch a license, ensuring it belongs to the signed-in client.

    Someone else's license id is reported as *not found*, so the portal can't
    be used to enumerate which licenses exist.
    """
    lic = await session.get(LicLicense, license_id)
    if lic is None or lic.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Лицензия не найдена")
    return lic


def _require_downloadable(lic: LicLicense) -> None:
    if lic.status not in DOWNLOADABLE_STATUSES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_PAYWALL_MESSAGE)


async def _portal_license_dict(session: AsyncSession, lic: LicLicense) -> dict[str, Any]:
    project = await session.get(LicProject, lic.project_id)
    effective = await service.get_effective_files(session, lic)
    return {
        "id": lic.id,
        "project_name": project.name if project else "—",
        "project_slug": project.slug if project else "—",
        "key_last4": lic.key_last4,
        "status": lic.status,
        "plan": lic.plan,
        "expires_at": dt_iso(lic.expires_at),
        "created_at": dt_iso(lic.created_at),
        "price_amount": lic.price_amount,
        "price_currency": lic.price_currency,
        "payment_status": lic.payment_status,
        "payment_instructions": lic.payment_instructions,
        "payment_claimed_at": dt_iso(lic.payment_claimed_at),
        "paid_at": dt_iso(lic.paid_at),
        "can_download": lic.status in DOWNLOADABLE_STATUSES,
        "module_count": len(effective),
    }


# --------------------------------------------------------------------------- #
# Cabinet
# --------------------------------------------------------------------------- #
@portal_router.get("/me")
async def portal_me(
    client: LicClient = Depends(get_current_portal_client),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Everything tied to this client: their projects and each one's state."""
    licenses = (
        await session.execute(
            select(LicLicense)
            .where(LicLicense.client_id == client.id)
            .order_by(LicLicense.created_at.desc())
        )
    ).scalars().all()

    return {
        "client_id": client.id,
        "client_name": client.name,
        "contact": client.contact,
        "licenses": [await _portal_license_dict(session, lic) for lic in licenses],
    }


@portal_router.post("/licenses/{license_id}/claim-payment")
@limiter.limit("10/minute")
async def claim_payment(
    request: Request,
    license_id: int,
    body: PortalPaymentClaim,
    client: LicClient = Depends(get_current_portal_client),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Client reports that they have paid; the owner gets pinged to verify.

    This only moves the license to ``pending``. It grants nothing — the money
    still has to be checked by a human.
    """
    lic = await _owned_license(session, client, license_id)

    if lic.price_amount is None:
        raise HTTPException(status_code=409, detail="Для этой лицензии не назначена цена")
    if lic.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Оплата уже подтверждена")

    already_pending = lic.payment_status == "pending"
    lic.payment_status = "pending"
    lic.payment_claimed_at = datetime.now()
    await session.commit()

    # Only alert on the transition, so a client tapping the button repeatedly
    # cannot flood the webhook.
    if not already_pending:
        project = await session.get(LicProject, lic.project_id)
        note = f"\nКомментарий клиента: {body.note}" if body.note else ""
        await security.send_alert(
            f"💰 Клиент сообщил об оплате\n"
            f"Клиент: **{client.name}** (#{client.id})\n"
            f"Проект: **{project.name if project else '—'}** "
            f"(лицензия #{lic.id}, …{lic.key_last4})\n"
            f"Сумма: **{lic.price_amount} {lic.price_currency}**{note}\n"
            f"Проверьте поступление и подтвердите в админке → Лицензии."
        )

    return await _portal_license_dict(session, lic)


# --------------------------------------------------------------------------- #
# Sources (unlocked licenses only)
# --------------------------------------------------------------------------- #
@portal_router.get("/licenses/{license_id}/files")
async def list_files(
    license_id: int,
    client: LicClient = Depends(get_current_portal_client),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """The files this license actually includes (metadata only, no source)."""
    lic = await _owned_license(session, client, license_id)
    _require_downloadable(lic)

    return [
        {
            "id": f.id,
            "relative_path": f.relative_path,
            "checksum": f.checksum,
            "version": f.version,
            "updated_at": dt_iso(f.updated_at),
            "content": None,
        }
        for f in await service.get_effective_files(session, lic)
    ]


@portal_router.get("/licenses/{license_id}/files/{file_id}")
async def read_file(
    license_id: int,
    file_id: int,
    client: LicClient = Depends(get_current_portal_client),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Decrypted source of one file, for viewing in the browser."""
    lic = await _owned_license(session, client, license_id)
    _require_downloadable(lic)

    # Resolve through the *effective* set, so a module disabled for this
    # license can't be read by asking for its id directly.
    effective = {f.id: f for f in await service.get_effective_files(session, lic)}
    f: LicProjectFile | None = effective.get(file_id)
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")

    return {
        "id": f.id,
        "relative_path": f.relative_path,
        "checksum": f.checksum,
        "version": f.version,
        "updated_at": dt_iso(f.updated_at),
        "content": crypto.decrypt_at_rest(f.content_enc),
    }


@portal_router.get("/licenses/{license_id}/download")
async def download_project(
    license_id: int,
    client: LicClient = Depends(get_current_portal_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """The whole project as a plain ZIP — the client owns this code now."""
    lic = await _owned_license(session, client, license_id)
    _require_downloadable(lic)

    project = await session.get(LicProject, lic.project_id)
    files = await service.get_effective_files(session, lic)
    if not files:
        raise HTTPException(status_code=404, detail="В проекте нет доступных файлов")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for f in files:
            archive.writestr(f.relative_path, crypto.decrypt_at_rest(f.content_enc))

    slug = project.slug if project else f"project-{lic.project_id}"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'},
    )


# --------------------------------------------------------------------------- #
# Portal page (self-contained HTML)
# --------------------------------------------------------------------------- #
portal_ui_router = APIRouter(tags=["licensing-portal-ui"])


@portal_ui_router.get("/licensing/portal", response_class=HTMLResponse, include_in_schema=False)
async def portal_page() -> HTMLResponse:
    html_path = _STATIC_DIR / "portal.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Portal not built")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
