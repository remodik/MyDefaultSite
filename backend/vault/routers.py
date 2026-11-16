"""REST API vault: /api/vault/*. Только для администратора сайта (JWT)."""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from vault.paths import VaultPathError
from vault.service import VaultError, dumps, get_service

# Жёсткий потолок тела запроса до разбора; точный лимит (VAULT_MAX_NOTE_BYTES)
# проверяет сервис.
MAX_BODY_CHARS = 8 * 1024 * 1024

# Cloudflare рвёт соединение, по которому долго ничего не идёт: пинг-комментарий
# каждые 15 секунд держит SSE-поток живым.
SSE_PING_SECONDS = 15

vault_router = APIRouter(prefix="/api/vault", tags=["vault"])


class NoteCreate(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    content: str = Field(default="", max_length=MAX_BODY_CHARS)


class NoteUpdate(BaseModel):
    content: str = Field(max_length=MAX_BODY_CHARS)
    # Хэш версии, открытой в редакторе: защищает от затирания чужой правки.
    expected_hash: str | None = Field(default=None, max_length=64)


class NoteMove(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    new_path: str = Field(min_length=1, max_length=1024)


class NoteTrash(BaseModel):
    path: str = Field(min_length=1, max_length=1024)


class RenderRequest(BaseModel):
    content: str = Field(max_length=MAX_BODY_CHARS)
    path: str | None = Field(default=None, max_length=1024)


def http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VaultPathError):
        return HTTPException(status_code=400, detail=f"Недопустимый путь: {exc}")
    if isinstance(exc, VaultError):
        detail: Any = exc.message
        if exc.extra:
            detail = {"message": exc.message, **exc.extra}
        return HTTPException(status_code=exc.status_code, detail=detail)
    raise exc


def _actor(user: dict[str, Any]) -> str:
    return f"user:{user.get('username') or user.get('id')}"


def attach_routes(app, get_current_admin: Callable[..., Any]) -> None:
    """Подключает роутер к приложению. Зависимость авторизации передаётся из
    server.py аргументом — импортировать её отсюда значило бы зациклить импорт."""
    admin = Depends(get_current_admin)

    @vault_router.get("/notes", summary="Список заметок (фильтры: tag, folder, q)")
    async def _list_notes(
        tag: str | None = Query(default=None, max_length=255),
        folder: str | None = Query(default=None, max_length=1024),
        q: str | None = Query(default=None, max_length=200),
        limit: int = Query(default=5000, ge=1, le=5000),
        _user: dict[str, Any] = admin,
    ) -> dict[str, Any]:
        try:
            notes = await get_service().list_notes(tag=tag, folder=folder, q=q, limit=limit)
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc
        return {"notes": notes}

    @vault_router.get("/tags", summary="Теги и число заметок с каждым")
    async def _list_tags(_user: dict[str, Any] = admin) -> dict[str, Any]:
        return {"tags": await get_service().list_tags()}

    @vault_router.post("/notes", status_code=201, summary="Создать заметку")
    async def _create_note(body: NoteCreate, user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return await get_service().create_note(body.path, body.content, _actor(user))
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.post("/notes/move", summary="Переместить или переименовать заметку")
    async def _move_note(body: NoteMove, user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return await get_service().move_note(body.path, body.new_path, _actor(user))
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.post("/notes/trash", summary="Перенести заметку в .trash/")
    async def _trash_note(body: NoteTrash, user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return await get_service().trash_note(body.path, _actor(user))
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.post("/render", summary="HTML для несохранённого текста")
    async def _render(body: RenderRequest, _user: dict[str, Any] = admin) -> dict[str, str]:
        try:
            return {"html": await get_service().render_preview(body.content, body.path)}
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.get("/notes/{path:path}", summary="Заметка: текст, HTML, ссылки")
    async def _read_note(path: str, _user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return await get_service().read_note(path)
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.put("/notes/{path:path}", summary="Сохранить заметку")
    async def _update_note(path: str, body: NoteUpdate, user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return await get_service().update_note(
                path, body.content, _actor(user), expected_hash=body.expected_hash
            )
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.get("/files/{path:path}", summary="Вложение (картинка) из vault")
    async def _read_file(path: str, _user: dict[str, Any] = admin) -> FileResponse:
        try:
            abs_path = await get_service().attachment_path(path)
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc
        # SVG может нести скрипт: nosniff + CSP не дают исполнить его, даже если
        # файл откроют напрямую по ссылке.
        return FileResponse(
            abs_path,
            headers={
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
                "Cache-Control": "private, max-age=300",
            },
        )

    @vault_router.get("/backlinks/{path:path}", summary="Заметки, ссылающиеся на эту")
    async def _backlinks(path: str, _user: dict[str, Any] = admin) -> dict[str, Any]:
        try:
            return {"backlinks": await get_service().backlinks(path)}
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.get("/graph/local/{path:path}", summary="Окрестность заметки в графе")
    async def _local_graph(
        path: str,
        depth: int = Query(default=1, ge=1, le=2),
        _user: dict[str, Any] = admin,
    ) -> dict[str, Any]:
        try:
            return await get_service().local_graph(path, depth)
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.get("/graph", summary="Граф связей всего vault")
    async def _graph(
        tag: str | None = Query(default=None, max_length=255),
        folder: str | None = Query(default=None, max_length=1024),
        unresolved: bool = False,
        orphans: bool = True,
        _user: dict[str, Any] = admin,
    ) -> dict[str, Any]:
        try:
            return await get_service().graph(tag=tag, folder=folder, unresolved=unresolved, orphans=orphans)
        except (VaultError, VaultPathError) as exc:
            raise http_error(exc) from exc

    @vault_router.get("/events", summary="Живые события vault (SSE)")
    async def _events(_user: dict[str, Any] = admin) -> EventSourceResponse:
        service = get_service()

        async def stream():
            queue = service.events.subscribe()
            try:
                yield {"event": "hello", "data": "{}"}
                while True:
                    event = await queue.get()
                    yield {"event": event["type"], "data": dumps(event)}
            finally:
                service.events.unsubscribe(queue)

        return EventSourceResponse(
            stream(),
            ping=SSE_PING_SECONDS,
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    app.include_router(vault_router)
