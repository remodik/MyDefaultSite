from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "licenses",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("key", sa.String(14), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("hwid", sa.String(256), nullable=True),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("offline_token", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_licenses_key", "licenses", ["key"], unique=True)
    op.create_index("ix_licenses_hwid", "licenses", ["hwid"], unique=False)

    op.create_table(
        "license_logs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("event", sa.String(32), nullable=False),
        sa.Column("hwid", sa.String(256), nullable=True),
        sa.Column("key", sa.String(14), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_license_logs_hwid", "license_logs", ["hwid"], unique=False)
    op.create_index("ix_license_logs_created_at", "license_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_license_logs_created_at", table_name="license_logs")
    op.drop_index("ix_license_logs_hwid", table_name="license_logs")
    op.drop_table("license_logs")

    op.drop_index("ix_licenses_hwid", table_name="licenses")
    op.drop_index("ix_licenses_key", table_name="licenses")
    op.drop_table("licenses")