#!/usr/bin/env python3
"""Пингер, не дающий бесплатному сервису Render уснуть.

Render Free усыпляет сервис после ~15 минут без входящих HTTP-запросов, а
холодный старт занимает 30–60 секунд. Для системы лицензий это критично: боты
клиентов в это время получают ServerUnavailable на fetch/validate.

Скрипт раз в N секунд дёргает лёгкий /api/health (без обращения к БД).

Запуск:
    python scripts/keep_alive.py https://ваш-сервис.onrender.com
    python scripts/keep_alive.py --once            # разовая проверка
    KEEP_ALIVE_URL=https://... python scripts/keep_alive.py

Зависимостей нет (только stdlib) — можно копировать куда угодно.

ВАЖНО: скрипт должен где-то постоянно работать (VPS, Raspberry Pi, включённый
ПК). Если такого места нет — используйте GitHub Actions
(.github/workflows/keep-alive.yml) или внешний пингер вроде cron-job.org.
"""

from __future__ import annotations

import argparse
import os
import random
import signal
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

DEFAULT_PATH = "/api/health"
DEFAULT_INTERVAL = 600  # 10 минут: с запасом до 15-минутного таймаута Render
USER_AGENT = "keep-alive/1.0 (+render-anti-sleep)"

_stop = False


def _handle_signal(signum, frame) -> None:  # noqa: ARG001
    global _stop
    _stop = True
    print("\nОстанавливаюсь…", flush=True)


def _log(message: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}", flush=True)


def ping(url: str, timeout: float) -> tuple[bool, str]:
    """Один запрос. Возвращает (успех, описание)."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(200).decode("utf-8", "replace").strip()
            elapsed = time.monotonic() - started
            ok = 200 <= response.status < 300
            return ok, f"HTTP {response.status} за {elapsed:.1f}с · {body[:60]}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code} за {time.monotonic() - started:.1f}с"
    except urllib.error.URLError as exc:
        return False, f"сеть недоступна: {exc.reason}"
    except Exception as exc:  # noqa: BLE001 - пингер не должен падать никогда
        return False, f"ошибка: {exc}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Не даёт бесплатному сервису Render уснуть.",
    )
    parser.add_argument(
        "url", nargs="?", default=os.getenv("KEEP_ALIVE_URL"),
        help="базовый URL сервиса, напр. https://mysite.onrender.com "
             "(или переменная окружения KEEP_ALIVE_URL)",
    )
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"путь для пинга (по умолчанию: {DEFAULT_PATH})")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL,
                        help=f"интервал в секундах (по умолчанию: {DEFAULT_INTERVAL})")
    parser.add_argument("--timeout", type=float, default=90.0,
                        help="таймаут запроса; с запасом на холодный старт (по умолчанию: 90)")
    parser.add_argument("--once", action="store_true", help="сделать один запрос и выйти")
    args = parser.parse_args(argv)

    if not args.url:
        parser.error("укажите URL сервиса или задайте KEEP_ALIVE_URL")

    url = args.url.rstrip("/") + "/" + args.path.lstrip("/")

    if args.once:
        ok, info = ping(url, args.timeout)
        _log(("OK   " if ok else "СБОЙ ") + info)
        return 0 if ok else 1

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    _log(f"Пингую {url} каждые {args.interval}с. Ctrl+C — выход.")
    sent = failed = 0
    while not _stop:
        ok, info = ping(url, args.timeout)
        sent += 1
        if ok:
            _log(f"OK    {info}")
        else:
            failed += 1
            _log(f"СБОЙ  {info}  (всего сбоев: {failed}/{sent})")

        # Небольшой разброс, чтобы запросы не шли строго по таймеру.
        delay = args.interval + random.uniform(-15, 15)
        deadline = time.monotonic() + max(30.0, delay)
        while not _stop and time.monotonic() < deadline:
            time.sleep(1)

    _log(f"Готово. Запросов: {sent}, сбоев: {failed}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
