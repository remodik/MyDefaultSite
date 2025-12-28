// Projects page

import { projectsApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml, formatDate } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';

let projects = [];

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-folder text-discord-accent mr-3"></i>
                        Проекты
                    </h1>
                    <p class="text-discord-text mt-2">Мои проекты и разработки</p>
                </div>
                ${isAdmin() ? `
                    <button class="btn btn-primary" id="add-project-btn" data-testid="add-project-btn">
                        <i class="fas fa-plus"></i>
                        Новый проект
                    </button>
                ` : ''}
            </div>
            
            <div id="projects-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderProjects() {
    const container = document.getElementById('projects-content');
    if (!container) return;
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Проектов пока нет</h3>
                <p class="text-discord-text mt-2">Скоро здесь появятся интересные проекты</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${projects.map(project => `
                <div class="project-card fade-in" data-project-id="${project.id}">
                    <div class="p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-12 h-12 bg-discord-accent/20 rounded-lg flex items-center justify-center">
                                <i class="fas fa-code text-discord-accent text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="text-lg font-bold text-white truncate">${escapeHtml(project.name)}</h3>
                                <p class="text-discord-text text-sm">${formatDate(project.created_at)}</p>
                            </div>
                        </div>
                        
                        <p class="text-discord-text text-sm line-clamp-2 mb-4">
                            ${escapeHtml(project.description) || 'Нет описания'}
                        </p>
                        
                        <div class="flex justify-between items-center">
                            <a href="/projects/${project.id}" class="btn btn-primary btn-sm">
                                <i class="fas fa-eye"></i>
                                Открыть
                            </a>
                            
                            ${isAdmin() ? `
                                <div class="flex gap-2">
                                    <button class="btn btn-secondary btn-sm edit-project" data-id="${project.id}">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm delete-project" data-id="${project.id}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Event listeners
    if (isAdmin()) {
        container.querySelectorAll('.edit-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const project = projects.find(p => p.id === id);
                if (project) showProjectModal(project);
            });
        });
        
        container.querySelectorAll('.delete-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                deleteProject(id);
            });
        });
    }
}

function showProjectModal(project = null) {
    const isEdit = !!project;
    
    showModal({
        title: isEdit ? 'Редактировать проект' : 'Новый проект',
        content: `
            <form id="project-form" class="space-y-4">
                <div>
                    <label class="label" for="project-name">Название</label>
                    <input type="text" id="project-name" class="input" value="${isEdit ? escapeHtml(project.name) : ''}" required>
                </div>
                <div>
                    <label class="label" for="project-description">Описание</label>
                    <textarea id="project-description" class="input" rows="4">${isEdit ? escapeHtml(project.description) : ''}</textarea>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" data-close>Отмена</button>
            <button class="btn btn-primary" id="save-project-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? 'Сохранить' : 'Создать'}
            </button>
        `,
    });
    
    setTimeout(() => {
        const closeBtn = document.querySelector('[data-close]');
        const saveBtn = document.getElementById('save-project-btn');
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (saveBtn) saveBtn.addEventListener('click', () => saveProject(project?.id));
    }, 0);
}

async function saveProject(id = null) {
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-description').value.trim();
    
    if (!name) {
        showToast('Введите название проекта', 'error');
        return;
    }
    
    try {
        if (id) {
            await projectsApi.update(id, { name, description });
            showToast('Проект обновлён', 'success');
        } else {
            await projectsApi.create(name, description);
            showToast('Проект создан', 'success');
        }
        closeModal();
        loadProjects();
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения', 'error');
    }
}

async function deleteProject(id) {
    confirmModal('Удалить этот проект и все его файлы?', async () => {
        try {
            await projectsApi.delete(id);
            showToast('Проект удалён', 'success');
            loadProjects();
        } catch (error) {
            showToast(error.message || 'Ошибка удаления', 'error');
        }
    });
}

async function loadProjects() {
    try {
        projects = await projectsApi.getAll();
        renderProjects();
    } catch (error) {
        const container = document.getElementById('projects-content');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-discord-red"></i>
                    <h3 class="text-xl font-semibold text-white mt-4">Ошибка загрузки</h3>
                    <p class="text-discord-text mt-2">${error.message}</p>
                </div>
            `;
        }
    }
}

export function mount() {
    loadProjects();
    
    const addBtn = document.getElementById('add-project-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => showProjectModal());
    }
}

export function unmount() {
    projects = [];
}