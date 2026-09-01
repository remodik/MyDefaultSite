from __future__ import annotations

import logging
import os
import ssl
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

import re

_raw_url = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'projects.db'}")
DATABASE_URL = re.sub(r'\?.*$', '', _raw_url)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

log = logging.getLogger(__name__)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    # Проверка живости перед выдачей из пула: провайдер закрывает
    # простаивающие соединения, а пул об этом не узнаёт.
    pool_pre_ping=True,
    # pre_ping ловит мёртвое соединение в момент выдачи, но не мешает пулу
    # копить те, что вот-вот закроются на той стороне. Порог держим заметно
    # ниже провайдерского idle-таймаута.
    pool_recycle=300,
    connect_args={"ssl": "require"} if "postgresql" in DATABASE_URL else {}
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
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
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
    module_title: Mapped[str] = mapped_column(String(255), default="")
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
    yookassa_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Work(Base):
    __tablename__ = "works"
    __table_args__ = (
        Index("ix_works_slug", "slug", unique=True),
        Index("ix_works_is_published", "is_published"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(255), default="")
    display_date: Mapped[str] = mapped_column(String(64), default="")
    icon: Mapped[str] = mapped_column(String(64), default="book")
    tags: Mapped[str] = mapped_column(Text, default="")
    html_content: Mapped[str] = mapped_column(Text, default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class Donation(Base):
    __tablename__ = "donations"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_donation_amount"),
        CheckConstraint(
            "status IN ('pending', 'completed', 'cancelled')",
            name="ck_donation_status",
        ),
        Index("ix_donations_status", "status"),
        Index("ix_donations_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    amount: Mapped[int] = mapped_column(default=0)
    message: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    yookassa_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


async def _add_missing_columns(conn, table: str, columns: dict[str, str]) -> None:
    """Идемпотентно добавить недостающие колонки в существующую таблицу.

    Имена таблиц/колонок и DDL здесь — константы из кода, не пользовательский
    ввод, поэтому подстановка в SQL безопасна.
    """
    if "postgresql" in DATABASE_URL:
        for name, ddl in columns.items():
            await conn.exec_driver_sql(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl}"
            )
        return

    # SQLite не знает ADD COLUMN IF NOT EXISTS — сверяемся с фактической схемой.
    result = await conn.exec_driver_sql(f"PRAGMA table_info({table})")
    existing = {row[1] for row in result}
    if not existing:  # таблицы нет — её только что создал create_all()
        return
    for name, ddl in columns.items():
        if name not in existing:
            await conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


async def init_models() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # create_all() создаёт недостающие таблицы, но не добавляет новые
        # колонки в уже существующие. Для Postgres докатываем схему вручную
        # идемпотентными ALTER-ами, чтобы вход через Google работал без
        # отдельного запуска Alembic. На свежей БД (колонки уже созданы
        # create_all) и при повторном старте это no-op.
        if "postgresql" in DATABASE_URL:
            try:
                await conn.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)"
                )
                await conn.exec_driver_sql(
                    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"
                )
                await conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"
                )
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: google_id schema upgrade skipped: {exc}")

        # Биллинг-колонки lic_licenses (цена и статус оплаты для личного
        # кабинета) добавлены позже самой таблицы, а create_all() уже
        # существующие таблицы не трогает — докатываем их тем же способом.
        try:
            await _add_missing_columns(
                conn,
                "lic_licenses",
                {
                    "price_amount": "INTEGER",
                    "price_currency": "VARCHAR(3) NOT NULL DEFAULT 'RUB'",
                    "payment_status": "VARCHAR(16) NOT NULL DEFAULT 'none'",
                    "payment_instructions": "TEXT",
                    "payment_claimed_at": "TIMESTAMP",
                    "paid_at": "TIMESTAMP",
                },
            )
            # create_all() пропускает существующую таблицу целиком, вместе с
            # её индексами, поэтому индекс тоже создаём вручную.
            await conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_lic_licenses_payment_status "
                "ON lic_licenses (payment_status)"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: lic_licenses billing schema upgrade skipped: {exc}")


async def get_session() -> AsyncIterator[AsyncSession]:
    """Сессия на запрос.

    Уборка обёрнута намеренно. Если соединение к моменту выхода уже мертво
    (Render закрыл простаивающее, клиент отвалился и asyncpg снял запрос),
    то `rollback()` и `close()` сами падают с InterfaceError — и он встаёт
    на место исходного исключения. В логе тогда виден трейсбек про
    «cannot call Transaction.rollback(): the underlying connection is
    closed», а настоящая причина отказа запроса теряется.

    Второе: мёртвое соединение выбрасывается из пула через `invalidate()`.
    Иначе оно возвращается в пул как исправное и достаётся следующему
    запросу — та же ошибка повторяется, пока пул не пересоберётся.
    """
    session = async_session_factory()
    try:
        yield session
    except Exception:
        try:
            await session.rollback()
        except Exception:
            log.warning("откат не удался: соединение закрыто", exc_info=True)
            with suppress(Exception):
                await session.invalidate()
        raise  # исходное исключение важнее ошибки уборки
    finally:
        try:
            await session.close()
        except Exception:
            log.warning("закрытие сессии не удалось: соединение закрыто", exc_info=True)
            with suppress(Exception):
                await session.invalidate()
