"""Add billing columns to lic_licenses (client portal pricing / payment).

Lets the owner put a price on a license, the client claim payment from the
portal, and the owner confirm it. Amounts are whole currency units, matching
the site's existing ``donations.amount`` / ``purchases.amount`` convention.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default is required: existing rows must get a value for the
    # NOT NULL columns. The ORM-side default handles new rows either way.
    op.add_column("lic_licenses", sa.Column("price_amount", sa.Integer(), nullable=True))
    op.add_column(
        "lic_licenses",
        sa.Column("price_currency", sa.String(3), nullable=False, server_default="RUB"),
    )
    op.add_column(
        "lic_licenses",
        sa.Column("payment_status", sa.String(16), nullable=False, server_default="none"),
    )
    op.add_column("lic_licenses", sa.Column("payment_instructions", sa.Text(), nullable=True))
    op.add_column("lic_licenses", sa.Column("payment_claimed_at", sa.DateTime(), nullable=True))
    op.add_column("lic_licenses", sa.Column("paid_at", sa.DateTime(), nullable=True))

    op.create_index("ix_lic_licenses_payment_status", "lic_licenses", ["payment_status"])


def downgrade() -> None:
    op.drop_index("ix_lic_licenses_payment_status", table_name="lic_licenses")
    op.drop_column("lic_licenses", "paid_at")
    op.drop_column("lic_licenses", "payment_claimed_at")
    op.drop_column("lic_licenses", "payment_instructions")
    op.drop_column("lic_licenses", "payment_status")
    op.drop_column("lic_licenses", "price_currency")
    op.drop_column("lic_licenses", "price_amount")
