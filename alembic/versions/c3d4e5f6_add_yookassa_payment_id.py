"""Добавляет колонку yookassa_payment_id в purchases и automute_purchases."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("purchases") as batch:
        batch.add_column(sa.Column("yookassa_payment_id", sa.String(64), nullable=True))
    op.create_index(
        "ix_purchases_yookassa_payment_id",
        "purchases",
        ["yookassa_payment_id"],
    )

    with op.batch_alter_table("automute_purchases") as batch:
        batch.add_column(sa.Column("yookassa_payment_id", sa.String(64), nullable=True))
    op.create_index(
        "ix_automute_purchases_yookassa_payment_id",
        "automute_purchases",
        ["yookassa_payment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_automute_purchases_yookassa_payment_id",
        table_name="automute_purchases",
    )
    with op.batch_alter_table("automute_purchases") as batch:
        batch.drop_column("yookassa_payment_id")

    op.drop_index("ix_purchases_yookassa_payment_id", table_name="purchases")
    with op.batch_alter_table("purchases") as batch:
        batch.drop_column("yookassa_payment_id")
