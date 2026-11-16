import { drawGraph } from './vault-graph.js';
import { vaultApi } from './vault-api.js';

export function graphDialogMarkup() {
    return `
        <dialog class="vault-graph-dialog" id="vault-graph-dialog" aria-labelledby="vault-graph-heading">
            <header class="vault-graph-header">
                <h2 id="vault-graph-heading">Граф связей</h2>
                <button class="vault-icon-btn" data-close-graph aria-label="Закрыть граф" autofocus>×</button>
            </header>
            <div class="vault-graph-toolbar">
                <label>Область <select class="vault-input" data-graph-scope>
                    <option value="all">Все заметки</option>
                    <option value="1">Соседи заметки</option>
                    <option value="2">Два уровня связей</option>
                </select></label>
                <span class="vault-graph-count" data-graph-count role="status"></span>
                <div class="vault-zoom" aria-label="Масштаб графа">
                    <button class="vault-icon-btn" type="button" data-zoom="out" aria-label="Уменьшить">−</button>
                    <button class="vault-icon-btn" type="button" data-zoom="reset" aria-label="Сбросить масштаб">1:1</button>
                    <button class="vault-icon-btn" type="button" data-zoom="in" aria-label="Увеличить">+</button>
                </div>
            </div>
            <div class="vault-graph-layout">
                <div class="vault-graph vault-graph-canvas"></div>
                <aside class="vault-graph-inspector" aria-label="Связи выбранной заметки"></aside>
            </div>
        </dialog>`;
}

export function openGraphDialog(dialog, options) {
    const scope = dialog.querySelector('[data-graph-scope]');
    const count = dialog.querySelector('[data-graph-count]');
    const canvas = dialog.querySelector('.vault-graph-canvas');
    const inspector = dialog.querySelector('.vault-graph-inspector');
    const controls = dialog.querySelector('.vault-zoom');
    let dispose;
    let revision = 0;

    function append(parent, tag, text, action) {
        const el = document.createElement(tag);
        el.textContent = text;
        if (action) {
            el.type = 'button';
            el.className = 'vault-btn';
            el.onclick = action;
        }
        parent.append(el);
        return el;
    }

    const open = id => { dialog.close(); options.open(id); };

    async function load() {
        const current = ++revision;
        dispose?.();
        count.textContent = '';
        canvas.textContent = 'Загрузка графа…';
        inspector.textContent = 'Выберите заметку на графе';
        const staging = document.createElement('div');
        // Selection can take place while the SVG is still loading its zoom library.
        const details = document.createElement('div');
        function inspect(node, related, select) {
            details.replaceChildren();
            append(details, 'h3', node.title);
            if (!node.unresolved) {
                append(details, 'p', node.id);
                append(details, 'button', 'Открыть заметку', () => open(node.id));
            }
            for (const [label, items] of [
                ['Исходящие', related.outgoing],
                ['Входящие', related.incoming],
            ]) {
                append(details, 'h4', `${label} · ${items.length}`);
                const list = document.createElement('ul');
                details.append(list);
                for (const item of items) {
                    const row = document.createElement('li');
                    list.append(row);
                    append(row, 'button', item.title, () => select(item));
                }
            }
        }
        try {
            const graph = scope.value === 'all' ? await vaultApi.graph(options.filters)
                : await vaultApi.localGraph(options.path, scope.value);
            if (current !== revision || !dialog.open) return;
            if (!graph.nodes.length) { canvas.textContent = 'Нет заметок для графа'; return; }
            details.textContent = 'Выберите заметку на графе';
            const stop = await drawGraph(staging, graph, options.path, open, {
                controls,
                onSelect: inspect,
                size: { width: canvas.clientWidth, height: canvas.clientHeight },
            });
            if (current !== revision || !dialog.open) { stop(); return; }
            dispose = stop;
            count.textContent = `Заметки: ${graph.nodes.length} · Связи: ${graph.edges.length}`;
            canvas.replaceChildren(...staging.childNodes);
            inspector.replaceChildren(details);
        } catch (err) {
            if (current === revision && dialog.open) canvas.textContent = err.message || 'Не удалось загрузить граф';
        }
    }

    for (const option of [...scope.options].slice(1)) option.disabled = !options.path;
    scope.value = options.path ? options.mode : 'all';
    dialog.querySelector('[data-close-graph]').onclick = () => dialog.close();
    scope.onchange = load;
    dialog.addEventListener('close', () => {
        revision++;
        dispose?.();
        canvas.replaceChildren();
        inspector.replaceChildren();
    }, { once: true });
    dialog.showModal();
    void load();
}
