from __future__ import annotations

import pytest

from vault.paths import VaultPathError, in_prefix, normalize_folder, normalize_path, safe_join


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("note", "note.md"),
        ("note.md", "note.md"),
        ("Folder/Sub/Note.MD", "Folder/Sub/Note.MD"),
        ("  a//b/ c .md", "a/b/c .md"),
        ("a\\b", "a/b.md"),
        ("v1.2 notes", "v1.2 notes.md"),
        ("Заметки/Идея", "Заметки/Идея.md"),
    ],
)
def test_valid_paths_are_normalized(raw, expected):
    assert normalize_path(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "/etc/passwd",
        "../secret",
        "a/../../b",
        "a/./b",
        "C:/Windows/x",
        ".git/config",
        "a/.trash/b",
        ".obsidian/app.json",
        "a\x00b",
        "a\nb",
        "what?",
        "a|b",
        "a#b",
        "[[x]]",
        "x" * 300,
        "trailing.",
        ".md",
    ],
)
def test_dangerous_paths_are_rejected(raw):
    with pytest.raises(VaultPathError):
        normalize_path(raw)


def test_non_string_path_is_rejected():
    with pytest.raises(VaultPathError):
        normalize_path(None)  # type: ignore[arg-type]


def test_attachment_paths_keep_their_extension():
    assert normalize_path("img/pic.png", note=False) == "img/pic.png"


def test_folder_normalization():
    assert normalize_folder(None) == ""
    assert normalize_folder("/") == ""
    assert normalize_folder("agent/") == "agent"
    with pytest.raises(VaultPathError):
        normalize_folder("../x")


def test_safe_join_rejects_symlink_escape(tmp_path):
    root = tmp_path / "vault"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.md").write_text("secret")
    (root / "link").symlink_to(outside)

    assert safe_join(root, "a/b.md") == root / "a" / "b.md"
    with pytest.raises(VaultPathError):
        safe_join(root, "link/secret.md")


def test_prefix_matching_respects_folder_boundaries():
    assert in_prefix("agent/x.md", "agent/")
    assert in_prefix("agent/sub/x.md", "agent")
    assert not in_prefix("agent2/x.md", "agent")
    assert not in_prefix("x.md", "agent")
    assert in_prefix("anything.md", "")
