"""Единый билдер клиентских файлов для лицензированных проектов.

Генерирует ОДИН самодостаточный ``.py``, который вы отдаёте клиенту вместе с
его license_key. Тип файла выбирается флагом ``--type``:

* ``module``    — обычный подключаемый модуль:

      import economy
      pkg = await economy.load()
      pkg.core.calculate_reward(user_id=1)
      # или, без разницы между local/remote:
      await economy.call("core.calculate_reward", user_id=1)

* ``extension`` — Discord-расширение для ``bot.load_extension("economy")``.
  Загружает лицензированный проект и передаёт ``bot`` в его ``setup(bot)``,
  где клиентский код регистрирует коги/команды. Работает и с py-cord
  (синхронный ``setup``), и с discord.py 2.x (``await bot.load_extension``).

По умолчанию рантайм ``licensed_loader`` **встраивается** в сгенерированный
файл (``--embed``), поэтому клиенту не нужно ставить пакет — только
``pip install httpx cryptography``. С ``--no-embed`` генерируется тонкая
обёртка, требующая установленного ``licensed_loader``.

Пример:

    python -m licensed_loader.builder \\
        --key LL_xxxxxxxx --server https://example.ru --slug economy-bot \\
        --type extension --out dist/economy.py
"""

from __future__ import annotations

import argparse
import base64
import json
import zlib
from pathlib import Path

__all__ = ["build", "main"]

# Модули пакета, которые встраиваются в standalone-файл. Порядок не важен —
# импорт разруливает сам Python, относительные импорты сохраняются.
_RUNTIME_FILES = (
    "__init__.py",
    "exceptions.py",
    "crypto.py",
    "fingerprint.py",
    "loader.py",
    "_http.py",
    "discord_guard.py",
    "project.py",
)

_HEADER = '''\
# -*- coding: utf-8 -*-
"""{title}

СГЕНЕРИРОВАНО автоматически (licensed_loader.builder) — не редактируйте вручную.

Проект : {slug}
Режим  : {mode}
Сервер : {server}

Зависимости: pip install httpx cryptography{extra_dep}
"""

from __future__ import annotations

LICENSE_KEY = {key!r}
SERVER_URL = {server!r}
PROJECT_SLUG = {slug!r}
MODE = {mode!r}
REVALIDATE_INTERVAL = {revalidate!r}
BIND_FINGERPRINT = {bind_fp!r}
'''

# --- bootstrap встроенного рантайма -----------------------------------------
_EMBED_BOOTSTRAP = '''

# --- встроенный рантайм licensed_loader -------------------------------------
# Пакет вшит в этот файл и монтируется в память (на диск ничего не пишется).
# Если licensed_loader уже установлен в окружении — используется он.
_RUNTIME_PAYLOAD = "{payload}"


def _install_embedded_runtime() -> None:
    import sys

    try:  # уже установлен или смонтирован другим сгенерированным файлом
        import licensed_loader  # noqa: F401
        return
    except ImportError:
        pass

    import base64
    import importlib.abc
    import importlib.util
    import json
    import zlib

    sources = json.loads(zlib.decompress(base64.b64decode(_RUNTIME_PAYLOAD)).decode("utf-8"))

    modules = {{}}
    for path, code in sources.items():
        name = "licensed_loader." + path[: -len(".py")].replace("/", ".")
        is_pkg = name.endswith(".__init__")
        if is_pkg:
            name = name[: -len(".__init__")]
        modules[name] = (code, is_pkg)

    class _Loader(importlib.abc.Loader):
        def __init__(self, code):
            self._code = code

        def create_module(self, spec):
            return None

        def exec_module(self, module):
            exec(compile(self._code, "<licensed_loader:%s>" % module.__name__, "exec"), module.__dict__)

    class _Finder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            entry = modules.get(fullname)
            if entry is None:
                return None
            code, is_pkg = entry
            spec = importlib.util.spec_from_loader(
                fullname, _Loader(code), origin="<licensed_loader>", is_package=is_pkg
            )
            if is_pkg and spec is not None:
                spec.submodule_search_locations = []
            return spec

    sys.meta_path.insert(0, _Finder())


_install_embedded_runtime()
'''

_COMMON_IMPORTS = '''
from licensed_loader import (  # noqa: E402
    LicenseError,
    LicenseRevoked,
    LicensedProject,
    ServerUnavailable,
)

__all__ = ["project", "LicenseError", "LicenseRevoked", "ServerUnavailable"]

project = LicensedProject(
    license_key=LICENSE_KEY,
    server_url=SERVER_URL,
    project_slug=PROJECT_SLUG,
    mode=MODE,
    revalidate_interval=REVALIDATE_INTERVAL,
    hardware_fingerprint=None if BIND_FINGERPRINT else "",
)
'''

# --- шаблон: обычный модуль --------------------------------------------------
_MODULE_BODY_LOCAL = '''
_pkg = None


async def load():
    """Скачать, расшифровать и смонтировать проект. Возвращает пакет.

    После вызова модули проекта доступны и как атрибуты этого модуля:
    ``pkg = await economy.load(); economy.core.calculate_reward(...)``
    """
    global _pkg
    _pkg = await project.load()
    return _pkg


async def call(entrypoint, **kwargs):
    """Вызвать ``"модуль.функция"`` проекта (грузит проект при необходимости)."""
    return await project.call(entrypoint, **kwargs)


async def close():
    """Остановить ревалидацию и выгрузить проект из памяти."""
    global _pkg
    await project.aclose()
    _pkg = None


def __getattr__(name):
    # Ленивый доступ к модулям проекта после load(): economy.core
    if not name.startswith("_") and _pkg is not None:
        try:
            return getattr(_pkg, name)
        except AttributeError:
            pass
    raise AttributeError(
        "%r недоступен. Сначала выполните `await load()`; "
        "модули проекта появятся как атрибуты этого модуля." % (name,)
    )
'''

_MODULE_BODY_REMOTE = '''

async def call(entrypoint, **kwargs):
    """Вызвать ``"модуль.функция"`` на сервере и получить только результат.

    В remote-режиме код проекта не покидает сервер, поэтому локального пакета
    нет — доступен только этот вызов.
    """
    return await project.call(entrypoint, **kwargs)


async def close():
    """Остановить фоновую ревалидацию."""
    await project.aclose()
'''

# --- шаблон: Discord extension ----------------------------------------------
_EXTENSION_BODY = '''
import asyncio  # noqa: E402
import inspect  # noqa: E402
import logging  # noqa: E402

log = logging.getLogger(__name__)

# Модуль проекта, в котором искать setup(bot). None => искать автоматически.
ENTRY_MODULE = {entry!r}

# Сообщение при обращении к выключенному модулю / неактивной лицензии.
DENY_MESSAGE = {deny_message!r}
# Насколько устаревшим может быть состояние лицензии перед проверкой на
# сервере. Определяет задержку реакции на переключатель в панели (сек).
STALE_AFTER = {stale_after!r}
# Блокировать команды выключенных модулей.
GUARD_COMMANDS = {guard!r}

_pkg = None


def _resolve_setup(pkg):
    """Найти setup(bot) в лицензированном проекте."""
    if ENTRY_MODULE:
        module = pkg.import_module(ENTRY_MODULE)
        return getattr(module, "setup", None)
    for name in sorted(pkg.top_level):
        try:
            module = pkg.import_module(name)
        except Exception:  # noqa: BLE001 - пропускаем несопоставимые модули
            continue
        fn = getattr(module, "setup", None)
        if callable(fn):
            return fn
    return None


async def _on_ready_revalidate():
    # load() мог отработать во временном loop (синхронный путь py-cord) —
    # там фоновая задача ревалидации не выживает. Поднимаем её в боевом loop.
    project.start_revalidation()


async def _async_setup(bot):
    global _pkg
    _pkg = await project.load()

    entry = _resolve_setup(_pkg)
    if entry is None:
        raise RuntimeError(
            "В лицензированном проекте {slug!r} не найден setup(bot). "
            "Добавьте его в модуль проекта или укажите --entry при сборке."
        )

    result = entry(bot)
    if inspect.isawaitable(result):
        await result

    if GUARD_COMMANDS:
        # Команды выключенного модуля перестанут выполняться и ответят
        # DENY_MESSAGE — без перезапуска бота.
        project.attach_discord(bot, message=DENY_MESSAGE, stale_after=STALE_AFTER)

    bot.add_listener(_on_ready_revalidate, "on_ready")
    log.info("licensed_loader: проект %s загружен", PROJECT_SLUG)


async def _async_teardown(bot):
    global _pkg
    if _pkg is not None:
        entry_mod = _resolve_teardown(_pkg)
        if entry_mod is not None:
            result = entry_mod(bot)
            if inspect.isawaitable(result):
                await result
    await project.aclose()
    _pkg = None


def _resolve_teardown(pkg):
    if ENTRY_MODULE:
        module = pkg.import_module(ENTRY_MODULE)
        return getattr(module, "teardown", None)
    for name in sorted(pkg.top_level):
        try:
            module = pkg.import_module(name)
        except Exception:  # noqa: BLE001
            continue
        fn = getattr(module, "teardown", None)
        if callable(fn):
            return fn
    return None


def _run(coro):
    """Выполнить корутину и там, и там.

    py-cord вызывает setup(bot) синхронно (обычно до bot.run(), когда loop ещё
    не запущен) — выполняем через asyncio.run(). discord.py 2.x делает
    ``await setup(bot)`` при работающем loop — возвращаем корутину, её заавейтят.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(coro)
        return None
    return coro


def setup(bot):
    return _run(_async_setup(bot))


def teardown(bot):
    return _run(_async_teardown(bot))
'''


def _read_runtime_sources(package_dir: Path) -> dict[str, str]:
    sources: dict[str, str] = {}
    for name in _RUNTIME_FILES:
        path = package_dir / name
        if not path.exists():
            raise FileNotFoundError(f"Не найден модуль рантайма: {path}")
        sources[name] = path.read_text(encoding="utf-8")
    return sources


def _make_payload(package_dir: Path) -> str:
    raw = json.dumps(_read_runtime_sources(package_dir), ensure_ascii=False).encode("utf-8")
    return base64.b64encode(zlib.compress(raw, 9)).decode("ascii")


DEFAULT_DENY_MESSAGE = (
    "⛔ Модуль недоступен: требуется оплата или продление лицензии. "
    "Свяжитесь с администратором."
)


def build(
    *,
    license_key: str,
    server_url: str,
    project_slug: str,
    kind: str = "module",
    mode: str = "local",
    entry: str | None = None,
    revalidate: int = 900,
    embed: bool = True,
    bind_fingerprint: bool = True,
    deny_message: str = DEFAULT_DENY_MESSAGE,
    stale_after: float = 60.0,
    guard: bool = True,
    package_dir: Path | None = None,
) -> str:
    """Собрать исходник клиентского файла и вернуть его как строку."""
    if kind not in ("module", "extension"):
        raise ValueError("kind должен быть 'module' или 'extension'")
    if mode not in ("local", "remote"):
        raise ValueError("mode должен быть 'local' или 'remote'")
    if kind == "extension" and mode != "local":
        raise ValueError(
            "Discord-расширение работает только в режиме local: объект bot нельзя "
            "передать на сервер. Для remote соберите --type module и вызывайте call()."
        )

    package_dir = package_dir or Path(__file__).resolve().parent

    title = (
        f"Discord-расширение проекта {project_slug!r}."
        if kind == "extension"
        else f"Клиентский модуль проекта {project_slug!r}."
    )
    parts = [
        _HEADER.format(
            title=title,
            slug=project_slug,
            mode=mode,
            server=server_url,
            key=license_key,
            revalidate=revalidate,
            bind_fp=bind_fingerprint,
            extra_dep="" if embed else "\nТребуется установленный пакет licensed_loader.",
        )
    ]

    if embed:
        parts.append(_EMBED_BOOTSTRAP.format(payload=_make_payload(package_dir)))

    parts.append(_COMMON_IMPORTS)

    if kind == "extension":
        parts.append(_EXTENSION_BODY.format(
            entry=entry, slug=project_slug, deny_message=deny_message,
            stale_after=stale_after, guard=guard,
        ))
    elif mode == "local":
        parts.append(_MODULE_BODY_LOCAL)
    else:
        parts.append(_MODULE_BODY_REMOTE)

    return "".join(parts)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m licensed_loader.builder",
        description="Собрать единый клиентский .py для лицензированного проекта.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Примеры:\n"
            "  # обычный модуль\n"
            "  python -m licensed_loader.builder --key LL_xxx --server https://example.ru \\\n"
            "      --slug economy-bot --type module --out economy.py\n\n"
            "  # Discord-расширение (bot.load_extension('economy'))\n"
            "  python -m licensed_loader.builder --key LL_xxx --server https://example.ru \\\n"
            "      --slug economy-bot --type extension --out economy.py\n"
        ),
    )
    p.add_argument("--key", required=True, help="license_key клиента (LL_...)")
    p.add_argument("--server", required=True, help="URL сервера лицензий, напр. https://example.ru")
    p.add_argument("--slug", required=True, help="slug проекта, напр. economy-bot")
    p.add_argument("--type", dest="kind", choices=("module", "extension"), default="module",
                   help="тип файла (по умолчанию: module)")
    p.add_argument("--mode", choices=("local", "remote"), default="local",
                   help="режим loader'а (по умолчанию: local; extension поддерживает только local)")
    p.add_argument("--entry", default=None,
                   help="для extension: модуль проекта с setup(bot); по умолчанию ищется автоматически")
    p.add_argument("--revalidate", type=int, default=900,
                   help="интервал ревалидации лицензии в секундах, 0 = выключить (по умолчанию: 900)")
    p.add_argument("--no-embed", dest="embed", action="store_false",
                   help="не встраивать рантайм (клиенту понадобится pip install licensed_loader)")
    p.add_argument("--no-fingerprint", dest="bind_fingerprint", action="store_false",
                   help="не отправлять hardware fingerprint")
    p.add_argument("--deny-message", default=DEFAULT_DENY_MESSAGE,
                   help="сообщение при обращении к выключенному модулю (только для extension)")
    p.add_argument("--stale-after", type=float, default=60.0,
                   help="через сколько секунд перепроверять лицензию при вызове команды; "
                        "определяет задержку реакции на выключение модуля (по умолчанию: 60)")
    p.add_argument("--no-guard", dest="guard", action="store_false",
                   help="не блокировать команды выключенных модулей (только для extension)")
    p.add_argument("--out", "-o", default=None, help="куда записать файл (по умолчанию: stdout)")

    args = p.parse_args(argv)

    try:
        code = build(
            license_key=args.key,
            server_url=args.server,
            project_slug=args.slug,
            kind=args.kind,
            mode=args.mode,
            entry=args.entry,
            revalidate=args.revalidate,
            embed=args.embed,
            bind_fingerprint=args.bind_fingerprint,
            deny_message=args.deny_message,
            stale_after=args.stale_after,
            guard=args.guard,
        )
    except ValueError as exc:
        p.error(str(exc))
        return 2

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(code, encoding="utf-8")
        size = len(code.encode("utf-8")) / 1024
        print(f"✔ {args.kind} собран: {out} ({size:.1f} КБ)")
        if args.kind == "extension":
            print(f"  Клиент подключает так: bot.load_extension(\"{out.stem}\")")
        else:
            print(f"  Клиент подключает так: import {out.stem}")
    else:
        print(code)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
