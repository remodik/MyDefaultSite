from __future__ import annotations

import hashlib
import hmac
import json
import os
import random
import string
from datetime import datetime


def _get_secret() -> bytes:
    secret = os.getenv("LICENSE_SECRET", "")
    if not secret:
        raise RuntimeError(
            "LICENSE_SECRET не задан в переменных окружения. "
            "Добавьте его в .env файл."
        )
    return secret.encode("utf-8")


_KEY_ALPHABET = string.ascii_uppercase + string.digits


def generate_license_key() -> str:
    def segment() -> str:
        return "".join(random.choices(_KEY_ALPHABET, k=4))
    return f"{segment()}-{segment()}-{segment()}"


def hmac_sha256_hex(data: str) -> str:
    return hmac.new(
        _get_secret(),
        data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_offline_token(hwid: str, expires_at_ms: int) -> str:
    return hmac_sha256_hex(f"{hwid}|{expires_at_ms}")


def verify_offline_token(hwid: str, expires_at_ms: int, token: str) -> bool:
    expected = generate_offline_token(hwid, expires_at_ms)
    return hmac.compare_digest(expected, token)


def sign_response(payload: dict) -> str:
    data = "".join(
        json.dumps(v, ensure_ascii=False, separators=(',', ':'))
        for _, v in sorted(payload.items())
    )
    return hmac_sha256_hex(data)


def dt_to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def dt_to_ms(dt: datetime | None) -> int | None:
    if dt is None:
        return None
    return int(dt.timestamp() * 1000)