"""Scoped agent identities, write requests and audit history."""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, String, Text, func, select
from sqlalchemy.orm import Mapped, mapped_column

from database import Base, async_session_factory
from vault import config, gitrepo
from vault.paths import normalize_folder, normalize_path
from vault.service import VaultConflict, VaultError, VaultNotFound, dumps, get_service


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    digest: Mapped[str] = mapped_column(String(64), unique=True)
    scope: Mapped[str] = mapped_column(String(16))
    prefixes: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    def folders(self) -> list[str]:
        return json.loads(self.prefixes)

    def allows(self, path: str) -> bool:
        return any(not p or path.startswith(p + "/") for p in self.folders())


class PendingWrite(Base):
    __tablename__ = "vault_pending_writes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    token_id: Mapped[str] = mapped_column(ForeignKey("api_tokens.id"), index=True)
    payload: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reviewer: Mapped[str | None] = mapped_column(String(60))


class TokenInput(BaseModel):
    name: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,60}$")
    scope: Literal["read-only", "read-write"]
    prefixes: list[str] = Field(min_length=1, max_length=20)


class WriteInput(BaseModel):
    action: Literal["create", "append", "update", "move", "trash"]
    path: str
    content: str = ""
    expected_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    new_path: str | None = None


class AgentDenied(VaultError):
    pass


# Serialize agent writes with revocations and approvals. The vault itself
# serializes filesystem mutations and compares expected hashes under its lock.
_gate = asyncio.Lock()


def token_data(row: ApiToken) -> dict[str, Any]:
    return {"id": row.id, "name": row.name, "scope": row.scope, "prefixes": json.loads(row.prefixes),
            "revoked": row.revoked_at is not None}


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def authenticate(raw: str) -> ApiToken | None:
    if not raw.startswith("vlt_") or len(raw) != 47:
        return None
    async with async_session_factory() as session:
        return await session.scalar(select(ApiToken).where(ApiToken.digest == digest(raw), ApiToken.revoked_at.is_(None)))


async def create_token(data: TokenInput) -> dict:
    prefixes = []
    for raw in data.prefixes:
        # Root access requires an explicit slash, never a blank input.
        prefix = "" if raw.strip() == "/" else normalize_folder(raw)
        if not prefix and raw.strip() != "/":
            raise VaultError("для доступа ко всему vault укажите /")
        prefixes.append(prefix)
    raw = "vlt_" + secrets.token_urlsafe(32)
    row = ApiToken(id=uuid.uuid4().hex, name=data.name, scope=data.scope, digest=digest(raw),
                   prefixes=dumps(sorted(set(prefixes))))
    async with async_session_factory() as session:
        session.add(row)
        await session.commit()
    return {**token_data(row), "token": raw}


async def revoke(token_id: str) -> None:
    async with _gate, async_session_factory() as session:
        row = await session.get(ApiToken, token_id)
        if not row:
            raise VaultNotFound("токен не найден")
        row.revoked_at = row.revoked_at or now()
        await session.commit()


def require_read(token: ApiToken, path: str) -> str:
    path = normalize_path(path)
    if not token.allows(path):
        raise AgentDenied("доступ к пути запрещён")
    return path


async def execute(data: WriteInput, actor: str) -> dict:
    service = get_service()
    if data.action == "create":
        return await service.create_note(data.path, data.content, actor)
    if data.action == "update":
        return await service.update_note(data.path, data.content, actor, expected_hash=data.expected_hash)
    if data.action == "append":
        return await service.append_to_note(data.path, data.content, actor, expected_hash=data.expected_hash)
    if data.action == "move":
        return await service.move_note(data.path, data.new_path, actor, expected_hash=data.expected_hash)
    return await service.trash_note(data.path, actor, expected_hash=data.expected_hash)


async def submit(token: ApiToken, data: WriteInput) -> dict:
    data.path = normalize_path(data.path)
    if data.action == "move":
        data.new_path = normalize_path(data.new_path)
    if data.action == "update" and not data.expected_hash:
        raise VaultError("для обновления нужен expected_hash")
    if len(data.content.encode()) > config.max_note_bytes():
        raise VaultError("содержимое превышает лимит")
    async with _gate, async_session_factory() as session:
        row = await session.get(ApiToken, token.id)
        if not row or row.revoked_at is not None or row.scope != "read-write":
            raise AgentDenied("запись запрещена")
        actor = f"agent:{row.name}"
        scoped = row.allows(data.path) and (data.new_path is None or row.allows(data.new_path))
        if scoped and data.action not in {"move", "trash"}:
            return await execute(data, actor)
        count = await session.scalar(select(func.count()).select_from(PendingWrite).where(
            PendingWrite.token_id == row.id, PendingWrite.status == "pending"))
        if count >= max(1, config.max_pending_per_token()):
            raise VaultError("слишком много ожидающих запросов")
        # Blind requests never read the protected file. Existing protected
        # contents and their hashes are never provided to the token holder.
        if data.action != "create" and row.allows(data.path) and not data.expected_hash:
            data.expected_hash = await get_service().note_hash(data.path)
        req = PendingWrite(id=uuid.uuid4().hex, token_id=row.id, payload=data.model_dump_json(),
                           reason="destructive" if scoped else "outside_scope")
        session.add(req)
        await session.commit()
        return {"status": "pending", "request_id": req.id}


async def decide(request_id: str, approved: bool, reviewer: str, expected_hash: str | None) -> dict:
    async with _gate, async_session_factory() as session:
        req = await session.get(PendingWrite, request_id)
        if req is None:
            raise VaultNotFound("запрос не найден")
        if req.status != "pending":
            raise VaultConflict("запрос уже рассмотрен")
        result = {}
        if approved:
            row = await session.get(ApiToken, req.token_id)
            if row.revoked_at is not None:
                raise VaultConflict("токен отозван")
            data = WriteInput.model_validate_json(req.payload)
            if data.action != "create":
                if not expected_hash or (data.expected_hash and data.expected_hash != expected_hash):
                    raise VaultConflict("запрос относится к другой версии заметки")
                data.expected_hash = expected_hash
            # Claim first: after a crash the same request must not replay.
            req.status = "applying"
            req.reviewer = reviewer
            await session.commit()
            try:
                result = await execute(data, f"agent:{row.name}")
            except Exception:
                req.status = "failed"
                await session.commit()
                raise
        req.status = "approved" if approved else "rejected"
        req.reviewer = reviewer
        await session.commit()
        return {"status": req.status, **result}


async def settings() -> dict:
    async with async_session_factory() as session:
        tokens = (await session.scalars(select(ApiToken).order_by(ApiToken.created_at.desc()).limit(100))).all()
        rows = (await session.execute(select(PendingWrite, ApiToken.name).join(ApiToken)
                .where(PendingWrite.status == "pending").order_by(PendingWrite.created_at).limit(100))).all()
    return {
        "tokens": [token_data(row) for row in tokens],
        "pending": [{"id": req.id, "agent": name, "reason": req.reason,
                     **WriteInput.model_validate_json(req.payload).model_dump()} for req, name in rows],
    }


async def history() -> list[dict]:
    # Git is authoritative for "who, what, when, commit", even if the app
    # crashes immediately after saving. No duplicate write log is required.
    return await asyncio.to_thread(gitrepo.log, get_service().root, 100)
