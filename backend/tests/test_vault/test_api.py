from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from vault import gitrepo


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """Приложение целиком, как под uvicorn: lifespan поднимает vault."""
    import os

    os.environ["VAULT_DIR"] = str(tmp_path_factory.mktemp("api") / "vault")
    from vault import service as service_module

    service_module.reset_service()
    import server

    with TestClient(server.app) as test_client:
        yield test_client
    service_module.reset_service()


def _make_user(client, role: str) -> dict[str, str]:
    import server
    from database import User, async_session_factory

    username = f"{role}-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    async def create() -> None:
        async with async_session_factory() as session:
            session.add(User(id=user_id, username=username, email=f"{username}@example.com",
                             password_hash="x", role=role, created_at=datetime.now()))
            await session.commit()

    client.portal.call(create)
    token = server.create_access_token({"sub": user_id})
    return {"Authorization": f"Bearer {token}", "X-Username": username}


@pytest.fixture(scope="module")
def admin(client):
    return _make_user(client, "admin")


@pytest.fixture(scope="module")
def plain_user(client):
    return _make_user(client, "user")


def test_vault_requires_admin(client, plain_user):
    for method, url in [("get", "/api/vault/notes"), ("get", "/api/vault/tags"),
                        ("get", "/api/vault/notes/x.md"), ("get", "/api/vault/files/x.png")]:
        assert getattr(client, method)(url).status_code == 401, url
        assert getattr(client, method)(url, headers=plain_user).status_code == 403, url
    assert client.post("/api/vault/notes", json={"path": "x", "content": ""}).status_code == 401
    assert client.post("/api/vault/notes", json={"path": "x", "content": ""}, headers=plain_user).status_code == 403
    assert client.put("/api/vault/notes/x.md", json={"content": "y"}, headers=plain_user).status_code == 403
    assert client.post("/api/vault/notes/trash", json={"path": "x"}, headers=plain_user).status_code == 403


def test_create_read_update_cycle(client, admin):
    created = client.post("/api/vault/notes", json={"path": "api/Первая заметка", "content": "# Привет\n\n[[Other]] #api\n"},
                          headers=admin)
    assert created.status_code == 201, created.text
    assert created.json()["path"] == "api/Первая заметка.md"

    note = client.get("/api/vault/notes/api/Первая заметка.md", headers=admin).json()
    assert note["title"] == "Привет"
    assert note["tags"] == ["api"]
    assert "is-unresolved" in note["html"]
    assert note["links"][0]["path"] is None

    saved = client.put("/api/vault/notes/api/Первая заметка.md",
                       json={"content": "# Привет\n\nновый текст\n", "expected_hash": note["hash"]}, headers=admin)
    assert saved.status_code == 200, saved.text
    assert saved.json()["hash"] != note["hash"]

    from vault.service import get_service

    commits = gitrepo.log(get_service().root)
    assert commits[0]["author"] == f"user:{admin['X-Username']}"
    assert commits[0]["message"] == "update: api/Первая заметка.md"


def test_stale_save_is_rejected_with_the_current_hash(client, admin):
    client.post("/api/vault/notes", json={"path": "api/conflict", "content": "one"}, headers=admin)
    seen = client.get("/api/vault/notes/api/conflict.md", headers=admin).json()["hash"]
    client.put("/api/vault/notes/api/conflict.md", json={"content": "two", "expected_hash": seen}, headers=admin)

    stale = client.put("/api/vault/notes/api/conflict.md", json={"content": "three", "expected_hash": seen},
                       headers=admin)

    assert stale.status_code == 409
    current = client.get("/api/vault/notes/api/conflict.md", headers=admin).json()
    assert stale.json()["detail"]["current_hash"] == current["hash"]
    assert current["content"] == "two"


def test_list_filters_and_search(client, admin):
    client.post("/api/vault/notes", json={"path": "listing/a", "content": "уникальное-слово #listing"}, headers=admin)
    client.post("/api/vault/notes", json={"path": "listing/sub/b", "content": "other #listing/deep"}, headers=admin)

    by_folder = client.get("/api/vault/notes", params={"folder": "listing"}, headers=admin).json()["notes"]
    by_tag = client.get("/api/vault/notes", params={"tag": "listing/deep"}, headers=admin).json()["notes"]
    by_query = client.get("/api/vault/notes", params={"q": "уникальное"}, headers=admin).json()["notes"]
    tags = client.get("/api/vault/tags", headers=admin).json()["tags"]

    assert [n["path"] for n in by_folder] == ["listing/a.md", "listing/sub/b.md"]
    assert [n["path"] for n in by_tag] == ["listing/sub/b.md"]
    assert [n["path"] for n in by_query] == ["listing/a.md"]
    assert "<mark>" in by_query[0]["snippet_html"]
    assert {"tag": "listing", "count": 1} in tags


def test_move_and_trash(client, admin):
    client.post("/api/vault/notes", json={"path": "mv/src", "content": "x"}, headers=admin)

    moved = client.post("/api/vault/notes/move", json={"path": "mv/src", "new_path": "mv/dst"}, headers=admin)
    assert moved.status_code == 200 and moved.json()["new_path"] == "mv/dst.md"
    assert client.get("/api/vault/notes/mv/src.md", headers=admin).status_code == 404

    trashed = client.post("/api/vault/notes/trash", json={"path": "mv/dst"}, headers=admin)
    assert trashed.status_code == 200 and trashed.json()["new_path"].startswith(".trash/")
    assert client.get("/api/vault/notes/mv/dst.md", headers=admin).status_code == 404

    from vault.service import get_service

    assert (get_service().root / ".trash/mv/dst.md").read_text() == "x"


@pytest.mark.parametrize("path", ["../../etc/passwd", "..%2F..%2Fetc%2Fpasswd", ".git/config", ".trash/mv/dst.md",
                                  "/etc/passwd", "a/../../b"])
def test_traversal_is_rejected_everywhere(client, admin, path):
    assert client.get(f"/api/vault/notes/{path}", headers=admin).status_code in (400, 404)
    assert client.put(f"/api/vault/notes/{path}", json={"content": "x"}, headers=admin).status_code in (400, 404)
    assert client.get(f"/api/vault/files/{path}", headers=admin).status_code in (400, 404)
    created = client.post("/api/vault/notes", json={"path": path, "content": "x"}, headers=admin)
    assert created.status_code == 400, created.text
    moved = client.post("/api/vault/notes/move", json={"path": "whatever", "new_path": path}, headers=admin)
    assert moved.status_code == 400


def test_oversized_note_is_rejected(client, admin, monkeypatch):
    monkeypatch.setenv("VAULT_MAX_NOTE_BYTES", "100")

    too_big = client.post("/api/vault/notes", json={"path": "big", "content": "x" * 101}, headers=admin)

    assert too_big.status_code == 413
    assert client.get("/api/vault/notes/big.md", headers=admin).status_code == 404


def test_render_endpoint_previews_unsaved_text(client, admin):
    client.post("/api/vault/notes", json={"path": "render/Target", "content": "# Target"}, headers=admin)

    html = client.post("/api/vault/render", json={"content": "[[Target]] <script>x</script> **b**",
                                                  "path": "render/draft"}, headers=admin).json()["html"]

    assert 'data-note="render/Target.md"' in html
    assert "<script" not in html and "<strong>b</strong>" in html


def test_attachments_only_serve_images(client, admin):
    from vault.service import get_service

    root = get_service().root
    (root / "img").mkdir(exist_ok=True)
    (root / "img" / "pic.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "secret.txt").write_text("nope")

    image = client.get("/api/vault/files/img/pic.png", headers=admin)
    assert image.status_code == 200
    assert image.headers["x-content-type-options"] == "nosniff"
    assert client.get("/api/vault/files/secret.txt", headers=admin).status_code == 400
    assert client.get("/api/vault/files/api/conflict.md", headers=admin).status_code == 400
    assert client.get("/api/vault/files/img/missing.png", headers=admin).status_code == 404


def test_existing_site_endpoints_still_work(client):
    assert client.get("/api/health").status_code == 200
