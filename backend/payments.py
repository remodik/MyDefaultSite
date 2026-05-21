from __future__ import annotations

import asyncio
import os
from typing import Any

from yookassa import Configuration, Payment

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://remod3.ru")

if YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY:
    Configuration.account_id = YOOKASSA_SHOP_ID
    Configuration.secret_key = YOOKASSA_SECRET_KEY
else:
    print("WARNING: YOOKASSA_SHOP_ID/SECRET_KEY не заданы — приём платежей отключён.")


def _is_configured() -> bool:
    return bool(YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY)


async def create_payment(
    amount: int,
    description: str,
    metadata: dict[str, Any],
    return_url: str | None = None,
) -> dict[str, Any]:
    if not _is_configured():
        raise RuntimeError("YooKassa не настроена: отсутствуют YOOKASSA_SHOP_ID/SECRET_KEY")

    payload = {
        "amount": {"value": f"{int(amount)}.00", "currency": "RUB"},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": return_url or FRONTEND_URL,
        },
        "description": description[:128],
        "metadata": {k: str(v) for k, v in metadata.items()},
    }
    payment = await asyncio.to_thread(Payment.create, payload)
    confirmation_url = None
    if payment.confirmation is not None:
        confirmation_url = getattr(payment.confirmation, "confirmation_url", None)
    return {
        "id": payment.id,
        "status": payment.status,
        "confirmation_url": confirmation_url,
    }


async def fetch_payment(payment_id: str) -> dict[str, Any]:
    if not _is_configured():
        raise RuntimeError("YooKassa не настроена")
    payment = await asyncio.to_thread(Payment.find_one, payment_id)
    return {
        "id": payment.id,
        "status": payment.status,
        "paid": bool(getattr(payment, "paid", False)),
        "metadata": dict(payment.metadata or {}),
        "amount_value": payment.amount.value if payment.amount else None,
    }
