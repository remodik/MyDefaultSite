"""Общая подготовка тестов vault.

Окружение задаётся до импорта database/server: тесты работают со своей
SQLite во временном каталоге и не трогают backend/projects.db и настоящий
VAULT_DIR.
"""

from __future__ import annotations

import pytest


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
