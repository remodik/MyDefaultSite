from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.automute.utils import is_valid_plan


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SubscribeRequest(_Strict):
    plan: str = Field(..., description="1d | 7d | 30d")

    @field_validator("plan")
    @classmethod
    def _validate_plan(cls, v: str) -> str:
        v = v.strip().lower()
        if not is_valid_plan(v):
            raise ValueError("Недопустимый тариф. Доступны: 1d, 7d, 30d")
        return v


class SbpDetails(_Strict):
    phone: str
    bank: str
    recipient: str
    amount: int
    comment: str
    instruction: str


class AutoMutePurchaseResponse(_Strict):
    id: str
    user_id: str
    plan: str
    amount: int
    status: str
    sbp_comment: str | None = None
    created_at: str
    completed_at: str | None = None


class SubscribeResponse(_Strict):
    purchase: AutoMutePurchaseResponse
    sbp: SbpDetails | None = None


class AdminAutoMutePurchaseResponse(AutoMutePurchaseResponse):
    username: str
    email: str | None = None
    license_key: str | None = None


class SubscriptionStatusResponse(_Strict):
    active: bool
    plan: str | None = None
    license_key: str | None = None
    activated_at: str | None = None
    expires_at: str | None = None
    seconds_left: int | None = None
    pending_purchase: AutoMutePurchaseResponse | None = None


class AutoMuteLogResponse(_Strict):
    id: int
    server_address: str | None = None
    player_name: str
    category_name: str
    word: str | None = None
    command: str | None = None
    triggered_message: str | None = None
    screenshot_url: str | None = None
    triggered_at: str


class AutoMuteLogsListResponse(_Strict):
    items: list[AutoMuteLogResponse]
    total: int


class ModLogSubmitRequest(BaseModel):
    hwid: str = Field(..., min_length=8, max_length=256)
    server_address: str | None = Field(None, max_length=255)
    player_name: str = Field(..., min_length=1, max_length=64)
    category_name: str = Field(..., min_length=1, max_length=128)
    word: str | None = Field(None, max_length=255)
    command: str | None = Field(None, max_length=2000)
    triggered_message: str | None = Field(None, max_length=4000)
    sign: str = Field(..., min_length=64, max_length=64)


class ModLogSubmitResponse(_Strict):
    success: bool
    log_id: int | None = None
    message: str | None = None
    sign: str


class ScreenshotSignRequest(_Strict):
    hwid: str = Field(..., min_length=8, max_length=256)
    log_id: int
    sign: str = Field(..., min_length=64, max_length=64)
