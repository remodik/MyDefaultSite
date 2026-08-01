import { coursesApi, resolveApiUrl } from '../api.js';
import { isAdmin, isAuthenticated } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, renderMarkdown } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';

let course = null;
let purchases = [];
let currentCourseId = null;

const SBP_PHONE_FALLBACK = '+7 987 745 65 36';
const SBP_BANK_FALLBACK = 'Т-банк / Сбер';

function formatPrice(amount) {
    return `${Number(amount || 0).toLocaleString('ru-RU')} ₽`;
}

function renderCover() {
    if (course?.cover_url) {
        return `
            <div class="course-detail-cover-frame">
                <img
                    src="${escapeHtml(resolveApiUrl(course?.cover_url))}"
                    alt="${escapeHtml(course.title)}"
                    class="course-detail-cover-image"
                    referrerpolicy="no-referrer"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                >
                <div class="course-detail-cover-fallback hidden">
                    <i class="fas fa-graduation-cap" aria-hidden="true"></i>
                </div>
            </div>
        `;
    }

    return `
        <div class="course-detail-cover-frame course-detail-cover-fallback">
            <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        </div>
    `;
}

function getCoursePurchase() {
    return purchases.find((item) => item.course_id === course.id && !item.part_id) || null;
}

function renderCoursePurchaseBlock() {
    if (!course || Number(course.price || 0) <= 0) {
        return '';
    }

    const purchase = getCoursePurchase();

    if (!purchase) {
        return `
            <div class="v1-card v1-callout">
                <div class="v1-actions v1-actions-between">
                    <div>
                        <h3 class="v1-card-h">Полный доступ к курсу</h3>
                        <p class="v1-muted">Оплатите курс, чтобы открыть все разделы</p>
                    </div>
                    <button class="v1-btn v1-btn-primary" id="purchase-course-btn">
                        Купить курс за ${formatPrice(course.price)}
                    </button>
                </div>
            </div>
        `;
    }

    if (purchase.status === 'pending') {
        const amountText = formatPrice(purchase.amount);
        const comment = escapeHtml(purchase.sbp_comment || '');
        return `
            <div class="v1-card v1-callout warning">
                <div class="v1-actions v1-actions-between v1-actions-start">
                    <div>
                        <span class="v1-badge v1-badge-warn">Ожидает подтверждения</span>
                        <p class="v1-muted v1-leading">
                            Ожидает подтверждения. Переведите ${amountText} на ${escapeHtml(SBP_PHONE_FALLBACK)} (${escapeHtml(SBP_BANK_FALLBACK)}) с комментарием <strong>${comment}</strong>
                        </p>
                    </div>
                    <button class="v1-btn v1-btn-sm" id="copy-course-comment-btn" data-comment="${comment}">
                        Скопировать комментарий
                    </button>
                </div>
            </div>
        `;
    }

    if (purchase.status === 'completed') {
        return `
            <div class="v1-card v1-callout success">
                <span class="v1-badge v1-badge-success">Полный доступ открыт ✓</span>
            </div>
        `;
    }

    return `
        <div class="v1-card v1-callout danger">
            <div class="v1-actions v1-actions-between">
                <div>
                    <span class="v1-badge v1-badge-danger">Оплата отклонена</span>
                    <p class="v1-muted">Попробуйте создать оплату повторно</p>
                </div>
                <button class="v1-btn v1-btn-primary" id="purchase-course-retry-btn">
                    Купить курс за ${formatPrice(course.price)}
                </button>
            </div>
        </div>
    `;
}

function renderPartAction(part) {
    const canRead = Boolean(part.has_access || part.is_preview);
    const partPrice = Number(part.price || 0);

    if (canRead) {
        return `
            <button class="v1-btn v1-btn-primary v1-btn-sm read-part-btn" data-part-id="${escapeHtml(part.id)}">
                Читать →
            </button>
        `;
    }

    if (partPrice > 0) {
        return `
            <button class="v1-btn v1-btn-primary v1-btn-sm purchase-part-btn" data-part-id="${escapeHtml(part.id)}">
                Купить раздел за ${formatPrice(partPrice)}
            </button>
        `;
    }

    return `
        <div class="v1-muted v1-actions">
            <i class="fas fa-lock"></i>
            Требуется покупка курса
        </div>
    `;
}

function renderPartsList() {
    const parts = [...(course?.parts || [])].sort((a, b) => {
        const left = Number(a.order || 0);
        const right = Number(b.order || 0);
        return left - right;
    });

    if (!parts.length) {
        return `
            <div class="v1-empty">
                <i class="fas fa-book-open v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">Разделов пока нет</div>
            </div>
        `;
    }

    const groups = [];
    let currentModule = null;
    let currentParts = [];

    for (const part of parts) {
        const mod = part.module_title || '';
        if (mod !== currentModule) {
            if (currentParts.length) {
                groups.push({ title: currentModule, parts: currentParts });
            }
            currentModule = mod;
            currentParts = [part];
        } else {
            currentParts.push(part);
        }
    }
    if (currentParts.length) {
        groups.push({ title: currentModule, parts: currentParts });
    }

    let globalIndex = 0;

    return `
        <div class="v1-vstack-lg">
            ${groups.map((group) => `
                ${group.title ? `
                    <h3 class="v1-section-title v1-module-title">
                        <span class="v1-title-icon">#</span>
                        ${escapeHtml(group.title)}
                    </h3>
                ` : ''}
                <div class="v1-vstack">
                    ${group.parts.map((part) => {
        globalIndex++;
        const partPrice = Number(part.price || 0);
        const showPartPrice = partPrice > 0 && !part.has_access;

        return `
                            <article class="v1-card v1-part-card">
                                <div class="v1-actions v1-actions-between v1-actions-start">
                                    <div>
                                        <div class="v1-actions">
                                            <span class="v1-soft">${globalIndex}.</span>
                                            <h3 class="v1-card-h">${escapeHtml(part.title)}</h3>
                                            ${part.is_preview ? '<span class="v1-badge v1-badge-info">Превью</span>' : ''}
                                        </div>
                                        <p class="v1-muted">${escapeHtml(part.description || 'Без описания')}</p>
                                        ${showPartPrice ? `<p class="v1-price-inline">${formatPrice(partPrice)}</p>` : ''}
                                    </div>
                                    <div class="v1-actions">
                                        ${renderPartAction(part)}
                                        ${isAdmin() ? `
                                            <button class="v1-btn v1-btn-sm edit-part-btn" data-part-id="${escapeHtml(part.id)}">
                                                Редактировать
                                            </button>
                                            <button class="v1-btn v1-btn-danger v1-btn-sm delete-part-btn" data-part-id="${escapeHtml(part.id)}">
                                                Удалить
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </article>
                        `;
    }).join('')}
                </div>
            `).join('')}
        </div>
    `;
}

function renderCourse() {
    const container = document.getElementById('course-content');
    if (!container || !course) return;

    container.innerHTML = `
        <div class="fade-in">
            ${renderCover()}

            <div class="v1-breadcrumb-inline">
                <a href="/courses" class="v1-link">Курсы</a>
                <span>→</span>
                <span>${escapeHtml(course.title)}</span>
            </div>

            <h1 class="v1-page-title v1-detail-title">${escapeHtml(course.title)}</h1>

            <div class="markdown-content v1-card v1-markdown-card" id="course-description-markdown">
                ${renderMarkdown(course.description || '')}
            </div>

            ${renderCoursePurchaseBlock()}

            <div class="v1-page-header v1-section-header">
                <h2 class="v1-section-title">Разделы курса</h2>
                ${isAdmin() ? `
                    <button class="v1-btn v1-btn-primary" id="add-part-btn">
                        <i class="fas fa-plus"></i>
                        Добавить раздел
                    </button>
                ` : ''}
            </div>

            ${renderPartsList()}
        </div>
    `;

    const purchaseCourseBtn = document.getElementById('purchase-course-btn');
    if (purchaseCourseBtn) {
        purchaseCourseBtn.addEventListener('click', () => handlePurchaseCourse(purchaseCourseBtn));
    }

    const purchaseCourseRetryBtn = document.getElementById('purchase-course-retry-btn');
    if (purchaseCourseRetryBtn) {
        purchaseCourseRetryBtn.addEventListener('click', () => handlePurchaseCourse(purchaseCourseRetryBtn));
    }

    const copyCourseCommentBtn = document.getElementById('copy-course-comment-btn');
    if (copyCourseCommentBtn) {
        copyCourseCommentBtn.addEventListener('click', async () => {
            const comment = copyCourseCommentBtn.dataset.comment || '';
            await copyToClipboard(comment);
        });
    }

    container.querySelectorAll('.read-part-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const partId = button.dataset.partId;
            if (partId) {
                router.navigate(`/courses/${course.id}/parts/${partId}`);
            }
        });
    });

    container.querySelectorAll('.purchase-part-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const partId = button.dataset.partId;
            if (partId) {
                handlePurchasePart(partId, button);
            }
        });
    });

    if (isAdmin()) {
        const addPartBtn = document.getElementById('add-part-btn');
        if (addPartBtn) {
            addPartBtn.addEventListener('click', () => showPartModal());
        }

        container.querySelectorAll('.edit-part-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const partId = button.dataset.partId;
                if (!partId) return;

                try {
                    const fullPart = await coursesApi.getPartContent(course.id, partId);
                    showPartModal(fullPart);
                } catch (error) {
                    showToast(error.message || 'Не удалось загрузить раздел', 'error');
                }
            });
        });

        container.querySelectorAll('.delete-part-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const partId = button.dataset.partId;
                if (partId) {
                    deletePart(partId);
                }
            });
        });
    }

    if (window.Prism) {
        Prism.highlightAll();
    }

    if (window.renderMathInElement) {
        const markdownRoot = document.getElementById('course-description-markdown');
        if (markdownRoot) {
            renderMathInElement(markdownRoot, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false },
                ],
                throwOnError: false,
            });
        }
    }
}

function renderNotFound(message = 'Курс не найден') {
    const container = document.getElementById('course-content');
    if (!container) return;

    container.innerHTML = `
        <div class="v1-empty">
            <i class="fas fa-exclamation-circle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
            <div class="v1-empty-h">${escapeHtml(message)}</div>
            <button class="v1-btn v1-btn-primary" style="margin-top:var(--v1-space-4)" id="back-to-courses-btn">
                ← Вернуться к курсам
            </button>
        </div>
    `;

    const backBtn = document.getElementById('back-to-courses-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => router.navigate('/courses'));
    }
}

async function loadCourseData(courseId) {
    try {
        course = await coursesApi.getById(courseId);
    } catch (error) {
        showToast(error.message || 'Ошибка загрузки курса', 'error');
        renderNotFound('Курс не найден');
        return;
    }

    if (isAuthenticated()) {
        try {
            purchases = await coursesApi.getMyPurchases();
        } catch (error) {
            purchases = [];
            showToast(error.message || 'Не удалось загрузить покупки', 'error');
        }
    } else {
        purchases = [];
    }

    renderCourse();
}

async function copyToClipboard(text) {
    if (!text) {
        showToast('Комментарий не найден', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast('Комментарий скопирован', 'success');
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
        showToast('Комментарий скопирован', 'success');
    }
}

function showSbpModal(sbp, onClosed) {
    if (!sbp) {
        if (onClosed) onClosed();
        return;
    }

    showModal({
        title: 'Оплата через СБП',
        content: `
            <div class="v1-vstack">
                <p class="v1-muted">Переведите <strong>${formatPrice(sbp.amount)}</strong> на ${escapeHtml(sbp.phone)} (${escapeHtml(sbp.bank)}) с комментарием:</p>
                <div class="v1-code-box">
                    <code>${escapeHtml(sbp.comment)}</code>
                </div>
                <p class="v1-muted">Получатель: ${escapeHtml(sbp.recipient)}</p>
            </div>
        `,
        footer: `
            <button class="v1-btn" id="close-sbp-modal-btn">Закрыть</button>
            <button class="v1-btn v1-btn-primary" id="copy-sbp-comment-btn" data-comment="${escapeHtml(sbp.comment)}">
                Скопировать комментарий
            </button>
        `,
        onClose: () => {
            if (onClosed) onClosed();
        },
    });

    setTimeout(() => {
        const closeBtn = document.getElementById('close-sbp-modal-btn');
        const copyBtn = document.getElementById('copy-sbp-comment-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const comment = copyBtn.dataset.comment || '';
                await copyToClipboard(comment);
            });
        }
    }, 0);
}

async function handlePurchaseCourse(button) {
    if (!isAuthenticated()) {
        await router.navigate('/login');
        return;
    }

    const initialText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.textContent = 'Загрузка…';
    }

    try {
        const response = await coursesApi.purchaseCourse(currentCourseId);

        if (response?.confirmation_url) {
            showToast('Переходим к оплате…', 'info');
            window.location.href = response.confirmation_url;
            return;
        }
        if (response?.sbp) {
            showSbpModal(response.sbp, async () => {
                await loadCourseData(currentCourseId);
            });
        } else {
            showToast('Полный доступ открыт', 'success');
            await loadCourseData(currentCourseId);
        }
    } catch (error) {
        showToast(error.message || 'Ошибка покупки курса', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = initialText;
        }
    }
}

async function handlePurchasePart(partId, button) {
    if (!isAuthenticated()) {
        await router.navigate('/login');
        return;
    }

    const initialText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.textContent = 'Загрузка…';
    }

    try {
        const response = await coursesApi.purchasePart(currentCourseId, partId);

        if (response?.confirmation_url) {
            showToast('Переходим к оплате…', 'info');
            window.location.href = response.confirmation_url;
            return;
        }
        if (response?.sbp) {
            showSbpModal(response.sbp, async () => {
                await loadCourseData(currentCourseId);
            });
        } else {
            showToast('Доступ к разделу открыт', 'success');
            await loadCourseData(currentCourseId);
        }
    } catch (error) {
        showToast(error.message || 'Ошибка покупки раздела', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = initialText;
        }
    }
}

function showPartModal(part = null) {
    const isEdit = Boolean(part);

    showModal({
        title: isEdit ? 'Редактировать раздел' : 'Новый раздел',
        content: `
            <form id="part-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label" for="part-module">Модуль (необязательно)</label>
                    <input id="part-module" type="text" class="v1-input" maxlength="255" 
                           placeholder="Например: Модуль 1. Введение"
                           value="${isEdit ? escapeHtml(part.module_title || '') : ''}">
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="part-title">Название</label>
                    <input id="part-title" type="text" class="v1-input" maxlength="255" value="${isEdit ? escapeHtml(part.title) : ''}" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="part-description">Короткое описание</label>
                    <input id="part-description" type="text" class="v1-input" maxlength="512" value="${isEdit ? escapeHtml(part.description || '') : ''}">
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="part-content">Контент (Markdown)</label>
                    <textarea id="part-content" class="v1-input v1-code-input" rows="15">${isEdit ? escapeHtml(part.content || '') : ''}</textarea>
                </div>
                <div class="v1-form-row">
                    <div class="v1-field">
                        <label class="v1-label" for="part-price">Цена (₽)</label>
                        <input id="part-price" type="number" class="v1-input" min="0" step="1" value="${isEdit ? Number(part.price || 0) : 0}">
                    </div>
                    <div class="v1-field">
                        <label class="v1-label" for="part-order">Порядок</label>
                        <input id="part-order" type="number" class="v1-input" min="0" step="1" value="${isEdit ? Number(part.order || 0) : 0}">
                    </div>
                </div>
                <label class="v1-check-row">
                    <input id="part-is-preview" type="checkbox" ${isEdit && part.is_preview ? 'checked' : ''}>
                    Превью-раздел
                </label>
            </form>
        `,
        footer: `
            <button class="v1-btn" id="cancel-part-btn">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="save-part-btn">
                <i class="fas fa-save"></i>
                Сохранить
            </button>
        `,
        size: 'full',
    });

    setTimeout(() => {
        const cancelBtn = document.getElementById('cancel-part-btn');
        const saveBtn = document.getElementById('save-part-btn');
        const contentArea = document.getElementById('part-content');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => savePart(part?.id || null));
        }
        if (contentArea) {
            contentArea.addEventListener('keydown', (event) => {
                if (event.key === 'Tab') {
                    event.preventDefault();
                    const start = contentArea.selectionStart;
                    const end = contentArea.selectionEnd;
                    contentArea.value = `${contentArea.value.slice(0, start)}    ${contentArea.value.slice(end)}`;
                    contentArea.selectionStart = contentArea.selectionEnd = start + 4;
                }
            });
        }
    }, 0);
}

async function savePart(partId = null) {
    const saveBtn = document.getElementById('save-part-btn');
    if (!saveBtn) return;

    const initialText = saveBtn.innerHTML;

    const titleInput = document.getElementById('part-title');
    const descriptionInput = document.getElementById('part-description');
    const contentInput = document.getElementById('part-content');
    const priceInput = document.getElementById('part-price');
    const orderInput = document.getElementById('part-order');
    const previewInput = document.getElementById('part-is-preview');

    const title = titleInput?.value.trim() || '';
    if (!title) {
        showToast('Введите название раздела', 'error');
        return;
    }

    const parsedPrice = Number.parseInt(priceInput?.value || '0', 10);
    const parsedOrder = Number.parseInt(orderInput?.value || '0', 10);

    const payload = {
        module_title: document.getElementById('part-module')?.value.trim() || '',
        title,
        description: descriptionInput?.value.trim() || '',
        content: contentInput?.value || '',
        price: Number.isNaN(parsedPrice) || parsedPrice < 0 ? 0 : parsedPrice,
        order: Number.isNaN(parsedOrder) || parsedOrder < 0 ? 0 : parsedOrder,
        is_preview: Boolean(previewInput?.checked),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение…';

    try {
        if (partId) {
            await coursesApi.updatePart(currentCourseId, partId, payload);
            showToast('Раздел обновлён', 'success');
        } else {
            await coursesApi.createPart(currentCourseId, payload);
            showToast('Раздел добавлен', 'success');
        }

        closeModal();
        await loadCourseData(currentCourseId);
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения раздела', 'error');
    } finally {
        if (document.getElementById('save-part-btn')) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = initialText;
        }
    }
}

async function deletePart(partId) {
    confirmModal('Удалить раздел?', async () => {
        try {
            await coursesApi.deletePart(currentCourseId, partId);
            showToast('Раздел удалён', 'success');
            await loadCourseData(currentCourseId);
        } catch (error) {
            showToast(error.message || 'Ошибка удаления раздела', 'error');
        }
    });
}

export function render() {
    return `
        <div class="v1-doc">
            <div id="course-content">
                <div class="v1-loading">Загрузка…</div>
            </div>
        </div>
    `;
}

export async function mount(params) {
    currentCourseId = params?.id || null;
    if (!currentCourseId) {
        renderNotFound();
        return;
    }

    await loadCourseData(currentCourseId);
}

export function unmount() {
    course = null;
    purchases = [];
    currentCourseId = null;
}
