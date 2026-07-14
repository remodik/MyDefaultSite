"""Add the licensed-module distribution subsystem tables (lic_*).

Creates: lic_projects, lic_project_files, lic_clients, lic_licenses,
lic_license_module_overrides, lic_access_logs, lic_security_flags.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lic_projects",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lic_projects_slug", "lic_projects", ["slug"], unique=True)

    op.create_table(
        "lic_project_files",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("relative_path", sa.String(512), nullable=False),
        sa.Column("content_enc", sa.Text(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["lic_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "relative_path", name="uq_lic_file_path"),
    )
    op.create_index("ix_lic_project_files_project_id", "lic_project_files", ["project_id"])

    op.create_table(
        "lic_clients",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "lic_licenses",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("key_last4", sa.String(4), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("plan", sa.String(8), nullable=False, server_default="lifetime"),
        sa.Column("hardware_fingerprint", sa.String(256), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["lic_clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["lic_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lic_licenses_key_hash", "lic_licenses", ["key_hash"], unique=True)
    op.create_index("ix_lic_licenses_client_id", "lic_licenses", ["client_id"])
    op.create_index("ix_lic_licenses_project_id", "lic_licenses", ["project_id"])

    op.create_table(
        "lic_license_module_overrides",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("license_id", sa.Integer(), nullable=False),
        sa.Column("project_file_id", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["license_id"], ["lic_licenses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_file_id"], ["lic_project_files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("license_id", "project_file_id", name="uq_lic_override"),
    )
    op.create_index("ix_lic_override_license_id", "lic_license_module_overrides", ["license_id"])

    op.create_table(
        "lic_access_logs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("license_id", sa.Integer(), nullable=True),
        sa.Column("project_file_id", sa.Integer(), nullable=True),
        sa.Column("attempted_key_last4", sa.String(4), nullable=True),
        sa.Column("mode", sa.String(8), nullable=True),
        sa.Column("entrypoint", sa.String(256), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(256), nullable=True),
        sa.Column("hardware_fingerprint", sa.String(256), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(["license_id"], ["lic_licenses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_file_id"], ["lic_project_files.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lic_access_logs_license_id", "lic_access_logs", ["license_id"])
    op.create_index("ix_lic_access_logs_requested_at", "lic_access_logs", ["requested_at"])
    op.create_index("ix_lic_access_logs_success", "lic_access_logs", ["success"])

    op.create_table(
        "lic_security_flags",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("license_id", sa.Integer(), nullable=False),
        sa.Column("flag_type", sa.String(32), nullable=False),
        sa.Column("detected_at", sa.DateTime(), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("auto_action", sa.String(32), nullable=True),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("resolution", sa.String(32), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["license_id"], ["lic_licenses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lic_security_flags_license_id", "lic_security_flags", ["license_id"])
    op.create_index("ix_lic_security_flags_detected_at", "lic_security_flags", ["detected_at"])
    op.create_index("ix_lic_security_flags_resolved", "lic_security_flags", ["resolved"])


def downgrade() -> None:
    op.drop_table("lic_security_flags")
    op.drop_table("lic_access_logs")
    op.drop_table("lic_license_module_overrides")
    op.drop_index("ix_lic_licenses_project_id", table_name="lic_licenses")
    op.drop_index("ix_lic_licenses_client_id", table_name="lic_licenses")
    op.drop_index("ix_lic_licenses_key_hash", table_name="lic_licenses")
    op.drop_table("lic_licenses")
    op.drop_table("lic_clients")
    op.drop_index("ix_lic_project_files_project_id", table_name="lic_project_files")
    op.drop_table("lic_project_files")
    op.drop_index("ix_lic_projects_slug", table_name="lic_projects")
    op.drop_table("lic_projects")
