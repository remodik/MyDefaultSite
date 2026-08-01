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
        <div class="v1-actions v1-actions-between ${containerClass}">
            <div>
                ${prev ? `
                    <button class="v1-btn v1-btn-sm reader-nav-btn" data-part-id="${escapeHtml(prev.id)}">
                        ← ${escapeHtml(prev.title)}
                    </button>
                ` : ''}
            </div>
            <div>
                ${next ? `
                    <button class="v1-btn v1-btn-sm reader-nav-btn" data-part-id="${escapeHtml(next.id)}">
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
            <div class="v1-breadcrumb-inline">
                <a href="/courses" class="v1-link">Курсы</a>
                <span>/</span>
                <a href="/courses/${escapeHtml(course.id)}" class="v1-link">${escapeHtml(course.title)}</a>
                <span>/</span>
                <span>${escapeHtml(part.title)}</span>
            </div>

            ${renderNavButtons(prev, next, 'v1-reader-nav')}

            <div class="v1-reader-heading">
                <div class="v1-actions">
                    <h1 class="v1-page-title">${escapeHtml(part.title)}</h1>
                    ${part.is_preview ? '<span class="v1-badge v1-badge-info">Превью</span>' : ''}
                </div>
                <p class="v1-page-sub">${escapeHtml(part.description || '')}</p>
            </div>

            <div class="markdown-content v1-card v1-markdown-card" id="reader-markdown-content">
                ${renderMarkdown(part.content || '')}
            </div>

            ${renderNavButtons(prev, next, 'v1-reader-nav')}
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
        <div class="v1-empty">
            <i class="fas fa-exclamation-circle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
            <div class="v1-empty-h">${escapeHtml(message)}</div>
            <button class="v1-btn v1-btn-primary" style="margin-top:var(--v1-space-4)" id="reader-back-course-btn">← Вернуться к курсу</button>
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
        <div class="v1-empty">
            <i class="fas fa-lock v1-empty-icon" style="color:var(--v1-amber)" aria-hidden="true"></i>
            <div class="v1-empty-h">Нет доступа</div>
            <p>Для просмотра этого раздела необходима покупка</p>
            <div class="v1-actions" style="justify-content:center;margin-top:var(--v1-space-5)">
                ${partPrice > 0 ? `
                    <button class="v1-btn v1-btn-primary" id="reader-buy-part-btn">
                        Купить раздел за ${formatPrice(partPrice)}
                    </button>
                ` : ''}
                <button class="v1-btn v1-btn-primary" id="reader-buy-course-btn">
                    Купить курс целиком за ${formatPrice(course.price)}
                </button>
                <button class="v1-btn" id="reader-back-btn">
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
            <div class="v1-vstack">
                <p class="v1-muted">Переведите <strong>${formatPrice(sbp.amount)}</strong> на ${escapeHtml(sbp.phone)} (${escapeHtml(sbp.bank)}) с комментарием:</p>
                <div class="v1-code-box">
                    <code>${escapeHtml(sbp.comment)}</code>
                </div>
                <p class="v1-muted">Получатель: ${escapeHtml(sbp.recipient)}</p>
            </div>
        `,
        footer: `
            <button class="v1-btn" id="reader-close-sbp-btn">Закрыть</button>
            <button class="v1-btn v1-btn-primary" id="reader-copy-sbp-btn" data-comment="${escapeHtml(sbp.comment)}">
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
        await router.navigate('/login');
        return;
    }

    const initialText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.textContent = 'Загрузка…';
    }

    try {
        const response = await coursesApi.purchasePart(currentCourseId, currentPartId);
        if (response?.confirmation_url) {
            showToast('Переходим к оплате…', 'info');
            window.location.href = response.confirmation_url;
            return;
        }
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
        <div class="v1-doc">
            <div id="reader-content">
                <div class="v1-loading">Загрузка…</div>
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
