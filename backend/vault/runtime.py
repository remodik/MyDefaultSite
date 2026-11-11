"""Запуск и остановка vault вместе с приложением.

Процесс сайта перезапускается watchdog-ом лаунчера, поэтому старт обязан
быть быстрым и переживать повтор: здесь только создаётся каталог и
git-репозиторий, а сверка индекса с диском уходит в фоновую задачу.
Сбой vault не должен ронять остальной сайт.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import AsyncIterator

from vault.service import VaultService, get_service

log = logging.getLogger("vault")


async def _initial_reconcile(service: VaultService) -> None:
    try:
        stats = await service.reconcile()
        log.info("vault: индекс сверен с диском: %s", stats)
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        log.exception("vault: сверка индекса не удалась")


async def _background(service: VaultService) -> None:
    await _initial_reconcile(service)


@asynccontextmanager
async def vault_lifespan(app) -> AsyncIterator[None]:
    service = get_service()
    task: asyncio.Task[None] | None = None
    try:
        await service.start()
        task = asyncio.create_task(_background(service), name="vault-background")
    except Exception:  # noqa: BLE001
        log.exception("vault: запуск не удался — сайт работает без заметок")
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task
