from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.automute.models import AutoMuteLog, AutoMutePurchase
from backend.automute.schemas import (
    AdminAutoMutePurchaseResponse,
    AutoMuteLogsListResponse,
    ModLogSubmitRequest,
    ModLogSubmitResponse,
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionStatusResponse,
)
from backend.automute.utils import PLAN_DAYS, PLAN_PRICES
from backend.database import User, get_session
from backend.license.models import License
from backend.license.utils import (
    dt_to_iso,
    generate_license_key,
    hmac_sha256_hex,
    sign_response,
)

limiter = Limiter(key_func=get_remote_address)

automute_router = APIRouter(prefix="/api/automute", tags=["automute"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCREENSHOTS_DIR = BASE_DIR / "uploads" / "automute_screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _purchase_to_dict(p: AutoMutePurchase) -> dict[str, Any]:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "plan": p.plan,
        "amount": int(p.amount),
        "status": p.status,
        "sbp_comment": p.sbp_comment,
        "created_at": dt_to_iso(p.created_at),
        "completed_at": dt_to_iso(p.completed_at),
    }


def _build_sbp_details(amount: int, comment: str) -> dict[str, Any]:
    phone = os.getenv("SBP_PHONE", "+70000000000")
    bank = os.getenv("SBP_BANK", "Тинькофф")
    recipient = os.getenv("SBP_RECIPIENT", "Получатель не указан")
    return {
        "phone": phone,
        "bank": bank,
        "recipient": recipient,
        "amount": int(amount),
        "comment": comment,
        "instruction": f"Переведите {amount} ₽ на {phone} ({bank}) с комментарием {comment}",
    }


def _verify_mod_signature(payload: dict[str, Any], received_sign: str) -> bool:
    expected = sign_response({k: v for k, v in payload.items() if k != "sign"})
    if len(expected) != len(received_sign):
        return False
    diff = 0
    for a, b in zip(expected, received_sign):
        diff |= ord(a) ^ ord(b)
    return diff == 0


def attach_routes(app) -> None:
    from backend.server import get_current_admin, get_current_user_model

    @automute_router.post(
        "/subscribe",
        response_model=SubscribeResponse,
        summary="Оформить подписку на AutoMute (создаёт pending-покупку)",
    )
    async def _subscribe(
        body: SubscribeRequest,
        current_user: User = Depends(get_current_user_model),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        plan = body.plan
        amount = PLAN_PRICES[plan]

        existing = await session.execute(
            select(AutoMutePurchase).where(
                AutoMutePurchase.user_id == current_user.id,
                AutoMutePurchase.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="У вас уже есть ожидающая подтверждения покупка",
            )

        sbp_comment = f"AM-{uuid.uuid4().hex[:8].upper()}"
        purchase = AutoMutePurchase(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            plan=plan,
            amount=amount,
            status="pending",
            sbp_comment=sbp_comment,
            created_at=datetime.now(),
        )
        session.add(purchase)
        await session.commit()
        await session.refresh(purchase)

        return {
            "purchase": _purchase_to_dict(purchase),
            "sbp": _build_sbp_details(amount, sbp_comment),
        }

    @automute_router.get(
        "/me/subscription",
        response_model=SubscriptionStatusResponse,
        summary="Текущий статус подписки и ключ",
    )
    async def _my_subscription(
        current_user: User = Depends(get_current_user_model),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        result = await session.execute(
            select(License)
            .where(License.user_id == current_user.id)
            .order_by(License.expires_at.desc(), License.created_at.desc())
        )
        licenses = result.scalars().all()

        active: License | None = None
        latest: License | None = None
        now = datetime.now()
        for lic in licenses:
            if latest is None:
                latest = lic
            if lic.expires_at and lic.expires_at > now:
                active = lic
                break

        chosen = active or latest

        pending_result = await session.execute(
            select(AutoMutePurchase)
            .where(
                AutoMutePurchase.user_id == current_user.id,
                AutoMutePurchase.status == "pending",
            )
            .order_by(AutoMutePurchase.created_at.desc())
        )
        pending = pending_result.scalar_one_or_none()

        seconds_left: int | None = None
        if chosen and chosen.expires_at:
            delta = (chosen.expires_at - now).total_seconds()
            seconds_left = max(0, int(delta))

        return {
            "active": active is not None,
            "plan": chosen.plan if chosen else None,
            "license_key": chosen.key if chosen else None,
            "activated_at": dt_to_iso(chosen.activated_at) if chosen else None,
            "expires_at": dt_to_iso(chosen.expires_at) if chosen else None,
            "seconds_left": seconds_left,
            "pending_purchase": _purchase_to_dict(pending) if pending else None,
        }

    @automute_router.get(
        "/me/logs",
        response_model=AutoMuteLogsListResponse,
        summary="Логи нарушений текущего пользователя",
    )
    async def _my_logs(
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
        current_user: User = Depends(get_current_user_model),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        result = await session.execute(
            select(AutoMuteLog)
            .where(AutoMuteLog.user_id == current_user.id)
            .order_by(AutoMuteLog.triggered_at.desc())
            .offset(offset)
            .limit(limit)
        )
        logs = result.scalars().all()
        items = [
            {
                "id": l.id,
                "server_address": l.server_address,
                "player_name": l.player_name,
                "category_name": l.category_name,
                "word": l.word,
                "command": l.command,
                "triggered_message": l.triggered_message,
                "screenshot_url": l.screenshot_url,
                "triggered_at": dt_to_iso(l.triggered_at),
            }
            for l in logs
        ]
        return {"items": items, "total": len(items)}

    @automute_router.post(
        "/log",
        response_model=ModLogSubmitResponse,
        summary="Приём лога нарушения от мода",
    )
    @limiter.limit("60/minute")
    async def _submit_log(
        request: Request,
        body: ModLogSubmitRequest,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        payload = body.model_dump(exclude={"sign"})
        if not _verify_mod_signature(payload, body.sign):
            resp = {"success": False, "log_id": None, "message": "Bad signature"}
            return {**resp, "sign": sign_response(resp)}

        lic_result = await session.execute(
            select(License).where(
                License.hwid == body.hwid,
                License.used.is_(True),
            )
        )
        lic = lic_result.scalar_one_or_none()
        now = datetime.now()
        if not lic or not lic.expires_at or lic.expires_at < now:
            resp = {"success": False, "log_id": None, "message": "Лицензия не активна"}
            return {**resp, "sign": sign_response(resp)}

        log = AutoMuteLog(
            user_id=lic.user_id,
            license_id=lic.id,
            hwid=body.hwid,
            server_address=body.server_address,
            player_name=body.player_name[:64],
            category_name=body.category_name[:128],
            word=(body.word or "")[:255] if body.word else None,
            command=body.command,
            triggered_message=body.triggered_message,
            triggered_at=now,
        )
        session.add(log)
        await session.commit()
        await session.refresh(log)

        resp = {"success": True, "log_id": log.id, "message": "ok"}
        return {**resp, "sign": sign_response(resp)}

    @automute_router.post(
        "/log/{log_id}/screenshot",
        summary="Загрузка скриншота-доказательства к существующему логу",
    )
    @limiter.limit("60/minute")
    async def _upload_screenshot(
        request: Request,
        log_id: int,
        hwid: str = Query(..., min_length=8, max_length=256),
        sign: str = Query(..., min_length=64, max_length=64),
        file: UploadFile = File(...),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        expected = hmac_sha256_hex(f"{hwid}|{log_id}")
        if len(expected) != len(sign):
            raise HTTPException(status_code=403, detail="Bad signature")
        diff = 0
        for a, b in zip(expected, sign):
            diff |= ord(a) ^ ord(b)
        if diff != 0:
            raise HTTPException(status_code=403, detail="Bad signature")

        log = await session.get(AutoMuteLog, log_id)
        if not log:
            raise HTTPException(status_code=404, detail="Лог не найден")
        if log.hwid != hwid:
            raise HTTPException(status_code=403, detail="HWID не совпадает")

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Пустой файл")
        if len(data) > MAX_SCREENSHOT_BYTES:
            raise HTTPException(status_code=413, detail="Файл слишком большой")

        ext = ".png"
        filename = f"{log_id}_{uuid.uuid4().hex[:8]}{ext}"
        target_dir = SCREENSHOTS_DIR
        if log.user_id:
            target_dir = SCREENSHOTS_DIR / log.user_id
            target_dir.mkdir(parents=True, exist_ok=True)
        path = target_dir / filename
        path.write_bytes(data)

        rel_url = f"/uploads/automute_screenshots/{log.user_id}/{filename}" if log.user_id \
            else f"/uploads/automute_screenshots/{filename}"
        log.screenshot_url = rel_url
        await session.commit()

        return {"success": True, "url": rel_url}

    @automute_router.get(
        "/admin/purchases",
        response_model=list[AdminAutoMutePurchaseResponse],
        dependencies=[Depends(get_current_admin)],
        summary="Список покупок AutoMute (для админа)",
    )
    async def _admin_purchases(
        status_filter: str | None = Query(None, alias="status"),
        session: AsyncSession = Depends(get_session),
    ) -> list[dict[str, Any]]:
        query = (
            select(AutoMutePurchase, User, License)
            .select_from(AutoMutePurchase)
            .outerjoin(User, AutoMutePurchase.user_id == User.id)
            .outerjoin(License, AutoMutePurchase.license_id == License.id)
            .order_by(AutoMutePurchase.created_at.desc())
        )
        if status_filter:
            query = query.where(AutoMutePurchase.status == status_filter)

        result = await session.execute(query)
        rows = result.all()

        out: list[dict[str, Any]] = []
        for purchase, user, lic in rows:
            payload = _purchase_to_dict(purchase)
            payload["username"] = user.username if user else "Удалённый"
            payload["email"] = user.email if user else None
            payload["license_key"] = lic.key if lic else None
            out.append(payload)
        return out

    @automute_router.post(
        "/admin/purchases/{purchase_id}/confirm",
        response_model=AdminAutoMutePurchaseResponse,
        dependencies=[Depends(get_current_admin)],
        summary="Подтвердить покупку и выдать ключ",
    )
    async def _admin_confirm_purchase(
        purchase_id: str,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        purchase = await session.get(AutoMutePurchase, purchase_id)
        if not purchase:
            raise HTTPException(status_code=404, detail="Покупка не найдена")
        if purchase.status == "completed":
            raise HTTPException(status_code=400, detail="Покупка уже подтверждена")
        if purchase.status == "cancelled":
            raise HTTPException(status_code=400, detail="Покупка отменена")

        days = PLAN_DAYS[purchase.plan]
        now = datetime.now()
        expires = now + timedelta(days=days)

        for _ in range(10):
            key = generate_license_key()
            existing = await session.execute(select(License).where(License.key == key))
            if not existing.scalar_one_or_none():
                break
        else:
            raise HTTPException(status_code=500, detail="Не удалось сгенерировать ключ")

        lic = License(
            key=key,
            used=False,
            expires_at=expires,
            created_at=now,
            user_id=purchase.user_id,
            plan=purchase.plan,
        )
        session.add(lic)
        await session.flush()

        purchase.status = "completed"
        purchase.completed_at = now
        purchase.license_id = lic.id
        await session.commit()
        await session.refresh(purchase)

        user = await session.get(User, purchase.user_id)
        payload = _purchase_to_dict(purchase)
        payload["username"] = user.username if user else "Удалённый"
        payload["email"] = user.email if user else None
        payload["license_key"] = key
        return payload

    @automute_router.post(
        "/admin/purchases/{purchase_id}/cancel",
        response_model=AdminAutoMutePurchaseResponse,
        dependencies=[Depends(get_current_admin)],
        summary="Отменить покупку",
    )
    async def _admin_cancel_purchase(
        purchase_id: str,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        purchase = await session.get(AutoMutePurchase, purchase_id)
        if not purchase:
            raise HTTPException(status_code=404, detail="Покупка не найдена")
        if purchase.status == "completed":
            raise HTTPException(status_code=400, detail="Покупка уже подтверждена")

        purchase.status = "cancelled"
        purchase.completed_at = datetime.now()
        await session.commit()
        await session.refresh(purchase)

        user = await session.get(User, purchase.user_id)
        payload = _purchase_to_dict(purchase)
        payload["username"] = user.username if user else "Удалённый"
        payload["email"] = user.email if user else None
        payload["license_key"] = None
        return payload

    app.include_router(automute_router)
