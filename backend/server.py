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
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    AdminResetRequest,
    ChatMessage,
    File as FileModel,
    PasswordReset as PasswordResetModel,
    Project,
    Service,
    User,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

WAKATIME_API_KEY = os.getenv("WAKATIME_API_KEY")
wakatime_cache = {
    "data": None,
    "expires_at": None
}

WAKATIME_CACHE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "dev@remod3.ru")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://remod3.ru")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    print("WARNING: RESEND_API_KEY is not set. Emails will not be sent.")


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


async def get_current_user(token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)) -> dict[
    str, Any]:
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
    return user_to_public_dict(user)


async def get_current_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


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
    # noinspection PyUnresolvedReferences,PyTypeChecker
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

    file_id = str(uuid.uuid4())
    file_obj = FileModel(
        id=file_id,
        project_id=file.project_id,
        name=file.name,
        path=full_path,
        parent_path=file.parent_path,
        is_folder=file.is_folder,
        content=file.content,
        file_type=file.file_type,
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
    file_type = file.filename.split(".")[-1] if "." in file.filename else "txt"

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
    # noinspection PyUnresolvedReferences,PyTypeChecker
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


@app.get("/api/wakatime/stats")
async def get_wakatime_stats() -> dict[str, Any]:
    if not WAKATIME_API_KEY:
        raise HTTPException(status_code=503, detail="Wakatime API key not configured")

    now = datetime.now()
    if (wakatime_cache["data"] is not None and
            wakatime_cache["expires_at"] is not None and
            now < wakatime_cache["expires_at"]):
        return {
            **wakatime_cache["data"],
            "cached": True,
            "cache_expires_at": wakatime_cache["expires_at"].isoformat()
        }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://wakatime.com/api/v1/users/current/stats/last_7_days",
                headers={"Authorization": f"Bearer {WAKATIME_API_KEY}"},
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

            wakatime_cache["data"] = data
            wakatime_cache["expires_at"] = now + timedelta(minutes=WAKATIME_CACHE_MINUTES)

            return {
                **data,
                "cached": False,
                "cache_expires_at": wakatime_cache["expires_at"].isoformat()
            }
    except httpx.HTTPError as e:
        if wakatime_cache["data"] is not None:
            return {
                **wakatime_cache["data"],
                "cached": True,
                "stale": True,
                "error": str(e)
            }
        raise HTTPException(status_code=503, detail=f"Wakatime API error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)