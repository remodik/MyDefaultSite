"""Блокировка команд Discord-бота, когда модуль выключен админом.

Проблема: в режиме local код уже загружен, коги зарегистрированы, и бот
продолжает выполнять команды, даже если вы выключили модуль в панели или
приостановили лицензию — обработчики держат прямые ссылки на функции.

Решение: ставим в бота глобальную проверку. Перед каждой командой смотрим, из
какого модуля пришёл её callback (``callback.__module__`` — наш загрузчик
монтирует файлы проекта под их натуральными именами, поэтому имя совпадает с
модулем проекта). Если модуль принадлежит лицензированному проекту и сейчас
выключен — команда не выполняется, а пользователю уходит сообщение.

Код самого бота (не из проекта) проверка не трогает — она для него прозрачна.

Поддерживаются disnake, py-cord и discord.py 2.x: библиотеки различаются API
для слэш-команд, поэтому ставим все доступные хуки (duck typing, ни один
discord-пакет не импортируется).
"""

from __future__ import annotations

import inspect
import logging
from typing import Any, Callable

log = logging.getLogger("licensed_loader")

__all__ = ["attach"]


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _command_module(target: Any) -> str | None:
    """Определить модуль, из которого пришла команда (ctx или interaction)."""
    cmd = (
        getattr(target, "command", None)
        or getattr(target, "application_command", None)
        or target  # на случай, если передали саму команду
    )
    for attr in ("callback", "_callback", "func"):
        cb = getattr(cmd, attr, None)
        module = getattr(cb, "__module__", None)
        if module:
            return module
    cog = getattr(cmd, "cog", None)
    if cog is not None:
        return type(cog).__module__
    return None


async def _reply(target: Any, message: str) -> None:
    """Ответить и на интеракцию, и на обычный ctx."""
    response = getattr(target, "response", None)
    if response is not None and hasattr(response, "send_message"):
        try:
            done = getattr(response, "is_done", None)
            if callable(done) and done():
                followup = getattr(target, "followup", None)
                if followup is not None:
                    await followup.send(message, ephemeral=True)
                    return
            await response.send_message(message, ephemeral=True)
            return
        except Exception as exc:  # noqa: BLE001
            log.debug("licensed_loader: не удалось ответить на интеракцию: %s", exc)

    send = getattr(target, "send", None)
    if callable(send):
        try:
            await send(message)
        except Exception as exc:  # noqa: BLE001
            log.debug("licensed_loader: не удалось отправить сообщение: %s", exc)


def attach(
    bot: Any,
    project: Any,
    *,
    message: str | None = None,
    stale_after: float = 60.0,
    on_denied: Callable[[Any, str], Any] | None = None,
) -> list[str]:
    """Повесить на ``bot`` проверку лицензии/модулей.

    :param message: текст отказа (по умолчанию ``project.denial_message``).
    :param stale_after: насколько устаревшим может быть состояние лицензии,
        прежде чем проверка сходит на сервер. Определяет задержку реакции на
        переключатель в панели (по умолчанию — до 60 секунд).
    :param on_denied: ``(target, module)`` вместо стандартного ответа.
    :returns: список установленных хуков (для логов/диагностики).
    """

    async def _check(target: Any) -> bool:
        module = _command_module(target)
        if not project.owns_module(module):
            return True  # чужой код — не вмешиваемся

        await project.ensure_fresh(stale_after)
        if project.module_allowed(module):
            return True

        text = message or getattr(project, "denial_message", "Модуль недоступен.")
        try:
            if on_denied is not None:
                await _maybe_await(on_denied(target, module))
            else:
                await _reply(target, text)
        finally:
            log.info("licensed_loader: доступ к модулю %s заблокирован", module)
        return False

    installed: list[str] = []

    # Префиксные команды — есть во всех ext.commands-ботах.
    add_check = getattr(bot, "add_check", None)
    if callable(add_check):
        try:
            add_check(_check)
            installed.append("prefix")
        except Exception as exc:  # noqa: BLE001
            log.debug("licensed_loader: add_check не сработал: %s", exc)

    # disnake: отдельный реестр проверок для application commands.
    add_app_check = getattr(bot, "add_app_command_check", None)
    if callable(add_app_check):
        try:
            add_app_check(
                _check, slash_commands=True, user_commands=True, message_commands=True
            )
            installed.append("app_commands")
        except Exception as exc:  # noqa: BLE001
            log.debug("licensed_loader: add_app_command_check не сработал: %s", exc)

    # discord.py 2.x: проверка на уровне дерева команд.
    tree = getattr(bot, "tree", None)
    if tree is not None and not installed_has_tree(installed):
        previous = getattr(tree, "interaction_check", None)

        async def _tree_check(interaction: Any) -> bool:
            if previous is not None:
                ok = await _maybe_await(previous(interaction))
                if ok is False:
                    return False
            return await _check(interaction)

        try:
            tree.interaction_check = _tree_check
            installed.append("tree")
        except Exception as exc:  # noqa: BLE001
            log.debug("licensed_loader: tree.interaction_check не сработал: %s", exc)

    if not installed:
        log.warning(
            "licensed_loader: не удалось повесить проверку лицензии на бота (%s). "
            "Команды выключенного модуля продолжат работать — проверяйте вручную "
            "через project.module_allowed(__name__).",
            type(bot).__name__,
        )
    else:
        log.info("licensed_loader: проверка лицензии активна (%s)", ", ".join(installed))
    return installed


def installed_has_tree(installed: list[str]) -> bool:
    """disnake уже покрыл app-команды — второй хук на tree не нужен."""
    return "app_commands" in installed
