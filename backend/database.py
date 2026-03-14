from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator
import ssl

from dotenv import load_dotenv
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'projects.db'}")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args={
        "ssl": ssl_context
    } if "postgresql" in DATABASE_URL else {}
)
async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(1024), default="", index=True)
    parent_path: Mapped[str] = mapped_column(String(1024), default="", index=True)
    is_folder: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    file_type: Mapped[str] = mapped_column(String(50), default="")
    is_binary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AdminResetRequest(Base):
    __tablename__ = "admin_reset_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    accent_color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    privacy_dm: Mapped[str] = mapped_column(String(20), default="all")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("user_a", "user_b", name="uq_conversations_pair"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_a: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_b: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[str] = mapped_column(String(100), nullable=False)
    estimated_time: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_methods: Mapped[str] = mapped_column(Text, nullable=False)
    frameworks: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        Index("ix_courses_is_published", "is_published"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(default=0)
    cover_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class CoursePart(Base):
    __tablename__ = "course_parts"
    __table_args__ = (
        Index("ix_course_parts_course_order", "course_id", "order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(512), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(default=0)
    order: Mapped[int] = mapped_column(default=0)
    is_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint(
            "(course_id IS NOT NULL AND part_id IS NULL) OR "
            "(course_id IS NULL AND part_id IS NOT NULL)",
            name="ck_purchase_target",
        ),
        CheckConstraint("amount >= 0", name="ck_purchase_amount"),
        CheckConstraint(
            "status IN ('pending', 'completed', 'cancelled')",
            name="ck_purchase_status",
        ),
        Index("ix_purchases_user_id", "user_id"),
        Index("ix_purchases_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    part_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("course_parts.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    sbp_comment: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


async def init_models() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
