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
        <div class="v1-doc">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// works/</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-folder-open v1-page-title-icon"></i>${escapeHtml(t('page_works_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_works_sub'))}</p>
                </div>
                ${isAdmin() ? `
                    <button class="v1-btn v1-btn-primary" id="add-work-btn">
                        <i class="fas fa-upload"></i>
                        ${escapeHtml(t('works_upload'))}
                    </button>
                ` : ''}
            </div>

            <div id="works-filters"></div>

            <div id="works-content">
                <div class="v1-loading">${escapeHtml(t('loading'))}</div>
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
        <div class="v1-filters">
            <button class="v1-filter ${selectedSubject === 'all' ? 'active' : ''}" data-subject="all">
                <i class="fas fa-layer-group"></i>
                ${escapeHtml(t('works_filter_all'))}
                <span class="v1-filter-n">${works.length}</span>
            </button>
            ${subjects.map(([name, count]) => `
                <button class="v1-filter ${selectedSubject === name ? 'active' : ''}"
                        data-subject="${escapeHtml(name)}">
                    <i class="fas ${SUBJECT_ICONS[name] || 'fa-book'}"></i>
                    ${escapeHtml(name)}
                    <span class="v1-filter-n">${count}</span>
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
            <div class="v1-empty">
                <i class="fas fa-folder-open v1-empty-icon"></i>
                <div class="v1-empty-h">${escapeHtml(t('works_empty_h'))}</div>
                <p>${isAdmin() ? escapeHtml(t('works_empty_d_admin')) : escapeHtml(t('works_empty_d_user'))}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="v1-card-grid">
            ${list.map(work => `
                <article class="v1-wcard fade-in" data-slug="${escapeHtml(work.slug)}">
                    <div class="v1-wcard-top">
                        <span class="v1-wcard-icon">
                            <i class="${getIconClass(work.icon)}"></i>
                        </span>
                        ${!work.is_published ? `<span class="v1-tag-warn">${escapeHtml(t('work_draft'))}</span>` : ''}
                    </div>

                    ${work.subject ? `
                        <div class="v1-wcard-subject">${escapeHtml(work.subject)}</div>
                    ` : ''}

                    <h3 class="v1-wcard-title">${escapeHtml(work.title)}</h3>

                    <div class="v1-wcard-date">
                        ${work.display_date ? escapeHtml(work.display_date) : formatDate(work.created_at)}
                    </div>

                    <p class="v1-wcard-desc">${escapeHtml(work.description || t('work_no_desc'))}</p>

                    ${work.tags && work.tags.length ? `
                        <div class="v1-svc-tags">
                            ${work.tags.slice(0, 4).map(tag => `<span class="v1-chip">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}

                    <div class="v1-wcard-foot">
                        <a class="v1-btn v1-btn-sm work-open-btn" data-slug="${escapeHtml(work.slug)}">
                            ${escapeHtml(t('work_open'))} →
                        </a>
                        ${isAdmin() ? `
                            <div class="v1-wcard-actions">
                                <button class="v1-icon-btn work-edit-btn" data-slug="${escapeHtml(work.slug)}" title="Редактировать">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="v1-icon-btn work-replace-btn" data-slug="${escapeHtml(work.slug)}" title="Перезалить HTML">
                                    <i class="fas fa-sync"></i>
                                </button>
                                <button class="v1-icon-btn danger work-delete-btn" data-slug="${escapeHtml(work.slug)}" title="Удалить">
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
                <div class="v1-empty">
                    <i class="fas fa-exclamation-triangle v1-empty-icon" style="color:var(--v1-red)"></i>
                    <div class="v1-empty-h">${escapeHtml(t('common_load_error'))}</div>
                    <p>${escapeHtml(error.message)}</p>
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
            <form id="work-upload-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label" for="work-file">HTML файл *</label>
                    <input id="work-file" type="file" accept=".html,.htm" class="v1-input" required>
                    <p class="v1-muted">Файл загрузится «как есть», CSS и JS внутри сохранятся.</p>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="work-title">Название *</label>
                    <input id="work-title" type="text" class="v1-input" maxlength="255" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="work-subject">Раздел / предмет</label>
                    <input id="work-subject" type="text" class="v1-input" maxlength="255"
                           placeholder="Например: Управление программными проектами"
                           list="work-subject-suggestions">
                    <datalist id="work-subject-suggestions">
                        <option value="Управление программными проектами">
                        <option value="Обеспечение качества функционирования компьютерных систем">
                        <option value="Внедрение и поддержка компьютерных систем">
                    </datalist>
                </div>
                <div class="v1-form-row">
                    <div class="v1-field">
                        <label class="v1-label" for="work-date">Дата (для отображения)</label>
                        <input id="work-date" type="text" class="v1-input" maxlength="64" placeholder="10 декабря 2025">
                    </div>
                    <div class="v1-field">
                        <label class="v1-label" for="work-icon">Иконка (Font Awesome)</label>
                        <input id="work-icon" type="text" class="v1-input" maxlength="64"
                               placeholder="fa-chart" value="fa-book">
                    </div>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="work-description">Описание</label>
                    <textarea id="work-description" class="v1-input" rows="3" maxlength="2000"></textarea>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="work-tags">Тэги (через запятую)</label>
                    <input id="work-tags" type="text" class="v1-input" maxlength="512"
                           placeholder="WBS, Риски, WPF">
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="work-slug">URL slug (опционально)</label>
                    <input id="work-slug" type="text" class="v1-input" maxlength="160"
                           placeholder="оставь пустым — сгенерируется из названия">
                </div>
                <label class="v1-check-row">
                    <input id="work-published" type="checkbox" checked>
                    Опубликовать сразу
                </label>
            </form>
        `,
        footer: `
            <button class="v1-btn" id="cancel-upload-btn">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="submit-upload-btn">
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
        submitBtn.textContent = 'Загрузка…';
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
            <form id="work-edit-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label">Название</label>
                    <input id="edit-title" type="text" class="v1-input" value="${escapeHtml(work.title)}" maxlength="255">
                </div>
                <div class="v1-field">
                    <label class="v1-label">Раздел</label>
                    <input id="edit-subject" type="text" class="v1-input" value="${escapeHtml(work.subject)}" maxlength="255">
                </div>
                <div class="v1-form-row">
                    <div class="v1-field">
                        <label class="v1-label">Дата</label>
                        <input id="edit-date" type="text" class="v1-input" value="${escapeHtml(work.display_date)}" maxlength="64">
                    </div>
                    <div class="v1-field">
                        <label class="v1-label">Иконка</label>
                        <input id="edit-icon" type="text" class="v1-input" value="${escapeHtml(work.icon)}" maxlength="64">
                    </div>
                </div>
                <div class="v1-field">
                    <label class="v1-label">Описание</label>
                    <textarea id="edit-description" class="v1-input" rows="3" maxlength="2000">${escapeHtml(work.description)}</textarea>
                </div>
                <div class="v1-field">
                    <label class="v1-label">Тэги (через запятую)</label>
                    <input id="edit-tags" type="text" class="v1-input" value="${escapeHtml((work.tags || []).join(', '))}" maxlength="512">
                </div>
                <div class="v1-field">
                    <label class="v1-label">Slug</label>
                    <input id="edit-slug" type="text" class="v1-input" value="${escapeHtml(work.slug)}" maxlength="160">
                </div>
                <label class="v1-check-row">
                    <input id="edit-published" type="checkbox" ${work.is_published ? 'checked' : ''}>
                    Опубликована
                </label>
            </form>
        `,
        footer: `
            <button class="v1-btn" id="edit-cancel-btn">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="edit-save-btn">
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
        btn.textContent = 'Сохранение…';
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
            <div class="v1-field">
                <p class="v1-muted">Метаданные сохранятся, заменится только содержимое страницы.</p>
                <input id="replace-file" type="file" accept=".html,.htm" class="v1-input">
            </div>
        `,
        footer: `
            <button class="v1-btn" id="replace-cancel-btn">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="replace-submit-btn">
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
