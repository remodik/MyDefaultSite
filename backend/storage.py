"""S3-совместимое хранилище для аватарок (Selectel Object Storage).

Если переменные окружения S3_* не заданы, is_configured() вернёт False и
вызывающий код должен откатиться на локальный диск (для локальной разработки).
Бакет должен быть публичным на чтение, чтобы браузер грузил картинки по прямой
ссылке без подписи.
"""

from __future__ import annotations

import os

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "").rstrip("/")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_REGION = os.getenv("S3_REGION", "ru-1")
# Необязательный публичный базовый URL (например, если у бакета свой домен/CDN).
# По умолчанию собирается как {endpoint}/{bucket} (path-style).
S3_PUBLIC_URL_BASE = os.getenv("S3_PUBLIC_URL_BASE", "").rstrip("/")


def is_configured() -> bool:
    return bool(S3_ENDPOINT_URL and S3_ACCESS_KEY and S3_SECRET_KEY and S3_BUCKET)


def _client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _public_url(key: str) -> str:
    base = S3_PUBLIC_URL_BASE or f"{S3_ENDPOINT_URL}/{S3_BUCKET}"
    return f"{base}/{key}"


def upload_avatar(user_id: str, data: bytes) -> str:
    """Кладёт JPEG-байты в бакет и возвращает публичный URL. Блокирующая — вызывать через asyncio.to_thread."""
    key = f"avatars/{user_id}.jpg"
    _client().put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=data,
        ContentType="image/jpeg",
        CacheControl="public, max-age=86400",
    )
    return _public_url(key)


def delete_avatar(user_id: str) -> None:
    """Удаляет аватарку из бакета. Блокирующая — вызывать через asyncio.to_thread."""
    key = f"avatars/{user_id}.jpg"
    _client().delete_object(Bucket=S3_BUCKET, Key=key)
