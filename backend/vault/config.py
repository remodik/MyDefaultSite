"""Настройки vault из окружения. Читаются при обращении, а не при импорте —
так тесты и scripts/reindex_vault.py могут задать их до первого вызова."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_VAULT_DIR = BACKEND_DIR / "data" / "vault"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def vault_dir() -> Path:
    raw = os.getenv("VAULT_DIR", "").strip()
    path = Path(raw).expanduser() if raw else DEFAULT_VAULT_DIR
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path


def max_note_bytes() -> int:
    return _int_env("VAULT_MAX_NOTE_BYTES", 1024 * 1024)


def max_attachment_bytes() -> int:
    return _int_env("VAULT_MAX_ATTACHMENT_BYTES", 10 * 1024 * 1024)


def watch_mode() -> str:
    """auto — watchfiles с откатом на опрос; poll — только опрос; off — без слежения."""
    mode = os.getenv("VAULT_WATCH", "auto").strip().lower()
    return mode if mode in {"auto", "poll", "off"} else "auto"


def poll_interval() -> float:
    return max(1.0, float(_int_env("VAULT_POLL_INTERVAL", 5)))


def trust_proxy_header() -> str:
    """Когда верить CF-Connecting-IP: auto (запрос пришёл с loopback, то есть
    от cloudflared), always, never."""
    mode = os.getenv("VAULT_TRUST_PROXY_HEADER", "auto").strip().lower()
    return mode if mode in {"auto", "always", "never"} else "auto"


def mcp_rate_limit() -> tuple[int, int]:
    return _int_env("VAULT_MCP_RATE_LIMIT", 120), _int_env("VAULT_MCP_RATE_WINDOW", 60)


def login_rate_limit() -> tuple[int, int]:
    return _int_env("LOGIN_RATE_LIMIT", 10), _int_env("LOGIN_RATE_WINDOW", 300)


def max_pending_per_token() -> int:
    return _int_env("VAULT_MAX_PENDING_PER_TOKEN", 20)
