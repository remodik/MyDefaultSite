"""Сервис vault — единственный слой, который трогает файлы, git и индекс.

REST-роутер и MCP-сервер вызывают одни и те же методы, поэтому проверка
путей, лимиты размера и коммиты у них общие.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any

from sqlalchemy import func, or_, select

from vault import config, gitrepo, index
from vault.events import EventBus
from vault.markdown import ParsedNote, parse
from vault.models import VaultAttachment, VaultLink, VaultNote, VaultTag
from vault.paths import (
    TRASH_DIR,
    VaultPathError,
    folder_of,
    is_note,
    normalize_folder,
    normalize_path,
    safe_join,
    stem_of,
)

RECONCILE_BATCH = 25


class VaultError(Exception):
    status_code = 400

    def __init__(self, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.message = message
        self.extra = extra


class VaultNotFound(VaultError):
    status_code = 404


class VaultConflict(VaultError):
    status_code = 409


class VaultTooLarge(VaultError):
    status_code = 413


class VaultResolver:
    """Связывает парсер с индексом имён и файлами на диске."""

    def __init__(self, names: index.NameIndex, root: Path) -> None:
        self._names = names
        self._root = root

    def resolve(self, target: str, source: str | None) -> str | None:
        return self._names.resolve(target, source)

    def read(self, path: str) -> str | None:
        try:
            abs_path = safe_join(self._root, path)
            if not abs_path.is_file() or abs_path.stat().st_size > config.max_note_bytes():
                return None
            return abs_path.read_text(encoding="utf-8", errors="replace")
        except (OSError, VaultPathError):
            return None


def _like_prefix(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "/%"


def _write_atomic(abs_path: Path, data: bytes) -> None:
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    # Скрытое имя: слежение и сканер пропускают файлы с точкой в начале.
    tmp = abs_path.with_name(f".{abs_path.name}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, abs_path)
    finally:
        tmp.unlink(missing_ok=True)


def _prune_empty_dirs(root: Path, start: Path) -> None:
    current = start
    while current != root and root in current.parents:
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


class VaultService:
    def __init__(self, root: Path | None = None, session_factory: Any = None) -> None:
        self._root = (root or config.vault_dir()).resolve()
        if session_factory is None:
            from database import async_session_factory

            session_factory = async_session_factory
        self._sessions = session_factory
        self.events = EventBus()
        # Один писатель за раз: файл, коммит и индекс меняются согласованно,
        # а SQLite не упирается в «database is locked».
        self._lock = asyncio.Lock()
        self._names: index.NameIndex | None = None
        self._started = False

    @property
    def root(self) -> Path:
        return self._root

    # ── жизненный цикл ───────────────────────────────────────────────────────

    async def start(self) -> None:
        """Каталог, git-репозиторий и FTS-таблица. Быстро и идемпотентно —
        вызывается при каждом старте процесса."""
        if self._started:
            return
        await asyncio.to_thread(gitrepo.ensure_repo, self._root)
        async with self._sessions() as session:
            conn = await session.connection()
            await index.ensure_fts(conn)
            await session.commit()
        self._started = True

    def _invalidate(self) -> None:
        self._names = None

    async def names(self) -> index.NameIndex:
        if self._names is None:
            async with self._sessions() as session:
                self._names = await index.load_names(session)
        return self._names

    # ── чтение ───────────────────────────────────────────────────────────────

    def _note_path(self, raw: str) -> tuple[str, Path]:
        path = normalize_path(raw)
        return path, safe_join(self._root, path)

    async def _read_bytes(self, path: str, abs_path: Path) -> bytes:
        def read() -> bytes:
            if not abs_path.is_file():
                raise VaultNotFound(f"заметка не найдена: {path}")
            if abs_path.stat().st_size > config.max_note_bytes():
                raise VaultTooLarge(f"заметка больше лимита: {path}")
            return abs_path.read_bytes()

        return await asyncio.to_thread(read)

    async def read_note(self, raw_path: str, *, render: bool = True) -> dict[str, Any]:
        path, abs_path = self._note_path(raw_path)
        data = await self._read_bytes(path, abs_path)
        content = data.decode("utf-8", errors="replace")
        names = await self.names()
        resolver = VaultResolver(names, self._root)
        parsed: ParsedNote = await asyncio.to_thread(parse, content, resolver=resolver, source=path)
        stat = abs_path.stat()

        links = []
        for link in parsed.links:
            resolved = names.resolve(link.target, path)
            links.append(
                {
                    "target": link.target,
                    "heading": link.heading,
                    "display": link.display,
                    "embed": link.embed,
                    "path": resolved,
                    "title": names.titles.get(resolved) if resolved else None,
                }
            )
        result: dict[str, Any] = {
            "path": path,
            "title": parsed.title or stem_of(path),
            "folder": folder_of(path),
            "content": content,
            "hash": index.content_hash(data),
            "mtime": stat.st_mtime,
            "size": stat.st_size,
            "frontmatter": parsed.frontmatter,
            "tags": parsed.tags,
            "aliases": parsed.aliases,
            "headings": [{"level": h.level, "text": h.text, "slug": h.slug} for h in parsed.headings],
            "links": links,
        }
        if render:
            result["html"] = parsed.html
        return result

    async def render_preview(self, content: str, source: str | None = None) -> str:
        """HTML для несохранённого текста — предпросмотр во время правки."""
        if len(content.encode("utf-8")) > config.max_note_bytes():
            raise VaultTooLarge("текст больше лимита")
        source_path = normalize_path(source) if source else None
        resolver = VaultResolver(await self.names(), self._root)
        parsed = await asyncio.to_thread(parse, content, resolver=resolver, source=source_path)
        return parsed.html

    async def list_notes(
        self,
        *,
        tag: str | None = None,
        folder: str | None = None,
        q: str | None = None,
        limit: int = 5000,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 5000))
        async with self._sessions() as session:
            stmt = select(VaultNote.path, VaultNote.title, VaultNote.folder, VaultNote.mtime, VaultNote.size)
            folder_norm = normalize_folder(folder)
            if folder_norm:
                stmt = stmt.where(
                    or_(
                        VaultNote.folder == folder_norm,
                        VaultNote.folder.like(_like_prefix(folder_norm), escape="\\"),
                    )
                )
            if tag and tag.strip().lstrip("#"):
                wanted = tag.strip().lstrip("#").strip("/").lower()
                stmt = stmt.where(
                    VaultNote.path.in_(
                        select(VaultTag.path).where(
                            or_(VaultTag.tag == wanted, VaultTag.tag.like(_like_prefix(wanted), escape="\\"))
                        )
                    )
                )

            snippets: dict[str, dict[str, str]] = {}
            order: dict[str, int] = {}
            if q and q.strip():
                hits = await index.search(session, q, limit=min(limit, 200))
                if not hits:
                    return []
                for rank, hit in enumerate(hits):
                    snippets[hit["path"]] = hit
                    order[hit["path"]] = rank
                stmt = stmt.where(VaultNote.path.in_(list(order)))
            else:
                stmt = stmt.order_by(VaultNote.path).limit(limit)

            rows = (await session.execute(stmt)).all()
            paths = [row.path for row in rows]
            tags: dict[str, list[str]] = {}
            if paths:
                tag_stmt = select(VaultTag.path, VaultTag.tag)
                if len(paths) <= 500:
                    tag_stmt = tag_stmt.where(VaultTag.path.in_(paths))
                wanted_paths = set(paths)
                for tag_path, tag_name in (await session.execute(tag_stmt)).all():
                    if tag_path in wanted_paths:
                        tags.setdefault(tag_path, []).append(tag_name)

        notes = [
            {
                "path": row.path,
                "title": row.title,
                "folder": row.folder,
                "mtime": row.mtime,
                "size": row.size,
                "tags": tags.get(row.path, []),
                **(
                    {
                        "snippet": snippets[row.path]["snippet"],
                        "snippet_html": snippets[row.path]["snippet_html"],
                    }
                    if row.path in snippets
                    else {}
                ),
            }
            for row in rows
        ]
        if order:
            notes.sort(key=lambda note: order[note["path"]])
        return notes

    async def list_tags(self) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            rows = (
                await session.execute(
                    select(VaultTag.tag, func.count(func.distinct(VaultTag.path)))
                    .group_by(VaultTag.tag)
                    .order_by(VaultTag.tag)
                )
            ).all()
        return [{"tag": tag, "count": count} for tag, count in rows]

    async def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        notes = await self.list_notes(q=query, limit=limit)
        return notes[: max(1, min(limit, 200))]

    async def attachment_path(self, raw_path: str) -> Path:
        path = normalize_path(raw_path, note=False)
        if not index.is_attachment(path):
            raise VaultError("этот тип файла не отдаётся")
        abs_path = safe_join(self._root, path)
        if not abs_path.is_file():
            raise VaultNotFound(f"файл не найден: {path}")
        if abs_path.stat().st_size > config.max_attachment_bytes():
            raise VaultTooLarge("файл больше лимита")
        return abs_path

    # ── ссылки и граф ────────────────────────────────────────────────────────

    async def backlinks(self, raw_path: str) -> list[dict[str, Any]]:
        path = normalize_path(raw_path)
        names = await self.names()
        if path.lower() not in names.paths:
            raise VaultNotFound(f"заметка не найдена: {path}")
        keys = {stem_of(path).lower()}
        keys.update(key for key, paths in names.aliases.items() if path in paths)
        async with self._sessions() as session:
            rows = (
                await session.execute(
                    select(VaultLink.source_path, VaultLink.target, VaultLink.heading, VaultLink.is_embed)
                    .where(VaultLink.target_key.in_(keys))
                    .order_by(VaultLink.source_path)
                )
            ).all()
        out: list[dict[str, Any]] = []
        seen: set[tuple[str, str | None]] = set()
        for source, target, heading, is_embed in rows:
            if source == path or names.resolve(target, source) != path or (source, heading) in seen:
                continue
            seen.add((source, heading))
            out.append(
                {
                    "path": source,
                    "title": names.titles.get(source, stem_of(source)),
                    "heading": heading,
                    "embed": bool(is_embed),
                }
            )
        return out

    async def _graph(self) -> tuple[dict[str, dict[str, Any]], set[tuple[str, str]]]:
        """Полный граф: узлы-заметки, «висячие» цели и рёбра между ними."""
        names = await self.names()
        async with self._sessions() as session:
            note_rows = (await session.execute(select(VaultNote.path, VaultNote.title, VaultNote.folder))).all()
            tag_rows = (await session.execute(select(VaultTag.path, VaultTag.tag))).all()
            link_rows = (await session.execute(select(VaultLink.source_path, VaultLink.target))).all()

        nodes: dict[str, dict[str, Any]] = {
            path: {"id": path, "title": title, "folder": folder, "tags": [], "unresolved": False}
            for path, title, folder in note_rows
        }
        for path, tag in tag_rows:
            if path in nodes:
                nodes[path]["tags"].append(tag)

        edges: set[tuple[str, str]] = set()
        for source, target in link_rows:
            if source not in nodes:
                continue
            resolved = names.resolve(target, source)
            if resolved is None:
                ghost = "?" + index.link_key(target)
                nodes.setdefault(
                    ghost, {"id": ghost, "title": target, "folder": "", "tags": [], "unresolved": True}
                )
                edges.add((source, ghost))
            elif is_note(resolved) and resolved in nodes and resolved != source:
                edges.add((source, resolved))
        return nodes, edges

    @staticmethod
    def _graph_payload(nodes: dict[str, dict[str, Any]], edges: set[tuple[str, str]]) -> dict[str, Any]:
        degree: dict[str, int] = {}
        for source, target in edges:
            degree[source] = degree.get(source, 0) + 1
            degree[target] = degree.get(target, 0) + 1
        return {
            "nodes": [{**node, "degree": degree.get(node_id, 0)} for node_id, node in sorted(nodes.items())],
            "edges": [{"source": s, "target": t} for s, t in sorted(edges)],
        }

    async def graph(
        self,
        *,
        tag: str | None = None,
        folder: str | None = None,
        unresolved: bool = False,
        orphans: bool = True,
    ) -> dict[str, Any]:
        nodes, edges = await self._graph()
        folder_norm = normalize_folder(folder)
        wanted_tag = tag.strip().lstrip("#").strip("/").lower() if tag and tag.strip() else None

        def keep(node: dict[str, Any]) -> bool:
            if node["unresolved"]:
                return unresolved
            if folder_norm and not (
                node["folder"] == folder_norm or node["folder"].startswith(folder_norm + "/")
            ):
                return False
            if wanted_tag and not any(t == wanted_tag or t.startswith(wanted_tag + "/") for t in node["tags"]):
                return False
            return True

        nodes = {node_id: node for node_id, node in nodes.items() if keep(node)}
        edges = {(s, t) for s, t in edges if s in nodes and t in nodes}
        linked = {node_id for edge in edges for node_id in edge}
        # «Висячая» цель без видимого источника — всегда шум, а не сирота.
        nodes = {
            node_id: node
            for node_id, node in nodes.items()
            if node_id in linked or (orphans and not node["unresolved"])
        }
        return self._graph_payload(nodes, edges)

    async def local_graph(self, raw_path: str, depth: int = 1) -> dict[str, Any]:
        path = normalize_path(raw_path)
        depth = 2 if depth >= 2 else 1
        nodes, edges = await self._graph()
        if path not in nodes:
            raise VaultNotFound(f"заметка не найдена: {path}")
        neighbours: dict[str, set[str]] = {}
        for source, target in edges:
            neighbours.setdefault(source, set()).add(target)
            neighbours.setdefault(target, set()).add(source)

        distance = {path: 0}
        queue = deque([path])
        while queue:
            current = queue.popleft()
            if distance[current] >= depth:
                continue
            for other in neighbours.get(current, ()):
                if other not in distance:
                    distance[other] = distance[current] + 1
                    queue.append(other)

        local_nodes = {node_id: {**nodes[node_id], "depth": dist} for node_id, dist in distance.items()}
        local_edges = {(s, t) for s, t in edges if s in distance and t in distance}
        payload = self._graph_payload(local_nodes, local_edges)
        payload["center"] = path
        return payload

    # ── запись ───────────────────────────────────────────────────────────────

    async def _index_path(self, session: Any, path: str) -> str | None:
        """Переиндексирует один файл с диска. Возвращает хэш заметки."""
        abs_path = safe_join(self._root, path)
        stat = abs_path.stat()
        if not is_note(path):
            await index.upsert_attachment(session, path, mtime=stat.st_mtime, size=stat.st_size)
            return None
        if stat.st_size > config.max_note_bytes():
            # Слишком большой файл остаётся на диске, но в индекс не попадает.
            await index.delete_note(session, path)
            return None
        data = await asyncio.to_thread(abs_path.read_bytes)
        parsed = await asyncio.to_thread(parse, data.decode("utf-8", errors="replace"), source=path)
        digest = index.content_hash(data)
        await index.upsert_note(session, path, parsed, digest=digest, mtime=stat.st_mtime, size=stat.st_size)
        return digest

    def _publish(self, event_type: str, **payload: Any) -> None:
        self.events.publish({"type": event_type, "ts": time.time(), **payload})

    def _check_size(self, content: str) -> bytes:
        data = content.encode("utf-8")
        if len(data) > config.max_note_bytes():
            raise VaultTooLarge(f"заметка больше лимита {config.max_note_bytes()} байт")
        return data

    async def _save(self, path: str, abs_path: Path, data: bytes, actor: str, action: str) -> dict[str, Any]:
        await asyncio.to_thread(_write_atomic, abs_path, data)
        commit = await asyncio.to_thread(gitrepo.commit_paths, self._root, [path], f"{action}: {path}", actor)
        async with self._sessions() as session:
            digest = await self._index_path(session, path)
            await session.commit()
        self._invalidate()
        self._publish("note_changed", path=path, action=action, actor=actor, commit=commit, hash=digest)
        return {"path": path, "hash": digest, "commit": commit, "action": action}

    async def create_note(self, raw_path: str, content: str, actor: str) -> dict[str, Any]:
        path, abs_path = self._note_path(raw_path)
        data = self._check_size(content)
        async with self._lock:
            if abs_path.exists():
                raise VaultConflict(f"заметка уже существует: {path}")
            return await self._save(path, abs_path, data, actor, "create")

    async def update_note(
        self, raw_path: str, content: str, actor: str, *, expected_hash: str | None = None
    ) -> dict[str, Any]:
        """Перезаписывает заметку. ``expected_hash`` — хэш версии, которую видел
        автор правки: если файл с тех пор изменился, правка отклоняется."""
        path, abs_path = self._note_path(raw_path)
        data = self._check_size(content)
        async with self._lock:
            current = await self._read_bytes(path, abs_path)
            current_hash = index.content_hash(current)
            if expected_hash is not None and expected_hash != current_hash:
                raise VaultConflict(
                    "заметка изменилась с момента чтения — перечитайте её и повторите",
                    current_hash=current_hash,
                )
            if current == data:
                return {"path": path, "hash": current_hash, "commit": None, "action": "unchanged"}
            return await self._save(path, abs_path, data, actor, "update")

    async def append_to_note(self, raw_path: str, addition: str, actor: str) -> dict[str, Any]:
        path, abs_path = self._note_path(raw_path)
        async with self._lock:
            current = (await self._read_bytes(path, abs_path)).decode("utf-8", errors="replace")
            if current and not current.endswith("\n"):
                current += "\n"
            data = self._check_size(current + addition + ("" if addition.endswith("\n") else "\n"))
            return await self._save(path, abs_path, data, actor, "append")

    async def _relocate(self, path: str, new_path: str, actor: str, action: str) -> dict[str, Any]:
        abs_path = safe_join(self._root, path)
        new_abs = safe_join(self._root, new_path)

        def move() -> None:
            new_abs.parent.mkdir(parents=True, exist_ok=True)
            os.replace(abs_path, new_abs)
            _prune_empty_dirs(self._root, abs_path.parent)

        await asyncio.to_thread(move)
        commit = await asyncio.to_thread(
            gitrepo.commit_paths, self._root, [path, new_path], f"{action}: {path} -> {new_path}", actor
        )
        async with self._sessions() as session:
            await index.delete_note(session, path)
            if not new_path.startswith(TRASH_DIR + "/"):
                await self._index_path(session, new_path)
            await session.commit()
        self._invalidate()
        return {"path": path, "new_path": new_path, "commit": commit, "action": action}

    async def move_note(self, raw_path: str, raw_new_path: str, actor: str) -> dict[str, Any]:
        path, abs_path = self._note_path(raw_path)
        new_path, new_abs = self._note_path(raw_new_path)
        if path == new_path:
            raise VaultError("новый путь совпадает со старым")
        async with self._lock:
            if not abs_path.is_file():
                raise VaultNotFound(f"заметка не найдена: {path}")
            if new_abs.exists():
                raise VaultConflict(f"по новому пути уже есть файл: {new_path}")
            result = await self._relocate(path, new_path, actor, "move")
        self._publish("note_moved", path=path, to=new_path, actor=actor, commit=result["commit"])
        return result

    async def trash_note(self, raw_path: str, actor: str) -> dict[str, Any]:
        """Переносит заметку в .trash/. Файлы не удаляются никогда."""
        path, abs_path = self._note_path(raw_path)
        async with self._lock:
            if not abs_path.is_file():
                raise VaultNotFound(f"заметка не найдена: {path}")
            trash_path = f"{TRASH_DIR}/{path}"
            if safe_join(self._root, trash_path).exists():
                trash_path = f"{TRASH_DIR}/{path[:-3]}-{int(time.time())}.md"
            result = await self._relocate(path, trash_path, actor, "trash")
        self._publish("note_deleted", path=path, to=result["new_path"], actor=actor, commit=result["commit"])
        return result

    # ── синхронизация с диском ───────────────────────────────────────────────

    async def sync_path(self, raw_path: str) -> str | None:
        """Реакция на изменение файла на диске (слежение). Возвращает действие
        или None, если индекс уже соответствует файлу."""
        try:
            path = normalize_path(raw_path, note=False)
        except VaultPathError:
            return None
        if not (is_note(path) or index.is_attachment(path)):
            return None
        abs_path = safe_join(self._root, path)
        async with self._lock:
            exists = abs_path.is_file() and not abs_path.is_symlink()
            async with self._sessions() as session:
                if not is_note(path):
                    if exists:
                        await self._index_path(session, path)
                    else:
                        await index.delete_attachment(session, path)
                    await session.commit()
                    self._invalidate()
                    return "attachment"

                known = (
                    await session.execute(select(VaultNote.content_hash).where(VaultNote.path == path))
                ).scalar_one_or_none()
                if not exists:
                    if known is None:
                        return None
                    await index.delete_note(session, path)
                    await session.commit()
                    self._invalidate()
                    self._publish("note_deleted", path=path, actor="external", commit=None)
                    return "deleted"
                if abs_path.stat().st_size <= config.max_note_bytes():
                    data = await asyncio.to_thread(abs_path.read_bytes)
                    if known == index.content_hash(data):
                        return None  # наша же запись: индекс уже актуален
                digest = await self._index_path(session, path)
                await session.commit()
            self._invalidate()
            self._publish("note_changed", path=path, action="external", actor="external", commit=None, hash=digest)
            return "changed"

    async def reconcile(self, *, full: bool = False) -> dict[str, int]:
        """Приводит индекс к состоянию диска. ``full`` — сначала очистить всё.

        Идёт пачками и отпускает блокировку между ними, чтобы большое
        хранилище не задерживало сохранения на время сверки.
        """
        if full:
            async with self._lock:
                async with self._sessions() as session:
                    await index.clear(session)
                    await session.commit()
                self._invalidate()

        files = await asyncio.to_thread(index.scan_files, self._root)
        async with self._sessions() as session:
            known = {
                path: (mtime, size)
                for path, mtime, size in (
                    await session.execute(select(VaultNote.path, VaultNote.mtime, VaultNote.size))
                ).all()
            }
            known.update(
                {
                    path: (mtime, size)
                    for path, mtime, size in (
                        await session.execute(
                            select(VaultAttachment.path, VaultAttachment.mtime, VaultAttachment.size)
                        )
                    ).all()
                }
            )

        changed = [path for path, meta in files.items() if known.get(path) != meta]
        removed = [path for path in known if path not in files]
        stats = {"indexed": 0, "removed": 0, "errors": 0, "total": len(files)}

        for start in range(0, len(changed), RECONCILE_BATCH):
            async with self._lock:
                async with self._sessions() as session:
                    for path in changed[start : start + RECONCILE_BATCH]:
                        try:
                            await self._index_path(session, path)
                            stats["indexed"] += 1
                        except (OSError, VaultPathError):
                            stats["errors"] += 1
                    await session.commit()
            await asyncio.sleep(0)

        if removed:
            async with self._lock:
                async with self._sessions() as session:
                    for path in removed:
                        if is_note(path):
                            await index.delete_note(session, path)
                        else:
                            await index.delete_attachment(session, path)
                        stats["removed"] += 1
                    await session.commit()

        if stats["indexed"] or stats["removed"] or full:
            self._invalidate()
            self._publish("index_updated", **stats)
        return stats


_service: VaultService | None = None


def get_service() -> VaultService:
    global _service
    if _service is None:
        _service = VaultService()
    return _service


def reset_service() -> None:
    """Для тестов: следующий get_service() создаст сервис с текущим окружением."""
    global _service
    _service = None


def dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
