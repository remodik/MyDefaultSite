import { coursesApi, resolveApiUrl } from '../api.js';
import { isAdmin } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, debounce } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { t } from '../i18n.js';

let courses = [];

function formatPrice(price) {
    const amount = Number(price || 0);
    if (amount === 0) {
        return `<span class="v1-price-free">${escapeHtml(t('price_free'))}</span>`;
    }
    return `<span class="v1-price-inline">${amount.toLocaleString('ru-RU')} ₽</span>`;
}

function renderCover(course) {
    if (course.cover_url) {
        return `
            <div class="course-card-cover-frame">
                <img
                    src="${escapeHtml(resolveApiUrl(course.cover_url))}"
                    alt="${escapeHtml(course.title)}"
                    class="course-card-cover-image"
                    referrerpolicy="no-referrer"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                >
                <div class="course-card-cover-fallback hidden">
                    <i class="fas fa-graduation-cap" aria-hidden="true"></i>
                </div>
            </div>
        `;
    }

    return `
        <div class="course-card-cover-frame course-card-cover-fallback">
            <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        </div>
    `;
}

export function render() {
    return `
        <div class="v1-doc">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// courses.md</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-graduation-cap v1-page-title-icon" aria-hidden="true"></i>${escapeHtml(t('page_courses_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_courses_sub'))}</p>
                </div>
                ${isAdmin() ? `
                    <button class="v1-btn v1-btn-primary" id="add-course-btn">
                        <i class="fas fa-plus"></i>
                        ${escapeHtml(t('page_projects_add'))}
                    </button>
                ` : ''}
            </div>

            <div id="courses-content">
                <div class="v1-loading">${escapeHtml(t('loading'))}</div>
            </div>
        </div>
    `;
}

function renderCourses() {
    const container = document.getElementById('courses-content');
    if (!container) return;

    if (!courses.length) {
        container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-graduation-cap v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">${escapeHtml(t('courses_empty'))}</div>
                <p>${escapeHtml(t('page_courses_sub'))}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="v1-card-grid">
            ${courses.map(course => `
                <article
                    class="course-card v1-scard fade-in"
                    data-course-id="${escapeHtml(course.id)}"
                >
                    ${renderCover(course)}

                    <div class="course-card-body">
                        <div class="v1-scard-head">
                            <h3 class="v1-scard-title">${escapeHtml(course.title)}</h3>
                            ${isAdmin() && !course.is_published ? `<span class="v1-badge v1-badge-warn">${escapeHtml(t('work_draft'))}</span>` : ''}
                        </div>

                        <p class="v1-scard-desc course-card-desc">${escapeHtml(course.short_description || t('work_no_desc'))}</p>

                        <div class="course-card-footer">
                            <div class="v1-card-actions">
                                <div>${formatPrice(course.price)}</div>
                                <button class="v1-btn v1-btn-sm course-open-btn" data-course-id="${escapeHtml(course.id)}">
                                    ${escapeHtml(t('learn_more'))} →
                                </button>
                            </div>

                            ${isAdmin() ? `
                                <div class="v1-card-actions v1-card-actions-admin">
                                    <button class="v1-btn v1-btn-sm edit-course" data-course-id="${escapeHtml(course.id)}">
                                        <i class="fas fa-edit"></i>
                                        ${escapeHtml(t('common_edit'))}
                                    </button>
                                    <button class="v1-btn v1-btn-danger v1-btn-sm delete-course" data-course-id="${escapeHtml(course.id)}">
                                        <i class="fas fa-trash"></i>
                                        Удалить
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </article>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.course-card').forEach((card) => {
        card.addEventListener('click', () => {
            const id = card.dataset.courseId;
            if (id) {
                router.navigate(`/courses/${id}`);
            }
        });
    });

    container.querySelectorAll('.course-open-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const id = button.dataset.courseId;
            if (id) {
                router.navigate(`/courses/${id}`);
            }
        });
    });

    if (isAdmin()) {
        container.querySelectorAll('.edit-course').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = button.dataset.courseId;
                const targetCourse = courses.find((item) => item.id === id);
                if (targetCourse) {
                    showCourseModal(targetCourse);
                }
            });
        });

        container.querySelectorAll('.delete-course').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const id = button.dataset.courseId;
                if (id) {
                    deleteCourse(id);
                }
            });
        });
    }
}

async function loadCourses() {
    const container = document.getElementById('courses-content');
    if (!container) return;

    container.innerHTML = `
        <div class="v1-loading">${escapeHtml(t('loading'))}</div>
    `;

    try {
        courses = isAdmin() ? await coursesApi.getAllAdmin() : await coursesApi.getAll();
        renderCourses();
    } catch (error) {
        showToast(error.message || 'Ошибка загрузки курсов', 'error');
        container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-exclamation-triangle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
                <div class="v1-empty-h">Ошибка загрузки</div>
                <p>${escapeHtml(error.message || 'Не удалось загрузить список курсов')}</p>
            </div>
        `;
    }
}

function showCourseModal(course = null) {
    const isEdit = Boolean(course);

    showModal({
        title: isEdit ? 'Редактировать курс' : 'Новый курс',
        content: `
            <form id="course-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label" for="course-title">Название</label>
                    <input id="course-title" type="text" class="v1-input" value="${isEdit ? escapeHtml(course.title) : ''}" maxlength="255" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="course-short-description">Краткое описание (для карточки)</label>
                    <textarea id="course-short-description" class="v1-input" rows="2" maxlength="512">${isEdit ? escapeHtml(course.short_description || '') : ''}</textarea>
                    <div class="v1-hint-row">
                        <span>Пара предложений для карточки. Полный текст курса — в поле ниже.</span>
                        <span id="short-description-counter"></span>
                    </div>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="course-description">Полное описание (Markdown)</label>
                    <textarea id="course-description" class="v1-input" rows="8" maxlength="50000">${isEdit ? escapeHtml(course.description || '') : ''}</textarea>
                    <p class="v1-muted">Здесь пишите длинный текст курса — поддерживается Markdown, до 50 000 символов.</p>
                </div>
                <div class="v1-form-row">
                    <div class="v1-field">
                        <label class="v1-label" for="course-price">Цена (₽)</label>
                        <input id="course-price" type="number" class="v1-input" min="0" step="1" value="${isEdit ? Number(course.price || 0) : 0}">
                    </div>
                    <div class="v1-field">
                        <label class="v1-label" for="course-cover-url">URL обложки</label>
                        <input id="course-cover-url" type="text" class="v1-input" maxlength="512" value="${isEdit ? escapeHtml(course.cover_url || '') : ''}" placeholder="https://...">
                        <div id="cover-preview-wrap" class="hidden">
                            <img id="cover-preview-img" alt="Предпросмотр обложки" referrerpolicy="no-referrer" class="course-card-cover-image" style="max-height:120px;width:auto;border-radius:8px;border:1px solid rgba(64,66,73,0.8);">
                            <p id="cover-preview-error" class="v1-msg error hidden">Не удалось загрузить изображение по этому URL (проверьте ссылку или защиту хостинга от hotlink).</p>
                        </div>
                    </div>
                </div>
                <label class="v1-check-row">
                    <input id="course-is-published" type="checkbox" ${isEdit && course.is_published ? 'checked' : ''}>
                    Опубликован
                </label>
            </form>
        `,
        footer: `
            <button class="v1-btn" id="cancel-course-btn">Отмена</button>
            <button class="v1-btn v1-btn-primary" id="save-course-btn">
                <i class="fas fa-save"></i>
                Сохранить
            </button>
        `,
        size: 'xl',
    });

    setTimeout(() => {
        const cancelBtn = document.getElementById('cancel-course-btn');
        const saveBtn = document.getElementById('save-course-btn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => saveCourse(course?.id || null));
        }

        const shortInput = document.getElementById('course-short-description');
        const counter = document.getElementById('short-description-counter');
        if (shortInput && counter) {
            const updateCounter = () => {
                counter.textContent = `${shortInput.value.length} / 512`;
            };
            shortInput.addEventListener('input', updateCounter);
            updateCounter();
        }

        const coverInput = document.getElementById('course-cover-url');
        const previewWrap = document.getElementById('cover-preview-wrap');
        const previewImg = document.getElementById('cover-preview-img');
        const previewError = document.getElementById('cover-preview-error');
        if (coverInput && previewWrap && previewImg && previewError) {
            const updatePreview = () => {
                const url = coverInput.value.trim();
                if (!url) {
                    previewWrap.classList.add('hidden');
                    return;
                }
                previewWrap.classList.remove('hidden');
                previewError.classList.add('hidden');
                previewImg.style.display = '';
                previewImg.src = resolveApiUrl(url);
            };
            previewImg.addEventListener('error', () => {
                previewImg.style.display = 'none';
                previewError.classList.remove('hidden');
            });
            previewImg.addEventListener('load', () => {
                previewImg.style.display = '';
                previewError.classList.add('hidden');
            });
            coverInput.addEventListener('input', debounce(updatePreview, 400));
            updatePreview();
        }
    }, 0);
}

async function saveCourse(courseId = null) {
    const saveBtn = document.getElementById('save-course-btn');
    if (!saveBtn) return;

    const initialContent = saveBtn.innerHTML;

    const titleInput = document.getElementById('course-title');
    const shortDescriptionInput = document.getElementById('course-short-description');
    const descriptionInput = document.getElementById('course-description');
    const priceInput = document.getElementById('course-price');
    const coverInput = document.getElementById('course-cover-url');
    const publishedInput = document.getElementById('course-is-published');

    const title = titleInput?.value.trim() || '';
    if (!title) {
        showToast('Введите название курса', 'error');
        return;
    }

    const parsedPrice = Number.parseInt(priceInput?.value || '0', 10);
    const data = {
        title,
        short_description: shortDescriptionInput?.value.trim() || '',
        description: descriptionInput?.value || '',
        price: Number.isNaN(parsedPrice) || parsedPrice < 0 ? 0 : parsedPrice,
        cover_url: (coverInput?.value || '').trim() || null,
        is_published: Boolean(publishedInput?.checked),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение…';

    try {
        if (courseId) {
            await coursesApi.update(courseId, data);
            showToast('Курс обновлён', 'success');
        } else {
            await coursesApi.create(data);
            showToast('Курс создан', 'success');
        }

        closeModal();
        await loadCourses();
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения курса', 'error');
    } finally {
        if (document.getElementById('save-course-btn')) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = initialContent;
        }
    }
}

async function deleteCourse(id) {
    confirmModal('Удалить курс и все его разделы?', async () => {
        try {
            await coursesApi.delete(id);
            showToast('Курс удалён', 'success');
            await loadCourses();
        } catch (error) {
            showToast(error.message || 'Ошибка удаления курса', 'error');
        }
    });
}

export async function mount() {
    await loadCourses();

    const addBtn = document.getElementById('add-course-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => showCourseModal());
    }
}

export function unmount() {
    courses = [];
}
