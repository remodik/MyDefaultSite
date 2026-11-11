"""Пересборка индекса vault из .md-файлов.

Запуск из каталога backend/:

    python scripts/reindex_vault.py          # досверить индекс с диском
    python scripts/reindex_vault.py --full   # очистить и собрать заново

Файлы в VAULT_DIR — источник истины; индекс в SQLite полностью производный,
поэтому скрипт безопасно запускать в любой момент.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


async def reindex(full: bool) -> dict[str, int]:
    import vault.models  # noqa: F401  (регистрирует таблицы до create_all)
    from database import engine, init_models
    from vault.service import VaultService

    await init_models()
    service = VaultService()
    await service.start()
    stats = await service.reconcile(full=full)
    await engine.dispose()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Пересборка индекса vault из файлов")
    parser.add_argument("--full", action="store_true", help="очистить индекс и собрать заново")
    args = parser.parse_args()
    stats = asyncio.run(reindex(args.full))
    print(
        f"vault: файлов {stats['total']}, проиндексировано {stats['indexed']}, "
        f"убрано {stats['removed']}, ошибок {stats['errors']}"
    )


if __name__ == "__main__":
    main()
