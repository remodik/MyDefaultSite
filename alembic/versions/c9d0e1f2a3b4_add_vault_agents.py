"""Add vault agent tokens and write approvals."""

from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "api_tokens",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False, unique=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("prefixes", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_table(
        "vault_pending_writes",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("token_id", sa.String(32), sa.ForeignKey("api_tokens.id"), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("reviewer", sa.String(60)),
    )
    for column in ("status", "token_id"):
        op.create_index(f"ix_vault_pending_writes_{column}", "vault_pending_writes", [column])


def downgrade():
    op.drop_table("vault_pending_writes")
    op.drop_table("api_tokens")
