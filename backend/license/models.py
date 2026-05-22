from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class License(Base):
    __tablename__ = "licenses"
    __table_args__ = (
        Index("ix_licenses_key", "key", unique=True),
        Index("ix_licenses_hwid", "hwid"),
        Index("ix_licenses_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(14), nullable=False, unique=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hwid: Mapped[str | None] = mapped_column(String(256), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at:   Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    offline_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    plan: Mapped[str | None] = mapped_column(String(8), nullable=True)


class LicenseLog(Base):
    __tablename__ = "license_logs"
    __table_args__ = (
        Index("ix_license_logs_hwid", "hwid"),
        Index("ix_license_logs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event: Mapped[str] = mapped_column(String(32), nullable=False)
    hwid: Mapped[str | None] = mapped_column(String(256), nullable=True)
    key:  Mapped[str | None] = mapped_column(String(14), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
