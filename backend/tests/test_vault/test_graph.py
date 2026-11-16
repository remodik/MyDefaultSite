from __future__ import annotations

import asyncio

import pytest

from vault import runtime
from vault.service import VaultNotFound

pytestmark = pytest.mark.anyio


async def _seed(service):
    await service.create_note("Home", "---\naliases: [Start]\n---\n[[Site]] [[Projects/Design|d]] [[Ghost]] #index", "user:x")
    await service.create_note("Site", "back to [[Home]] and ![[Home]] #project", "user:x")
    await service.create_note("Projects/Design", "[[Start]] [[Site]] [[Site#Part]] #project/vault", "user:x")
    await service.create_note("Lonely", "nothing", "user:x")


async def test_backlinks_resolve_names_paths_and_aliases(service):
    await _seed(service)

    home = await service.backlinks("Home")
    site = await service.backlinks("Site")

    assert [(b["path"], b["title"]) for b in home] == [("Projects/Design.md", "Design"), ("Site.md", "Site")]
    assert {(b["path"], b["heading"]) for b in site} == {
        ("Home.md", None), ("Projects/Design.md", None), ("Projects/Design.md", "Part"),
    }
    assert await service.backlinks("Lonely") == []
    with pytest.raises(VaultNotFound):
        await service.backlinks("Missing")


async def test_backlinks_follow_the_nearest_note_with_that_name(service):
    await service.create_note("a/Note", "A", "user:x")
    await service.create_note("b/Note", "B", "user:x")
    await service.create_note("b/Source", "[[Note]]", "user:x")
    await service.create_note("Root", "[[a/Note]]", "user:x")

    assert [b["path"] for b in await service.backlinks("b/Note")] == ["b/Source.md"]  # та же папка ближе
    assert [b["path"] for b in await service.backlinks("a/Note")] == ["Root.md"]


async def test_unresolved_link_becomes_a_backlink_once_the_note_exists(service):
    await service.create_note("Source", "[[Later]]", "user:x")
    graph = await service.graph(unresolved=True)
    assert {"source": "Source.md", "target": "?later"} in graph["edges"]

    await service.create_note("Later", "now exists", "user:x")

    assert [b["path"] for b in await service.backlinks("Later")] == ["Source.md"]
    assert {"source": "Source.md", "target": "Later.md"} in (await service.graph(unresolved=True))["edges"]


async def test_global_graph(service):
    await _seed(service)

    graph = await service.graph()
    nodes = {n["id"]: n for n in graph["nodes"]}

    assert set(nodes) == {"Home.md", "Site.md", "Projects/Design.md", "Lonely.md"}
    assert graph["edges"] == [
        {"source": "Home.md", "target": "Projects/Design.md"},
        {"source": "Home.md", "target": "Site.md"},
        {"source": "Projects/Design.md", "target": "Home.md"},
        {"source": "Projects/Design.md", "target": "Site.md"},
        {"source": "Site.md", "target": "Home.md"},
    ]
    assert nodes["Home.md"]["degree"] == 4 and nodes["Lonely.md"]["degree"] == 0
    assert nodes["Site.md"]["tags"] == ["project"]


async def test_graph_filters(service):
    await _seed(service)

    with_ghosts = await service.graph(unresolved=True)
    ghost = next(n for n in with_ghosts["nodes"] if n["unresolved"])
    assert (ghost["id"], ghost["title"]) == ("?ghost", "Ghost")

    no_orphans = {n["id"] for n in (await service.graph(orphans=False))["nodes"]}
    assert "Lonely.md" not in no_orphans

    tagged = await service.graph(tag="project")
    assert {n["id"] for n in tagged["nodes"]} == {"Site.md", "Projects/Design.md"}
    assert tagged["edges"] == [{"source": "Projects/Design.md", "target": "Site.md"}]

    folder = await service.graph(folder="Projects")
    assert [n["id"] for n in folder["nodes"]] == ["Projects/Design.md"] and folder["edges"] == []


async def test_local_graph_depth(service):
    await service.create_note("A", "[[B]]", "user:x")
    await service.create_note("B", "[[C]]", "user:x")
    await service.create_note("C", "[[D]]", "user:x")
    await service.create_note("D", "end", "user:x")

    one = await service.local_graph("A", 1)
    two = await service.local_graph("A", 2)

    assert one["center"] == "A.md"
    assert {n["id"]: n["depth"] for n in one["nodes"]} == {"A.md": 0, "B.md": 1}
    assert {n["id"]: n["depth"] for n in two["nodes"]} == {"A.md": 0, "B.md": 1, "C.md": 2}
    assert two["edges"] == [{"source": "A.md", "target": "B.md"}, {"source": "B.md", "target": "C.md"}]
    with pytest.raises(VaultNotFound):
        await service.local_graph("Missing", 1)


async def test_events_are_published_for_every_change(service):
    queue = service.events.subscribe()

    await service.create_note("a", "one", "agent:claude")
    await service.move_note("a", "b", "user:x")
    await service.trash_note("b", "user:x")
    await service.reconcile(full=True)

    events = [queue.get_nowait() for _ in range(queue.qsize())]
    assert [(e["type"], e.get("path"), e.get("actor")) for e in events] == [
        ("note_changed", "a.md", "agent:claude"),
        ("note_moved", "a.md", "user:x"),
        ("note_deleted", "b.md", "user:x"),
        ("index_updated", None, None),
    ]
    assert events[0]["commit"] and events[0]["action"] == "create"


async def test_slow_subscriber_does_not_grow_without_bound(service):
    from vault.events import QUEUE_SIZE

    queue = service.events.subscribe()
    for i in range(QUEUE_SIZE + 25):
        service.events.publish({"type": "note_changed", "n": i})

    assert queue.qsize() == QUEUE_SIZE
    assert queue.get_nowait()["n"] == 25  # самые старые вытеснены
    service.events.unsubscribe(queue)
    assert service.events.subscriber_count == 0


@pytest.mark.parametrize("mode", ["auto", "poll"])
async def test_watcher_indexes_files_changed_on_disk(service, monkeypatch, mode):
    monkeypatch.setenv("VAULT_WATCH", mode)
    monkeypatch.setenv("VAULT_POLL_INTERVAL", "1")
    queue = service.events.subscribe()
    task = asyncio.create_task(runtime._background(service))
    try:
        await asyncio.sleep(1.0)  # слежение успело подняться
        (service.root / "agent").mkdir()
        (service.root / "agent" / "dropped.md").write_text("# Dropped in\n\n#watch\n")

        event = await asyncio.wait_for(queue.get(), timeout=15)
        while event["type"] != "note_changed":
            event = await asyncio.wait_for(queue.get(), timeout=15)

        assert (event["path"], event["actor"]) == ("agent/dropped.md", "external")
        assert [n["title"] for n in await service.list_notes()] == ["Dropped in"]
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task


async def test_watcher_falls_back_to_polling(service, monkeypatch):
    monkeypatch.setenv("VAULT_WATCH", "auto")
    monkeypatch.setenv("VAULT_POLL_INTERVAL", "1")

    async def broken(_service):
        raise RuntimeError("inotify недоступен")

    monkeypatch.setattr(runtime, "_watch_files", broken)
    task = asyncio.create_task(runtime._background(service))
    try:
        (service.root / "late.md").write_text("# Late\n")
        for _ in range(40):
            await asyncio.sleep(0.25)
            if await service.list_notes():
                break
        assert [n["path"] for n in await service.list_notes()] == ["late.md"]
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
