import { projectsApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { showToast, escapeHtml, formatDate } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { t } from '../i18n.js';

let projects = [];

export function render() {
    return `
        <div class="v1-doc">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// projects.json</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-folder v1-page-title-icon" aria-hidden="true"></i>${escapeHtml(t('page_projects_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_projects_sub'))}</p>
                </div>
                ${isAdmin() ? `
                    <button class="v1-btn v1-btn-primary" id="add-project-btn" data-testid="add-project-btn">
                        <i class="fas fa-plus"></i>
                        ${escapeHtml(t('page_projects_add'))}
                    </button>
                ` : ''}
            </div>
            
            <div id="projects-content">
                <div class="v1-loading">${escapeHtml(t('loading'))}</div>
            </div>
        </div>
    `;
}

function renderProjects() {
    const container = document.getElementById('projects-content');
    if (!container) return;
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-folder-open v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">${escapeHtml(t('page_projects_empty_h'))}</div>
                <p>${escapeHtml(t('page_projects_empty_d'))}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="v1-card-grid">
            ${projects.map(project => `
                <article class="v1-prj fade-in" data-project-id="${project.id}">
                    <div class="v1-prj-head">
                        <span class="v1-prj-tag"><i class="fas fa-code" aria-hidden="true"></i> JSON</span>
                        <span class="v1-prj-hash">${escapeHtml(formatDate(project.created_at))}</span>
                    </div>
                    <h3 class="v1-prj-title">${escapeHtml(project.name)}</h3>
                    <p class="v1-prj-desc">${escapeHtml(project.description) || escapeHtml(t('prj_no_desc'))}</p>
                    <div class="v1-card-actions">
                        <a href="/projects/${project.id}" class="v1-btn v1-btn-primary v1-btn-sm">
                            <i class="fas fa-eye"></i>${escapeHtml(t('open'))}
                        </a>
                        ${isAdmin() ? `
                            <div class="v1-actions">
                                <button class="v1-icon-btn edit-project" data-id="${project.id}" title="${escapeHtml(t('common_edit') || 'Edit')}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="v1-icon-btn danger delete-project" data-id="${project.id}" title="${escapeHtml(t('common_delete') || 'Delete')}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;

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
        title: isEdit ? t('prj_modal_edit') : t('prj_modal_new'),
        content: `
            <form id="project-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label" for="project-name">${escapeHtml(t('svc_name'))}</label>
                    <input type="text" id="project-name" class="v1-input" value="${isEdit ? escapeHtml(project.name) : ''}" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="project-description">${escapeHtml(t('svc_desc'))}</label>
                    <textarea id="project-description" class="v1-input" rows="4">${isEdit ? escapeHtml(project.description) : ''}</textarea>
                </div>
            </form>
        `,
        footer: `
            <button class="v1-btn" data-close>${escapeHtml(t('common_cancel'))}</button>
            <button class="v1-btn v1-btn-primary" id="save-project-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? escapeHtml(t('common_save')) : escapeHtml(t('common_create'))}
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
        showToast(t('prj_name_required'), 'error');
        return;
    }

    try {
        if (id) {
            await projectsApi.update(id, { name, description });
            showToast(t('prj_updated'), 'success');
        } else {
            await projectsApi.create(name, description);
            showToast(t('prj_created'), 'success');
        }
        closeModal();
        await loadProjects();
    } catch (error) {
        showToast(error.message || t('common_save_error'), 'error');
    }
}

async function deleteProject(id) {
    confirmModal(t('prj_confirm_delete'), async () => {
        try {
            await projectsApi.delete(id);
            showToast(t('prj_deleted'), 'success');
            await loadProjects();
        } catch (error) {
            showToast(error.message || t('common_delete_error'), 'error');
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
                <div class="v1-empty">
                    <i class="fas fa-exclamation-triangle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
                    <div class="v1-empty-h">${escapeHtml(t('common_load_error'))}</div>
                    <p>${escapeHtml(error.message)}</p>
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
