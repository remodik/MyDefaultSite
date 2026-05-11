"""Добавляет таблицы AutoMute (purchases + logs) и расширяет licenses (user_id, plan)."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Расширяем licenses
    with op.batch_alter_table("licenses") as batch:
        batch.add_column(sa.Column("user_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("plan", sa.String(8), nullable=True))
    op.create_index("ix_licenses_user_id", "licenses", ["user_id"], unique=False)

    # 2. Покупки подписок AutoMute
    op.create_table(
        "automute_purchases",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("plan", sa.String(8), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sbp_comment", sa.String(64), nullable=True),
        sa.Column("license_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["license_id"], ["licenses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_automute_purchases_user_id", "automute_purchases", ["user_id"])
    op.create_index("ix_automute_purchases_status", "automute_purchases", ["status"])

    # 3. Логи нарушений
    op.create_table(
        "automute_logs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("license_id", sa.Integer(), nullable=True),
        sa.Column("hwid", sa.String(256), nullable=False),
        sa.Column("server_address", sa.String(255), nullable=True),
        sa.Column("player_name", sa.String(64), nullable=False),
        sa.Column("category_name", sa.String(128), nullable=False),
        sa.Column("word", sa.String(255), nullable=True),
        sa.Column("command", sa.Text(), nullable=True),
        sa.Column("triggered_message", sa.Text(), nullable=True),
        sa.Column("screenshot_url", sa.String(512), nullable=True),
        sa.Column("triggered_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["license_id"], ["licenses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_automute_logs_hwid", "automute_logs", ["hwid"])
    op.create_index("ix_automute_logs_user_id", "automute_logs", ["user_id"])
    op.create_index("ix_automute_logs_triggered_at", "automute_logs", ["triggered_at"])


def downgrade() -> None:
    op.drop_index("ix_automute_logs_triggered_at", table_name="automute_logs")
    op.drop_index("ix_automute_logs_user_id", table_name="automute_logs")
    op.drop_index("ix_automute_logs_hwid", table_name="automute_logs")
    op.drop_table("automute_logs")

    op.drop_index("ix_automute_purchases_status", table_name="automute_purchases")
    op.drop_index("ix_automute_purchases_user_id", table_name="automute_purchases")
    op.drop_table("automute_purchases")

    op.drop_index("ix_licenses_user_id", table_name="licenses")
    with op.batch_alter_table("licenses") as batch:
        batch.drop_column("plan")
        batch.drop_column("user_id")
