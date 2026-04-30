import { API_URL } from '../api.js';
import { router } from '../router.js';
import { showToast, escapeHtml } from '../utils.js';

let currentSlug = null;

export function render() {
    return `
        <div class="work-viewer-page" style="height: calc(100vh - 64px); display: flex; flex-direction: column;">
            <div class="work-viewer-toolbar" style="
                background: #1e1f22;
                border-bottom: 1px solid #404249;
                padding: 10px 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            ">
                <button id="work-back-btn" class="btn btn-secondary btn-sm">
                    <i class="fas fa-arrow-left"></i>
                    К списку
                </button>
                <div id="work-meta" style="flex: 1; min-width: 0;">
                    <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
                </div>
                <a id="work-open-tab" class="btn btn-outline btn-sm" target="_blank" rel="noopener" style="display:none;">
                    <i class="fas fa-external-link-alt"></i>
                    Открыть в новой вкладке
                </a>
            </div>

            <div id="work-frame-container" style="flex: 1; background: #0a0a0a; overflow: hidden;">
                <div class="flex justify-center items-center h-full">
                    <div class="spinner spinner-lg"></div>
                </div>
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
                <div class="text-white font-semibold truncate">${escapeHtml(work.title)}</div>
                ${work.subject ? `<div class="text-discord-text text-xs truncate">${escapeHtml(work.subject)}${work.display_date ? ' • ' + escapeHtml(work.display_date) : ''}</div>` : ''}
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
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle text-discord-red"></i>
                    <h3 class="text-xl font-semibold text-white mt-4">${escapeHtml(error.message)}</h3>
                    <button class="btn btn-primary mt-4" id="work-back-empty-btn">← К списку работ</button>
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