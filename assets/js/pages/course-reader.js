import { coursesApi } from '../api.js';
import { isAuthenticated } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, renderMarkdown } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';

let course = null;
let part = null;
let currentCourseId = null;
let currentPartId = null;

function formatPrice(amount) {
    return `${Number(amount || 0).toLocaleString('ru-RU')} ₽`;
}

function sortedParts() {
    return [...(course?.parts || [])].sort((a, b) => {
        const left = Number(a.order || 0);
        const right = Number(b.order || 0);
        return left - right;
    });
}

function getPrevNext(partId) {
    const parts = sortedParts();
    const index = parts.findIndex((item) => item.id === partId);

    return {
        prev: index > 0 ? parts[index - 1] : null,
        next: index >= 0 && index < parts.length - 1 ? parts[index + 1] : null,
    };
}

function renderNavButtons(prev, next, containerClass = '') {
    return `
        <div class="flex flex-wrap items-center justify-between gap-3 ${containerClass}">
            <div>
                ${prev ? `
                    <button class="btn btn-secondary btn-sm reader-nav-btn" data-part-id="${escapeHtml(prev.id)}">
                        ← ${escapeHtml(prev.title)}
                    </button>
                ` : ''}
            </div>
            <div>
                ${next ? `
                    <button class="btn btn-secondary btn-sm reader-nav-btn" data-part-id="${escapeHtml(next.id)}">
                        ${escapeHtml(next.title)} →
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function renderReader() {
    const container = document.getElementById('reader-content');
    if (!container || !course || !part) return;

    const { prev, next } = getPrevNext(part.id);

    container.innerHTML = `
        <div class="fade-in">
            <div class="text-discord-text text-sm mb-4">
                <a href="/courses" class="hover:text-white transition">Курсы</a>
                <span class="mx-2">/</span>
                <a href="/courses/${escapeHtml(course.id)}" class="hover:text-white transition">${escapeHtml(course.title)}</a>
                <span class="mx-2">/</span>
                <span class="text-white">${escapeHtml(part.title)}</span>
            </div>

            ${renderNavButtons(prev, next, 'mb-6')}

            <div class="mb-6">
                <div class="flex items-center gap-2 mb-2">
                    <h1 class="text-3xl font-bold text-white">${escapeHtml(part.title)}</h1>
                    ${part.is_preview ? '<span class="tag tag-primary">Превью</span>' : ''}
                </div>
                <p class="text-discord-text text-sm">${escapeHtml(part.description || '')}</p>
            </div>

            <div class="markdown-content bg-discord-light rounded-xl border border-discord-lighter/40 p-6" id="reader-markdown-content">
                ${renderMarkdown(part.content || '')}
            </div>

            ${renderNavButtons(prev, next, 'mt-8')}
        </div>
    `;

    container.querySelectorAll('.reader-nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const targetPartId = button.dataset.partId;
            if (targetPartId) {
                router.navigate(`/courses/${course.id}/parts/${targetPartId}`);
            }
        });
    });

    if (window.Prism) {
        Prism.highlightAll();
    }

    if (window.renderMathInElement) {
        const markdownContainer = document.getElementById('reader-markdown-content');
        if (markdownContainer) {
            renderMathInElement(markdownContainer, {
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

function renderNotFound(message = 'Раздел не найден') {
    const container = document.getElementById('reader-content');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-circle text-discord-red"></i>
            <h3 class="text-xl font-semibold text-white mt-4">${escapeHtml(message)}</h3>
            <button class="btn btn-primary mt-4" id="reader-back-course-btn">← Вернуться к курсу</button>
        </div>
    `;

    const backBtn = document.getElementById('reader-back-course-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentCourseId) {
                router.navigate(`/courses/${currentCourseId}`);
            } else {
                router.navigate('/courses');
            }
        });
    }
}

function renderNoAccessBlock() {
    const container = document.getElementById('reader-content');
    if (!container || !course) return;

    const fallbackPart = (course.parts || []).find((item) => item.id === currentPartId) || null;
    const partPrice = Number(fallbackPart?.price || 0);

    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-lock text-discord-yellow"></i>
            <h3 class="text-xl font-semibold text-white mt-4">Нет доступа</h3>
            <p class="text-discord-text mt-2">Для просмотра этого раздела необходима покупка</p>
            <div class="flex flex-wrap justify-center gap-3 mt-6">
                ${partPrice > 0 ? `
                    <button class="btn btn-success" id="reader-buy-part-btn">
                        Купить раздел за ${formatPrice(partPrice)}
                    </button>
                ` : ''}
                <button class="btn btn-primary" id="reader-buy-course-btn">
                    Купить курс целиком за ${formatPrice(course.price)}
                </button>
                <button class="btn btn-secondary" id="reader-back-btn">
                    ← Вернуться к курсу
                </button>
            </div>
        </div>
    `;

    const buyPartBtn = document.getElementById('reader-buy-part-btn');
    if (buyPartBtn) {
        buyPartBtn.addEventListener('click', () => handlePurchasePart(buyPartBtn));
    }

    const buyCourseBtn = document.getElementById('reader-buy-course-btn');
    if (buyCourseBtn) {
        buyCourseBtn.addEventListener('click', () => handlePurchaseCourse(buyCourseBtn));
    }

    const backBtn = document.getElementById('reader-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => router.navigate(`/courses/${course.id}`));
    }
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
            <button class="btn btn-secondary" id="reader-close-sbp-btn">Закрыть</button>
            <button class="btn btn-primary" id="reader-copy-sbp-btn" data-comment="${escapeHtml(sbp.comment)}">
                Скопировать комментарий
            </button>
        `,
        onClose: () => {
            if (onClosed) onClosed();
        },
    });

    setTimeout(() => {
        const closeBtn = document.getElementById('reader-close-sbp-btn');
        const copyBtn = document.getElementById('reader-copy-sbp-btn');

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

async function loadCourse(courseId) {
    try {
        course = await coursesApi.getById(courseId);
        return true;
    } catch (error) {
        showToast(error.message || 'Ошибка загрузки курса', 'error');
        renderNotFound('Курс не найден');
        return false;
    }
}

async function loadPartContent(courseId, partId) {
    try {
        part = await coursesApi.getPartContent(courseId, partId);
        renderReader();
    } catch (error) {
        const message = error.message || '';

        if (message === 'Требуется покупка') {
            renderNoAccessBlock();
            return;
        }

        if (message.includes('не найден')) {
            renderNotFound('Раздел не найден');
            return;
        }

        showToast(message || 'Ошибка загрузки раздела', 'error');
        renderNotFound('Ошибка загрузки раздела');
    }
}

async function refreshReader() {
    if (!currentCourseId || !currentPartId) return;

    const loaded = await loadCourse(currentCourseId);
    if (!loaded) return;

    await loadPartContent(currentCourseId, currentPartId);
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
                await refreshReader();
            });
        } else {
            await refreshReader();
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

async function handlePurchasePart(button) {
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
        const response = await coursesApi.purchasePart(currentCourseId, currentPartId);
        if (response?.sbp) {
            showSbpModal(response.sbp, async () => {
                await refreshReader();
            });
        } else {
            await refreshReader();
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

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div id="reader-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

export async function mount(params) {
    currentCourseId = params?.courseId || null;
    currentPartId = params?.partId || null;

    if (!currentCourseId || !currentPartId) {
        renderNotFound('Раздел не найден');
        return;
    }

    await refreshReader();
}

export function unmount() {
    course = null;
    part = null;
    currentCourseId = null;
    currentPartId = null;
}
