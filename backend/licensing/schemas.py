"""Pydantic schemas for the licensing subsystem (client + admin APIs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from licensing.models import LICENSE_PLANS, LICENSE_STATUSES


# --------------------------------------------------------------------------- #
# Client-facing (public) schemas
# --------------------------------------------------------------------------- #
class FetchRequest(BaseModel):
    license_key: str = Field(..., min_length=8, max_length=128)
    project_slug: str = Field(..., min_length=1, max_length=120)
    hardware_fingerprint: str | None = Field(None, max_length=256)
    client_version: str | None = Field(None, max_length=64)


class FetchFileMeta(BaseModel):
    relative_path: str
    checksum: str
    version: int


class FetchResponse(BaseModel):
    project_slug: str
    # AES-256-GCM envelope; decrypt with a key derived from the license key.
    archive: dict[str, Any]
    files: list[FetchFileMeta]
    revalidate_after_seconds: int


class ExecuteRequest(BaseModel):
    license_key: str = Field(..., min_length=8, max_length=128)
    project_slug: str = Field(..., min_length=1, max_length=120)
    entrypoint: str = Field(..., min_length=1, max_length=256)
    args: dict[str, Any] = Field(default_factory=dict)
    hardware_fingerprint: str | None = Field(None, max_length=256)
    client_version: str | None = Field(None, max_length=64)


class ExecuteResponse(BaseModel):
    ok: bool
    result: Any = None


class ValidateRequest(BaseModel):
    license_key: str = Field(..., min_length=8, max_length=128)
    project_slug: str = Field(..., min_length=1, max_length=120)
    hardware_fingerprint: str | None = Field(None, max_length=256)


class ValidateResponse(BaseModel):
    valid: bool
    status: str | None = None
    expires_at: str | None = None
    revalidate_after_seconds: int
    # Dotted names of the modules this license may currently use (global
    # enable AND per-license override). Lets a *running* client notice that a
    # module was switched off without restarting. Only sent when valid.
    modules: list[str] | None = None


# --------------------------------------------------------------------------- #
# Admin schemas
# --------------------------------------------------------------------------- #
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectCreate(_Strict):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=120)
    description: str = Field("", max_length=4000)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned or any(c.isspace() for c in cleaned):
            raise ValueError("slug must be non-empty and contain no whitespace")
        return cleaned


class ProjectUpdate(_Strict):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=4000)


class ProjectResponse(_Strict):
    id: int
    name: str
    slug: str
    description: str
    created_at: str
    file_count: int | None = None
    active_licenses: int | None = None


class ProjectFileUpload(_Strict):
    relative_path: str = Field(..., min_length=1, max_length=512)
    content: str = Field(..., max_length=2_000_000)

    @field_validator("relative_path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        cleaned = value.replace("\\", "/").strip().strip("/")
        if not cleaned.endswith(".py"):
            raise ValueError("relative_path must be a .py file")
        if ".." in cleaned.split("/"):
            raise ValueError("relative_path must not contain '..'")
        return cleaned


class ProjectFilesUpload(_Strict):
    files: list[ProjectFileUpload] = Field(..., min_length=1)


class ProjectFileResponse(_Strict):
    id: int
    project_id: int
    relative_path: str
    checksum: str
    version: int
    is_enabled: bool
    updated_at: str
    # Plaintext source, included only on explicit single-file fetch (editor).
    content: str | None = None


class ProjectFileToggle(_Strict):
    is_enabled: bool


class ClientCreate(_Strict):
    name: str = Field(..., min_length=1, max_length=255)
    contact: str | None = Field(None, max_length=255)


class ClientUpdate(_Strict):
    name: str | None = Field(None, min_length=1, max_length=255)
    contact: str | None = Field(None, max_length=255)


class ClientResponse(_Strict):
    id: int
    name: str
    contact: str | None
    created_at: str
    license_count: int | None = None


class LicenseCreate(_Strict):
    client_id: int
    project_id: int
    plan: str = Field("lifetime")
    hardware_fingerprint: str | None = Field(None, max_length=256)
    note: str | None = Field(None, max_length=512)

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, value: str) -> str:
        if value not in LICENSE_PLANS:
            raise ValueError(f"plan must be one of {LICENSE_PLANS}")
        return value


class LicenseStatusUpdate(_Strict):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in LICENSE_STATUSES:
            raise ValueError(f"status must be one of {LICENSE_STATUSES}")
        return value


class LicenseExtend(_Strict):
    plan: str | None = None
    expires_at: str | None = None  # ISO; overrides plan-based extension

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, value: str | None) -> str | None:
        if value is not None and value not in LICENSE_PLANS:
            raise ValueError(f"plan must be one of {LICENSE_PLANS}")
        return value


class ModuleOverrideUpdate(_Strict):
    project_file_id: int
    is_enabled: bool


class LicenseResponse(_Strict):
    id: int
    client_id: int
    client_name: str | None = None
    project_id: int
    project_slug: str | None = None
    key_last4: str
    status: str
    plan: str
    hardware_fingerprint: str | None
    expires_at: str | None
    note: str | None
    created_at: str


class LicenseCreatedResponse(LicenseResponse):
    # The plaintext key, shown exactly once at creation.
    license_key: str


class AccessLogResponse(_Strict):
    id: int
    license_id: int | None
    project_file_id: int | None
    attempted_key_last4: str | None
    mode: str | None
    entrypoint: str | None
    requested_at: str
    ip_address: str | None
    user_agent: str | None
    hardware_fingerprint: str | None
    success: bool
    reason: str | None


class SecurityFlagResponse(_Strict):
    id: int
    license_id: int
    license_last4: str | None = None
    flag_type: str
    detected_at: str
    details: str | None
    auto_action: str | None
    resolved: bool
    resolution: str | None
    resolved_at: str | None


class SecurityFlagResolve(_Strict):
    resolution: str  # "revoke" or "dismiss"

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in ("revoke", "dismiss"):
            raise ValueError("resolution must be 'revoke' or 'dismiss'")
        return value


def dt_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
