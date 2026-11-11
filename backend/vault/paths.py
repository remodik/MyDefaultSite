"""Проверка и нормализация путей внутри vault.

Любой путь от клиента (REST, MCP) проходит через :func:`normalize_path` до
обращения к файловой системе. Абсолютные пути, ``..``, скрытые сегменты
(``.git``, ``.trash``) и управляющие символы отклоняются; :func:`safe_join`
дополнительно проверяет итоговый путь после раскрытия симлинков.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

NOTE_SUFFIX = ".md"
TRASH_DIR = ".trash"
MAX_SEGMENT_BYTES = 240
MAX_PATH_BYTES = 1000

# Запрещены в именах файлов Windows и ломают синтаксис [[ссылок]].
_FORBIDDEN_CHARS = re.compile(r'[<>:"|?*\\#^\[\]]')
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_DRIVE_RE = re.compile(r"^[A-Za-z]:")


class VaultPathError(ValueError):
    """Путь не прошёл проверку."""


def normalize_path(raw: str, *, note: bool = True, allow_hidden: bool = False) -> str:
    """Возвращает путь относительно корня vault с ``/`` в качестве разделителя.

    ``note=True`` добавляет ``.md``, если расширения нет.
    """
    if not isinstance(raw, str):
        raise VaultPathError("путь должен быть строкой")
    value = unicodedata.normalize("NFC", raw).strip()
    if not value:
        raise VaultPathError("пустой путь")
    if _CONTROL_CHARS.search(value):
        raise VaultPathError("управляющие символы в пути")
    value = value.replace("\\", "/")
    if value.startswith("/") or _DRIVE_RE.match(value):
        raise VaultPathError("абсолютные пути запрещены")

    segments: list[str] = []
    for segment in value.split("/"):
        segment = segment.strip()
        if not segment:
            continue  # "a//b" и хвостовой "/" схлопываем
        if segment in {".", ".."}:
            raise VaultPathError("сегменты '.' и '..' запрещены")
        if segment.startswith(".") and not allow_hidden:
            raise VaultPathError("скрытые файлы и папки недоступны")
        if segment.endswith("."):
            raise VaultPathError("имя не может заканчиваться точкой")
        if _FORBIDDEN_CHARS.search(segment):
            raise VaultPathError('недопустимые символы в имени: < > : " | ? * \\ # ^ [ ]')
        if len(segment.encode("utf-8")) > MAX_SEGMENT_BYTES:
            raise VaultPathError("слишком длинное имя")
        segments.append(segment)

    if not segments:
        raise VaultPathError("пустой путь")
    if note and not segments[-1].lower().endswith(NOTE_SUFFIX):
        segments[-1] += NOTE_SUFFIX
    if note and segments[-1].lower() == NOTE_SUFFIX:
        raise VaultPathError("пустое имя заметки")
    result = "/".join(segments)
    if len(result.encode("utf-8")) > MAX_PATH_BYTES:
        raise VaultPathError("слишком длинный путь")
    return result


def normalize_folder(raw: str | None) -> str:
    """Папка-фильтр или префикс: '' — корень vault."""
    if raw is None or not str(raw).strip().strip("/"):
        return ""
    return normalize_path(str(raw), note=False)


def safe_join(root: Path, rel_path: str) -> Path:
    """Абсолютный путь внутри ``root``. Симлинк, ведущий наружу, отклоняется."""
    root_resolved = root.resolve()
    candidate = (root_resolved / rel_path).resolve()
    if candidate != root_resolved and root_resolved not in candidate.parents:
        raise VaultPathError("путь выходит за пределы vault")
    return candidate


def is_note(path: str) -> bool:
    return path.lower().endswith(NOTE_SUFFIX)


def folder_of(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def stem_of(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name[: -len(NOTE_SUFFIX)] if name.lower().endswith(NOTE_SUFFIX) else name


def in_prefix(path: str, prefix: str) -> bool:
    """``agent/`` разрешает ``agent/x.md``, но не ``agent2/x.md``."""
    prefix = prefix.strip("/")
    return not prefix or path == prefix or path.startswith(prefix + "/")
