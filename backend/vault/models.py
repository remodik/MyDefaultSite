"""Таблицы vault.

``vault_notes`` / ``vault_links`` / ``vault_tags`` / ``vault_aliases`` /
``vault_attachments`` и FTS-таблица ``vault_fts`` — производный индекс: его
можно удалить и собрать заново из файлов (scripts/reindex_vault.py).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class VaultNote(Base):
    __tablename__ = "vault_notes"
    __table_args__ = (
        Index("ix_vault_notes_folder", "folder"),
        Index("ix_vault_notes_stem_key", "stem_key"),
    )

    path: Mapped[str] = mapped_column(String(1024), primary_key=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    folder: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    # Имя файла без .md в нижнем регистре — по нему разрешаются [[ссылки]].
    stem_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mtime: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    frontmatter: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    indexed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)


class VaultLink(Base):
    __tablename__ = "vault_links"
    __table_args__ = (
        Index("ix_vault_links_source", "source_path"),
        Index("ix_vault_links_target_key", "target_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Цель как написана в заметке. Разрешение в путь делается при запросе:
    # ссылка, бывшая «висячей», становится рабочей, когда появляется заметка.
    target: Mapped[str] = mapped_column(String(1024), nullable=False)
    target_key: Mapped[str] = mapped_column(String(512), nullable=False)
    heading: Mapped[str | None] = mapped_column(String(512), nullable=True)
    display: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_embed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class VaultTag(Base):
    __tablename__ = "vault_tags"
    __table_args__ = (
        Index("ix_vault_tags_path", "path"),
        Index("ix_vault_tags_tag", "tag"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    tag: Mapped[str] = mapped_column(String(255), nullable=False)


class VaultAlias(Base):
    __tablename__ = "vault_aliases"
    __table_args__ = (
        Index("ix_vault_aliases_path", "path"),
        Index("ix_vault_aliases_alias_key", "alias_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    alias: Mapped[str] = mapped_column(String(512), nullable=False)
    alias_key: Mapped[str] = mapped_column(String(512), nullable=False)


class VaultAttachment(Base):
    """Не-markdown файлы vault (картинки) — чтобы ``![[pic.png]]`` находился по имени."""

    __tablename__ = "vault_attachments"
    __table_args__ = (Index("ix_vault_attachments_name_key", "name_key"),)

    path: Mapped[str] = mapped_column(String(1024), primary_key=True)
    name_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mtime: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
