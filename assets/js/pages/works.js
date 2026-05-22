import { API_URL } from '../api.js';
import { isAdmin, getToken } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, formatDate } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { t } from '../i18n.js';

let works = [];
let selectedSubject = 'all';

const SUBJECT_ICONS = {
    'Обеспечение качества функционирования компьютерных систем': 'fa-shield-alt',
    'Внедрение и поддержка компьютерных систем': 'fa-puzzle-piece',
    'Управление программными проектами': 'fa-briefcase',
};

function getIconClass(name) {
    const value = (name || '').trim();
    if (!value) return 'fas fa-book';
    if (value.startsWith('fa-')) return `fas ${value}`;
    if (value.includes(' ')) return value;
    return `fas fa-${value}`;
}

function uniqueSubjects() {
    const map = new Map();
    works.forEach(w => {
        const key = w.subject || t('works_no_subject');
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries());
}

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="flex justify-between items-start mb-8 flex-wrap gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-folder-open text-discord-accent mr-3"></i>
                        ${escapeHtml(t('page_works_title'))}
                    </h1>
                    <p class="text-discord-text mt-2">${escapeHtml(t('page_works_sub'))}</p>
                </div>
                ${isAdmin() ? `
                    <button class="btn btn-primary" id="add-work-btn">
                        <i class="fas fa-upload"></i>
                        ${escapeHtml(t('works_upload'))}
                    </button>
                ` : ''}
            </div>

            <div id="works-filters" class="mb-6"></div>

            <div id="works-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderFilters() {
    const container = document.getElementById('works-filters');
    if (!container) return;

    const subjects = uniqueSubjects();
    if (!subjects.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm ${selectedSubject === 'all' ? 'btn-primary' : 'btn-secondary'}" data-subject="all">
                <i class="fas fa-layer-group"></i>
                ${escapeHtml(t('works_filter_all'))}
                <span class="ml-1 opacity-75">${works.length}</span>
            </button>
            ${subjects.map(([name, count]) => `
                <button class="btn btn-sm ${selectedSubject === name ? 'btn-primary' : 'btn-secondary'}"
                        data-subject="${escapeHtml(name)}">
                    <i class="fas ${SUBJECT_ICONS[name] || 'fa-book'}"></i>
                    ${escapeHtml(name)}
                    <span class="ml-1 opacity-75">${count}</span>
                </button>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('[data-subject]').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedSubject = btn.dataset.subject;
            renderFilters();
            renderList();
        });
    });
}

function renderList() {
    const container = document.getElementById('works-content');
    if (!container) return;

    const list = selectedSubject === 'all'
        ? works
        : works.filter(w => (w.subject || t('works_no_subject')) === selectedSubject);

    if (!list.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3 class="text-xl font-semibold text-white mt-4">${escapeHtml(t('works_empty_h'))}</h3>
                <p class="text-discord-text mt-2">${isAdmin() ? escapeHtml(t('works_empty_d_admin')) : escapeHtml(t('works_empty_d_user'))}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${list.map(work => `
                <article class="bg-discord-light rounded-xl border border-discord-lighter/40 hover:-translate-y-1 hover:border-discord-accent/50 transition-all duration-200 p-5 cursor-pointer fade-in"
                         data-slug="${escapeHtml(work.slug)}">
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="w-12 h-12 rounded-lg bg-discord-accent/15 flex items-center justify-center flex-shrink-0">
                            <i class="${getIconClass(work.icon)} text-discord-accent text-xl"></i>
                        </div>
                        ${!work.is_published ? `<span class="tag tag-warning">${escapeHtml(t('work_draft'))}</span>` : ''}
                    </div>

                    ${work.subject ? `
                        <div class="text-xs text-discord-text/70 uppercase tracking-wider mb-2">
                            ${escapeHtml(work.subject)}
                        </div>
                    ` : ''}

                    <h3 class="text-white font-bold text-lg leading-tight mb-2">${escapeHtml(work.title)}</h3>

                    ${work.display_date ? `
                        <p class="text-discord-accent text-sm font-semibold mb-2">${escapeHtml(work.display_date)}</p>
                    ` : `
                        <p class="text-discord-text/60 text-xs mb-2">${formatDate(work.created_at)}</p>
                    `}

                    <p class="text-discord-text text-sm line-clamp-2 mb-4 min-h-[40px]">
                        ${escapeHtml(work.description || t('work_no_desc'))}
                    </p>

                    ${work.tags && work.tags.length ? `
                        <div class="flex flex-wrap gap-1.5 mb-4">
                            ${work.tags.slice(0, 4).map(t => `<span class="tag tag-primary text-xs">${escapeHtml(t)}</span>`).join('')}
                        </div>
                    ` : ''}

                    <div class="flex items-center justify-between gap-2 pt-3 border-t border-discord-lighter/30">
                        <button class="btn btn-outline btn-sm work-open-btn" data-slug="${escapeHtml(work.slug)}">
                            ${escapeHtml(t('work_open'))} →
                        </button>
                        ${isAdmin() ? `
                            <div class="flex gap-1">
                                <button class="btn btn-secondary btn-sm work-edit-btn" data-slug="${escapeHtml(work.slug)}" title="Редактировать">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm work-replace-btn" data-slug="${escapeHtml(work.slug)}" title="Перезалить HTML">
                                    <i class="fas fa-sync"></i>
                                </button>
                                <button class="btn btn-danger btn-sm work-delete-btn" data-slug="${escapeHtml(work.slug)}" title="Удалить">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('article[data-slug]').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            router.navigate(`/works/${card.dataset.slug}`);
        });
    });

    container.querySelectorAll('.work-open-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            router.navigate(`/works/${btn.dataset.slug}`);
        });
    });

    if (isAdmin()) {
        container.querySelectorAll('.work-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const work = works.find(w => w.slug === btn.dataset.slug);
                if (work) showWorkEditModal(work);
            });
        });
        container.querySelectorAll('.work-replace-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showReplaceContentModal(btn.dataset.slug);
            });
        });
        container.querySelectorAll('.work-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteWork(btn.dataset.slug);
            });
        });
    }
}

async function loadWorks() {
    const container = document.getElementById('works-content');
    try {
        const headers = {};
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_URL}/api/works`, { headers });
        if (!response.ok) throw new Error('Не удалось загрузить список');
        works = await response.json();
        renderFilters();
        renderList();
    } catch (error) {
        showToast(error.message, 'error');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-discord-red"></i>
                    <h3 class="text-xl font-semibold text-white mt-4">${escapeHtml(t('common_load_error'))}</h3>
                    <p class="text-discord-text mt-2">${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }
}

function showUploadModal() {
    showModal({
        title: 'Загрузить работу',
        size: 'xl',
        content: `
            <form id="work-upload-form" class="space-y-4">
                <div>
                    <label class="label" for="work-file">HTML файл *</label>
                    <input id="work-file" type="file" accept=".html,.htm" class="input" required>
                    <p class="text-xs text-discord-text mt-1">Файл загрузится «как есть», CSS и JS внутри сохранятся.</p>
                </div>
                <div>
                    <label class="label" for="work-title">Название *</label>
                    <input id="work-title" type="text" class="input" maxlength="255" required>
                </div>
                <div>
                    <label class="label" for="work-subject">Раздел / предмет</label>
                    <input id="work-subject" type="text" class="input" maxlength="255"
                           placeholder="Например: Управление программными проектами"
                           list="work-subject-suggestions">
                    <datalist id="work-subject-suggestions">
                        <option value="Управление программными проектами">
                        <option value="Обеспечение качества функционирования компьютерных систем">
                        <option value="Внедрение и поддержка компьютерных систем">
                    </datalist>
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="label" for="work-date">Дата (для отображения)</label>
                        <input id="work-date" type="text" class="input" maxlength="64" placeholder="10 декабря 2025">
                    </div>
                    <div>
                        <label class="label" for="work-icon">Иконка (Font Awesome)</label>
                        <input id="work-icon" type="text" class="input" maxlength="64"
                               placeholder="fa-chart" value="fa-book">
                    </div>
                </div>
                <div>
                    <label class="label" for="work-description">Описание</label>
                    <textarea id="work-description" class="input" rows="3" maxlength="2000"></textarea>
                </div>
                <div>
                    <label class="label" for="work-tags">Тэги (через запятую)</label>
                    <input id="work-tags" type="text" class="input" maxlength="512"
                           placeholder="WBS, Риски, WPF">
                </div>
                <div>
                    <label class="label" for="work-slug">URL slug (опционально)</label>
                    <input id="work-slug" type="text" class="input" maxlength="160"
                           placeholder="оставь пустым — сгенерируется из названия">
                </div>
                <label class="flex items-center gap-2 text-discord-text">
                    <input id="work-published" type="checkbox" checked>
                    Опубликовать сразу
                </label>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" id="cancel-upload-btn">Отмена</button>
            <button class="btn btn-primary" id="submit-upload-btn">
                <i class="fas fa-upload"></i>
                Загрузить
            </button>
        `,
    });

    setTimeout(() => {
        document.getElementById('cancel-upload-btn')?.addEventListener('click', closeModal);
        document.getElementById('submit-upload-btn')?.addEventListener('click', submitUpload);
    }, 0);
}

async function submitUpload() {
    const fileInput = document.getElementById('work-file');
    const title = document.getElementById('work-title')?.value.trim() || '';

    if (!fileInput?.files?.[0]) {
        showToast('Выбери HTML файл', 'error');
        return;
    }
    if (!title) {
        showToast('Введи название', 'error');
        return;
    }

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('title', title);
    fd.append('description', document.getElementById('work-description')?.value.trim() || '');
    fd.append('subject', document.getElementById('work-subject')?.value.trim() || '');
    fd.append('display_date', document.getElementById('work-date')?.value.trim() || '');
    fd.append('icon', document.getElementById('work-icon')?.value.trim() || 'book');
    fd.append('tags', document.getElementById('work-tags')?.value.trim() || '');
    fd.append('slug', document.getElementById('work-slug')?.value.trim() || '');
    fd.append('is_published', document.getElementById('work-published')?.checked ? 'true' : 'false');

    const submitBtn = document.getElementById('submit-upload-btn');
    const initialHtml = submitBtn?.innerHTML;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div>';
    }

    try {
        const response = await fetch(`${API_URL}/api/works`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd,
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Не удалось загрузить');
        }
        showToast('Работа загружена', 'success');
        closeModal();
        await loadWorks();
    } catch (error) {
        showToast(error.message, 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = initialHtml;
        }
    }
}

function showWorkEditModal(work) {
    showModal({
        title: 'Редактировать работу',
        size: 'xl',
        content: `
            <form id="work-edit-form" class="space-y-4">
                <div>
                    <label class="label">Название</label>
                    <input id="edit-title" type="text" class="input" value="${escapeHtml(work.title)}" maxlength="255">
                </div>
                <div>
                    <label class="label">Раздел</label>
                    <input id="edit-subject" type="text" class="input" value="${escapeHtml(work.subject)}" maxlength="255">
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="label">Дата</label>
                        <input id="edit-date" type="text" class="input" value="${escapeHtml(work.display_date)}" maxlength="64">
                    </div>
                    <div>
                        <label class="label">Иконка</label>
                        <input id="edit-icon" type="text" class="input" value="${escapeHtml(work.icon)}" maxlength="64">
                    </div>
                </div>
                <div>
                    <label class="label">Описание</label>
                    <textarea id="edit-description" class="input" rows="3" maxlength="2000">${escapeHtml(work.description)}</textarea>
                </div>
                <div>
                    <label class="label">Тэги (через запятую)</label>
                    <input id="edit-tags" type="text" class="input" value="${escapeHtml((work.tags || []).join(', '))}" maxlength="512">
                </div>
                <div>
                    <label class="label">Slug</label>
                    <input id="edit-slug" type="text" class="input" value="${escapeHtml(work.slug)}" maxlength="160">
                </div>
                <label class="flex items-center gap-2 text-discord-text">
                    <input id="edit-published" type="checkbox" ${work.is_published ? 'checked' : ''}>
                    Опубликована
                </label>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" id="edit-cancel-btn">Отмена</button>
            <button class="btn btn-primary" id="edit-save-btn">
                <i class="fas fa-save"></i>
                Сохранить
            </button>
        `,
    });

    setTimeout(() => {
        document.getElementById('edit-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('edit-save-btn')?.addEventListener('click', () => saveWorkEdits(work.slug));
    }, 0);
}

async function saveWorkEdits(originalSlug) {
    const payload = {
        title: document.getElementById('edit-title')?.value.trim(),
        subject: document.getElementById('edit-subject')?.value.trim(),
        display_date: document.getElementById('edit-date')?.value.trim(),
        icon: document.getElementById('edit-icon')?.value.trim() || 'book',
        description: document.getElementById('edit-description')?.value.trim(),
        tags: document.getElementById('edit-tags')?.value.trim(),
        slug: document.getElementById('edit-slug')?.value.trim(),
        is_published: document.getElementById('edit-published')?.checked,
    };

    const btn = document.getElementById('edit-save-btn');
    const initial = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div>';
    }

    try {
        const response = await fetch(`${API_URL}/api/works/${encodeURIComponent(originalSlug)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Ошибка сохранения');
        }
        showToast('Сохранено', 'success');
        closeModal();
        await loadWorks();
    } catch (error) {
        showToast(error.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = initial;
        }
    }
}

function showReplaceContentModal(slug) {
    showModal({
        title: 'Перезалить HTML',
        content: `
            <p class="text-discord-text mb-4">Метаданные сохранятся, заменится только содержимое страницы.</p>
            <input id="replace-file" type="file" accept=".html,.htm" class="input">
        `,
        footer: `
            <button class="btn btn-secondary" id="replace-cancel-btn">Отмена</button>
            <button class="btn btn-primary" id="replace-submit-btn">
                <i class="fas fa-sync"></i>
                Заменить
            </button>
        `,
    });

    setTimeout(() => {
        document.getElementById('replace-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('replace-submit-btn')?.addEventListener('click', async () => {
            const fileInput = document.getElementById('replace-file');
            if (!fileInput?.files?.[0]) {
                showToast('Выбери файл', 'error');
                return;
            }
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            try {
                const response = await fetch(`${API_URL}/api/works/${encodeURIComponent(slug)}/content`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                    body: fd,
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.detail || 'Ошибка');
                }
                showToast('HTML обновлён', 'success');
                closeModal();
                await loadWorks();
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }, 0);
}

function deleteWork(slug) {
    confirmModal('Удалить эту работу безвозвратно?', async () => {
        try {
            const response = await fetch(`${API_URL}/api/works/${encodeURIComponent(slug)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Ошибка удаления');
            }
            showToast('Удалено', 'success');
            await loadWorks();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

export async function mount() {
    selectedSubject = 'all';
    await loadWorks();

    document.getElementById('add-work-btn')?.addEventListener('click', showUploadModal);
}

export function unmount() {
    works = [];
    selectedSubject = 'all';
}