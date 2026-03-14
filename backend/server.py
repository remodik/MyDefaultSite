import asyncio
import base64
import os
import random
import secrets
import string
import uuid
import httpx
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta
from typing import Any

import bcrypt
import resend
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy import and_, delete, or_, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import (
    AdminResetRequest,
    ChatMessage,
    Conversation,
    Course,
    CoursePart,
    DirectMessage,
    File as FileModel,
    PasswordReset as PasswordResetModel,
    Project,
    Purchase,
    Service,
    User,
    UserProfile,
    async_session_factory,
    get_session,
    init_models,
)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_models()
    yield


app = FastAPI(lifespan=lifespan)

_allowed_origins_env = os.getenv("CORS_ORIGINS", "https://remod3.ru,http://localhost:3000,http://localhost:5173,https://www.remod3.ru")
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "dev@remod3.ru")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://remod3.ru")
SBP_PHONE = os.getenv("SBP_PHONE", "+70000000000")
SBP_BANK = os.getenv("SBP_BANK", "Тинькофф")
SBP_RECIPIENT = os.getenv("SBP_RECIPIENT", "Получатель не указан")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    print("WARNING: RESEND_API_KEY is not set. Emails will not be sent.")

VALID_DM_PRIVACY_VALUES = {"all", "none"}
DEFAULT_DM_PRIVACY = "all"
MAX_DM_MESSAGE_LENGTH = 1000


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[dict[str, Any]] = []

    async def connect(self, websocket: WebSocket, user_id: str, username: str) -> None:
        self.active_connections.append({
            "websocket": websocket,
            "user_id": user_id,
            "username": username
        })

    def disconnect(self, websocket: WebSocket) -> str | None:
        username = None
        for conn in self.active_connections:
            if conn["websocket"] == websocket:
                username = conn["username"]
                break
        self.active_connections = [conn for conn in self.active_connections if conn["websocket"] != websocket]
        return username

    async def broadcast(self, message: dict) -> None:
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection["websocket"].send_json(message)
            except Exception:
                disconnected.append(connection["websocket"])

        for ws in disconnected:
            self.disconnect(ws)


manager = ConnectionManager()


class UserCreate(BaseModel):
    username: str
    email: EmailStr | None = None
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class PasswordResetRequest(BaseModel):
    email: str


class PasswordReset(BaseModel):
    token: str
    new_password: str


class ProjectCreate(BaseModel):
    name: str
    description: str | None = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class FileCreate(BaseModel):
    project_id: str
    name: str
    content: str = ""
    file_type: str = ""
    path: str = ""
    parent_path: str = ""
    is_folder: bool = False


class FileUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


class FolderCreate(BaseModel):
    project_id: str
    name: str
    parent_path: str = ""


class FileMove(BaseModel):
    new_parent_path: str


class ChatMessagePayload(BaseModel):
    message: str


class ProfileUpdatePayload(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    accent_color: str | None = None
    privacy_dm: str | None = None


class ConversationCreatePayload(BaseModel):
    user_id: str


class DirectMessageCreatePayload(BaseModel):
    text: str


class ServiceCreate(BaseModel):
    name: str
    description: str
    price: str
    estimated_time: str
    payment_methods: str
    frameworks: str


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: str | None = None
    estimated_time: str | None = None
    payment_methods: str | None = None
    frameworks: str | None = None


class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    subject: str
    message: str


class _StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CourseCreate(_StrictSchema):
    title: str = Field(..., min_length=1, max_length=255)
    short_description: str = Field("", max_length=512)
    description: str = Field("", max_length=50000)
    price: int = Field(0, ge=0)
    cover_url: str | None = Field(None, max_length=512)
    is_published: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Название курса не может быть пустым")
        return cleaned

    @field_validator("short_description", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("cover_url")
    @classmethod
    def normalize_cover_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CourseUpdate(_StrictSchema):
    title: str | None = Field(None, min_length=1, max_length=255)
    short_description: str | None = Field(None, max_length=512)
    description: str | None = Field(None, max_length=50000)
    price: int | None = Field(None, ge=0)
    cover_url: str | None = None
    is_published: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Название курса не может быть пустым")
        return cleaned

    @field_validator("short_description", "description")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()

    @field_validator("cover_url")
    @classmethod
    def normalize_optional_cover_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CourseResponse(_StrictSchema):
    id: str
    title: str
    short_description: str
    description: str
    price: int
    cover_url: str | None
    is_published: bool
    created_at: str
    updated_at: str
    parts: list["CoursePartResponse"] | None = None


class CoursePartCreate(_StrictSchema):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=512)
    content: str = Field("", max_length=500000)
    price: int = Field(0, ge=0)
    order: int = Field(0, ge=0)
    is_preview: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Название раздела не может быть пустым")
        return cleaned

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        return value.strip()


class CoursePartUpdate(_StrictSchema):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=512)
    content: str | None = Field(None, max_length=500000)
    price: int | None = Field(None, ge=0)
    order: int | None = Field(None, ge=0)
    is_preview: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Название раздела не может быть пустым")
        return cleaned

    @field_validator("description")
    @classmethod
    def strip_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class CoursePartResponse(_StrictSchema):
    id: str
    course_id: str
    title: str
    description: str
    price: int
    order: int
    is_preview: bool
    has_access: bool
    created_at: str
    updated_at: str


class CoursePartContentResponse(CoursePartResponse):
    content: str


class PurchaseResponse(_StrictSchema):
    id: str
    user_id: str
    course_id: str | None
    part_id: str | None
    amount: int
    status: str
    sbp_comment: str | None
    created_at: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        allowed = {"pending", "completed", "cancelled"}
        if value not in allowed:
            raise ValueError("Недопустимый статус покупки")
        return value


class SbpDetails(_StrictSchema):
    phone: str
    bank: str
    recipient: str
    amount: int
    comment: str
    instruction: str


class PurchaseWithSbpResponse(_StrictSchema):
    purchase: PurchaseResponse
    sbp: SbpDetails | None

    @model_validator(mode="after")
    def validate_sbp_payload(self) -> "PurchaseWithSbpResponse":
        if self.purchase.status == "pending" and self.sbp is None:
            raise ValueError("Для ожидающей покупки требуются реквизиты СБП")
        return self


class AdminPurchaseResponse(PurchaseResponse):
    username: str
    course_title: str | None
    part_title: str | None


CourseResponse.model_rebuild()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now() + expires_delta
    else:
        expire = datetime.now() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _infer_file_type(name: str, fallback: str = "txt") -> str:
    base_name = name.rsplit("/", 1)[-1].strip()
    if not base_name:
        return fallback

    if base_name.startswith(".") and base_name.count(".") == 1:
        ext = base_name[1:]
    else:
        _, ext = os.path.splitext(base_name)
        ext = ext[1:] if ext.startswith(".") else ext

    return ext.lower() if ext else fallback


def user_to_public_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "created_at": _to_iso(user.created_at),
    }


def project_to_dict(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description or "",
        "created_by": project.created_by,
        "created_at": _to_iso(project.created_at),
    }


def file_to_dict(file: FileModel) -> dict[str, Any]:
    return {
        "id": file.id,
        "project_id": file.project_id,
        "name": file.name,
        "content": file.content,
        "path": file.path,
        "parent_path": file.parent_path,
        "is_folder": file.is_folder,
        "file_type": file.file_type,
        "is_binary": file.is_binary,
        "created_at": _to_iso(file.created_at),
        "updated_at": _to_iso(file.updated_at),
    }


def chat_message_to_dict(message: ChatMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "user_id": message.user_id,
        "username": message.username,
        "message": message.message,
        "timestamp": _to_iso(message.timestamp),
    }


async def ensure_db_connection(session: AsyncSession) -> None:
    try:
        await session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed. Ensure DATABASE_URL is correct."
        ) from exc


def _normalize_display_name(display_name: str | None, username: str) -> str:
    clean_name = (display_name or "").strip()
    return clean_name or username


def _normalize_privacy_dm(privacy_dm: str | None) -> str:
    value = (privacy_dm or DEFAULT_DM_PRIVACY).strip().lower()
    if value not in VALID_DM_PRIVACY_VALUES:
        raise HTTPException(status_code=400, detail="Invalid privacy_dm value. Allowed: all, none")
    return value


def profile_to_dict(user: User, profile: UserProfile | None) -> dict[str, Any]:
    display_name = _normalize_display_name(profile.display_name if profile else None, user.username)
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": display_name,
        "bio": (profile.bio if profile else "") or "",
        "avatar_url": profile.avatar_url if profile else None,
        "accent_color": profile.accent_color if profile else None,
        "privacy_dm": _normalize_privacy_dm(profile.privacy_dm if profile else DEFAULT_DM_PRIVACY),
        "created_at": _to_iso(profile.created_at if profile else user.created_at),
        "updated_at": _to_iso(profile.updated_at if profile else user.created_at),
    }


def direct_message_to_dict(
    message: DirectMessage,
    sender_user: User,
    sender_profile: UserProfile | None = None,
) -> dict[str, Any]:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "user_id": message.sender_id,
        "username": sender_user.username,
        "display_name": _normalize_display_name(sender_profile.display_name if sender_profile else None, sender_user.username),
        "text": message.text,
        "message": message.text,
        "created_at": _to_iso(message.created_at),
        "timestamp": _to_iso(message.created_at),
    }


def get_partner_id(conversation: Conversation, current_user_id: str) -> str:
    return conversation.user_b if conversation.user_a == current_user_id else conversation.user_a


def _conversation_pair(user_id_1: str, user_id_2: str) -> tuple[str, str]:
    ordered = sorted([user_id_1, user_id_2])
    return ordered[0], ordered[1]


async def get_or_create_profile(
    session: AsyncSession,
    user: User,
    commit_on_create: bool = True,
) -> UserProfile:
    result = await session.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    profile = UserProfile(
        user_id=user.id,
        display_name=user.username,
        bio="",
        avatar_url=None,
        accent_color=None,
        privacy_dm=DEFAULT_DM_PRIVACY,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(profile)

    if commit_on_create:
        await session.commit()
        await session.refresh(profile)
    else:
        await session.flush()

    return profile


async def get_conversation_for_user_or_404(
    session: AsyncSession,
    conversation_id: str,
    user_id: str,
) -> Conversation:
    result = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conversation.user_a != user_id and conversation.user_b != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return conversation


async def ensure_user_accepts_dm(
    session: AsyncSession,
    target_user: User,
) -> UserProfile | None:
    target_profile_result = await session.execute(select(UserProfile).where(UserProfile.user_id == target_user.id))
    target_profile = target_profile_result.scalar_one_or_none()
    privacy_dm = _normalize_privacy_dm(target_profile.privacy_dm if target_profile else DEFAULT_DM_PRIVACY)
    if privacy_dm == "none":
        raise HTTPException(status_code=403, detail="User does not accept direct messages")
    return target_profile


async def build_conversation_summary(
    session: AsyncSession,
    conversation: Conversation,
    current_user_id: str,
) -> dict[str, Any]:
    partner_id = get_partner_id(conversation, current_user_id)
    partner_user = await session.get(User, partner_id)
    if not partner_user:
        raise HTTPException(status_code=404, detail="Conversation participant not found")

    partner_profile_result = await session.execute(select(UserProfile).where(UserProfile.user_id == partner_id))
    partner_profile = partner_profile_result.scalar_one_or_none()

    last_message_result = await session.execute(
        select(DirectMessage)
        .where(DirectMessage.conversation_id == conversation.id)
        .order_by(DirectMessage.created_at.desc())
        .limit(1)
    )
    last_message = last_message_result.scalar_one_or_none()

    partner_display_name = _normalize_display_name(partner_profile.display_name if partner_profile else None, partner_user.username)
    return {
        "id": conversation.id,
        "user_a": conversation.user_a,
        "user_b": conversation.user_b,
        "created_at": _to_iso(conversation.created_at),
        "partner": {
            "id": partner_user.id,
            "username": partner_user.username,
            "display_name": partner_display_name,
            "avatar_url": partner_profile.avatar_url if partner_profile else None,
        },
        "last_message": last_message.text if last_message else "",
        "last_message_at": _to_iso(last_message.created_at if last_message else conversation.created_at),
        "updated_at": _to_iso(last_message.created_at if last_message else conversation.created_at),
    }


async def get_current_user_model(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    await ensure_db_connection(session)
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_current_user(current_user: User = Depends(get_current_user_model)) -> dict[str, Any]:
    return user_to_public_dict(current_user)


async def get_current_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


VALID_PURCHASE_STATUSES = {"pending", "completed", "cancelled"}


def _course_to_response(
    course: Course,
    parts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": course.id,
        "title": course.title,
        "short_description": course.short_description or "",
        "description": course.description or "",
        "price": int(course.price),
        "cover_url": course.cover_url,
        "is_published": bool(course.is_published),
        "created_at": _to_iso(course.created_at),
        "updated_at": _to_iso(course.updated_at),
    }
    if parts is not None:
        payload["parts"] = parts
    return payload


def _course_part_to_response(
    part: CoursePart,
    has_access: bool,
    include_content: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": part.id,
        "course_id": part.course_id,
        "title": part.title,
        "description": part.description or "",
        "price": int(part.price),
        "order": int(part.order),
        "is_preview": bool(part.is_preview),
        "has_access": bool(has_access),
        "created_at": _to_iso(part.created_at),
        "updated_at": _to_iso(part.updated_at),
    }
    if include_content:
        payload["content"] = part.content or ""
    return payload


def _purchase_to_response(purchase: Purchase) -> dict[str, Any]:
    return {
        "id": purchase.id,
        "user_id": purchase.user_id,
        "course_id": purchase.course_id,
        "part_id": purchase.part_id,
        "amount": int(purchase.amount),
        "status": purchase.status,
        "sbp_comment": purchase.sbp_comment,
        "created_at": _to_iso(purchase.created_at),
    }


def _admin_purchase_to_response(
    purchase: Purchase,
    username: str,
    course_title: str | None,
    part_title: str | None,
) -> dict[str, Any]:
    payload = _purchase_to_response(purchase)
    payload["username"] = username
    payload["course_title"] = course_title
    payload["part_title"] = part_title
    return payload


def _build_sbp_details(amount: int, comment: str) -> dict[str, Any]:
    return {
        "phone": SBP_PHONE,
        "bank": SBP_BANK,
        "recipient": SBP_RECIPIENT,
        "amount": int(amount),
        "comment": comment,
        "instruction": f"Переведите {amount} ₽ на {SBP_PHONE} ({SBP_BANK}) с комментарием {comment}",
    }


async def _get_optional_user_from_request(request: Request, session: AsyncSession) -> User | None:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if not auth_header:
        return None

    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None

    try:
        return await get_current_user_model(token=token.strip(), session=session)
    except HTTPException:
        return None


async def _has_access_to_part(
    session: AsyncSession,
    user_id: str,
    part: CoursePart,
    is_admin_user: bool = False,
) -> bool:
    if is_admin_user or part.is_preview:
        return True

    result = await session.execute(
        select(Purchase).where(
            Purchase.user_id == user_id,
            Purchase.course_id == part.course_id,
            Purchase.part_id.is_(None),
            Purchase.status == "completed",
        )
    )
    if result.scalar_one_or_none():
        return True

    result = await session.execute(
        select(Purchase).where(
            Purchase.user_id == user_id,
            Purchase.part_id == part.id,
            Purchase.status == "completed",
        )
    )
    return result.scalar_one_or_none() is not None


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def generate_random_password(length: int = 8) -> str:
    chars = string.ascii_letters + string.digits
    chars += "!@#$%^&*"
    return "".join(random.choices(chars, k=length))


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***@***.***"

    local, domain = email.split("@", 1)

    if len(local) <= 2:
        masked_local = local[0] + "*" * (len(local) - 1) if len(local) > 1 else "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]

    return f"{masked_local}@{domain}"


def _send_email_via_resend(to_email: str, subject: str, html_content: str, text_content: str = None) -> bool:
    if not RESEND_API_KEY:
        print("Error: RESEND_API_KEY is not configured.")
        return False

    try:
        params = {
            "from": f"remod3.ru <{EMAIL_FROM}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        if text_content:
            params["text"] = text_content

        r = resend.Emails.send(params)
        print(f"✅ Email sent to {to_email}. ID: {r.get('id')}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email via Resend: {e}")
        return False


async def send_reset_link_email(email: str, token: str) -> bool:
    reset_link = f"{FRONTEND_URL}/password-reset?token={token}"

    subject = "Сброс пароля - remod3.ru"

    text_content = f"""
Вы запросили сброс пароля на remod3.ru.

Перейдите по ссылке для сброса пароля:
{reset_link}

Ссылка действительна 1 час.

Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
"""

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #1e1f22; margin: 0; padding: 20px;">
    <div style="max-width: 500px; margin: 0 auto; background: #2b2d31; border-radius: 12px; overflow: hidden; border: 1px solid #404249;">
        <div style="background: linear-gradient(135deg, #5865F2 0%, #7289DA 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Сброс пароля</h1>
        </div>
        <div style="padding: 30px;">
            <p style="color: #b5bac1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Вы запросили сброс пароля для вашего аккаунта на remod3.ru.
            </p>
            <p style="color: #b5bac1; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Нажмите на кнопку ниже, чтобы создать новый пароль:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" style="display: inline-block; background: #5865f2; color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Сбросить пароль
                </a>
            </div>
            <p style="color: #72767d; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
                Ссылка действительна <strong style="color: #b5bac1;">1 час</strong>.
            </p>
            <p style="color: #72767d; font-size: 14px; line-height: 1.6; margin: 15px 0 0 0;">
                Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
            </p>
            <hr style="border: none; border-top: 1px solid #404249; margin: 25px 0;">
            <p style="color: #5a5d63; font-size: 12px; margin: 0;">
                Если кнопка не работает, скопируйте эту ссылку в браузер:<br>
                <a href="{reset_link}" style="color: #5865f2; word-break: break-all;">{reset_link}</a>
            </p>
        </div>
    </div>
</body>
</html>
"""

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        _send_email_via_resend,
        email,
        subject,
        html_content,
        text_content
    )


@app.on_event("startup")
async def startup_event() -> None:
    await init_models()


@app.post("/api/auth/register", response_model=Token)
async def register(user: UserCreate, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(select(User).where(User.username == user.username))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    if user.email:
        result = await session.execute(select(User).where(User.email == user.email))
        existing_email = result.scalar_one_or_none()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_obj = User(
        id=user_id,
        username=user.username,
        email=user.email,
        password_hash=get_password_hash(user.password),
        role="user",
        created_at=datetime.now(),
    )
    session.add(user_obj)
    session.add(
        UserProfile(
            user_id=user_id,
            display_name=user.username,
            bio="",
            avatar_url=None,
            accent_color=None,
            privacy_dm=DEFAULT_DM_PRIVACY,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
    )
    await session.commit()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user_id}, expires_delta=access_token_expires)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_to_public_dict(user_obj)
    }


@app.post("/api/auth/login", response_model=Token)
async def login(user: UserLogin, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await ensure_db_connection(session)
    result = await session.execute(select(User).where(User.username == user.username))
    db_user = result.scalar_one_or_none()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": db_user.id}, expires_delta=access_token_expires)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_to_public_dict(db_user)
    }


@app.get("/api/auth/me")
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user


@app.get("/api/me")
async def get_me_short(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user


@app.get("/api/me/profile")
async def get_my_profile(
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    profile = await get_or_create_profile(session, current_user)
    return profile_to_dict(current_user, profile)


@app.put("/api/me/profile")
async def update_my_profile(
    payload: ProfileUpdatePayload,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    profile = await get_or_create_profile(session, current_user, commit_on_create=False)

    if payload.display_name is not None:
        profile.display_name = _normalize_display_name(payload.display_name, current_user.username)

    if payload.bio is not None:
        profile.bio = payload.bio.strip()[:400]

    if payload.avatar_url is not None:
        profile.avatar_url = payload.avatar_url.strip()[:512] or None

    if payload.accent_color is not None:
        profile.accent_color = payload.accent_color.strip()[:32] or None

    if payload.privacy_dm is not None:
        profile.privacy_dm = _normalize_privacy_dm(payload.privacy_dm)

    profile.updated_at = datetime.now()
    await session.commit()
    await session.refresh(profile)

    return profile_to_dict(current_user, profile)


@app.get("/api/users/search")
async def search_users(
    q: str = "",
    limit: int = 20,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    search_query = q.strip()
    if not search_query:
        return []

    safe_limit = min(max(limit, 1), 50)
    users_result = await session.execute(
        select(User)
        .where(
            User.id != current_user.id,
            User.username.ilike(f"%{search_query}%"),
        )
        .order_by(User.username.asc())
        .limit(safe_limit)
    )
    users = users_result.scalars().all()
    if not users:
        return []

    user_ids = [user.id for user in users]
    profiles_result = await session.execute(select(UserProfile).where(UserProfile.user_id.in_(user_ids)))
    profiles_map = {profile.user_id: profile for profile in profiles_result.scalars().all()}

    payload: list[dict[str, Any]] = []
    for user in users:
        profile = profiles_map.get(user.id)
        privacy_dm = _normalize_privacy_dm(profile.privacy_dm if profile else DEFAULT_DM_PRIVACY)
        payload.append({
            "id": user.id,
            "username": user.username,
            "display_name": _normalize_display_name(profile.display_name if profile else None, user.username),
            "avatar_url": profile.avatar_url if profile else None,
            "privacy_dm": privacy_dm,
            "can_receive_dm": privacy_dm != "none",
        })

    return payload


@app.post("/api/conversations")
async def create_or_get_conversation(
    payload: ConversationCreatePayload,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    target_user_id = payload.user_id.strip()
    if not target_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot create conversation with yourself")

    target_user = await session.get(User, target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    await ensure_user_accepts_dm(session, target_user)

    user_a, user_b = _conversation_pair(current_user.id, target_user_id)
    conversation_result = await session.execute(
        select(Conversation).where(
            and_(
                Conversation.user_a == user_a,
                Conversation.user_b == user_b,
            )
        )
    )
    conversation = conversation_result.scalar_one_or_none()

    if not conversation:
        conversation = Conversation(
            id=str(uuid.uuid4()),
            user_a=user_a,
            user_b=user_b,
            created_at=datetime.now(),
        )
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)

    return await build_conversation_summary(session, conversation, current_user.id)


@app.get("/api/me/conversations")
async def get_my_conversations(
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    conversations_result = await session.execute(
        select(Conversation).where(
            or_(
                Conversation.user_a == current_user.id,
                Conversation.user_b == current_user.id,
            )
        )
    )
    conversations = conversations_result.scalars().all()

    summaries: list[dict[str, Any]] = []
    for conversation in conversations:
        try:
            summaries.append(await build_conversation_summary(session, conversation, current_user.id))
        except HTTPException as exc:
            if exc.status_code == 404:
                continue
            raise

    summaries.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return summaries


@app.get("/api/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 50,
    before: str | None = None,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    await get_conversation_for_user_or_404(session, conversation_id, current_user.id)

    safe_limit = min(max(limit, 1), 100)
    query = (
        select(DirectMessage)
        .where(DirectMessage.conversation_id == conversation_id)
        .order_by(DirectMessage.created_at.desc())
        .limit(safe_limit)
    )

    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
            if before_dt.tzinfo is not None:
                before_dt = before_dt.replace(tzinfo=None)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid 'before' datetime format") from exc
        query = (
            select(DirectMessage)
            .where(
                DirectMessage.conversation_id == conversation_id,
                DirectMessage.created_at < before_dt,
            )
            .order_by(DirectMessage.created_at.desc())
            .limit(safe_limit)
        )

    messages_result = await session.execute(query)
    direct_messages = list(messages_result.scalars().all())[::-1]

    sender_ids = {msg.sender_id for msg in direct_messages}
    if not sender_ids:
        return []

    users_result = await session.execute(select(User).where(User.id.in_(sender_ids)))
    users_map = {user.id: user for user in users_result.scalars().all()}

    profiles_result = await session.execute(select(UserProfile).where(UserProfile.user_id.in_(sender_ids)))
    profiles_map = {profile.user_id: profile for profile in profiles_result.scalars().all()}

    payload: list[dict[str, Any]] = []
    for message in direct_messages:
        sender = users_map.get(message.sender_id)
        if not sender:
            continue
        payload.append(direct_message_to_dict(message, sender, profiles_map.get(message.sender_id)))

    return payload


@app.post("/api/conversations/{conversation_id}/messages")
async def send_conversation_message(
    conversation_id: str,
    payload: DirectMessageCreatePayload,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    conversation = await get_conversation_for_user_or_404(session, conversation_id, current_user.id)

    text_value = payload.text.strip()
    if not text_value:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text_value) > MAX_DM_MESSAGE_LENGTH:
        raise HTTPException(status_code=400, detail=f"Message too long (max {MAX_DM_MESSAGE_LENGTH} chars)")

    partner_id = get_partner_id(conversation, current_user.id)
    partner_user = await session.get(User, partner_id)
    if not partner_user:
        raise HTTPException(status_code=404, detail="Conversation participant not found")

    await ensure_user_accepts_dm(session, partner_user)

    current_user_profile_result = await session.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    current_user_profile = current_user_profile_result.scalar_one_or_none()

    message = DirectMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation.id,
        sender_id=current_user.id,
        text=text_value,
        created_at=datetime.now(),
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)

    return direct_message_to_dict(message, current_user, current_user_profile)


@app.post("/api/auth/password-reset-request")
async def request_password_reset(
        request: PasswordResetRequest,
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        return {
            "message": "Если этот email зарегистрирован, на него будет отправлена ссылка для сброса пароля"
        }

    reset_token = generate_reset_token()
    reset_id = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(hours=1)

    reset = PasswordResetModel(
        id=reset_id,
        user_id=user.id,
        code=reset_token,
        created_at=datetime.now(),
        expires_at=expires_at,
        used=False,
    )
    session.add(reset)
    await session.commit()

    email_sent = await send_reset_link_email(user.email, reset_token)

    if not email_sent:
        print(f"Failed to send reset email to {user.email}")

    return {
        "message": "Если этот email зарегистрирован, на него будет отправлена ссылка для сброса пароля"
    }


@app.get("/api/auth/password-reset/verify")
async def verify_reset_token(
        token: str,
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(PasswordResetModel).where(
            PasswordResetModel.code == token,
            PasswordResetModel.used.is_(False),
        )
    )
    reset_request = result.scalar_one_or_none()

    if not reset_request:
        raise HTTPException(status_code=400, detail="Недействительная или истёкшая ссылка")

    if datetime.now() > reset_request.expires_at:
        raise HTTPException(status_code=400, detail="Срок действия ссылки истёк")

    return {"valid": True}


@app.post("/api/auth/password-reset")
async def reset_password(
        reset: PasswordReset,
        session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(PasswordResetModel).where(
            PasswordResetModel.code == reset.token,
            PasswordResetModel.used.is_(False),
        )
    )
    reset_request = result.scalar_one_or_none()

    if not reset_request:
        raise HTTPException(status_code=400, detail="Недействительная или истёкшая ссылка")

    if datetime.now() > reset_request.expires_at:
        raise HTTPException(status_code=400, detail="Срок действия ссылки истёк")

    user = await session.get(User, reset_request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if len(reset.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть не менее 6 символов")

    user.password_hash = get_password_hash(reset.new_password)
    reset_request.used = True
    await session.commit()

    return {"message": "Пароль успешно изменён"}


@app.get("/api/projects")
async def get_projects(
        current_user: dict[str, Any] = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)

    result = await session.execute(select(Project))
    projects = [project_to_dict(project) for project in result.scalars().all()]
    return projects


@app.get("/api/projects/{project_id}")
async def get_project(
        project_id: str,
        current_user: dict[str, Any] = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await session.execute(select(FileModel).where(FileModel.project_id == project_id))
    files = [file_to_dict(file) for file in result.scalars().all()]

    project_data = project_to_dict(project)
    project_data["files"] = files
    return project_data


@app.post("/api/projects")
async def create_project(
        project: ProjectCreate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    project_id = str(uuid.uuid4())
    project_obj = Project(
        id=project_id,
        name=project.name,
        description=project.description,
        created_by=current_user["id"],
        created_at=datetime.now(),
    )
    session.add(project_obj)
    await session.commit()

    return project_to_dict(project_obj)


@app.put("/api/projects/{project_id}")
async def update_project(
        project_id: str,
        project: ProjectUpdate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    project_obj = await session.get(Project, project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = {k: v for k, v in project.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    for key, value in update_data.items():
        setattr(project_obj, key, value)

    await session.commit()
    await session.refresh(project_obj)

    return project_to_dict(project_obj)


@app.delete("/api/projects/{project_id}")
async def delete_project(
        project_id: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)

    project_obj = await session.get(Project, project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    await session.execute(delete(FileModel).where(FileModel.project_id == project_id))
    await session.delete(project_obj)
    await session.commit()

    return {"message": "Project deleted"}


@app.post("/api/files")
async def create_file(
        file: FileCreate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    project_obj = await session.get(Project, file.project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    if file.parent_path:
        full_path = f"{file.parent_path}/{file.name}"
    else:
        full_path = file.name

    file_type = (file.file_type or "").strip().lower()
    if file.is_folder:
        file_type = "folder"
    if not file_type:
        file_type = _infer_file_type(file.name)

    file_id = str(uuid.uuid4())
    file_obj = FileModel(
        id=file_id,
        project_id=file.project_id,
        name=file.name,
        path=full_path,
        parent_path=file.parent_path,
        is_folder=file.is_folder,
        content=file.content,
        file_type=file_type,
        is_binary=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(file_obj)
    await session.commit()

    return file_to_dict(file_obj)


@app.post("/api/files/upload")
async def upload_file(
        project_id: str = Form(...),
        file: UploadFile = File(...),
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    content = await file.read()
    file_type = _infer_file_type(file.filename)

    if file_type in [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "mp4",
        "avi",
        "mov",
        "webm",
        "ico",
    ]:
        content_str = base64.b64encode(content).decode("utf-8")
        is_binary = True
    else:
        try:
            content_str = content.decode("utf-8")
            is_binary = False
        except UnicodeDecodeError:
            content_str = base64.b64encode(content).decode("utf-8")
            is_binary = True

    file_id = str(uuid.uuid4())
    now = datetime.now()
    file_obj = FileModel(
        id=file_id,
        project_id=project_id,
        name=file.filename,
        content=content_str,
        file_type=file_type,
        is_binary=is_binary,
        created_at=now,
        updated_at=now,
    )
    session.add(file_obj)
    await session.commit()

    return file_to_dict(file_obj)


@app.get("/api/files/{file_id}")
async def get_file(
        file_id: str,
        current_user: dict[str, Any] = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    file_obj = await session.get(FileModel, file_id)
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")
    return file_to_dict(file_obj)


@app.put("/api/files/{file_id}")
async def update_file(
        file_id: str,
        file: FileUpdate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    file_obj = await session.get(FileModel, file_id)
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    update_data = {k: v for k, v in file.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    for key, value in update_data.items():
        setattr(file_obj, key, value)
    file_obj.updated_at = datetime.now()

    await session.commit()
    await session.refresh(file_obj)

    return file_to_dict(file_obj)


@app.delete("/api/files/{file_id}")
async def delete_file(
        file_id: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)

    file_obj = await session.get(FileModel, file_id)
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    if file_obj.is_folder:
        result = await session.execute(
            select(FileModel).where(
                FileModel.project_id == file_obj.project_id,
                FileModel.path.startswith(file_obj.path + "/")
            )
        )
        children = result.scalars().all()
        for child in children:
            await session.delete(child)

    await session.delete(file_obj)
    await session.commit()

    return {"message": "File deleted"}


@app.post("/api/folders")
async def create_folder(
        folder: FolderCreate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    await ensure_db_connection(session)

    project_obj = await session.get(Project, folder.project_id)
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    if folder.parent_path:
        full_path = f"{folder.parent_path}/{folder.name}"
    else:
        full_path = folder.name

    folder_id = str(uuid.uuid4())
    folder_obj = FileModel(
        id=folder_id,
        project_id=folder.project_id,
        name=folder.name,
        path=full_path,
        parent_path=folder.parent_path,
        is_folder=True,
        content="",
        file_type="folder",
        is_binary=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(folder_obj)
    await session.commit()

    return file_to_dict(folder_obj)


@app.put("/api/files/{file_id}/move")
async def move_file(
        file_id: str,
        move_data: FileMove,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    file_obj = await session.get(FileModel, file_id)

    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")
    old_path = file_obj.path
    old_parent_path = file_obj.parent_path
    new_parent_path = move_data.new_parent_path

    if new_parent_path:
        new_path = f"{new_parent_path}/{file_obj.name}"
    else:
        new_path = file_obj.name

    file_obj.parent_path = new_parent_path
    file_obj.path = new_path
    file_obj.updated_at = datetime.now()

    if file_obj.is_folder:
        result = await session.execute(
            select(FileModel).where(
                FileModel.project_id == file_obj.project_id,
                FileModel.parent_path.startswith(old_path)
            )
        )
        children = result.scalars().all()

        for child in children:
            child.parent_path = child.parent_path.replace(old_path, new_path, 1)
            child.path = child.path.replace(old_path, new_path, 1)
            child.updated_at = datetime.now()
    await session.commit()
    await session.refresh(file_obj)

    return file_to_dict(file_obj)


@app.put("/api/files/{file_id}/rename")
async def rename_file(
        file_id: str,
        new_name: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    file_obj = await session.get(FileModel, file_id)
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")
    old_path = file_obj.path
    old_name = file_obj.name

    if file_obj.parent_path:
        new_path = f"{file_obj.parent_path}/{new_name}"
    else:
        new_path = new_name

    file_obj.name = new_name
    file_obj.path = new_path
    file_obj.updated_at = datetime.now()

    if file_obj.is_folder:
        result = await session.execute(
            select(FileModel).where(
                FileModel.project_id == file_obj.project_id,
                FileModel.parent_path.startswith(old_path)
            )
        )
        children = result.scalars().all()
        for child in children:
            child.parent_path = child.parent_path.replace(old_path, new_path, 1)
            child.path = child.path.replace(old_path, new_path, 1)
            child.updated_at = datetime.now()
    await session.commit()
    await session.refresh(file_obj)

    return file_to_dict(file_obj)


@app.get("/api/admin/users")
async def get_users(
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)

    result = await session.execute(select(User))
    return [user_to_public_dict(user) for user in result.scalars().all()]


@app.get("/api/admin/reset-requests")
async def get_reset_requests(
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(AdminResetRequest).where(AdminResetRequest.status == "pending")
    )
    requests = []
    for reset in result.scalars().all():
        requests.append({
            "id": reset.id,
            "user_id": reset.user_id,
            "username": reset.username,
            "status": reset.status,
            "requested_at": _to_iso(reset.requested_at),
            "completed_at": _to_iso(reset.completed_at)
        })
    return requests


@app.post("/api/admin/reset-password/{user_id}")
async def admin_reset_password(
        user_id: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)

    user_obj = await session.get(User, user_id)
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found")

    new_password = generate_random_password()
    user_obj.password_hash = get_password_hash(new_password)

    await session.execute(
        update(AdminResetRequest)
        .where(AdminResetRequest.user_id == user_id, AdminResetRequest.status == "pending")
        .values(status="completed", completed_at=datetime.now())
    )

    await session.commit()

    return {"message": f"Password reset to {new_password}"}


@app.put("/api/admin/users/{user_id}/role")
async def update_user_role(
        user_id: str,
        role: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)
    if role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user_obj = await session.get(User, user_id)
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found")

    user_obj.role = role
    await session.commit()

    return {"message": "Role updated"}


@app.websocket("/api/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str) -> None:
    user = None

    try:
        await websocket.accept()

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")

            if not user_id:
                await websocket.close(code=1008, reason="Invalid token")
                return
        except JWTError:
            await websocket.close(code=1008, reason="Invalid token")
            return

        async with async_session_factory() as session:
            user_result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()

            if not user:
                await websocket.close(code=1008, reason="User not found")
                return

            await manager.connect(websocket, user_id, user.username)

            history_result = await session.execute(
                select(ChatMessage)
                .order_by(ChatMessage.timestamp.desc())
                .limit(50)
            )
            messages = [
                chat_message_to_dict(msg)
                for msg in history_result.scalars().all()
            ][::-1]

            await websocket.send_json({
                "type": "history",
                "messages": messages
            })

            await manager.broadcast({
                "type": "user_joined",
                "username": user.username
            })

        while True:
            data = await websocket.receive_json()

            async with async_session_factory() as session:
                message_id = str(uuid.uuid4())
                chat_message = ChatMessage(
                    id=message_id,
                    user_id=user_id,
                    username=user.username,
                    message=data.get("message", ""),
                    timestamp=datetime.now(),
                )
                session.add(chat_message)
                await session.commit()

                await manager.broadcast({
                    "type": "message",
                    "data": chat_message_to_dict(chat_message)
                })

    except WebSocketDisconnect:
        pass

    except Exception as exc:
        print(f"WebSocket error: {exc}")
        import traceback
        traceback.print_exc()

    finally:
        username = manager.disconnect(websocket)

        if username:
            await manager.broadcast({
                "type": "user_left",
                "username": username
            })

        with suppress(Exception):
            if websocket.client_state.name == "CONNECTED":
                await websocket.close(code=1000)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def service_to_dict(service: Service) -> dict[str, Any]:
    return {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "price": service.price,
        "estimated_time": service.estimated_time,
        "payment_methods": service.payment_methods,
        "frameworks": service.frameworks,
        "created_at": _to_iso(service.created_at),
        "updated_at": _to_iso(service.updated_at),
    }


@app.get("/api/services")
async def get_services(
        session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    result = await session.execute(select(Service))
    services = [service_to_dict(service) for service in result.scalars().all()]
    return services


@app.post("/api/services")
async def create_service(
        service: ServiceCreate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    service_id = str(uuid.uuid4())
    service_obj = Service(
        id=service_id,
        name=service.name,
        description=service.description,
        price=service.price,
        estimated_time=service.estimated_time,
        payment_methods=service.payment_methods,
        frameworks=service.frameworks,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(service_obj)
    await session.commit()
    return service_to_dict(service_obj)


@app.put("/api/services/{service_id}")
async def update_service(
        service_id: str,
        service: ServiceUpdate,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    service_obj = await session.get(Service, service_id)
    if not service_obj:
        raise HTTPException(status_code=404, detail="Service not found")

    update_data = {k: v for k, v in service.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    for key, value in update_data.items():
        setattr(service_obj, key, value)
    service_obj.updated_at = datetime.now()

    await session.commit()
    await session.refresh(service_obj)
    return service_to_dict(service_obj)


@app.delete("/api/services/{service_id}")
async def delete_service(
        service_id: str,
        current_user: dict[str, Any] = Depends(get_current_admin),
        session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)
    service_obj = await session.get(Service, service_id)
    if not service_obj:
        raise HTTPException(status_code=404, detail="Service not found")

    await session.delete(service_obj)
    await session.commit()
    return {"message": "Service deleted"}


@app.post("/api/contact")
async def send_contact_message(contact: ContactMessage) -> dict[str, Any]:
    recipient = EMAIL_FROM
    if not recipient:
        raise HTTPException(status_code=503, detail="System email not configured")

    subject = f"Контакт: {contact.subject}"
    phone_text = f"\nТелефон: {contact.phone}" if contact.phone else ""
    text_content = f"""
Новое сообщение с формы контакта:

Имя: {contact.name}
Email: {contact.email}{phone_text}
Тема: {contact.subject}

Сообщение:
{contact.message}
"""

    html_content = f"""
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #5865F2;">Новое сообщение с формы контакта</h2>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
        <p><strong>Имя:</strong> {contact.name}</p>
        <p><strong>Email:</strong> {contact.email}</p>
        {f'<p><strong>Телефон:</strong> {contact.phone}</p>' if contact.phone else ''}
        <p><strong>Тема:</strong> {contact.subject}</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
        <p><strong>Сообщение:</strong></p>
        <p style="white-space: pre-wrap;">{contact.message}</p>
    </div>
</body>
</html>
"""

    loop = asyncio.get_running_loop()
    success = await loop.run_in_executor(
        None,
        _send_email_via_resend,
        recipient,
        subject,
        html_content,
        text_content
    )

    if success:
        return {"success": True, "message": "Сообщение отправлено"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")


@app.get("/api/courses", response_model=list[CourseResponse])
async def get_courses_catalog(
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    result = await session.execute(
        select(Course)
        .where(Course.is_published.is_(True))
        .order_by(Course.created_at.desc())
    )
    courses = result.scalars().all()
    return [_course_to_response(course) for course in courses]


@app.get("/api/courses/all", response_model=list[CourseResponse])
async def get_all_courses_admin(
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    result = await session.execute(select(Course).order_by(Course.created_at.desc()))
    courses = result.scalars().all()
    return [_course_to_response(course) for course in courses]


@app.get("/api/courses/{course_id}", response_model=CourseResponse)
async def get_course_detail(
    course_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    course = await session.get(Course, course_id)
    optional_user = await _get_optional_user_from_request(request, session)
    is_admin_user = bool(optional_user and optional_user.role == "admin")

    if not course or (not course.is_published and not is_admin_user):
        raise HTTPException(status_code=404, detail="Курс не найден")

    parts_result = await session.execute(
        select(CoursePart)
        .where(CoursePart.course_id == course.id)
        .order_by(CoursePart.order.asc(), CoursePart.created_at.asc())
    )
    parts = parts_result.scalars().all()

    serialized_parts: list[dict[str, Any]] = []
    for part in parts:
        if optional_user:
            has_access = await _has_access_to_part(
                session,
                optional_user.id,
                part,
                is_admin_user=is_admin_user,
            )
        else:
            has_access = bool(part.is_preview)
        serialized_parts.append(_course_part_to_response(part, has_access=has_access))

    return _course_to_response(course, parts=serialized_parts)


@app.post("/api/courses", response_model=CourseResponse, status_code=201)
async def create_course(
    payload: CourseCreate,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)
    now = datetime.now()

    course = Course(
        id=str(uuid.uuid4()),
        title=payload.title,
        short_description=payload.short_description,
        description=payload.description,
        price=int(payload.price),
        cover_url=payload.cover_url,
        is_published=bool(payload.is_published),
        created_at=now,
        updated_at=now,
    )
    session.add(course)
    await session.commit()
    await session.refresh(course)

    return _course_to_response(course)


@app.put("/api/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    course = await session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(course, key, value)
    course.updated_at = datetime.now()

    await session.commit()
    await session.refresh(course)
    return _course_to_response(course)


@app.delete("/api/courses/{course_id}")
async def delete_course(
    course_id: str,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)

    course = await session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    parts_subquery = select(CoursePart.id).where(CoursePart.course_id == course_id)
    await session.execute(
        delete(Purchase).where(
            or_(
                Purchase.course_id == course_id,
                Purchase.part_id.in_(parts_subquery),
            )
        )
    )
    await session.execute(delete(CoursePart).where(CoursePart.course_id == course_id))
    await session.delete(course)
    await session.commit()

    return {"message": "Курс удалён"}


@app.post("/api/courses/{course_id}/parts", response_model=CoursePartContentResponse, status_code=201)
async def create_course_part(
    course_id: str,
    payload: CoursePartCreate,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    course = await session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    now = datetime.now()
    part = CoursePart(
        id=str(uuid.uuid4()),
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        content=payload.content,
        price=int(payload.price),
        order=int(payload.order),
        is_preview=bool(payload.is_preview),
        created_at=now,
        updated_at=now,
    )

    session.add(part)
    await session.commit()
    await session.refresh(part)

    return _course_part_to_response(part, has_access=True, include_content=True)


@app.put("/api/courses/{course_id}/parts/{part_id}", response_model=CoursePartContentResponse)
async def update_course_part(
    course_id: str,
    part_id: str,
    payload: CoursePartUpdate,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    part = await session.get(CoursePart, part_id)
    if not part or part.course_id != course_id:
        raise HTTPException(status_code=404, detail="Раздел не найден")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(part, key, value)
    part.updated_at = datetime.now()

    await session.commit()
    await session.refresh(part)

    return _course_part_to_response(part, has_access=True, include_content=True)


@app.delete("/api/courses/{course_id}/parts/{part_id}")
async def delete_course_part(
    course_id: str,
    part_id: str,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await ensure_db_connection(session)

    part = await session.get(CoursePart, part_id)
    if not part or part.course_id != course_id:
        raise HTTPException(status_code=404, detail="Раздел не найден")

    await session.execute(delete(Purchase).where(Purchase.part_id == part_id))
    await session.delete(part)
    await session.commit()

    return {"message": "Раздел удалён"}


@app.get("/api/courses/{course_id}/parts/{part_id}/content", response_model=CoursePartContentResponse)
async def get_course_part_content(
    course_id: str,
    part_id: str,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    part = await session.get(CoursePart, part_id)
    if not part or part.course_id != course_id:
        raise HTTPException(status_code=404, detail="Раздел не найден")

    has_access = await _has_access_to_part(
        session,
        current_user.id,
        part,
        is_admin_user=current_user.role == "admin",
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Требуется покупка")

    return _course_part_to_response(part, has_access=True, include_content=True)


@app.post("/api/courses/{course_id}/purchase", response_model=PurchaseWithSbpResponse)
async def purchase_course(
    course_id: str,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(Course).where(
            Course.id == course_id,
            Course.is_published.is_(True),
        )
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    existing = await session.execute(
        select(Purchase).where(
            Purchase.user_id == current_user.id,
            Purchase.course_id == course.id,
            Purchase.part_id.is_(None),
            Purchase.status.in_(["pending", "completed"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Уже существует активная или завершённая покупка",
        )

    amount = int(course.price)
    is_free = amount == 0
    sbp_comment = None if is_free else f"CRS-{uuid.uuid4().hex[:8].upper()}"

    purchase = Purchase(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        course_id=course.id,
        part_id=None,
        amount=amount,
        status="completed" if is_free else "pending",
        sbp_comment=sbp_comment,
        created_at=datetime.now(),
    )
    session.add(purchase)
    await session.commit()
    await session.refresh(purchase)

    sbp_payload = _build_sbp_details(amount, sbp_comment) if sbp_comment else None
    return {
        "purchase": _purchase_to_response(purchase),
        "sbp": sbp_payload,
    }


@app.post("/api/courses/{course_id}/parts/{part_id}/purchase", response_model=PurchaseWithSbpResponse)
async def purchase_course_part(
    course_id: str,
    part_id: str,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    part_result = await session.execute(
        select(CoursePart).where(
            CoursePart.id == part_id,
            CoursePart.course_id == course_id,
        )
    )
    part = part_result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Раздел не найден")

    course_purchase_result = await session.execute(
        select(Purchase).where(
            Purchase.user_id == current_user.id,
            Purchase.course_id == course_id,
            Purchase.part_id.is_(None),
            Purchase.status == "completed",
        )
    )
    if course_purchase_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="У вас уже есть доступ через покупку курса")

    part_purchase_result = await session.execute(
        select(Purchase).where(
            Purchase.user_id == current_user.id,
            Purchase.part_id == part_id,
            Purchase.status.in_(["pending", "completed"]),
        )
    )
    if part_purchase_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Уже существует активная или завершённая покупка",
        )

    amount = int(part.price)
    should_complete = amount == 0 or part.is_preview
    sbp_comment = None if should_complete else f"PRT-{uuid.uuid4().hex[:8].upper()}"

    purchase = Purchase(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        course_id=None,
        part_id=part.id,
        amount=amount,
        status="completed" if should_complete else "pending",
        sbp_comment=sbp_comment,
        created_at=datetime.now(),
    )

    session.add(purchase)
    await session.commit()
    await session.refresh(purchase)

    sbp_payload = _build_sbp_details(amount, sbp_comment) if sbp_comment else None
    return {
        "purchase": _purchase_to_response(purchase),
        "sbp": sbp_payload,
    }


@app.get("/api/me/purchases", response_model=list[PurchaseResponse])
async def get_my_purchases(
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)
    result = await session.execute(
        select(Purchase)
        .where(Purchase.user_id == current_user.id)
        .order_by(Purchase.created_at.desc())
    )
    purchases = result.scalars().all()
    return [_purchase_to_response(purchase) for purchase in purchases]


@app.get("/api/admin/purchases", response_model=list[AdminPurchaseResponse])
async def get_admin_purchases(
    status: str | None = None,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    await ensure_db_connection(session)

    if status is not None and status not in VALID_PURCHASE_STATUSES:
        raise HTTPException(status_code=400, detail="Недопустимый статус")

    query = (
        select(Purchase, User, Course, CoursePart)
        .select_from(Purchase)
        .outerjoin(User, Purchase.user_id == User.id)
        .outerjoin(Course, Purchase.course_id == Course.id)
        .outerjoin(CoursePart, Purchase.part_id == CoursePart.id)
        .order_by(Purchase.created_at.desc())
    )
    if status is not None:
        query = query.where(Purchase.status == status)

    result = await session.execute(query)
    rows = result.all()

    payload: list[dict[str, Any]] = []
    for purchase, user, course, part in rows:
        payload.append(
            _admin_purchase_to_response(
                purchase=purchase,
                username=user.username if user else "Удалённый пользователь",
                course_title=course.title if course else None,
                part_title=part.title if part else None,
            )
        )

    return payload


@app.put("/api/admin/purchases/{purchase_id}/status", response_model=PurchaseResponse)
async def update_purchase_status(
    purchase_id: str,
    status: str,
    current_user: dict[str, Any] = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await ensure_db_connection(session)

    if status not in VALID_PURCHASE_STATUSES:
        raise HTTPException(status_code=400, detail="Недопустимый статус")

    purchase = await session.get(Purchase, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Покупка не найдена")

    purchase.status = status
    await session.commit()
    await session.refresh(purchase)

    return _purchase_to_response(purchase)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
