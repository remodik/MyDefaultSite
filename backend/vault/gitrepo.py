"""Git-история vault через dulwich.

dulwich — чистый Python: бинарника ``git`` в контейнере хостинга может не
быть, и внешний процесс на каждое сохранение обходился бы дороже. Формат
репозитория обычный, так что ``git log`` / ``git clone`` с ним работают.

Все функции синхронные — сервис вызывает их через ``asyncio.to_thread``.
"""

from __future__ import annotations

from pathlib import Path

from dulwich.repo import Repo

COMMIT_EMAIL = "vault@localhost"


def _worktree(repo: Repo):
    # dulwich 1.x вынес stage/commit в WorkTree; в 0.2x они были методами Repo.
    return repo.get_worktree() if hasattr(repo, "get_worktree") else repo


def ensure_repo(root: Path) -> None:
    """Создаёт каталог и git-репозиторий, если их ещё нет. Идемпотентно."""
    root.mkdir(parents=True, exist_ok=True)
    if not (root / ".git").exists():
        Repo.init(str(root)).close()


def commit_paths(root: Path, rel_paths: list[str], message: str, author: str) -> str | None:
    """Коммитит перечисленные пути (включая удалённые). Возвращает sha или
    None, если изменений нет.

    В индекс попадают только названные пути: чужие незакоммиченные правки на
    диске (внешний редактор, синхронизация) в коммит автора не подмешиваются.
    """
    repo = Repo(str(root))
    try:
        worktree = _worktree(repo)
        worktree.stage(rel_paths)

        tree_id = repo.open_index().commit(repo.object_store)
        try:
            head_tree = repo[repo.head()].tree
        except KeyError:
            head_tree = None
        if head_tree == tree_id:
            return None

        identity = f"{author} <{COMMIT_EMAIL}>".encode("utf-8")
        commit = getattr(worktree, "commit", None) or repo.do_commit
        sha = commit(message=message.encode("utf-8"), author=identity, committer=identity)
        return sha.decode("ascii") if isinstance(sha, bytes) else str(sha)
    finally:
        repo.close()


def head_commit(root: Path) -> str | None:
    repo = Repo(str(root))
    try:
        return repo.head().decode("ascii")
    except KeyError:
        return None
    finally:
        repo.close()


def log(root: Path, limit: int = 20) -> list[dict[str, str]]:
    """Последние коммиты: sha, автор, сообщение, время (unix)."""
    repo = Repo(str(root))
    try:
        try:
            head = repo.head()
        except KeyError:
            return []
        out: list[dict[str, str]] = []
        for entry in repo.get_walker(include=[head], max_entries=limit):
            commit = entry.commit
            author = commit.author.decode("utf-8", "replace")
            out.append(
                {
                    "sha": commit.id.decode("ascii"),
                    "author": author.split(" <", 1)[0],
                    "message": commit.message.decode("utf-8", "replace").strip(),
                    "time": str(commit.commit_time),
                }
            )
        return out
    finally:
        repo.close()
