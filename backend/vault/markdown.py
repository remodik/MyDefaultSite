"""Единый серверный парсер Obsidian-разметки.

Один вызов :func:`parse` возвращает html, frontmatter, исходящие ссылки, теги
и заголовки. Этим же результатом пользуются предпросмотр, индекс и граф,
поэтому они не могут разойтись: ссылка, которую видно в заметке, — это ровно
та ссылка, что попала в индекс.

HTML проходит через nh3: содержимое заметки считается недоверенным (его
пишут и агенты), так что <script>, <iframe>, обработчики on* и javascript:
в выдачу не попадают, даже если написаны в заметке сырым HTML.
"""

from __future__ import annotations

import html
import posixpath
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol
from urllib.parse import quote, unquote

import nh3
import yaml
from markdown_it import MarkdownIt
from markdown_it.rules_core import StateCore
from markdown_it.rules_inline import StateInline
from markdown_it.token import Token
from mdit_py_plugins.dollarmath import dollarmath_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.front_matter import front_matter_plugin
from mdit_py_plugins.tasklists import tasklists_plugin

# Вложенность ![[embed]]: заметка A встраивает B, B встраивает C. Глубже —
# обычная ссылка. Вместе со стеком путей это защищает и от циклов (A → B → A).
MAX_EMBED_DEPTH = 3

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"})

_WIKILINK_RE = re.compile(r"\[\[([^\[\]\n]+?)\]\]")
_CALLOUT_RE = re.compile(r"^\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*(.*)$")
# Тег: не часть слова/URL, содержит хотя бы один не-цифровой символ
# (#123 — не тег, как и в Obsidian).
_TAG_RE = re.compile(r"(?<![\w#/&])#(?=[\w/-]*[^\W\d])([\w/-]+)")
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
_COMMENT_RE = re.compile(r"(`+[^`\n]*`+)|%%.*?%%", re.DOTALL)
_ATX_RE = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$")
_SIZE_RE = re.compile(r"^(\d{1,4})(?:x(\d{1,4}))?$")


@dataclass(frozen=True)
class Link:
    """Исходящая ссылка заметки: ``[[target#heading|display]]`` или ``[t](x.md)``."""

    target: str
    heading: str | None = None
    display: str | None = None
    embed: bool = False


@dataclass(frozen=True)
class Heading:
    level: int
    text: str
    slug: str


@dataclass
class ParsedNote:
    html: str = ""
    frontmatter: dict[str, Any] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    headings: list[Heading] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    title: str | None = None
    # Текст без frontmatter и %%комментариев%% — то, что уходит в FTS.
    body: str = ""


class Resolver(Protocol):
    """Связь парсера с хранилищем. Без него все ссылки считаются неразрешёнными."""

    def resolve(self, target: str, source: str | None) -> str | None:
        """Путь заметки или вложения внутри vault, либо None."""

    def read(self, path: str) -> str | None:
        """Текст заметки для ![[embed]], либо None."""


# ── подготовка текста ────────────────────────────────────────────────────────


def _strip_comments(text: str) -> str:
    """Убирает %%комментарии%%, не трогая блоки кода и `инлайн-код`."""
    if "%%" not in text:
        return text
    out: list[str] = []
    chunk: list[str] = []
    fence: str | None = None

    def flush() -> None:
        if chunk:
            joined = "".join(chunk)
            out.append(_COMMENT_RE.sub(lambda m: m.group(1) or "", joined))
            chunk.clear()

    for line in text.splitlines(keepends=True):
        match = _FENCE_RE.match(line)
        if fence is None:
            if match:
                flush()
                fence = match.group(1)
                out.append(line)
            else:
                chunk.append(line)
        else:
            out.append(line)
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence):
                fence = None
    flush()
    return "".join(out)


def extract_section(text: str, heading: str) -> str | None:
    """Раздел заметки под заголовком ``heading`` — для ``![[note#heading]]``."""
    wanted = heading.strip().casefold()
    lines = text.splitlines(keepends=True)
    fence: str | None = None
    start: int | None = None
    level = 0
    for i, line in enumerate(lines):
        match = _FENCE_RE.match(line)
        if match:
            if fence is None:
                fence = match.group(1)
            elif match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence):
                fence = None
            continue
        if fence is not None:
            continue
        atx = _ATX_RE.match(line.rstrip("\n"))
        if not atx:
            continue
        if start is None:
            if atx.group(2).strip().casefold() == wanted:
                start, level = i, len(atx.group(1))
        elif len(atx.group(1)) <= level:
            return "".join(lines[start:i])
    return "".join(lines[start:]) if start is not None else None


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\- ]", "", text.strip().lower()).strip().replace(" ", "-")
    return re.sub(r"-{2,}", "-", slug) or "section"


def _jsonable(value: Any) -> Any:
    """YAML отдаёт date/datetime — приводим к строкам, чтобы frontmatter ложился в JSON."""
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _as_list(value: Any, *, split_spaces: bool) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[,\s]+" if split_spaces else r",", value)
    elif isinstance(value, (list, tuple)):
        parts = [str(v) for v in value if v is not None]
    else:
        parts = [str(value)]
    return [p.strip() for p in parts if p and p.strip()]


def normalize_tag(tag: str) -> str:
    return tag.strip().lstrip("#").strip("/").lower()


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


# ── правила markdown-it ──────────────────────────────────────────────────────


def _parse_wikilink(inner: str, embed: bool) -> Link:
    target_part, sep, display = re.split(r"(\\?\|)", inner, maxsplit=1) if "|" in inner else (inner, "", "")
    target, _, heading = target_part.partition("#")
    heading = heading.strip()
    if heading.startswith("^"):  # ссылка на блок — ведём на саму заметку
        heading = ""
    return Link(
        target=target.strip(),
        heading=heading or None,
        display=(display.strip() or None) if sep else None,
        embed=embed,
    )


def _wikilink_rule(state: StateInline, silent: bool) -> bool:
    src, pos = state.src, state.pos
    if src.startswith("![[", pos):
        embed, start = True, pos + 1
    elif src.startswith("[[", pos):
        embed, start = False, pos
    else:
        return False
    match = _WIKILINK_RE.match(src, start)
    if not match:
        return False
    link = _parse_wikilink(match.group(1), embed)
    if not link.target and not link.heading:
        return False
    if not silent:
        token = state.push("wikilink", "", 0)
        token.meta = {"link": link}
        if link.target:  # [[#heading]] ведёт внутрь той же заметки — это не связь
            state.env["links"].append(link)
    state.pos = match.end()
    return True


def _callouts_rule(state: StateCore) -> None:
    """``> [!note] Заголовок`` → блок-выноска; ``[!tip]-`` / ``[!tip]+`` — сворачиваемая."""
    tokens = state.tokens
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if (
            tok.type != "blockquote_open"
            or i + 2 >= len(tokens)
            or tokens[i + 1].type != "paragraph_open"
            or tokens[i + 2].type != "inline"
        ):
            i += 1
            continue
        inline = tokens[i + 2]
        first, _, rest = inline.content.partition("\n")
        match = _CALLOUT_RE.match(first)
        if not match:
            i += 1
            continue

        kind = match.group(1).lower()
        fold = match.group(2)
        title = match.group(3).strip() or kind.capitalize()
        depth = 0
        close_idx = i
        for j in range(i, len(tokens)):
            if tokens[j].type == "blockquote_open":
                depth += 1
            elif tokens[j].type == "blockquote_close":
                depth -= 1
                if depth == 0:
                    close_idx = j
                    break

        tag = "details" if fold else "div"
        tok.type, tok.tag = "callout_open", tag
        tok.attrSet("class", f"callout callout-{kind}")
        tok.attrSet("data-callout", kind)
        if fold == "+":
            tok.attrSet("open", "open")
        close = tokens[close_idx]
        close.type, close.tag = "callout_close", tag

        level = tok.level + 1
        title_tag = "summary" if fold else "div"
        title_open = Token("callout_title_open", title_tag, 1, level=level, block=True)
        title_open.attrSet("class", "callout-title")
        title_inline = Token(
            "inline", "", 0, level=level + 1, content=title, children=[], map=inline.map, block=True
        )
        title_close = Token("callout_title_close", title_tag, -1, level=level, block=True)
        content_open = Token("callout_content_open", "div", 1, level=level, block=True)
        content_open.attrSet("class", "callout-content")
        content_close = Token("callout_content_close", "div", -1, level=level, block=True)

        tokens.insert(close_idx, content_close)
        if rest.strip():
            inline.content = rest
        else:
            del tokens[i + 1 : i + 4]  # абзац состоял из одной строки-заголовка
        tokens[i + 1 : i + 1] = [title_open, title_inline, title_close, content_open]
        i += 1


def _inline_text(children: list[Token] | None) -> str:
    parts: list[str] = []
    for child in children or []:
        if child.type == "wikilink":
            link: Link = child.meta["link"]
            parts.append(link.display or link.target or link.heading or "")
        elif child.type in {"softbreak", "hardbreak"}:
            parts.append(" ")
        elif child.type == "image":
            parts.append(child.content)
        elif child.content and child.type != "html_inline":
            parts.append(child.content)
    return "".join(parts).strip()


def _split_tags(token: Token, env: dict[str, Any]) -> list[Token]:
    text = token.content
    out: list[Token] = []
    last = 0
    for match in _TAG_RE.finditer(text):
        tag = normalize_tag(match.group(1))
        if not tag:
            continue
        if match.start() > last:
            out.append(Token("text", "", 0, content=text[last : match.start()], level=token.level))
        tag_token = Token("vault_tag", "", 0, content=match.group(1), level=token.level)
        tag_token.meta = {"tag": tag}
        out.append(tag_token)
        env["tags"].append(tag)
        last = match.end()
    if not out:
        return [token]
    if last < len(text):
        out.append(Token("text", "", 0, content=text[last:], level=token.level))
    return out


def _post_inline_rule(state: StateCore) -> None:
    """После разбора инлайнов: #теги, заголовки, markdown-ссылки на заметки."""
    env = state.env
    tokens = state.tokens
    used_slugs: dict[str, int] = {}
    for idx, tok in enumerate(tokens):
        if tok.type != "inline" or tok.children is None:
            continue

        children: list[Token] = []
        link_depth = 0
        for child in tok.children:
            if child.type == "link_open":
                link_depth += 1
                href = str(child.attrGet("href") or "")
                path_part, _, fragment = href.partition("#")
                internal = (
                    path_part
                    and not _SCHEME_RE.match(href)
                    and not href.startswith(("/", "#", "?"))
                    and path_part.lower().endswith(".md")
                )
                if internal:
                    link = Link(target=unquote(path_part), heading=unquote(fragment) or None)
                    env["links"].append(link)
                    child.meta = {"link": link}
            elif child.type == "link_close":
                link_depth -= 1
            if child.type == "text" and link_depth == 0 and "#" in child.content:
                children.extend(_split_tags(child, env))
            else:
                children.append(child)
        tok.children = children

        prev = tokens[idx - 1] if idx else None
        if prev is not None and prev.type == "heading_open":
            text = _inline_text(tok.children)
            base = slugify(text)
            count = used_slugs.get(base, 0)
            used_slugs[base] = count + 1
            slug = base if count == 0 else f"{base}-{count}"
            prev.attrSet("data-heading", slug)
            env["headings"].append(Heading(level=int(prev.tag[1]), text=text, slug=slug))

        # Абзац из одного ![[embed]] — прячем <p>, иначе блочный embed окажется
        # внутри абзаца и HTML-парсер разорвёт его на пустые <p></p>.
        if (
            prev is not None
            and prev.type == "paragraph_open"
            and len(tok.children) == 1
            and tok.children[0].type == "wikilink"
            and tok.children[0].meta["link"].embed
            and idx + 1 < len(tokens)
        ):
            prev.hidden = True
            tokens[idx + 1].hidden = True


def _front_matter_rule(state: StateCore) -> None:
    for tok in state.tokens:
        if tok.type == "front_matter":
            try:
                data = yaml.safe_load(tok.content)
            except yaml.YAMLError:
                data = None
            if isinstance(data, dict):
                state.env["frontmatter"] = _jsonable(data)
            tok.hidden = True
            return


# ── рендеринг ────────────────────────────────────────────────────────────────


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def note_href(path: str, heading: str | None = None) -> str:
    href = "/vault?note=" + quote(path, safe="/")
    return f"{href}#{quote(slugify(heading))}" if heading else href


def _resolve(env: dict[str, Any], target: str) -> str | None:
    resolver: Resolver | None = env.get("resolver")
    if resolver is None or not target:
        return None
    return resolver.resolve(target, env.get("source"))


def _link_html(env: dict[str, Any], link: Link, label: str, extra_class: str = "") -> str:
    cls = ("vault-link " + extra_class).strip()
    if not link.target:  # [[#heading]]
        slug = slugify(link.heading or "")
        return f'<a class="{cls}" href="#{_esc(quote(slug))}" data-heading-target="{_esc(slug)}">{_esc(label)}</a>'
    path = _resolve(env, link.target)
    if path is None:
        return (
            f'<a class="{cls} is-unresolved" href="/vault?create={_esc(quote(link.target, safe="/"))}" '
            f'data-target="{_esc(link.target)}">{_esc(label)}</a>'
        )
    heading_attr = f' data-heading-target="{_esc(slugify(link.heading))}"' if link.heading else ""
    return (
        f'<a class="{cls}" href="{_esc(note_href(path, link.heading))}" '
        f'data-note="{_esc(path)}"{heading_attr}>{_esc(label)}</a>'
    )


def _default_label(link: Link) -> str:
    if link.display:
        return link.display
    if link.target and link.heading:
        return f"{link.target} > {link.heading}"
    return link.target or link.heading or ""


def _image_html(path: str, alt: str, size: str | None) -> str:
    attrs = f'class="vault-image" data-vault-src="{_esc(path)}" alt="{_esc(alt)}"'
    match = _SIZE_RE.match(size or "")
    if match:
        attrs += f' width="{match.group(1)}"'
        if match.group(2):
            attrs += f' height="{match.group(2)}"'
    # src проставляет фронтенд: картинка отдаётся только с заголовком Authorization.
    return f"<img {attrs}>"


def _render_embed(env: dict[str, Any], link: Link) -> str:
    ext = posixpath.splitext(link.target)[1].lstrip(".").lower()
    path = _resolve(env, link.target)
    if ext in IMAGE_EXTENSIONS:
        if path is None:
            return f'<span class="vault-embed is-unresolved">{_esc(link.target)}</span>'
        return _image_html(path, posixpath.basename(link.target), link.display)

    resolver: Resolver | None = env.get("resolver")
    stack: tuple[str, ...] = env.get("stack", ())
    if path is None or resolver is None or not path.lower().endswith(".md"):
        return _link_html(env, link, _default_label(link), "vault-embed-link")
    if env.get("depth", 0) >= MAX_EMBED_DEPTH or path in stack:
        return _link_html(env, link, _default_label(link), "vault-embed-link is-skipped")
    text = resolver.read(path)
    if text is None:
        return _link_html(env, link, _default_label(link), "vault-embed-link")
    if link.heading:
        text = extract_section(text, link.heading) or text
    inner = _render(text, resolver=resolver, source=path, depth=env.get("depth", 0) + 1, stack=(*stack, path))
    title = _link_html(env, link, _default_label(link))
    return (
        f'<div class="vault-embed" data-note="{_esc(path)}">'
        f'<div class="vault-embed-title">{title}</div>'
        f'<div class="vault-embed-body">{inner["html"]}</div></div>'
    )


def _render_wikilink(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    link: Link = tokens[idx].meta["link"]
    if link.embed:
        return _render_embed(env, link)
    return _link_html(env, link, _default_label(link))


def _render_tag(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    tag = tokens[idx].meta["tag"]
    return (
        f'<a class="vault-tag" href="/vault?tag={_esc(quote(tag, safe="/"))}" '
        f'data-tag="{_esc(tag)}">#{_esc(tokens[idx].content)}</a>'
    )


def _render_link_open(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    token = tokens[idx]
    link: Link | None = (token.meta or {}).get("link")
    if link is not None:
        path = _resolve(env, link.target)
        if path is None:
            token.attrSet("class", "vault-link is-unresolved")
            token.attrSet("data-target", link.target)
            token.attrSet("href", "/vault?create=" + quote(link.target, safe="/"))
        else:
            token.attrSet("class", "vault-link")
            token.attrSet("data-note", path)
            token.attrSet("href", note_href(path, link.heading))
    else:
        token.attrSet("class", "external-link")
    return self.renderToken(tokens, idx, options, env)


def _render_image(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    token = tokens[idx]
    src = str(token.attrGet("src") or "")
    alt = _inline_text(token.children) or token.content
    if src and not _SCHEME_RE.match(src) and not src.startswith(("/", "#")):
        path = _resolve(env, unquote(src))
        if path is None:
            return f'<span class="vault-embed is-unresolved">{_esc(alt or src)}</span>'
        return _image_html(path, alt, None)
    return f'<img class="vault-image" src="{_esc(src)}" alt="{_esc(alt)}">'


def _render_math_inline(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    return f'<span class="math math-inline">{_esc(tokens[idx].content)}</span>'


def _render_math_block(self: Any, tokens: list[Token], idx: int, options: Any, env: dict[str, Any]) -> str:
    return f'<div class="math math-block">{_esc(tokens[idx].content)}</div>\n'


def _build_markdown() -> MarkdownIt:
    md = (
        MarkdownIt("commonmark", {"html": True, "linkify": False, "typographer": False})
        .enable(["table", "strikethrough"])
        .use(front_matter_plugin)
        .use(tasklists_plugin)
        .use(footnote_plugin)
        .use(dollarmath_plugin, allow_space=False, double_inline=True)
    )
    md.inline.ruler.before("link", "wikilink", _wikilink_rule)
    md.core.ruler.before("inline", "vault_front_matter", _front_matter_rule)
    md.core.ruler.before("inline", "vault_callouts", _callouts_rule)
    md.core.ruler.after("inline", "vault_post_inline", _post_inline_rule)
    md.add_render_rule("wikilink", _render_wikilink)
    md.add_render_rule("vault_tag", _render_tag)
    md.add_render_rule("link_open", _render_link_open)
    md.add_render_rule("image", _render_image)
    md.add_render_rule("math_inline", _render_math_inline)
    md.add_render_rule("math_inline_double", _render_math_block)
    md.add_render_rule("math_block", _render_math_block)
    md.add_render_rule("front_matter", lambda *args, **kwargs: "")
    return md


_MD = _build_markdown()

_ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt",
    "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li",
    "mark", "ol", "p", "pre", "s", "section", "small", "span", "strong", "sub", "summary",
    "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}  # fmt: skip
_ALLOWED_ATTRIBUTES = {
    "*": {"class", "title"},
    "a": {"href"},
    "img": {"src", "alt", "width", "height"},
    "input": {"checked"},
    "details": {"open"},
    "ol": {"start"},
    "td": {"style", "colspan", "rowspan"},
    "th": {"style", "colspan", "rowspan"},
}


def sanitize(raw_html: str) -> str:
    return nh3.clean(
        raw_html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        generic_attribute_prefixes={"data-"},
        # <input> нужен только для флажков списков задач. Любой <input> из сырого
        # HTML заметки принудительно становится неактивным флажком — иначе в
        # предпросмотре оказалось бы поле ввода или кнопка.
        set_tag_attribute_values={"input": {"type": "checkbox", "disabled": "disabled"}},
        filter_style_properties={"text-align"},
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )


def _render(
    text: str,
    *,
    resolver: Resolver | None,
    source: str | None,
    depth: int,
    stack: tuple[str, ...],
) -> dict[str, Any]:
    env: dict[str, Any] = {
        "resolver": resolver,
        "source": source,
        "depth": depth,
        "stack": stack,
        "links": [],
        "tags": [],
        "headings": [],
        "frontmatter": {},
    }
    body = _strip_comments(text)
    env["html"] = _MD.render(body, env)
    env["body"] = body
    return env


def parse(text: str, *, resolver: Resolver | None = None, source: str | None = None) -> ParsedNote:
    """Разбирает заметку. ``source`` — её путь в vault (для относительных ссылок)."""
    env = _render(text, resolver=resolver, source=source, depth=0, stack=(source,) if source else ())
    frontmatter: dict[str, Any] = env["frontmatter"]

    fm_tags = _as_list(frontmatter.get("tags", frontmatter.get("tag")), split_spaces=True)
    tags = _dedupe([normalize_tag(t) for t in fm_tags] + env["tags"])
    aliases = _dedupe(_as_list(frontmatter.get("aliases", frontmatter.get("alias")), split_spaces=False))

    headings: list[Heading] = env["headings"]
    title = frontmatter.get("title")
    if not isinstance(title, str) or not title.strip():
        title = next((h.text for h in headings if h.level == 1 and h.text), None)

    links: list[Link] = []
    seen: set[Link] = set()
    for link in env["links"]:
        if link not in seen:
            seen.add(link)
            links.append(link)

    body = env["body"]
    if body.startswith("---"):
        end = re.search(r"\n(---|\.\.\.)[ \t]*(\n|$)", body[3:])
        if end and frontmatter:
            body = body[3 + end.end() :]

    return ParsedNote(
        html=sanitize(env["html"]),
        frontmatter=frontmatter,
        links=links,
        tags=tags,
        headings=headings,
        aliases=aliases,
        title=title.strip() if isinstance(title, str) else None,
        body=body,
    )
