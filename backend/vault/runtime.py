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
from pathlib import Path
from typing import AsyncIterator

from vault import config
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


def _relative(service: VaultService, raw: str) -> str | None:
    try:
        rel = Path(raw).relative_to(service.root).as_posix()
    except ValueError:
        return None
    # Скрытое (.git, .trash, временные файлы записи) индекс не интересует.
    if not rel or any(part.startswith(".") for part in rel.split("/")):
        return None
    return rel


async def _watch_files(service: VaultService) -> None:
    """Слежение через watchfiles: изменения на диске попадают в индекс и в SSE."""
    from watchfiles import awatch

    async for changes in awatch(
        service.root,
        watch_filter=lambda _change, path: _relative(service, path) is not None,
        debounce=600,
        force_polling=config.watch_mode() == "poll" or None,
        poll_delay_ms=int(config.poll_interval() * 1000),
    ):
        for rel in sorted({_relative(service, path) for _change, path in changes} - {None}):
            try:
                await service.sync_path(rel)
            except Exception:  # noqa: BLE001
                log.exception("vault: не удалось обновить индекс для %s", rel)


async def _poll_files(service: VaultService) -> None:
    """Запасной путь без watchfiles/inotify: периодическая сверка с диском."""
    while True:
        await asyncio.sleep(config.poll_interval())
        try:
            await service.reconcile()
        except Exception:  # noqa: BLE001
            log.exception("vault: периодическая сверка не удалась")


async def _background(service: VaultService) -> None:
    await _initial_reconcile(service)
    if config.watch_mode() == "off":
        return
    try:
        await _watch_files(service)
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        # Нет watchfiles, кончились inotify-дескрипторы, сетевой том без
        # уведомлений — переходим на опрос, а не остаёмся без обновлений.
        log.exception("vault: слежение за файлами недоступно, перехожу на опрос")
    await _poll_files(service)


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
