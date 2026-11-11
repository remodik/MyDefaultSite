"""Общая подготовка тестов vault.

Окружение задаётся до импорта database/server: тесты работают со своей
SQLite во временном каталоге и не трогают backend/projects.db и настоящий
VAULT_DIR.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_TMP = tempfile.mkdtemp(prefix="vault-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP}/test.db"
os.environ["VAULT_DIR"] = f"{_TMP}/vault"
os.environ["VAULT_WATCH"] = "off"
os.environ.setdefault("SECRET_KEY", "test-secret-key")

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def _database(anyio_backend):
    """Таблицы создаются один раз. Сессионная async-фикстура заодно держит
    один event loop на весь прогон — пул соединений SQLAlchemy привязан к нему."""
    import vault.models  # noqa: F401
    from database import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture
async def service(tmp_path):
    from database import async_session_factory
    from vault import index
    from vault.service import VaultService

    svc = VaultService(root=tmp_path / "vault")
    await svc.start()
    async with async_session_factory() as session:
        await index.clear(session)
        await session.commit()
    return svc
