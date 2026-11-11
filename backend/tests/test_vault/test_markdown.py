from __future__ import annotations

from vault.markdown import MAX_EMBED_DEPTH, Link, extract_section, parse


class FakeVault:
    """Минимальный resolver: заметки и вложения в словаре."""

    def __init__(self, files: dict[str, str | None]):
        self.files = files

    def resolve(self, target, source):
        wanted = target.lower()
        for path in self.files:
            name = path.lower().rsplit("/", 1)[-1]
            if path.lower() in (wanted, wanted + ".md") or name in (wanted, wanted + ".md"):
                return path
        return None

    def read(self, path):
        return self.files.get(path)


def test_frontmatter_tags_aliases_and_title():
    parsed = parse(
        "---\ntitle: Front Title\ntags: [Alpha, beta/sub]\naliases: [Mn, Main note]\ndate: 2026-01-02\n---\n"
        "# Heading\n\nbody #inline-tag\n"
    )

    assert parsed.frontmatter["title"] == "Front Title"
    assert parsed.frontmatter["date"] == "2026-01-02"  # дата приведена к строке
    assert parsed.title == "Front Title"
    assert parsed.tags == ["alpha", "beta/sub", "inline-tag"]
    assert parsed.aliases == ["Mn", "Main note"]
    assert "Front Title" not in parsed.html and "tags:" not in parsed.html
    assert parsed.body.startswith("# Heading")


def test_title_falls_back_to_first_h1_and_string_tags():
    parsed = parse("---\ntags: one, two three\n---\n## Sub\n\n# Real Title\n")

    assert parsed.title == "Real Title"
    assert parsed.tags == ["one", "two", "three"]


def test_broken_frontmatter_does_not_break_parsing():
    parsed = parse("---\n: : [unclosed\n---\ntext\n")

    assert parsed.frontmatter == {}
    assert "text" in parsed.html


def test_wikilink_forms_are_extracted():
    parsed = parse("[[Note]] [[Folder/Other|alias]] [[Note#Section]] [[Note#Section|shown]] [[#local]]")

    assert parsed.links == [
        Link("Note"),
        Link("Folder/Other", display="alias"),
        Link("Note", heading="Section"),
        Link("Note", heading="Section", display="shown"),
    ]


def test_resolved_and_unresolved_links_are_styled_differently():
    vault = FakeVault({"a/Other.md": "x"})
    html = parse("[[Other]] and [[Missing Note]]", resolver=vault, source="Main.md").html

    assert 'class="vault-link" href="/vault?note=a/Other.md" data-note="a/Other.md"' in html
    assert 'class="vault-link is-unresolved"' in html
    assert 'data-target="Missing Note"' in html


def test_without_resolver_every_link_is_unresolved():
    assert "is-unresolved" in parse("[[Anything]]").html


def test_markdown_links_to_notes_count_as_links():
    vault = FakeVault({"a/Other.md": "x"})
    parsed = parse("[t](a/Other.md#sec) [ext](https://example.com)", resolver=vault, source="Main.md")

    assert parsed.links == [Link("a/Other.md", heading="sec")]
    assert 'data-note="a/Other.md"' in parsed.html
    assert 'class="external-link"' in parsed.html


def test_note_embed_is_inlined():
    vault = FakeVault({"Other.md": "# Other\n\nembedded **text**\n"})
    parsed = parse("before\n\n![[Other]]\n", resolver=vault, source="Main.md")

    assert parsed.links == [Link("Other", embed=True)]
    assert '<div class="vault-embed" data-note="Other.md">' in parsed.html
    assert "embedded <strong>text</strong>" in parsed.html
    assert "<p><div" not in parsed.html  # абзац вокруг блочного embed убран


def test_section_embed_takes_only_that_section():
    vault = FakeVault({"Other.md": "# Other\n\nintro\n\n## Sec\n\nsec text\n\n## Next\n\nnext text\n"})
    html = parse("![[Other#Sec]]", resolver=vault, source="Main.md").html

    assert "sec text" in html
    assert "intro" not in html and "next text" not in html


def test_embed_cycle_is_cut():
    vault = FakeVault({"A.md": "a ![[B]]", "B.md": "b ![[A]]"})
    html = parse(vault.files["A.md"], resolver=vault, source="A.md").html

    assert html.count('class="vault-embed"') == 1  # B встроена, обратная A — уже ссылка
    assert "is-skipped" in html


def test_embed_depth_is_limited():
    files = {f"N{i}.md": f"level {i} ![[N{i + 1}]]" for i in range(10)}
    html = parse(files["N0.md"], resolver=FakeVault(files), source="N0.md").html

    assert html.count('class="vault-embed"') == MAX_EMBED_DEPTH
    assert f"level {MAX_EMBED_DEPTH}" in html
    assert f"level {MAX_EMBED_DEPTH + 1}" not in html


def test_image_embeds():
    vault = FakeVault({"img/pic.png": None})
    html = parse("![[pic.png|200]] ![alt](img/pic.png) ![[nope.png]]", resolver=vault, source="Main.md").html

    assert '<img class="vault-image" data-vault-src="img/pic.png" alt="pic.png" width="200">' in html
    assert 'data-vault-src="img/pic.png" alt="alt"' in html
    assert '<span class="vault-embed is-unresolved">nope.png</span>' in html
    assert "src=" not in html.replace("data-vault-src=", "")  # src ставит фронтенд


def test_callouts():
    html = parse(
        "> [!warning] Careful **now**\n> body\n\n> [!tip]- Folded\n> hidden\n\n> [!faq]+ Open\n> shown\n\n"
        "> [!note]\n> only body\n\n> plain quote\n"
    ).html

    assert '<div class="callout callout-warning" data-callout="warning">' in html
    assert '<div class="callout-title">Careful <strong>now</strong></div>' in html
    assert '<details class="callout callout-tip" data-callout="tip">' in html
    assert '<summary class="callout-title">Folded</summary>' in html
    assert '<details class="callout callout-faq" data-callout="faq" open="open">' in html
    assert '<div class="callout-title">Note</div>' in html
    assert "<blockquote>\n<p>plain quote</p>" in html
    assert "[!" not in html


def test_tags_are_found_only_where_obsidian_finds_them():
    parsed = parse(
        "#one text #two/sub and #my_tag-x, (#paren) #123 a#b http://x/#frag `#code`\n\n"
        "```\n#fenced\n```\n\n[#inlink](https://e.com)\n\n# Heading #htag\n"
    )

    assert parsed.tags == ["one", "two/sub", "my_tag-x", "paren", "htag"]
    assert '<a class="vault-tag" href="/vault?tag=two/sub" data-tag="two/sub"' in parsed.html


def test_comments_are_stripped_but_code_is_kept():
    parsed = parse("visible %%hidden%% tail `%%code%%`\n\n%%\nmulti\nline\n%%\n\n```\n%%fenced%%\n```\n")

    assert "hidden" not in parsed.html and "multi" not in parsed.html
    assert "<code>%%code%%</code>" in parsed.html
    assert "%%fenced%%" in parsed.html
    assert "hidden" not in parsed.body


def test_gfm_tables_tasks_strikethrough_and_math():
    html = parse(
        "| a | b |\n|:--|--:|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n\n~~gone~~ $a_b$\n\n$$\nx^2\n$$\n"
    ).html

    assert "<table>" in html and 'style="text-align:right"' in html
    assert html.count('type="checkbox"') == 2 and 'checked="checked"' in html
    assert "<s>gone</s>" in html
    assert '<span class="math math-inline">a_b</span>' in html  # подчёркивание не стало <em>
    assert '<div class="math math-block">' in html


def test_headings_get_unique_slugs():
    parsed = parse("# Intro\n\n## Part One\n\n## Part One\n\n### Что-то ещё!\n")

    assert [(h.level, h.text, h.slug) for h in parsed.headings] == [
        (1, "Intro", "intro"),
        (2, "Part One", "part-one"),
        (2, "Part One", "part-one-1"),
        (3, "Что-то ещё!", "что-то-ещё"),
    ]
    assert '<h2 data-heading="part-one-1">' in parsed.html


def test_html_is_sanitized():
    html = parse(
        "<script>alert(1)</script>\n\n<iframe src='https://evil.example'></iframe>\n\n"
        '<b onclick="steal()">bold</b> <a href="javascript:alert(1)">x</a> '
        '<img src="x" onerror="steal()"> <input type="text" value="q"> '
        '<div style="position:fixed" id="app">d</div> <form action="/x"><button>go</button></form>\n\n'
        "[click](javascript:alert(1)) [data](data:text/html,x)\n"
    ).html

    # Отклонённые markdown-ссылки остаются видимым текстом — это безопасно;
    # важно, что опасная схема не попала ни в один атрибут.
    for forbidden in ("<script", "<iframe", "onclick", "onerror", 'href="javascript', 'href="data:', "<form",
                      "<button", "position:fixed", 'id="app"', 'type="text"', "steal()"):
        assert forbidden not in html, forbidden
    assert "<b>bold</b>" in html


def test_link_text_cannot_inject_markup():
    html = parse('[[Note|<img src=x onerror=alert(1)>]] [[<script>x</script>]]').html

    assert "<img" not in html and "<script" not in html
    assert "&lt;img" in html


def test_extract_section():
    text = "# A\n\none\n\n## B\n\ntwo\n\n### C\n\nthree\n\n## D\n\nfour\n"

    assert extract_section(text, "b") == "## B\n\ntwo\n\n### C\n\nthree\n\n"
    assert extract_section(text, "D") == "## D\n\nfour\n"
    assert extract_section(text, "missing") is None
