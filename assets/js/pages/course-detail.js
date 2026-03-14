import { coursesApi } from '../api.js';
import { isAdmin, isAuthenticated } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, renderMarkdown } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';

let course = null;
let purchases = [];
let currentCourseId = null;

const SBP_PHONE_FALLBACK = '+7 987 745 65 36';
const SBP_BANK_FALLBACK = 'Тинькофф / Сбер';

function formatPrice(amount) {
    return `${Number(amount || 0).toLocaleString('ru-RU')} ₽`;
}

function renderCover() {
    if (course?.cover_url) {
        return `
            <div class="relative rounded-xl overflow-hidden border border-discord-lighter/40 mb-6 bg-discord-darker">
                <img
                    src="${escapeHtml(course.cover_url)}"
                    alt="${escapeHtml(course.title)}"
                    class="w-full h-64 object-cover"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                >
                <div class="hidden h-64 items-center justify-center bg-gradient-to-br from-discord-accent/40 to-discord-dark">
                    <i class="fas fa-graduation-cap text-5xl text-discord-text/80"></i>
                </div>
            </div>
        `;
    }

    return `
        <div class="h-64 rounded-xl mb-6 bg-gradient-to-br from-discord-accent/40 to-discord-dark border border-discord-lighter/40 flex items-center justify-center">
            <i class="fas fa-graduation-cap text-5xl text-discord-text/80"></i>
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
            <div class="bg-discord-light rounded-xl border border-discord-lighter/40 p-5 mb-6">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 class="text-white font-bold text-lg">Полный доступ к курсу</h3>
                        <p class="text-discord-text text-sm mt-1">Оплатите курс, чтобы открыть все разделы</p>
                    </div>
                    <button class="btn btn-success" id="purchase-course-btn">
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
            <div class="bg-discord-light rounded-xl border border-discord-yellow/40 p-5 mb-6">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <span class="tag tag-warning mb-3">Ожидает подтверждения</span>
                        <p class="text-discord-text text-sm leading-relaxed">
                            Ожидает подтверждения. Переведите ${amountText} на ${escapeHtml(SBP_PHONE_FALLBACK)} (${escapeHtml(SBP_BANK_FALLBACK)}) с комментарием <span class="text-white font-semibold">${comment}</span>
                        </p>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="copy-course-comment-btn" data-comment="${comment}">
                        Скопировать комментарий
                    </button>
                </div>
            </div>
        `;
    }

    if (purchase.status === 'completed') {
        return `
            <div class="bg-discord-light rounded-xl border border-discord-green/40 p-5 mb-6">
                <span class="tag tag-success">Полный доступ открыт ✓</span>
            </div>
        `;
    }

    return `
        <div class="bg-discord-light rounded-xl border border-discord-red/40 p-5 mb-6">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <span class="tag tag-danger mb-2">Оплата отклонена</span>
                    <p class="text-discord-text text-sm">Попробуйте создать оплату повторно</p>
                </div>
                <button class="btn btn-success" id="purchase-course-retry-btn">
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
            <button class="btn btn-primary btn-sm read-part-btn" data-part-id="${escapeHtml(part.id)}">
                Читать →
            </button>
        `;
    }

    if (partPrice > 0) {
        return `
            <button class="btn btn-success btn-sm purchase-part-btn" data-part-id="${escapeHtml(part.id)}">
                Купить раздел за ${formatPrice(partPrice)}
            </button>
        `;
    }

    return `
        <div class="text-discord-text text-sm flex items-center gap-2">
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
            <div class="empty-state mt-6">
                <i class="fas fa-book-open"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Разделов пока нет</h3>
            </div>
        `;
    }

    return `
        <div class="space-y-4 mt-4">
            ${parts.map((part, index) => {
                const partPrice = Number(part.price || 0);
                const showPartPrice = partPrice > 0 && !part.has_access;

                return `
                    <div class="bg-discord-light rounded-xl border border-discord-lighter/40 p-5">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-discord-text text-sm">${index + 1}.</span>
                                    <h3 class="text-white font-bold text-lg">${escapeHtml(part.title)}</h3>
                                    ${part.is_preview ? '<span class="tag tag-primary">Превью</span>' : ''}
                                </div>
                                <p class="text-discord-text text-sm">${escapeHtml(part.description || 'Без описания')}</p>
                                ${showPartPrice ? `<p class="text-white text-sm mt-2">${formatPrice(partPrice)}</p>` : ''}
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                ${renderPartAction(part)}
                                ${isAdmin() ? `
                                    <button class="btn btn-secondary btn-sm edit-part-btn" data-part-id="${escapeHtml(part.id)}">
                                        Редактировать
                                    </button>
                                    <button class="btn btn-danger btn-sm delete-part-btn" data-part-id="${escapeHtml(part.id)}">
                                        Удалить
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderCourse() {
    const container = document.getElementById('course-content');
    if (!container || !course) return;

    container.innerHTML = `
        <div class="fade-in">
            ${renderCover()}

            <div class="text-discord-text text-sm mb-3">
                <a href="/courses" class="hover:text-white transition">Курсы</a>
                <span class="mx-2">→</span>
                <span class="text-white">${escapeHtml(course.title)}</span>
            </div>

            <h1 class="text-3xl font-bold text-white mb-4">${escapeHtml(course.title)}</h1>

            <div class="markdown-content bg-discord-light rounded-xl border border-discord-lighter/40 p-6 mb-6" id="course-description-markdown">
                ${renderMarkdown(course.description || '')}
            </div>

            ${renderCoursePurchaseBlock()}

            <div class="flex justify-between items-center mt-8 mb-4">
                <h2 class="text-2xl font-bold text-white">Разделы курса</h2>
                ${isAdmin() ? `
                    <button class="btn btn-primary" id="add-part-btn">
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
        <div class="empty-state">
            <i class="fas fa-exclamation-circle text-discord-red"></i>
            <h3 class="text-xl font-semibold text-white mt-4">${escapeHtml(message)}</h3>
            <button class="btn btn-primary mt-4" id="back-to-courses-btn">
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
            <div class="space-y-3">
                <p class="text-discord-text">Переведите <span class="text-white font-semibold">${formatPrice(sbp.amount)}</span> на ${escapeHtml(sbp.phone)} (${escapeHtml(sbp.bank)}) с комментарием:</p>
                <div class="bg-discord-darker rounded-lg p-3 border border-discord-lighter/40">
                    <code class="text-white font-mono">${escapeHtml(sbp.comment)}</code>
                </div>
                <p class="text-discord-text text-sm">Получатель: ${escapeHtml(sbp.recipient)}</p>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" id="close-sbp-modal-btn">Закрыть</button>
            <button class="btn btn-primary" id="copy-sbp-comment-btn" data-comment="${escapeHtml(sbp.comment)}">
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
        router.navigate('/login');
        return;
    }

    const initialText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner"></div>';
    }

    try {
        const response = await coursesApi.purchaseCourse(currentCourseId);

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
        router.navigate('/login');
        return;
    }

    const initialText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner"></div>';
    }

    try {
        const response = await coursesApi.purchasePart(currentCourseId, partId);

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
            <form id="part-form" class="space-y-4">
                <div>
                    <label class="label" for="part-title">Название</label>
                    <input id="part-title" type="text" class="input" maxlength="255" value="${isEdit ? escapeHtml(part.title) : ''}" required>
                </div>
                <div>
                    <label class="label" for="part-description">Короткое описание</label>
                    <input id="part-description" type="text" class="input" maxlength="512" value="${isEdit ? escapeHtml(part.description || '') : ''}">
                </div>
                <div>
                    <label class="label" for="part-content">Контент (Markdown)</label>
                    <textarea id="part-content" class="input font-mono text-sm" rows="15">${isEdit ? escapeHtml(part.content || '') : ''}</textarea>
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="label" for="part-price">Цена (₽)</label>
                        <input id="part-price" type="number" class="input" min="0" step="1" value="${isEdit ? Number(part.price || 0) : 0}">
                    </div>
                    <div>
                        <label class="label" for="part-order">Порядок</label>
                        <input id="part-order" type="number" class="input" min="0" step="1" value="${isEdit ? Number(part.order || 0) : 0}">
                    </div>
                </div>
                <label class="flex items-center gap-2 text-discord-text">
                    <input id="part-is-preview" type="checkbox" ${isEdit && part.is_preview ? 'checked' : ''}>
                    Превью-раздел
                </label>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" id="cancel-part-btn">Отмена</button>
            <button class="btn btn-primary" id="save-part-btn">
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
        title,
        description: descriptionInput?.value.trim() || '',
        content: contentInput?.value || '',
        price: Number.isNaN(parsedPrice) || parsedPrice < 0 ? 0 : parsedPrice,
        order: Number.isNaN(parsedOrder) || parsedOrder < 0 ? 0 : parsedOrder,
        is_preview: Boolean(previewInput?.checked),
    };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner"></div>';

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
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div id="course-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
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
