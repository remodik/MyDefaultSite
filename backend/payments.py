from __future__ import annotations

import asyncio
import os
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx


YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://remod3.ru")

YOOKASSA_API_URL = "https://api.yookassa.ru/v3"
YOOKASSA_MAX_ATTEMPTS = 3
YOOKASSA_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

_RETRYABLE_STATUS_CODES = {
    429,
    500,
    502,
    503,
    504,
}


class YooKassaError(RuntimeError):
    """Базовая ошибка при работе с API ЮKassa."""


class YooKassaUnavailableError(YooKassaError):
    """ЮKassa временно недоступна на транспортном уровне."""


class YooKassaAPIError(YooKassaError):
    """ЮKassa вернула HTTP-ошибку."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


def _is_configured() -> bool:
    return bool(YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY)


def _format_api_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"ЮKassa вернула HTTP {response.status_code}"

    if not isinstance(payload, dict):
        return f"ЮKassa вернула HTTP {response.status_code}"

    code = payload.get("code")
    description = payload.get("description")
    parameter = payload.get("parameter")

    parts = [f"HTTP {response.status_code}"]

    if code:
        parts.append(str(code))

    if description:
        parts.append(str(description))

    if parameter:
        parts.append(f"parameter={parameter}")

    return ": ".join(parts)


async def _request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    idempotence_key: str | None = None,
) -> dict[str, Any]:
    if not _is_configured():
        raise RuntimeError(
            "YooKassa не настроена: отсутствуют "
            "YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY"
        )

    headers = {
        "Accept": "application/json",
    }

    if idempotence_key:
        headers["Idempotence-Key"] = idempotence_key

    auth = httpx.BasicAuth(
        YOOKASSA_SHOP_ID,
        YOOKASSA_SECRET_KEY,
    )

    async with httpx.AsyncClient(
        base_url=YOOKASSA_API_URL,
        auth=auth,
        timeout=YOOKASSA_TIMEOUT,
    ) as client:

        for attempt in range(1, YOOKASSA_MAX_ATTEMPTS + 1):

            try:
                response = await client.request(
                    method,
                    path,
                    headers=headers,
                    json=json,
                )

            except httpx.TransportError as exc:
                # DNS / timeout / TLS / connection reset /
                # premature disconnect и прочие сетевые ошибки.
                if attempt >= YOOKASSA_MAX_ATTEMPTS:
                    raise YooKassaUnavailableError(
                        "Не удалось подключиться к ЮKassa после "
                        f"{YOOKASSA_MAX_ATTEMPTS} попыток: "
                        f"{type(exc).__name__}: {exc}"
                    ) from exc

                await asyncio.sleep(
                    0.5 * (2 ** (attempt - 1))
                )
                continue

            # GET безопасно повторять.
            #
            # POST создания платежа тоже можно повторить,
            # потому что на всех попытках используется один
            # и тот же Idempotence-Key.
            if (
                response.status_code in _RETRYABLE_STATUS_CODES
                and attempt < YOOKASSA_MAX_ATTEMPTS
            ):
                await asyncio.sleep(
                    0.5 * (2 ** (attempt - 1))
                )
                continue

            if response.is_error:
                raise YooKassaAPIError(
                    response.status_code,
                    _format_api_error(response),
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise YooKassaError(
                    "ЮKassa вернула некорректный JSON "
                    f"(HTTP {response.status_code})"
                ) from exc

            if not isinstance(payload, dict):
                raise YooKassaError(
                    "ЮKassa вернула неожиданный формат ответа"
                )

            return payload

    # Сюда выполнение дойти не должно,
    # но оставляем страховку для type checker/runtime.
    raise YooKassaUnavailableError(
        "Не удалось выполнить запрос к ЮKassa"
    )


async def create_payment(
    amount: int,
    description: str,
    metadata: dict[str, Any],
    return_url: str | None = None,
) -> dict[str, Any]:
    if amount <= 0:
        raise ValueError("Сумма платежа должна быть больше нуля")

    payload = {
        "amount": {
            "value": f"{int(amount)}.00",
            "currency": "RUB",
        },
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": return_url or FRONTEND_URL,
        },
        "description": description[:128],
        "metadata": {
            key: str(value)
            for key, value in metadata.items()
        },
    }

    # ВАЖНО:
    # ключ создаётся один раз на всю операцию.
    # При retry остаётся тем же самым.
    idempotence_key = str(uuid4())

    payment = await _request(
        "POST",
        "/payments",
        json=payload,
        idempotence_key=idempotence_key,
    )

    payment_id = payment.get("id")

    if not payment_id:
        raise YooKassaError(
            "ЮKassa не вернула id созданного платежа"
        )

    confirmation = payment.get("confirmation")

    confirmation_url = None

    if isinstance(confirmation, dict):
        confirmation_url = confirmation.get(
            "confirmation_url"
        )

    return {
        "id": str(payment_id),
        "status": str(payment.get("status") or ""),
        "confirmation_url": confirmation_url,
    }


async def fetch_payment(
    payment_id: str,
) -> dict[str, Any]:
    payment_id = str(payment_id).strip()

    if not payment_id:
        raise ValueError(
            "payment_id не может быть пустым"
        )

    # quote не позволяет подставить произвольный path
    # через поддельный webhook.
    escaped_payment_id = quote(
        payment_id,
        safe="",
    )

    payment = await _request(
        "GET",
        f"/payments/{escaped_payment_id}",
    )

    metadata = payment.get("metadata")

    if not isinstance(metadata, dict):
        metadata = {}

    amount = payment.get("amount")

    amount_value = (
        amount.get("value")
        if isinstance(amount, dict)
        else None
    )

    return {
        "id": str(
            payment.get("id")
            or payment_id
        ),
        "status": str(
            payment.get("status")
            or ""
        ),
        "paid": bool(
            payment.get("paid", False)
        ),
        "metadata": dict(metadata),
        "amount_value": amount_value,
    }