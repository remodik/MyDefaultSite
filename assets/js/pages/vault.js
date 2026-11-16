import { drawGraph } from '../components/vault-graph.js';
import { vaultApi, VaultApiError } from '../components/vault-api.js';
import { renderPreview, scrollToHeading } from '../components/vault-preview.js';
import { createEditor } from '../components/vault-editor.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { showToast, escapeHtml, debounce } from '../utils.js';

const STYLE_ID = 'vault-styles';
const AUTOSAVE_MS = 1500;
const LS_LAST = 'vault_last_note';
const LS_MODE = 'vault_mode';
const LS_COLLAPSED = 'vault_collapsed_folders';

const state = {
    notes: [],
    tags: [],
    filter: { q: '', tag: '' },
    current: null,      // заметка, как её отдал сервер
    draft: null,        // текст в редакторе (может отличаться от сохранённого)
    dirty: false,
    saving: null,       // Promise идущего сохранения
    conflict: null,     // хэш серверной версии при конфликте правок
    mode: 'preview',
    view: 'note',
    editor: null,
    cleanupPreview: null,
    saveTimer: null,
    mounted: false,
    openSeq: 0,
};

let root = null;
let stream;
let graphStop;
let graphSeq = 0;
let refreshTimer;
let listSeq = 0;
const listeners = [];

// ── вспомогательное ─────────────────────────────────────────────────────────

function $(selector) {
    return root ? root.querySelector(selector) : null;
}

function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/assets/css/vault.css';
    document.head.appendChild(link);
}

function loadCollapsed() {
    try {
        return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]'));
    } catch {
        return new Set();
    }
}

function saveCollapsed(collapsed) {
    try {
        localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed]));
    } catch { /* приватный режим — не критично */ }
}

function stem(path) {
    return path.split('/').pop().replace(/\.md$/i, '');
}

function folderOf(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.slice(0, idx);
}

function noteHref(path) {
    return `/vault?note=${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

function setPane(pane) {
    if (root) root.dataset.pane = pane;
    root?.querySelectorAll('[data-pane-btn]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.paneBtn === pane);
    });
}

function setStatus(kind, text) {
    const el = $('#vault-status');
    if (!el) return;
    el.dataset.kind = kind;
    el.textContent = text;
}

function errorText(error) {
    return error instanceof VaultApiError ? error.message : 'Что-то пошло не так';
}

// ── разметка страницы ───────────────────────────────────────────────────────

export function render() {
    return `
        <div class="vault" id="vault" data-pane="list" data-view="note">
            <nav class="vault-panes" aria-label="Панели">
                <button type="button" class="active" data-pane-btn="list"><i class="fas fa-folder-tree"></i> Заметки</button>
                <button type="button" data-pane-btn="note"><i class="fas fa-file-lines"></i> Заметка</button>
                <button type="button" data-pane-btn="links"><i class="fas fa-diagram-project"></i> Связи</button>
            </nav>

            <aside class="vault-side vault-left" aria-label="Список заметок">
                <div class="vault-side-head">
                    <input type="search" id="vault-search" class="vault-input" placeholder="Поиск по заметкам…"
                           autocomplete="off" aria-label="Поиск по заметкам">
                    <button type="button" class="vault-icon-btn" id="vault-new" title="Новая заметка" aria-label="Новая заметка">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="vault-tools">
                    <select id="vault-tag-filter" class="vault-input" aria-label="Фильтр по тегу">
                        <option value="">Все теги</option>
                    </select>
                </div>
                <div class="vault-tree" id="vault-tree" role="tree"></div>
                <div class="vault-side-foot" id="vault-count"></div>
            </aside>

            <section class="vault-main">
                <header class="vault-bar">
                    <div class="vault-bar-title" id="vault-title">Vault</div>
                    <span class="vault-status" id="vault-status" role="status" aria-live="polite"></span>
                    <div class="vault-modes" role="tablist" aria-label="Режим">
                        <button type="button" data-mode="preview" role="tab">Просмотр</button>
                        <button type="button" data-mode="source" role="tab">Исходник</button>
                    </div>
                    <button type="button" class="vault-icon-btn" id="vault-rename" title="Переименовать или переместить"
                            aria-label="Переименовать или переместить"><i class="fas fa-pen"></i></button>
                    <button type="button" class="vault-icon-btn" id="vault-trash" title="В корзину"
                            aria-label="В корзину"><i class="fas fa-trash"></i></button>
                </header>
                <div class="vault-banner" id="vault-banner" hidden></div>
                <div class="vault-body" id="vault-body"></div>
            </section>

            <aside class="vault-side vault-right" aria-label="Связи заметки">
                <section class="vault-panel">
                    <h3 class="vault-panel-title">Граф</h3>
                    <div class="vault-tools vault-graph-controls">
                        <select class="vault-input" id="vault-graph-mode" aria-label="Область графа">
                            <option value="1">Локальный · глубина 1</option>
                            <option value="2">Локальный · глубина 2</option>
                            <option value="all">Все заметки</option>
                        </select>
                        <input class="vault-input" id="vault-graph-folder" placeholder="Папка" aria-label="Фильтр графа по папке" hidden>
                        <label id="vault-graph-options" hidden><input id="vault-graph-unresolved" type="checkbox"> Неразрешённые ссылки</label>
                    </div>
                    <div id="vault-graph" class="vault-graph"></div>
                </section>
                <section class="vault-panel">
                    <h3 class="vault-panel-title">Обратные ссылки</h3>
                    <ul class="vault-links" id="vault-backlinks"></ul>
                </section>
                <section class="vault-panel">
                    <h3 class="vault-panel-title">Исходящие ссылки</h3>
                    <ul class="vault-links" id="vault-outgoing"></ul>
                </section>
            </aside>
        </div>
    `;
}

// ── список заметок ──────────────────────────────────────────────────────────

function buildTree(notes) {
    const tree = { folders: new Map(), notes: [] };
    for (const note of notes) {
        const parts = note.path.split('/');
        let node = tree;
        for (const part of parts.slice(0, -1)) {
            if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), notes: [] });
            node = node.folders.get(part);
        }
        node.notes.push(note);
    }
    return tree;
}

function itemHtml(note, extra = '') {
    const active = state.current?.path === note.path ? ' active' : '';
    return `
        <a class="vault-item${active}" href="${escapeHtml(noteHref(note.path))}" data-note="${escapeHtml(note.path)}"
           role="treeitem" title="${escapeHtml(note.path)}">
            <span class="vault-item-name">${escapeHtml(stem(note.path))}</span>
            ${extra}
        </a>`;
}

function folderHtml(node, prefix, collapsed) {
    const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b));
    const notes = [...node.notes].sort((a, b) => stem(a.path).localeCompare(stem(b.path)));
    let html = '';
    for (const [name, child] of folders) {
        const path = prefix ? `${prefix}/${name}` : name;
        html += `
            <details class="vault-folder" data-folder="${escapeHtml(path)}" ${collapsed.has(path) ? '' : 'open'}>
                <summary><i class="fas fa-chevron-right vault-chevron"></i>${escapeHtml(name)}</summary>
                <div class="vault-folder-body">${folderHtml(child, path, collapsed)}</div>
            </details>`;
    }
    for (const note of notes) html += itemHtml(note);
    return html;
}

function renderList() {
    const tree = $('#vault-tree');
    const count = $('#vault-count');
    if (!tree) return;
    const filtered = Boolean(state.filter.q || state.filter.tag);

    if (!state.notes.length) {
        tree.innerHTML = `<p class="vault-muted vault-pad">${filtered ? 'Ничего не найдено' : 'Заметок пока нет — создайте первую.'}</p>`;
    } else if (state.filter.q) {
        // Результаты поиска — плоским списком в порядке релевантности.
        tree.innerHTML = state.notes.map((note) => itemHtml(note, `
            <span class="vault-item-path">${escapeHtml(note.folder || '/')}</span>
            ${note.snippet_html ? `<span class="vault-item-snippet">${note.snippet_html}</span>` : ''}
        `)).join('');
    } else {
        tree.innerHTML = folderHtml(buildTree(state.notes), '', loadCollapsed());
    }
    if (count) count.textContent = `${state.notes.length} ${filtered ? 'найдено' : 'заметок'}`;
}

function renderTagFilter() {
    const select = $('#vault-tag-filter');
    if (!select) return;
    const options = state.tags.map(
        (t) => `<option value="${escapeHtml(t.tag)}">#${escapeHtml(t.tag)} (${t.count})</option>`,
    );
    select.innerHTML = `<option value="">Все теги</option>${options.join('')}`;
    select.value = state.filter.tag;
    if (select.value !== state.filter.tag) {
        // Тег из ссылки, которого уже нет в списке — показываем как выбранный.
        select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(state.filter.tag)}">#${escapeHtml(state.filter.tag)}</option>`);
        select.value = state.filter.tag;
    }
}

async function loadList() {
    const seq = ++listSeq;
    try {
        const [notes, tags] = await Promise.all([
            vaultApi.listNotes({ q: state.filter.q, tag: state.filter.tag }),
            vaultApi.listTags(),
        ]);
        if (!state.mounted || seq !== listSeq) return;
        state.notes = notes;
        state.tags = tags;
        renderTagFilter();
        renderList();
    } catch (error) {
        const tree = seq === listSeq && $('#vault-tree');
        if (tree) tree.innerHTML = `<p class="vault-muted vault-pad">${escapeHtml(errorText(error))}</p>`;
    }
}

// ── заметка ─────────────────────────────────────────────────────────────────

function disposeBody() {
    if (state.cleanupPreview) {
        state.cleanupPreview();
        state.cleanupPreview = null;
    }
    if (state.editor) {
        state.editor.destroy();
        state.editor = null;
    }
}

function renderEmpty(message) {
    disposeBody();
    const body = $('#vault-body');
    if (body) {
        body.innerHTML = `
            <div class="vault-empty">
                <i class="fas fa-book-open"></i>
                <p>${escapeHtml(message)}</p>
            </div>`;
    }
}

function renderOutgoing() {
    const list = $('#vault-outgoing');
    if (!list) return;
    const links = state.current?.links || [];
    const seen = new Set();
    const items = [];
    for (const link of links) {
        const key = link.path || `?${link.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(link.path
            ? `<li><a class="vault-link" href="${escapeHtml(noteHref(link.path))}" data-note="${escapeHtml(link.path)}">${escapeHtml(link.title || stem(link.path))}</a></li>`
            : `<li><a class="vault-link is-unresolved" href="#" data-target="${escapeHtml(link.target)}">${escapeHtml(link.target)}</a></li>`);
    }
    list.innerHTML = items.length ? items.join('') : '<li class="vault-muted">Нет ссылок</li>';
}

async function refreshLinks() {
    const host = $('#vault-graph');
    if (!host) return;
    const seq = ++graphSeq;
    const path = state.current?.path;
    const mode = $('#vault-graph-mode').value;
    const all = mode === 'all';
    $('#vault-graph-folder').hidden = !all;
    $('#vault-graph-options').hidden = !all;
    const backlinks = $('#vault-backlinks');
    void (path ? vaultApi.backlinks(path) : Promise.resolve([])).then(rows => {
        if (seq !== graphSeq) return;
        backlinks.innerHTML = [...new Map(rows.map(row => [row.path, row])).values()].map(row =>
            `<li><a class="vault-link" href="${escapeHtml(noteHref(row.path))}" data-note="${escapeHtml(row.path)}">${escapeHtml(row.title)}</a></li>`
        ).join('') || '<li class="vault-muted">Нет ссылок</li>';
    }).catch(error => { if (seq === graphSeq) backlinks.textContent = errorText(error); });
    try {
        const graph = all ? await vaultApi.graph({
            tag: state.filter.tag, folder: $('#vault-graph-folder').value.trim(),
            unresolved: $('#vault-graph-unresolved').checked,
        }) : path ? await vaultApi.localGraph(path, mode) : null;
        if (seq !== graphSeq) return;
        graphStop?.();
        if (!graph?.nodes.length) {
            host.textContent = path || all ? 'Нет заметок для графа' : 'Выберите заметку';
            return;
        }
        const staging = document.createElement('div');
        const stop = await drawGraph(staging, graph, path, openNote);
        if (seq !== graphSeq) { stop(); return; }
        graphStop = stop;
        host.replaceChildren(...staging.childNodes);
    } catch (error) {
        if (seq === graphSeq) host.textContent = errorText(error);
    }
}

async function watchVault(signal) {
    while (!signal.aborted) {
        try {
            await vaultApi.events(signal, () => {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(async () => {
                    if (signal.aborted) return;
                    void loadList();
                    const old = state.current;
                    if (old && !state.dirty && !state.saving) {
                        const fresh = await vaultApi.readNote(old.path).catch(error => {
                            if (error.status === 404 && old === state.current && !state.dirty && !signal.aborted) {
                                state.current = null;
                                renderBar();
                                renderEmpty('Заметка была перемещена или удалена.');
                                renderOutgoing();
                            }
                            return null;
                        });
                        if (fresh && !signal.aborted && old === state.current && !state.dirty && !state.saving) {
                            state.current = fresh;
                            renderOutgoing();
                            if (state.mode === 'preview' || fresh.hash !== old.hash) {
                                state.draft = null;
                                void renderBody();
                            }
                        }
                    }
                    if (!signal.aborted) void refreshLinks();
                }, 200);
            });
        } catch (error) {
            if (error.status === 401 || error.status === 403) return;
        }
        if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 2500));
    }
}

function renderBar() {
    const note = state.current;
    const title = $('#vault-title');
    if (title) {
        title.innerHTML = note
            ? `<span class="vault-bar-folder">${escapeHtml(note.folder ? `${note.folder}/` : '')}</span>${escapeHtml(stem(note.path))}`
            : 'Vault';
    }
    root?.querySelectorAll('[data-mode]').forEach((btn) => {
        const active = btn.dataset.mode === state.mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.disabled = !note;
    });
    for (const id of ['#vault-rename', '#vault-trash']) {
        const btn = $(id);
        if (btn) btn.disabled = !note;
    }
    root?.querySelectorAll('.vault-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.note === note?.path);
    });
}

function hideBanner() {
    const banner = $('#vault-banner');
    if (banner) {
        banner.hidden = true;
        banner.innerHTML = '';
    }
    state.conflict = null;
}

function showConflict(currentHash) {
    state.conflict = currentHash || null;
    const banner = $('#vault-banner');
    if (!banner) return;
    banner.hidden = false;
    banner.innerHTML = `
        <span><i class="fas fa-triangle-exclamation"></i> Заметка изменилась в другом месте, пока вы её правили.</span>
        <span class="vault-banner-actions">
            <button type="button" class="vault-btn" data-conflict="reload">Загрузить новую версию</button>
            <button type="button" class="vault-btn vault-btn-danger" data-conflict="overwrite">Сохранить мою</button>
        </span>`;
    setStatus('error', 'Конфликт правок');
}

async function renderBody() {
    const body = $('#vault-body');
    const note = state.current;
    if (!body || !note) return;
    disposeBody();

    if (state.mode === 'source') {
        body.innerHTML = '<div class="vault-editor" id="vault-editor"><p class="vault-muted vault-pad">Загрузка редактора…</p></div>';
        const seq = state.openSeq;
        const editor = await createEditor($('#vault-editor'), {
            doc: state.draft ?? note.content,
            onChange: (text) => {
                state.draft = text;
                state.dirty = text !== state.current?.content;
                if (state.dirty) {
                    setStatus('dirty', 'Не сохранено');
                    scheduleSave();
                }
            },
        });
        if (seq !== state.openSeq || !state.mounted || state.mode !== 'source') {
            editor.destroy();  // пока редактор грузился, открыли другую заметку
            return;
        }
        state.editor = editor;
        return;
    }

    body.innerHTML = '<article class="vault-preview" id="vault-preview"></article>';
    state.cleanupPreview = renderPreview($('#vault-preview'), note.html || '');
}

async function openNote(path, { push = true, heading = null } = {}) {
    await flushSave();
    if (state.dirty) return;
    const seq = ++state.openSeq;
    let note;
    try {
        note = await vaultApi.readNote(path);
    } catch (error) {
        if (seq !== state.openSeq) return;
        showToast(error.status === 404 ? `Заметка не найдена: ${path}` : errorText(error), 'error');
        return;
    }
    if (seq !== state.openSeq || !state.mounted) return;

    state.current = note;
    state.draft = null;
    state.dirty = false;
    hideBanner();
    setStatus('saved', '');
    try { localStorage.setItem(LS_LAST, note.path); } catch { /* не критично */ }
    if (push) {
        const url = noteHref(note.path) + (heading ? `#${encodeURIComponent(heading)}` : '');
        history.pushState({ path: url }, '', url);
    }
    renderBar();
    renderOutgoing();
    void refreshLinks();
    await renderBody();
    setPane('note');
    if (heading && state.mode === 'preview') {
        requestAnimationFrame(() => scrollToHeading($('#vault-preview'), heading));
    } else {
        $('#vault-body')?.scrollTo?.(0, 0);
    }
}

async function reloadCurrent() {
    if (!state.current) return;
    const path = state.current.path;
    state.dirty = false;
    state.draft = null;
    await openNote(path, { push: false });
}

// ── сохранение ──────────────────────────────────────────────────────────────

function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => { flushSave(); }, AUTOSAVE_MS);
}

async function flushSave() {
    clearTimeout(state.saveTimer);
    if (state.saving) await state.saving.catch(() => {});
    if (!state.current || !state.dirty || state.conflict) return;

    const note = state.current;
    const text = state.draft ?? note.content;
    setStatus('saving', 'Сохранение…');
    state.saving = vaultApi.saveNote(note.path, text, note.hash);
    try {
        const result = await state.saving;
        // Сохранялась именно эта заметка? За время запроса могли открыть другую.
        if (state.current === note) {
            note.hash = result.hash;
            note.content = text;
            state.dirty = (state.draft ?? text) !== text;
            setStatus(state.dirty ? 'dirty' : 'saved', state.dirty ? 'Не сохранено' : 'Сохранено');
            if (state.dirty) scheduleSave();
        }
    } catch (error) {
        if (state.current !== note) return;
        if (error.status === 409) {
            showConflict(error.data?.current_hash);
        } else {
            setStatus('error', errorText(error));
        }
    } finally {
        state.saving = null;
    }
}

async function setMode(mode) {
    if (!state.current || mode === state.mode) return;
    if (mode === 'preview') {
        // Предпросмотр рисует сервер: сохраняем правку и перечитываем HTML.
        await flushSave();
        if (state.dirty) return;
        state.mode = mode;
        try { localStorage.setItem(LS_MODE, mode); } catch { /* не критично */ }
        await reloadCurrent();
        return;
    }
    state.mode = mode;
    try { localStorage.setItem(LS_MODE, mode); } catch { /* не критично */ }
    renderBar();
    await renderBody();
    state.editor?.focus();
}

// ── действия ────────────────────────────────────────────────────────────────

function promptPath({ title, label, value, confirmText }, onSubmit) {
    showModal({
        title,
        size: 'sm',
        content: `
            <label class="vault-field">
                <span>${escapeHtml(label)}</span>
                <input type="text" class="vault-input" id="vault-prompt-input" value="${escapeHtml(value)}"
                       autocomplete="off" spellcheck="false">
            </label>
            <p class="vault-muted" id="vault-prompt-error" role="alert"></p>`,
        footer: `
            <button class="v1-btn" id="vault-prompt-cancel">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="vault-prompt-ok">${escapeHtml(confirmText)}</button>`,
    });
    const input = document.getElementById('vault-prompt-input');
    const errorEl = document.getElementById('vault-prompt-error');
    const submit = async () => {
        const text = input.value.trim();
        if (!text) return;
        try {
            await onSubmit(text);
            closeModal();
        } catch (error) {
            errorEl.textContent = errorText(error);
        }
    };
    document.getElementById('vault-prompt-ok')?.addEventListener('click', submit);
    document.getElementById('vault-prompt-cancel')?.addEventListener('click', closeModal);
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
    });
    setTimeout(() => {
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
    }, 0);
}

async function createNote(path) {
    const result = await vaultApi.createNote(path, `# ${stem(path.replace(/\.md$/i, ''))}\n\n`);
    await loadList();
    state.mode = 'source';
    await openNote(result.path);
    state.editor?.focus();
}

function newNoteDialog(suggested = '') {
    const folder = state.current ? folderOf(state.current.path) : '';
    promptPath({
        title: 'Новая заметка',
        label: 'Путь (папки через /)',
        value: suggested || (folder ? `${folder}/` : ''),
        confirmText: 'Создать',
    }, createNote);
}

function renameDialog() {
    const note = state.current;
    if (!note) return;
    promptPath({
        title: 'Переименовать или переместить',
        label: 'Новый путь',
        value: note.path.replace(/\.md$/i, ''),
        confirmText: 'Переместить',
    }, async (newPath) => {
        await flushSave();
        const result = await vaultApi.moveNote(note.path, newPath);
        await loadList();
        await openNote(result.new_path);
    });
}

function trashCurrent() {
    const note = state.current;
    if (!note) return;
    confirmModal(`Перенести «${escapeHtml(stem(note.path))}» в корзину (.trash)?`, async () => {
        try {
            state.dirty = false;
            await vaultApi.trashNote(note.path);
            state.current = null;
            try { localStorage.removeItem(LS_LAST); } catch { /* не критично */ }
            history.replaceState({ path: '/vault' }, '', '/vault');
            renderBar();
            renderOutgoing();
            renderEmpty('Заметка перенесена в корзину.');
            setPane('list');
            await loadList();
        } catch (error) {
            showToast(errorText(error), 'error');
        }
    });
}

function setTagFilter(tag) {
    state.filter.tag = tag || '';
    renderTagFilter();
    loadList();
    setPane('list');
}

function onRootClick(event) {
    const paneBtn = event.target.closest('[data-pane-btn]');
    if (paneBtn) {
        setPane(paneBtn.dataset.paneBtn);
        return;
    }
    const modeBtn = event.target.closest('[data-mode]');
    if (modeBtn) {
        setMode(modeBtn.dataset.mode);
        return;
    }
    const conflictBtn = event.target.closest('[data-conflict]');
    if (conflictBtn) {
        if (conflictBtn.dataset.conflict === 'reload') {
            reloadCurrent();
        } else if (state.current) {
            state.current.hash = state.conflict;
            hideBanner();
            state.dirty = true;
            flushSave();
        }
        return;
    }

    const link = event.target.closest('a');
    if (!link || !root.contains(link)) return;
    // Клики по ссылкам обрабатываем сами: иначе глобальный роутер перерисует
    // всю страницу и несохранённый текст в редакторе пропадёт.
    if (link.dataset.note) {
        event.preventDefault();
        event.stopPropagation();
        openNote(link.dataset.note, { heading: link.dataset.headingTarget || null });
    } else if (link.dataset.tag) {
        event.preventDefault();
        event.stopPropagation();
        setTagFilter(link.dataset.tag);
    } else if (link.dataset.target) {
        event.preventDefault();
        event.stopPropagation();
        const folder = state.current ? folderOf(state.current.path) : '';
        newNoteDialog(folder && !link.dataset.target.includes('/') ? `${folder}/${link.dataset.target}` : link.dataset.target);
    } else if (link.dataset.headingTarget) {
        event.preventDefault();
        event.stopPropagation();
        scrollToHeading($('#vault-preview'), link.dataset.headingTarget);
    }
}

// ── жизненный цикл страницы ─────────────────────────────────────────────────

export async function mount() {
    ensureStyles();
    root = document.getElementById('vault');
    if (!root) return;
    state.mounted = true;
    state.notes = [];
    state.current = null;
    state.draft = null;
    state.dirty = false;
    state.conflict = null;
    state.view = 'note';
    try { state.mode = localStorage.getItem(LS_MODE) === 'source' ? 'source' : 'preview'; } catch { state.mode = 'preview'; }

    // Vault занимает всю высоту рабочей области: прокручиваются панели, а не страница.
    document.getElementById('ide-page')?.classList.add('vault-host');

    const params = new URLSearchParams(window.location.search);
    state.filter = { q: '', tag: params.get('tag') || '' };

    on(root, 'click', onRootClick);
    on($('#vault-new'), 'click', () => newNoteDialog());
    on($('#vault-rename'), 'click', renameDialog);
    on($('#vault-trash'), 'click', trashCurrent);
    on($('#vault-tag-filter'), 'change', (event) => {
        setTagFilter(event.target.value);
        void refreshLinks();
    });
    for (const id of ['#vault-graph-mode', '#vault-graph-folder', '#vault-graph-unresolved']) {
        on($(id), 'change', refreshLinks);
    }
    stream = new AbortController();
    void watchVault(stream.signal);
    on($('#vault-search'), 'input', debounce((event) => {
        state.filter.q = event.target.value.trim();
        loadList();
    }, 250));
    on($('#vault-tree'), 'toggle', (event) => {
        const folder = event.target.closest?.('.vault-folder');
        if (!folder) return;
        const collapsed = loadCollapsed();
        if (folder.open) collapsed.delete(folder.dataset.folder);
        else collapsed.add(folder.dataset.folder);
        saveCollapsed(collapsed);
    }, true);
    // Уход со страницы или сворачивание вкладки — последний шанс сохранить правку.
    on(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSave();
    });
    on(window, 'pagehide', () => { flushSave(); });

    renderBar();
    renderOutgoing();
    void refreshLinks();
    renderEmpty('Выберите заметку слева или создайте новую.');
    await loadList();
    if (!state.mounted) return;

    let target = params.get('note');
    if (!target && !state.filter.tag) {
        try { target = localStorage.getItem(LS_LAST); } catch { target = null; }
        if (target && !state.notes.some((note) => note.path === target)) target = null;
    }
    if (target) {
        const heading = decodeURIComponent(window.location.hash.replace(/^#/, '')) || null;
        await openNote(target, { push: false, heading });
    } else if (params.get('create')) {
        newNoteDialog(params.get('create'));
    }
}

export function unmount() {
    stream?.abort();
    clearTimeout(refreshTimer);
    graphSeq++;
    listSeq++;
    graphStop?.();
    graphStop = null;
    flushSave();
    state.mounted = false;
    state.openSeq += 1;
    clearTimeout(state.saveTimer);
    while (listeners.length) listeners.pop()();
    disposeBody();
    document.getElementById('ide-page')?.classList.remove('vault-host');
    root = null;
}
