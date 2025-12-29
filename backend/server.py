import asyncio
import base64
import os
import random
import smtplib
import string
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
import bcrypt
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, or_, select, text, update
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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

FROM_EMAIL = os.getenv("FROM_EMAIL")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


SMTP_USE_TLS = _env_flag("SMTP_USE_TLS", "true")
SMTP_USE_SSL = _env_flag("SMTP_USE_SSL", "false")
SMTP_VALIDATE_CERTS = _env_flag("SMTP_VALIDATE_CERTS", "true")
SMTP_SUPPRESS_SEND = _env_flag("SMTP_SUPPRESS_SEND", "false")
SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT", "30"))
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME")

FASTMAIL_CONFIG: ConnectionConfig | None = None
FASTMAIL_CLIENT: FastMail | None = None

if SMTP_HOST:
    mail_from = FROM_EMAIL or SMTP_USER
    if mail_from:
        FASTMAIL_CONFIG = ConnectionConfig(
            MAIL_USERNAME=SMTP_USER,
            MAIL_PASSWORD=SMTP_PASSWORD,
            MAIL_FROM=mail_from,
            MAIL_FROM_NAME=SMTP_FROM_NAME,
            MAIL_PORT=SMTP_PORT,
            MAIL_SERVER=SMTP_HOST,
            MAIL_STARTTLS=SMTP_USE_TLS and not SMTP_USE_SSL,
            MAIL_SSL_TLS=SMTP_USE_SSL,
            USE_CREDENTIALS=bool(SMTP_USER and SMTP_PASSWORD),
            VALIDATE_CERTS=SMTP_VALIDATE_CERTS,
            SUPPRESS_SEND=SMTP_SUPPRESS_SEND,
        )
        FASTMAIL_CLIENT = FastMail(FASTMAIL_CONFIG)


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
    username_or_email: str


class PasswordReset(BaseModel):
    username_or_email: str
    reset_code: str
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
    content: str
    file_type: str


class FileUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


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


async def get_current_user(token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
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


def generate_reset_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _compose_reset_email(code: str) -> dict[str, str]:
    subject = "Password Reset Code"
    text_content = f"Your password reset code is: {code}\nThis code will expire in 15 minutes."
    html_content = (
        "<p><strong>Your password reset code is:</strong> "
        f"<code>{code}</code></p>"
        "<p>This code will expire in 15 minutes.</p>"
    )
    return {
        "subject": subject,
        "text": text_content,
        "html": html_content,
    }


def _send_reset_email(email: str, message_data: dict[str, str]) -> bool:
    if not SMTP_HOST:
        print("SMTP host is not configured; skipping email send.")
        return False

    sender = FROM_EMAIL or SMTP_USER
    if not sender:
        print("No sender email configured; set FROM_EMAIL or SMTP_USER.")
        return False

    if SMTP_USE_TLS and SMTP_USE_SSL:
        print("Both SMTP_USE_TLS and SMTP_USE_SSL are enabled; defaulting to TLS only.")

    mime_message = MIMEMultipart("alternative")
    mime_message["Subject"] = message_data["subject"]
    mime_message["From"] = sender
    mime_message["To"] = email

    mime_message.attach(MIMEText(message_data["text"], "plain"))
    mime_message.attach(MIMEText(message_data["html"], "html"))

    smtp_class = smtplib.SMTP_SSL if (SMTP_USE_SSL and not SMTP_USE_TLS) else smtplib.SMTP

    try:
        with smtp_class(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as server:
            server.ehlo()
            if SMTP_USE_TLS and smtp_class is smtplib.SMTP:
                server.starttls()
                server.ehlo()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(sender, [email], mime_message.as_string())
        return True
    except Exception as exc:
        print(f"Error sending email: {exc}")
        return False


async def send_reset_email(email: str, code: str) -> bool:
    message_data = _compose_reset_email(code)

    if FASTMAIL_CLIENT:
        message = MessageSchema(
            subject=message_data["subject"],
            recipients=[email],
            body=message_data["html"],
            subtype=MessageType.html,
        )
        try:
            await FASTMAIL_CLIENT.send_message(message)
            return True
        except Exception as exc:
            print(f"FastMail send failed, falling back to SMTP: {exc}")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _send_reset_email, email, message_data)


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
        select(User).where(
            or_(User.username == request.username_or_email, User.email == request.username_or_email)
        )
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.email:
        reset_code = generate_reset_code()
        reset_id = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(minutes=15)

        reset = PasswordResetModel(
            id=reset_id,
            user_id=user.id,
            code=reset_code,
            created_at=datetime.now(),
            expires_at=expires_at,
            used=False,
        )
        session.add(reset)
        await session.commit()

        email_sent = await send_reset_email(user.email, reset_code)
        
        return {
            "message": "Reset code sent to your email",
            "has_email": True,
            "email_sent": email_sent
        }

    reset_id = str(uuid.uuid4())
    admin_request = AdminResetRequest(
        id=reset_id,
        user_id=user.id,
        username=user.username,
        status="pending",
        requested_at=datetime.now(),
    )
    session.add(admin_request)
    await session.commit()

    return {
        "message": "Reset request sent to administrator",
        "has_email": False,
    }

@app.post("/api/auth/password-reset")
async def reset_password(reset: PasswordReset, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await ensure_db_connection(session)

    result = await session.execute(
        select(User).where(or_(User.username == reset.username_or_email, User.email == reset.username_or_email))
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await session.execute(
        select(PasswordResetModel).where(
            PasswordResetModel.user_id == user.id,
            PasswordResetModel.code == reset.reset_code,
            PasswordResetModel.used.is_(False),
        )
    )
    reset_request = result.scalar_one_or_none()
    
    if not reset_request:
        raise HTTPException(status_code=400, detail="Invalid reset code")
    
    if datetime.now() > reset_request.expires_at:
        raise HTTPException(status_code=400, detail="Reset code expired")

    user.password_hash = get_password_hash(reset.new_password)
    reset_request.used = True
    await session.commit()
    
    return {"message": "Password reset successful"}


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

    file_id = str(uuid.uuid4())
    file_obj = FileModel(
        id=file_id,
        project_id=file.project_id,
        name=file.name,
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

    await session.delete(file_obj)
    await session.commit()

    return {"message": "File deleted"}


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

    new_password = "qwerty123"
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
    if not SMTP_HOST:
        raise HTTPException(status_code=503, detail="Email service not configured")
    
    sender = FROM_EMAIL or SMTP_USER
    if not sender:
        raise HTTPException(status_code=503, detail="Email sender not configured")
    
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
    
    message_data = {
        "subject": subject,
        "text": text_content,
        "html": html_content,
    }
    
    if FASTMAIL_CLIENT:
        message = MessageSchema(
            subject=subject,
            recipients=[sender],
            body=html_content,
            subtype=MessageType.html,
        )
        try:
            await FASTMAIL_CLIENT.send_message(message)
            return {"success": True, "message": "Сообщение отправлено"}
        except Exception as exc:
            print(f"FastMail send failed, falling back to SMTP: {exc}")
    
    loop = asyncio.get_running_loop()
    success = await loop.run_in_executor(None, _send_reset_email, sender, message_data)
    
    if success:
        return {"success": True, "message": "Сообщение отправлено"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
