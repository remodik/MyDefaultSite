"""Добавляет производный индекс vault: заметки, ссылки, теги, алиасы,
вложения и FTS5-таблицу для поиска.

Все эти таблицы пересобираются из .md-файлов (scripts/reindex_vault.py),
поэтому downgrade просто удаляет их — данные не теряются.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vault_notes",
        sa.Column("path", sa.String(1024), primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("folder", sa.String(1024), nullable=False, server_default=""),
        sa.Column("stem_key", sa.String(512), nullable=False),
        sa.Column("mtime", sa.Float(), nullable=False, server_default="0"),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("frontmatter", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("indexed_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_vault_notes_folder", "vault_notes", ["folder"])
    op.create_index("ix_vault_notes_stem_key", "vault_notes", ["stem_key"])

    op.create_table(
        "vault_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("source_path", sa.String(1024), nullable=False),
        sa.Column("target", sa.String(1024), nullable=False),
        sa.Column("target_key", sa.String(512), nullable=False),
        sa.Column("heading", sa.String(512), nullable=True),
        sa.Column("display", sa.String(512), nullable=True),
        sa.Column("is_embed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_vault_links_source", "vault_links", ["source_path"])
    op.create_index("ix_vault_links_target_key", "vault_links", ["target_key"])

    op.create_table(
        "vault_tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("tag", sa.String(255), nullable=False),
    )
    op.create_index("ix_vault_tags_path", "vault_tags", ["path"])
    op.create_index("ix_vault_tags_tag", "vault_tags", ["tag"])

    op.create_table(
        "vault_aliases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("alias", sa.String(512), nullable=False),
        sa.Column("alias_key", sa.String(512), nullable=False),
    )
    op.create_index("ix_vault_aliases_path", "vault_aliases", ["path"])
    op.create_index("ix_vault_aliases_alias_key", "vault_aliases", ["alias_key"])

    op.create_table(
        "vault_attachments",
        sa.Column("path", sa.String(1024), primary_key=True),
        sa.Column("name_key", sa.String(512), nullable=False),
        sa.Column("mtime", sa.Float(), nullable=False, server_default="0"),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_vault_attachments_name_key", "vault_attachments", ["name_key"])

    # FTS5 есть только в SQLite. На другой БД поиск работает по названию и пути.
    if op.get_bind().dialect.name == "sqlite":
        op.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5("
            "path UNINDEXED, title, body, tags, tokenize='unicode61 remove_diacritics 2')"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute("DROP TABLE IF EXISTS vault_fts")
    op.drop_index("ix_vault_attachments_name_key", table_name="vault_attachments")
    op.drop_table("vault_attachments")
    op.drop_index("ix_vault_aliases_alias_key", table_name="vault_aliases")
    op.drop_index("ix_vault_aliases_path", table_name="vault_aliases")
    op.drop_table("vault_aliases")
    op.drop_index("ix_vault_tags_tag", table_name="vault_tags")
    op.drop_index("ix_vault_tags_path", table_name="vault_tags")
    op.drop_table("vault_tags")
    op.drop_index("ix_vault_links_target_key", table_name="vault_links")
    op.drop_index("ix_vault_links_source", table_name="vault_links")
    op.drop_table("vault_links")
    op.drop_index("ix_vault_notes_stem_key", table_name="vault_notes")
    op.drop_index("ix_vault_notes_folder", table_name="vault_notes")
    op.drop_table("vault_notes")
