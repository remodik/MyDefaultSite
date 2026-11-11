from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from vault import config, gitrepo, index
from vault.paths import VaultPathError
from vault.service import VaultConflict, VaultNotFound, VaultTooLarge

pytestmark = pytest.mark.anyio

BACKEND_DIR = Path(__file__).resolve().parents[2]


async def test_create_writes_file_commits_and_indexes(service):
    result = await service.create_note("inbox/First", "# First\n\nhello #tag\n", "user:remodik")

    assert result["path"] == "inbox/First.md"
    assert (service.root / "inbox" / "First.md").read_text() == "# First\n\nhello #tag\n"
    commits = gitrepo.log(service.root)
    assert commits[0]["sha"] == result["commit"]
    assert commits[0]["author"] == "user:remodik"
    assert commits[0]["message"] == "create: inbox/First.md"

    notes = await service.list_notes()
    assert [(n["path"], n["title"], n["folder"], n["tags"]) for n in notes] == [
        ("inbox/First.md", "First", "inbox", ["tag"])
    ]


async def test_every_save_is_one_commit_with_its_author(service):
    await service.create_note("a", "one", "user:remodik")
    note = await service.read_note("a")
    await service.update_note("a", "two", "agent:claude", expected_hash=note["hash"])
    await service.append_to_note("a", "three", "agent:codex")

    commits = gitrepo.log(service.root)
    assert [(c["author"], c["message"]) for c in commits] == [
        ("agent:codex", "append: a.md"),
        ("agent:claude", "update: a.md"),
        ("user:remodik", "create: a.md"),
    ]
    assert (service.root / "a.md").read_text() == "two\nthree\n"


async def test_create_refuses_to_overwrite(service):
    await service.create_note("a", "one", "user:x")

    with pytest.raises(VaultConflict):
        await service.create_note("a.md", "two", "user:x")
    assert (service.root / "a.md").read_text() == "one"


async def test_update_requires_the_hash_the_author_saw(service):
    await service.create_note("a", "one", "user:x")
    seen = (await service.read_note("a"))["hash"]
    await service.update_note("a", "two", "user:x", expected_hash=seen)

    with pytest.raises(VaultConflict) as excinfo:
        await service.update_note("a", "three", "agent:late", expected_hash=seen)

    assert excinfo.value.extra["current_hash"] == index.content_hash(b"two")
    assert (service.root / "a.md").read_text() == "two"


async def test_unchanged_update_makes_no_commit(service):
    await service.create_note("a", "same", "user:x")

    result = await service.update_note("a", "same", "user:x")

    assert result["action"] == "unchanged" and result["commit"] is None
    assert len(gitrepo.log(service.root)) == 1


async def test_missing_note_and_bad_paths(service):
    with pytest.raises(VaultNotFound):
        await service.read_note("nope")
    with pytest.raises(VaultNotFound):
        await service.update_note("nope", "x", "user:x")
    for bad in ("../outside", "/etc/passwd", ".git/config", ".trash/x"):
        with pytest.raises(VaultPathError):
            await service.create_note(bad, "x", "user:x")
    assert not (service.root.parent / "outside.md").exists()


async def test_size_limit(service, monkeypatch):
    monkeypatch.setenv("VAULT_MAX_NOTE_BYTES", "64")

    with pytest.raises(VaultTooLarge):
        await service.create_note("big", "x" * 65, "user:x")
    await service.create_note("small", "x" * 60, "user:x")
    with pytest.raises(VaultTooLarge):
        await service.append_to_note("small", "y" * 10, "user:x")
    assert not (service.root / "big.md").exists()


async def test_move_keeps_history_and_updates_index(service):
    await service.create_note("inbox/a", "[[b]]", "user:x")

    result = await service.move_note("inbox/a", "archive/2026/a", "user:x")

    assert result["new_path"] == "archive/2026/a.md"
    assert not (service.root / "inbox").exists()  # пустая папка убрана
    assert (service.root / "archive/2026/a.md").read_text() == "[[b]]"
    assert [n["path"] for n in await service.list_notes()] == ["archive/2026/a.md"]
    assert gitrepo.log(service.root)[0]["message"] == "move: inbox/a.md -> archive/2026/a.md"

    await service.create_note("other", "x", "user:x")
    with pytest.raises(VaultConflict):
        await service.move_note("other", "archive/2026/a", "user:x")


async def test_trash_moves_instead_of_deleting(service):
    await service.create_note("a", "keep me", "user:x")

    first = await service.trash_note("a", "user:x")
    await service.create_note("a", "second", "user:x")
    second = await service.trash_note("a", "user:x")

    assert first["new_path"] == ".trash/a.md"
    assert second["new_path"] != first["new_path"]  # одноимённая заметка не затирает прежнюю
    assert (service.root / ".trash/a.md").read_text() == "keep me"
    assert (service.root / second["new_path"]).read_text() == "second"
    assert await service.list_notes() == []
    with pytest.raises(VaultNotFound):
        await service.read_note("a")


async def test_read_note_renders_and_resolves_links(service):
    await service.create_note("People/Alice", "---\naliases: [Al]\n---\n# Alice\n", "user:x")
    await service.create_note("Main", "[[Alice]] [[Al]] [[Nobody]] ![[Alice]]", "user:x")

    note = await service.read_note("Main")

    assert [link["path"] for link in note["links"]] == [
        "People/Alice.md", "People/Alice.md", None, "People/Alice.md",
    ]
    assert note["links"][0]["title"] == "Alice"
    assert note["html"].count('data-note="People/Alice.md"') >= 3
    assert "is-unresolved" in note["html"]
    assert '<div class="vault-embed"' in note["html"]


async def test_filters_by_tag_and_folder(service):
    await service.create_note("work/a", "#project/site", "user:x")
    await service.create_note("work/deep/b", "#project", "user:x")
    await service.create_note("home/c", "#home", "user:x")
    await service.create_note("workshop/d", "#other", "user:x")

    assert [n["path"] for n in await service.list_notes(folder="work")] == ["work/a.md", "work/deep/b.md"]
    assert [n["path"] for n in await service.list_notes(tag="project")] == ["work/a.md", "work/deep/b.md"]
    assert [n["path"] for n in await service.list_notes(tag="#project/site")] == ["work/a.md"]
    assert [n["path"] for n in await service.list_notes(tag="home", folder="work")] == []
    assert {t["tag"]: t["count"] for t in await service.list_tags()} == {
        "project/site": 1, "project": 1, "home": 1, "other": 1,
    }


async def test_full_text_search(service):
    await service.create_note("recipes/Борщ", "# Борщ\n\nСвёкла, капуста и картофель.\n", "user:x")
    await service.create_note("recipes/Pasta", "# Pasta\n\nTomato sauce and basil.\n", "user:x")
    await service.create_note("misc", "nothing relevant", "user:x")

    assert [n["path"] for n in await service.list_notes(q="капуст")] == ["recipes/Борщ.md"]  # префикс
    assert [n["path"] for n in await service.list_notes(q="БОРЩ")] == ["recipes/Борщ.md"]  # регистр
    hits = await service.search("tomato basil")
    assert [n["path"] for n in hits] == ["recipes/Pasta.md"]
    assert "<mark>Tomato</mark>" in hits[0]["snippet_html"]
    assert await service.list_notes(q='"; DROP TABLE vault_notes; --') == []
    assert await service.list_notes(q="zzzz") == []
    assert len(await service.list_notes()) == 3  # таблица на месте


async def test_search_snippet_is_escaped(service):
    await service.create_note("x", "needle <script>alert(1)</script>", "user:x")

    hit = (await service.search("needle"))[0]

    assert "<script>" not in hit["snippet_html"]
    assert "&lt;script&gt;" in hit["snippet_html"]


async def test_updated_note_replaces_its_index_rows(service):
    await service.create_note("a", "#old [[x]] unique-old-word", "user:x")
    await service.update_note("a", "#new [[y]] unique-new-word", "user:x")

    assert (await service.list_notes())[0]["tags"] == ["new"]
    assert await service.list_notes(q="unique-old-word") == []
    assert len(await service.list_notes(q="unique-new-word")) == 1


async def test_reconcile_picks_up_external_changes(service):
    await service.create_note("kept", "kept", "user:x")
    await service.create_note("gone", "gone", "user:x")
    (service.root / "added.md").write_text("# Added outside\n\n#ext\n")
    (service.root / "kept.md").write_text("# Kept, edited outside\n")
    os.remove(service.root / "gone.md")
    (service.root / ".trash").mkdir(exist_ok=True)
    (service.root / ".trash" / "old.md").write_text("trashed")
    (service.root / "pic.png").write_bytes(b"\x89PNG")

    stats = await service.reconcile()

    assert stats["indexed"] == 3 and stats["removed"] == 1  # added, kept, pic.png / gone
    notes = {n["path"]: n for n in await service.list_notes()}
    assert set(notes) == {"added.md", "kept.md"}  # .trash и .git не индексируются
    assert notes["added.md"]["title"] == "Added outside"
    assert notes["kept.md"]["title"] == "Kept, edited outside"
    assert (await service.names()).resolve("pic.png") == "pic.png"
    assert (await service.reconcile())["indexed"] == 0  # повторная сверка — без работы


async def test_full_rebuild_gives_the_same_index(service):
    await service.create_note("a", "---\naliases: [Alpha]\n---\n[[b]] #t1", "user:x")
    await service.create_note("dir/b", "[[a]] #t2 text", "user:x")
    before = (await service.list_notes(), await service.list_tags(), await service.backlinks("a"))

    stats = await service.reconcile(full=True)

    assert stats["indexed"] == 2
    assert (await service.list_notes(), await service.list_tags(), await service.backlinks("a")) == before
    assert len(await service.list_notes(q="text")) == 1


async def test_sync_path_follows_disk_and_ignores_own_writes(service):
    queue = service.events.subscribe()
    await service.create_note("a", "one", "user:x")
    assert queue.get_nowait()["type"] == "note_changed"

    assert await service.sync_path("a.md") is None  # наша запись — индекс уже актуален
    assert queue.empty()

    (service.root / "a.md").write_text("# Edited outside\n")
    assert await service.sync_path("a.md") == "changed"
    event = queue.get_nowait()
    assert (event["type"], event["path"], event["actor"]) == ("note_changed", "a.md", "external")
    assert (await service.list_notes())[0]["title"] == "Edited outside"

    os.remove(service.root / "a.md")
    assert await service.sync_path("a.md") == "deleted"
    assert queue.get_nowait()["type"] == "note_deleted"
    assert await service.list_notes() == []

    assert await service.sync_path(".git/HEAD") is None
    assert await service.sync_path("../x.md") is None


async def test_oversized_file_on_disk_is_not_indexed(service, monkeypatch):
    monkeypatch.setenv("VAULT_MAX_NOTE_BYTES", "32")
    (service.root / "huge.md").write_text("x" * 100)

    await service.reconcile()

    assert await service.list_notes() == []
    with pytest.raises(VaultTooLarge):
        await service.read_note("huge")


async def test_start_is_idempotent(service):
    await service.create_note("a", "one", "user:x")
    service._started = False

    await service.start()
    await service.start()

    assert len(gitrepo.log(service.root)) == 1
    assert (await service.read_note("a"))["content"] == "one"


def test_reindex_script_rebuilds_from_files(tmp_path):
    vault = tmp_path / "vault"
    (vault / "sub").mkdir(parents=True)
    (vault / "one.md").write_text("# One\n\n[[two]] #alpha\n")
    (vault / "sub" / "two.md").write_text("# Two\n")
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path}/index.db",
        "VAULT_DIR": str(vault),
    }

    for flag in ([], ["--full"]):
        proc = subprocess.run(
            [sys.executable, "scripts/reindex_vault.py", *flag],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=120,
        )
        assert proc.returncode == 0, proc.stderr
    assert "проиндексировано 2" in proc.stdout

    import sqlite3

    conn = sqlite3.connect(tmp_path / "index.db")
    assert [r[0] for r in conn.execute("SELECT path FROM vault_notes ORDER BY path")] == ["one.md", "sub/two.md"]
    assert conn.execute("SELECT target FROM vault_links").fetchall() == [("two",)]
    assert conn.execute("SELECT path FROM vault_fts WHERE vault_fts MATCH 'alpha'").fetchall() == [("one.md",)]
    assert (vault / ".git").is_dir()


def test_vault_dir_defaults_inside_the_backend(monkeypatch):
    monkeypatch.delenv("VAULT_DIR", raising=False)
    assert config.vault_dir() == BACKEND_DIR / "data" / "vault"
    monkeypatch.setenv("VAULT_DIR", "data/custom")
    assert config.vault_dir() == BACKEND_DIR / "data" / "custom"
