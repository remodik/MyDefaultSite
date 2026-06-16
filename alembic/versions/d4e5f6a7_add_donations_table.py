"""Добавляет таблицу donations (пожертвования)."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "donations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("yookassa_payment_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount >= 0", name="ck_donation_amount"),
        sa.CheckConstraint(
            "status IN ('pending', 'completed', 'cancelled')",
            name="ck_donation_status",
        ),
    )
    op.create_index("ix_donations_status", "donations", ["status"])
    op.create_index("ix_donations_created_at", "donations", ["created_at"])
    op.create_index(
        "ix_donations_yookassa_payment_id", "donations", ["yookassa_payment_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_donations_yookassa_payment_id", table_name="donations")
    op.drop_index("ix_donations_created_at", table_name="donations")
    op.drop_index("ix_donations_status", table_name="donations")
    op.drop_table("donations")
