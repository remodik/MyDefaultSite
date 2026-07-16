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


class LicensePriceUpdate(_Strict):
    """Owner sets (or clears) the price a client sees in the portal."""

    # Whole currency units. ``None`` clears the price (back to "nothing to pay").
    price_amount: int | None = Field(None, ge=0, le=100_000_000)
    price_currency: str = Field("RUB", min_length=3, max_length=3)
    payment_instructions: str | None = Field(None, max_length=4000)

    @field_validator("price_currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned.isalpha():
            raise ValueError("price_currency must be a 3-letter code, e.g. RUB")
        return cleaned


class PaymentConfirm(_Strict):
    """Owner confirms the money arrived.

    ``unlock`` hands the code over permanently — a one-way door, so it is
    opt-in rather than implied by confirming payment.
    """

    unlock: bool = True
    note: str | None = Field(None, max_length=512)


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
    price_amount: int | None = None
    price_currency: str = "RUB"
    payment_status: str = "none"
    payment_instructions: str | None = None
    payment_claimed_at: str | None = None
    paid_at: str | None = None


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


# --------------------------------------------------------------------------- #
# Client portal schemas
# --------------------------------------------------------------------------- #
class PortalLoginRequest(BaseModel):
    """The license key is the credential — there are no portal passwords."""

    license_key: str = Field(..., min_length=8, max_length=128)


class PortalLoginResponse(BaseModel):
    token: str
    client_id: int
    client_name: str
    expires_in: int  # seconds


class PortalLicense(BaseModel):
    """One licensed project as the *client* sees it.

    Deliberately narrower than :class:`LicenseResponse`: no fingerprint, no
    admin notes, no internal security state.
    """

    id: int
    project_name: str
    project_slug: str
    key_last4: str
    status: str
    plan: str
    expires_at: str | None
    created_at: str
    price_amount: int | None
    price_currency: str
    payment_status: str
    payment_instructions: str | None
    payment_claimed_at: str | None
    paid_at: str | None
    # True once the code is permanently delivered (status == "unlocked"):
    # the client may then browse and download the sources.
    can_download: bool
    module_count: int


class PortalMeResponse(BaseModel):
    client_id: int
    client_name: str
    contact: str | None
    licenses: list[PortalLicense]


class PortalPaymentClaim(BaseModel):
    """The client asserts they have paid. A claim, never proof."""

    note: str | None = Field(None, max_length=500)


class PortalFile(BaseModel):
    id: int
    relative_path: str
    checksum: str
    version: int
    updated_at: str | None
    # Plaintext source; only sent on an explicit single-file request.
    content: str | None = None


def dt_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
