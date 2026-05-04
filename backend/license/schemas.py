from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

KEY_PATTERN = re.compile(r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")


class ActivateRequest(BaseModel):
    code: str = Field(..., description="Лицензионный ключ XXXX-XXXX-XXXX")
    hwid: str = Field(..., min_length=8, max_length=256, description="HWID устройства")

    @field_validator("code")
    @classmethod
    def validate_key_format(cls, value: str) -> str:
        v = value.strip().upper()
        if not KEY_PATTERN.match(v):
            raise ValueError(
                "Неверный формат ключа. Ожидается XXXX-XXXX-XXXX (A-Z, 0-9)"
            )
        return v

    @field_validator("hwid")
    @classmethod
    def strip_hwid(cls, value: str) -> str:
        return value.strip()


class CheckRequest(BaseModel):
    hwid: str = Field(..., min_length=8, max_length=256)

    @field_validator("hwid")
    @classmethod
    def strip_hwid(cls, value: str) -> str:
        return value.strip()


class ActivateResponse(BaseModel):
    success: bool
    message: str
    offlineToken: str | None = None
    expiresAt: int | None = None
    sign: str


class CheckResponse(BaseModel):
    valid: bool
    expires_at: str | None = None
    sign: str


class GenerateKeyResponse(BaseModel):
    key: str


class LicenseListItem(BaseModel):
    id: int
    key: str
    used: bool
    hwid: str | None
    activated_at: str | None
    expires_at: str | None
    created_at: str


class LicenseListResponse(BaseModel):
    items: list[LicenseListItem]
    total: int