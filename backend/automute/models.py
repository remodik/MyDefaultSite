from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AutoMutePurchase(Base):
    __tablename__ = "automute_purchases"
    __table_args__ = (
        Index("ix_automute_purchases_user_id", "user_id"),
        Index("ix_automute_purchases_status", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    plan: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    sbp_comment: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("licenses.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AutoMuteLog(Base):
    __tablename__ = "automute_logs"
    __table_args__ = (
        Index("ix_automute_logs_hwid", "hwid"),
        Index("ix_automute_logs_user_id", "user_id"),
        Index("ix_automute_logs_triggered_at", "triggered_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    license_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("licenses.id", ondelete="SET NULL"), nullable=True
    )
    hwid: Mapped[str] = mapped_column(String(256), nullable=False)
    server_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    player_name: Mapped[str] = mapped_column(String(64), nullable=False)
    category_name: Mapped[str] = mapped_column(String(128), nullable=False)
    word: Mapped[str | None] = mapped_column(String(255), nullable=True)
    command: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
