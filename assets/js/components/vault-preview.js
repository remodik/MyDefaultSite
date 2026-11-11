import { vaultApi } from './vault-api.js';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

let mermaidPromise = null;
let mermaidCounter = 0;

function loadMermaid() {
    if (!mermaidPromise) {
        mermaidPromise = import(MERMAID_URL).then((module) => {
            const mermaid = module.default;
            // strict: в подписях диаграмм не исполняется HTML и нет кликов-скриптов.
            mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
            return mermaid;
        });
        mermaidPromise.catch(() => { mermaidPromise = null; });
    }
    return mermaidPromise;
}

function renderMath(root) {
    if (!window.katex) return;
    root.querySelectorAll('.math').forEach((el) => {
        const source = el.textContent;
        try {
            window.katex.render(source, el, {
                displayMode: el.classList.contains('math-block'),
                throwOnError: false,
            });
        } catch {
            el.textContent = source;
        }
    });
}

function highlightCode(root) {
    if (!window.Prism) return;
    root.querySelectorAll('pre > code[class*="language-"]').forEach((code) => {
        if (code.classList.contains('language-mermaid')) return;
        try {
            window.Prism.highlightElement(code);
        } catch {
            /* неизвестный язык — оставляем как есть */
        }
    });
}

async function renderMermaid(root) {
    const blocks = [...root.querySelectorAll('pre > code.language-mermaid')];
    if (!blocks.length) return;
    let mermaid;
    try {
        mermaid = await loadMermaid();
    } catch {
        return; // CDN недоступен — диаграмма остаётся блоком кода
    }
    for (const code of blocks) {
        const pre = code.parentElement;
        if (!pre || !pre.isConnected) continue;
        const holder = document.createElement('div');
        holder.className = 'vault-mermaid';
        try {
            mermaidCounter += 1;
            const { svg } = await mermaid.render(`vault-mermaid-${mermaidCounter}`, code.textContent);
            holder.innerHTML = svg;
            pre.replaceWith(holder);
        } catch {
            pre.classList.add('vault-mermaid-error');
        }
    }
}

function loadImages(root, objectUrls) {
    root.querySelectorAll('img[data-vault-src]').forEach(async (img) => {
        try {
            const url = await vaultApi.fileUrl(img.dataset.vaultSrc);
            objectUrls.push(url);
            if (img.isConnected) img.src = url;
        } catch {
            img.classList.add('is-broken');
            img.alt = `${img.alt || img.dataset.vaultSrc} (не загружено)`;
        }
    });
}

function decorateLinks(root) {
    root.querySelectorAll('a.external-link, a[href^="http"]').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });
}

/**
 * Вставляет серверный HTML заметки в контейнер и доводит его на клиенте:
 * KaTeX, Prism, mermaid, картинки vault. Разметку Obsidian (ссылки, теги,
 * выноски, embeds) сервер уже отрисовал — здесь она не разбирается повторно.
 *
 * Возвращает функцию очистки (отзывает object URL картинок).
 */
export function renderPreview(container, html) {
    // Сервер уже прогнал HTML через nh3; DOMPurify — второй рубеж на клиенте.
    container.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
    const objectUrls = [];
    renderMath(container);
    highlightCode(container);
    decorateLinks(container);
    loadImages(container, objectUrls);
    renderMermaid(container);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
}

/** Прокручивает предпросмотр к заголовку по его slug. */
export function scrollToHeading(container, slug) {
    if (!slug) return false;
    const target = [...container.querySelectorAll('[data-heading]')].find(
        (el) => el.dataset.heading === slug && !el.closest('.vault-embed'),
    );
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
}
