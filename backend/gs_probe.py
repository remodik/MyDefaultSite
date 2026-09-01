"""Проверка контракта get_session на подставных объектах: настоящая ошибка
запроса обязана дойти до вызывающего, даже когда уборка падает."""
import asyncio, logging
from contextlib import suppress
from typing import AsyncIterator

log = logging.getLogger("probe")

class DeadSession:
    """Сессия, у которой соединение умерло: rollback и close падают."""
    def __init__(self): self.invalidated = False
    async def rollback(self): raise RuntimeError("InterfaceError: connection is closed")
    async def close(self):    raise RuntimeError("InterfaceError: connection is closed")
    async def invalidate(self): self.invalidated = True

async def get_session_OLD(factory) -> AsyncIterator[object]:
    async with factory() as session:      # поведение до правки
        yield session

async def get_session_NEW(factory) -> AsyncIterator[object]:
    session = factory()
    try:
        yield session
    except Exception:
        try:
            await session.rollback()
        except Exception:
            log.warning("откат не удался", exc_info=False)
            with suppress(Exception):
                await session.invalidate()
        raise
    finally:
        try:
            await session.close()
        except Exception:
            log.warning("закрытие не удалось", exc_info=False)
            with suppress(Exception):
                await session.invalidate()

class _Ctx:
    def __init__(self, s): self.s = s
    async def __aenter__(self): return self.s
    async def __aexit__(self, *e): await self.s.close()

async def drive(gen_factory, session):
    gen = gen_factory(lambda: _Ctx(session) if gen_factory is get_session_OLD else session)
    s = await gen.asend(None)
    try:
        await gen.athrow(ValueError("НАСТОЯЩАЯ ошибка запроса"))
    except StopAsyncIteration:
        return "проглочено"
    except BaseException as exc:
        return f"{type(exc).__name__}: {exc}"

async def main():
    for name, f in (("до правки", get_session_OLD), ("после правки", get_session_NEW)):
        s = DeadSession()
        got = await drive(f, s)
        print(f"  {name:14} -> до вызывающего дошло: {got}")
        print(f"  {'':14}    соединение выброшено из пула: {s.invalidated}")

asyncio.run(main())
