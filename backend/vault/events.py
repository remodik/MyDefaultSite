"""Живые события vault для SSE: «заметка изменилась», «индекс обновлён»."""

from __future__ import annotations

import asyncio
from typing import Any

# Медленный подписчик (уснувшая вкладка телефона) не должен копить события в
# памяти: очередь ограничена, при переполнении старые события выбрасываются —
# клиент всё равно перечитывает список целиком.
QUEUE_SIZE = 64


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, event: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass
