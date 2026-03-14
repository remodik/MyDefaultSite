import { coursesApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';

let courses = [];

function formatPrice(price) {
    const amount = Number(price || 0);
    if (amount === 0) {
        return '<span class="text-discord-green font-semibold">Бесплатно</span>';
    }
    return `<span class="text-white font-semibold">${amount.toLocaleString('ru-RU')} ₽</span>`;
}

function renderCover(course) {
    if (course.cover_url) {
        return `
            <div class="h-40 rounded-lg mb-4 bg-cover bg-center border border-discord-lighter/40"
                 style="background-image: url('${escapeHtml(course.cover_url)}');"></div>
        `;
    }

    return `
        <div class="h-40 rounded-lg mb-4 bg-gradient-to-br from-discord-accent/40 to-discord-dark border border-discord-lighter/40 flex items-center justify-center">
            <i class="fas fa-graduation-cap text-4xl text-discord-text/70"></i>
        </div>
    `;
}

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-graduation-cap text-discord-accent mr-3"></i>
                        Курсы
                    </h1>
                    <p class="text-discord-text mt-2">Каталог доступных курсов</p>
                </div>
                ${isAdmin() ? `
                    <button class="btn btn-primary" id="add-course-btn">
                        <i class="fas fa-plus"></i>
                        Новый курс
                    </button>
                ` : ''}
            </div>

            <div id="courses-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderCourses() {
    const container = document.getElementById('courses-content');
    if (!container) return;

    if (!courses.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-graduation-cap"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Курсы не найдены</h3>
                <p class="text-discord-text mt-2">Список курсов пока пуст</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${courses.map(course => `
                <div
                    class="course-card bg-discord-light rounded-xl border border-discord-lighter/40 hover:-translate-y-1 hover:border-discord-accent/50 transition-all duration-200 p-5 cursor-pointer fade-in"
                    data-course-id="${escapeHtml(course.id)}"
                >
                    ${renderCover(course)}

                    <div class="flex items-start justify-between gap-3 mb-2">
                        <h3 class="text-white font-bold text-lg leading-tight">${escapeHtml(course.title)}</h3>
                        ${isAdmin() && !course.is_published ? '<span class="tag tag-warning">Черновик</span>' : ''}
                    </div>

                    <p class="text-discord-text text-sm line-clamp-2 min-h-[40px]">${escapeHtml(course.short_description || 'Без описания')}</p>

                    <div class="mt-4 flex items-center justify-between gap-2">
                        <div>${formatPrice(course.price)}</div>
                        <button class="btn btn-outline btn-sm course-open-btn" data-course-id="${escapeHtml(course.id)}">
                            Подробнее →
                        </button>
                    </div>

                    ${isAdmin() ? `
                        <div class="flex gap-2 mt-4 pt-4 border-t border-discord-lighter/40">
                            <button class="btn btn-secondary btn-sm edit-course" data-course-id="${escapeHtml(course.id)}">
                                <i class="fas fa-edit"></i>
                                Редактировать
                            </button>
                            <button class="btn btn-danger btn-sm delete-course" data-course-id="${escapeHtml(course.id)}">
                                <i class="fas fa-trash"></i>
                                Удалить
                            </button>
                        </div>
                    ` : ''}
                </div>
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
        <div class="flex justify-center py-12">
            <div class="spinner spinner-lg"></div>
        </div>
    `;

    try {
        courses = isAdmin() ? await coursesApi.getAllAdmin() : await coursesApi.getAll();
        renderCourses();
    } catch (error) {
        showToast(error.message || 'Ошибка загрузки курсов', 'error');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle text-discord-red"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Ошибка загрузки</h3>
                <p class="text-discord-text mt-2">${escapeHtml(error.message || 'Не удалось загрузить список курсов')}</p>
            </div>
        `;
    }
}

function showCourseModal(course = null) {
    const isEdit = Boolean(course);

    showModal({
        title: isEdit ? 'Редактировать курс' : 'Новый курс',
        content: `
            <form id="course-form" class="space-y-4">
                <div>
                    <label class="label" for="course-title">Название</label>
                    <input id="course-title" type="text" class="input" value="${isEdit ? escapeHtml(course.title) : ''}" maxlength="255" required>
                </div>
                <div>
                    <label class="label" for="course-short-description">Короткое описание</label>
                    <input id="course-short-description" type="text" class="input" value="${isEdit ? escapeHtml(course.short_description || '') : ''}" maxlength="512">
                </div>
                <div>
                    <label class="label" for="course-description">Описание (Markdown)</label>
                    <textarea id="course-description" class="input" rows="8" maxlength="50000">${isEdit ? escapeHtml(course.description || '') : ''}</textarea>
                </div>
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="label" for="course-price">Цена (₽)</label>
                        <input id="course-price" type="number" class="input" min="0" step="1" value="${isEdit ? Number(course.price || 0) : 0}">
                    </div>
                    <div>
                        <label class="label" for="course-cover-url">URL обложки</label>
                        <input id="course-cover-url" type="text" class="input" maxlength="512" value="${isEdit ? escapeHtml(course.cover_url || '') : ''}">
                    </div>
                </div>
                <label class="flex items-center gap-2 text-discord-text">
                    <input id="course-is-published" type="checkbox" ${isEdit && course.is_published ? 'checked' : ''}>
                    Опубликован
                </label>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" id="cancel-course-btn">Отмена</button>
            <button class="btn btn-primary" id="save-course-btn">
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
    saveBtn.innerHTML = '<div class="spinner"></div>';

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
