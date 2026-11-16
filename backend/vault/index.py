"""Производный индекс vault в SQLite: заметки, ссылки, теги, алиасы, FTS5.

Источник истины — файлы. Всё здесь пересобирается из них: точечно
(:func:`upsert_note` при сохранении и по событиям слежения) или целиком
(:func:`reconcile`).
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import posixpath
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from sqlalchemy import delete, select, text, or_, func
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from vault.markdown import IMAGE_EXTENSIONS, ParsedNote
from vault.models import VaultAlias, VaultAttachment, VaultLink, VaultNote, VaultTag
from vault.paths import NOTE_SUFFIX, folder_of, is_note, stem_of

FTS_TABLE = "vault_fts"
_MARK_OPEN, _MARK_CLOSE = "\x02", "\x03"
_WORD_RE = re.compile(r"\w+", re.UNICODE)


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def link_key(target: str) -> str:
    """Ключ ссылки — последний сегмент цели без .md, в нижнем регистре."""
    name = target.replace("\\", "/").strip().strip("/").rsplit("/", 1)[-1].lower()
    return name[: -len(NOTE_SUFFIX)] if name.endswith(NOTE_SUFFIX) else name


def _is_sqlite(bind) -> bool:
    return bind.dialect.name == "sqlite"


async def ensure_fts(conn: AsyncConnection) -> bool:
    """Создаёт FTS5-таблицу. На не-SQLite БД полнотекстового поиска нет —
    поиск откатывается на совпадение по названию и пути."""
    if not _is_sqlite(conn):
        return False
    await conn.exec_driver_sql(
        f"CREATE VIRTUAL TABLE IF NOT EXISTS {FTS_TABLE} USING fts5("
        "path UNINDEXED, title, body, tags, tokenize='unicode61 remove_diacritics 2')"
    )
    return True


# ── запись ───────────────────────────────────────────────────────────────────


async def delete_note(session: AsyncSession, path: str) -> None:
    await session.execute(delete(VaultNote).where(VaultNote.path == path))
    await session.execute(delete(VaultLink).where(VaultLink.source_path == path))
    await session.execute(delete(VaultTag).where(VaultTag.path == path))
    await session.execute(delete(VaultAlias).where(VaultAlias.path == path))
    if _is_sqlite(session.get_bind()):
        await session.execute(text(f"DELETE FROM {FTS_TABLE} WHERE path = :path"), {"path": path})


async def upsert_note(
    session: AsyncSession,
    path: str,
    parsed: ParsedNote,
    *,
    digest: str,
    mtime: float,
    size: int,
) -> None:
    """Заменяет все строки индекса для одной заметки. Коммит — на вызывающем."""
    await delete_note(session, path)
    title = parsed.title or stem_of(path)
    session.add(
        VaultNote(
            path=path,
            title=title[:512],
            folder=folder_of(path),
            stem_key=stem_of(path).lower()[:512],
            mtime=mtime,
            size=size,
            content_hash=digest,
            frontmatter=json.dumps(parsed.frontmatter, ensure_ascii=False),
            indexed_at=datetime.now(),
        )
    )
    for link in parsed.links:
        session.add(
            VaultLink(
                source_path=path,
                target=link.target[:1024],
                target_key=link_key(link.target)[:512],
                heading=(link.heading or None) and link.heading[:512],
                display=(link.display or None) and link.display[:512],
                is_embed=link.embed,
            )
        )
    for tag in parsed.tags:
        session.add(VaultTag(path=path, tag=tag[:255]))
    for alias in parsed.aliases:
        session.add(VaultAlias(path=path, alias=alias[:512], alias_key=alias.lower()[:512]))
    if _is_sqlite(session.get_bind()):
        await session.execute(
            text(f"INSERT INTO {FTS_TABLE} (path, title, body, tags) VALUES (:path, :title, :body, :tags)"),
            {"path": path, "title": title, "body": parsed.body, "tags": " ".join(parsed.tags)},
        )


async def upsert_attachment(session: AsyncSession, path: str, *, mtime: float, size: int) -> None:
    await session.execute(delete(VaultAttachment).where(VaultAttachment.path == path))
    session.add(
        VaultAttachment(path=path, name_key=posixpath.basename(path).lower()[:512], mtime=mtime, size=size)
    )


async def delete_attachment(session: AsyncSession, path: str) -> None:
    await session.execute(delete(VaultAttachment).where(VaultAttachment.path == path))


async def clear(session: AsyncSession) -> None:
    for model in (VaultNote, VaultLink, VaultTag, VaultAlias, VaultAttachment):
        await session.execute(delete(model))
    if _is_sqlite(session.get_bind()):
        await session.execute(text(f"DELETE FROM {FTS_TABLE}"))


# ── сканирование диска ───────────────────────────────────────────────────────


def is_attachment(path: str) -> bool:
    return posixpath.splitext(path)[1].lstrip(".").lower() in IMAGE_EXTENSIONS


def scan_files(root: Path) -> dict[str, tuple[float, int]]:
    """Все заметки и вложения vault: путь → (mtime, size). Скрытые каталоги
    (.git, .trash, .obsidian) и симлинки пропускаются."""
    found: dict[str, tuple[float, int]] = {}
    stack = [""]
    while stack:
        rel_dir = stack.pop()
        try:
            entries = list(os.scandir(root / rel_dir if rel_dir else root))
        except OSError:
            continue
        for entry in entries:
            if entry.name.startswith(".") or entry.is_symlink():
                continue
            rel = f"{rel_dir}/{entry.name}" if rel_dir else entry.name
            if entry.is_dir(follow_symlinks=False):
                stack.append(rel)
            elif entry.is_file(follow_symlinks=False) and (is_note(rel) or is_attachment(rel)):
                stat = entry.stat(follow_symlinks=False)
                found[rel] = (stat.st_mtime, stat.st_size)
    return found


# ── разрешение ссылок ────────────────────────────────────────────────────────


@dataclass
class NameIndex:
    """Имена всех заметок и вложений — для разрешения [[ссылок]] в пути."""

    paths: dict[str, str] = field(default_factory=dict)  # lower(path) → path
    stems: dict[str, list[str]] = field(default_factory=dict)
    aliases: dict[str, list[str]] = field(default_factory=dict)
    files: dict[str, list[str]] = field(default_factory=dict)  # lower(basename) → вложения
    titles: dict[str, str] = field(default_factory=dict)

    @staticmethod
    def _best(candidates: list[str], source: str | None) -> str | None:
        if not candidates:
            return None
        folder = folder_of(source) if source else None
        return min(candidates, key=lambda p: (folder_of(p) != folder, p.count("/"), len(p), p))

    def resolve(self, target: str, source: str | None = None) -> str | None:
        raw = target.replace("\\", "/").strip().strip("/")
        if not raw:
            return None
        lowered = raw.lower()
        variants = [lowered] if lowered.endswith(NOTE_SUFFIX) else [lowered, lowered + NOTE_SUFFIX]

        # 1. Путь относительно папки исходной заметки, затем от корня vault.
        bases = []
        if source and folder_of(source):
            bases.append(folder_of(source).lower())
        bases.append("")
        for base in bases:
            for variant in variants:
                joined = posixpath.normpath(posixpath.join(base, variant)) if base else posixpath.normpath(variant)
                if joined.startswith(".."):
                    continue
                if joined in self.paths:
                    return self.paths[joined]

        # 2. По имени файла (или хвосту пути) где угодно в vault.
        key = link_key(raw)
        candidates = self.stems.get(key, []) + self.files.get(lowered.rsplit("/", 1)[-1], [])
        if "/" in lowered:
            candidates = [p for p in candidates if any(p.lower().endswith("/" + v) for v in variants)]
        best = self._best(candidates, source)
        if best is not None:
            return best

        # 3. По алиасу из frontmatter.
        return self._best(self.aliases.get(lowered, []), source)


async def load_names(session: AsyncSession) -> NameIndex:
    names = NameIndex()
    for path, title, stem_key in (await session.execute(select(VaultNote.path, VaultNote.title, VaultNote.stem_key))).all():
        names.paths[path.lower()] = path
        names.stems.setdefault(stem_key, []).append(path)
        names.titles[path] = title
    for path, alias_key in (await session.execute(select(VaultAlias.path, VaultAlias.alias_key))).all():
        names.aliases.setdefault(alias_key, []).append(path)
    for path, name_key in (await session.execute(select(VaultAttachment.path, VaultAttachment.name_key))).all():
        names.paths[path.lower()] = path
        names.files.setdefault(name_key, []).append(path)
    return names


# ── поиск ────────────────────────────────────────────────────────────────────


def fts_query(query: str) -> str | None:
    """Пользовательский запрос → безопасное выражение FTS5 (префиксный AND)."""
    words = _WORD_RE.findall(query)[:12]
    if not words:
        return None
    return " ".join(f'"{word}"*' for word in words)


def folder_scope(column, prefixes: list[str]):
    return or_(False, *(func.substr(column, 1, len(p) + 1) == p + "/" for p in prefixes))


async def search(session: AsyncSession, query: str, limit: int = 50, *, prefixes: list[str] | None = None) -> list[dict[str, str]]:
    """Полнотекстовый поиск: путь и фрагмент с подсветкой (``snippet_html``
    экранирован, совпадения обёрнуты в <mark>)."""
    limit = max(1, min(limit, 200))
    if _is_sqlite(session.get_bind()):
        args = {"limit": limit, "mo": _MARK_OPEN, "mc": _MARK_CLOSE}
        scope = ""
        if prefixes is not None and "" not in prefixes:
            scope = " AND (" + " OR ".join(
                f"substr(path, 1, length(:p{i})) = :p{i}" for i in range(len(prefixes))
            ) + ")" if prefixes else " AND 0"
            args.update({f"p{i}": p + "/" for i, p in enumerate(prefixes)})
        expr = fts_query(query)
        if expr is None:
            return []
        rows = (
            await session.execute(
                text(
                    f"SELECT path, snippet({FTS_TABLE}, 2, :mo, :mc, '…', 14) AS snip "
                    f"FROM {FTS_TABLE} WHERE {FTS_TABLE} MATCH :q {scope} "
                    f"ORDER BY bm25({FTS_TABLE}, 0.0, 8.0, 1.0, 4.0) LIMIT :limit"
                ),
                {**args, "q": expr},
            )
        ).all()
        out = []
        for path, snip in rows:
            snip = snip or ""
            escaped = html.escape(snip).replace(_MARK_OPEN, "<mark>").replace(_MARK_CLOSE, "</mark>")
            plain = snip.replace(_MARK_OPEN, "").replace(_MARK_CLOSE, "")
            out.append({"path": path, "snippet": plain, "snippet_html": escaped})
        return out

    pattern = f"%{query.strip().lower()}%"
    rows = (
        await session.execute(
            select(VaultNote.path)
            .where(VaultNote.title.ilike(pattern) | VaultNote.path.ilike(pattern))
            .where(True if prefixes is None or "" in prefixes else folder_scope(VaultNote.path, prefixes))
            .order_by(VaultNote.path)
            .limit(limit)
        )
    ).all()
    return [{"path": path, "snippet": "", "snippet_html": ""} for (path,) in rows]
