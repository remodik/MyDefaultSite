import { API_URL } from '../api.js';
import { router } from '../router.js';
import { showToast, escapeHtml } from '../utils.js';

let currentSlug = null;

export function render() {
    return `
        <div class="v1-viewer" style="height: calc(100vh - 115px);">
            <div class="v1-viewer-bar">
                <button id="work-back-btn" class="v1-btn v1-btn-sm">
                    <i class="fas fa-arrow-left"></i>
                    К списку
                </button>
                <div id="work-meta" class="v1-viewer-meta">
                    <div class="v1-viewer-meta-sub">Загрузка…</div>
                </div>
                <a id="work-open-tab" class="v1-btn v1-btn-sm" target="_blank" rel="noopener" style="display:none;">
                    <i class="fas fa-external-link-alt"></i>
                    Открыть в новой вкладке
                </a>
            </div>

            <div id="work-frame-container" class="v1-viewer-frame">
                <div class="v1-loading" style="padding-top:48px">${escapeHtml('Загрузка…')}</div>
            </div>
        </div>
    `;
}

async function loadWork(slug) {
    try {
        const response = await fetch(`${API_URL}/api/works/${encodeURIComponent(slug)}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error('Работа не найдена');
            throw new Error('Ошибка загрузки');
        }
        const work = await response.json();

        const metaEl = document.getElementById('work-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                <div class="v1-viewer-meta-title">${escapeHtml(work.title)}</div>
                ${work.subject ? `<div class="v1-viewer-meta-sub">${escapeHtml(work.subject)}${work.display_date ? ' • ' + escapeHtml(work.display_date) : ''}</div>` : ''}
            `;
        }

        const rawUrl = `${API_URL}/api/works/${encodeURIComponent(slug)}/raw`;

        const openTabLink = document.getElementById('work-open-tab');
        if (openTabLink) {
            openTabLink.href = rawUrl;
            openTabLink.style.display = '';
        }

        const frameContainer = document.getElementById('work-frame-container');
        if (frameContainer) {
            frameContainer.innerHTML = `
                <iframe
                    src="${rawUrl}"
                    title="${escapeHtml(work.title)}"
                    style="width:100%; height:100%; border:0; background:#fff;"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                ></iframe>
            `;
        }
    } catch (error) {
        showToast(error.message, 'error');
        const container = document.getElementById('work-frame-container');
        if (container) {
            container.innerHTML = `
                <div class="v1-empty" style="background:var(--v1-bg);height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
                    <i class="fas fa-exclamation-circle v1-empty-icon" style="color:var(--v1-red)"></i>
                    <div class="v1-empty-h">${escapeHtml(error.message)}</div>
                    <button class="v1-btn v1-btn-primary" id="work-back-empty-btn" style="margin-top:16px">← К списку работ</button>
                </div>
            `;
            document.getElementById('work-back-empty-btn')?.addEventListener('click', () => router.navigate('/works'));
        }
    }
}

export async function mount(params) {
    currentSlug = params?.slug || null;

    document.getElementById('work-back-btn')?.addEventListener('click', () => router.navigate('/works'));

    if (!currentSlug) {
        showToast('Slug не указан', 'error');
        await router.navigate('/works');
        return;
    }

    await loadWork(currentSlug);
}

export function unmount() {
    currentSlug = null;
}