import { servicesApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { showToast, escapeHtml } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { t } from '../i18n.js';

if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });
}

let services = [];

export function render() {
    return `
        <div class="v1-doc">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// services.ts</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-briefcase v1-page-title-icon"></i>${escapeHtml(t('page_services_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_services_sub'))}</p>
                </div>
                ${isAdmin() ? `
                    <button class="v1-btn v1-btn-primary" id="add-service-btn" data-testid="add-service-btn">
                        <i class="fas fa-plus"></i>
                        ${escapeHtml(t('page_services_add'))}
                    </button>
                ` : ''}
            </div>

            <div id="services-content">
                <div class="v1-loading">${escapeHtml(t('loading'))}</div>
            </div>
        </div>
    `;
}

function renderServices() {
    const container = document.getElementById('services-content');
    if (!container) return;
    
    if (services.length === 0) {
        container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-briefcase v1-empty-icon"></i>
                <div class="v1-empty-h">${escapeHtml(t('page_services_empty_h'))}</div>
                <p>${escapeHtml(t('page_services_empty_d'))}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="v1-card-grid">
            ${services.map(service => `
                <article class="v1-scard fade-in" data-service-id="${service.id}">
                    <div class="v1-scard-head">
                        <h3 class="v1-scard-title">${escapeHtml(service.name)}</h3>
                        ${isAdmin() ? `
                            <div class="v1-scard-actions">
                                <button class="v1-icon-btn edit-service" data-id="${service.id}" title="${escapeHtml(t('common_edit') || 'Edit')}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="v1-icon-btn danger delete-service" data-id="${service.id}" title="${escapeHtml(t('common_delete') || 'Delete')}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <div class="v1-scard-desc markdown-content">${marked.parse(service.description)}</div>

                    <div class="v1-scard-meta">
                        <div>
                            <span class="v1-meta-l">${escapeHtml(t('svc_price'))}</span>
                            <span class="v1-scard-price">${escapeHtml(service.price)}</span>
                        </div>
                        <div>
                            <span class="v1-meta-l">${escapeHtml(t('svc_term'))}</span>
                            <span class="v1-meta-v">${escapeHtml(service.estimated_time)}</span>
                        </div>
                    </div>

                    <div class="v1-scard-block">
                        <span class="v1-meta-l">${escapeHtml(t('svc_tech'))}</span>
                        <div class="v1-svc-tags">
                            ${service.frameworks.split(',').map(fw => `
                                <span class="v1-chip">${escapeHtml(fw.trim())}</span>
                            `).join('')}
                        </div>
                    </div>

                    <div class="v1-scard-block">
                        <span class="v1-meta-l">${escapeHtml(t('svc_pay'))}</span>
                        <span class="v1-meta-v">${escapeHtml(service.payment_methods)}</span>
                    </div>
                </article>
            `).join('')}
        </div>
    `;

    if (isAdmin()) {
        container.querySelectorAll('.edit-service').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const service = services.find(s => s.id === id);
                if (service) showServiceModal(service);
            });
        });
        
        container.querySelectorAll('.delete-service').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                deleteService(id);
            });
        });
    }
}

function showServiceModal(service = null) {
    const isEdit = !!service;
    
    showModal({
        title: isEdit ? t('svc_modal_edit') : t('svc_modal_new'),
        content: `
            <form id="service-form" class="v1-form">
                <div class="v1-field">
                    <label class="v1-label" for="service-name">${escapeHtml(t('svc_name'))}</label>
                    <input type="text" id="service-name" class="v1-input" value="${isEdit ? escapeHtml(service.name) : ''}" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="service-description">${escapeHtml(t('svc_desc'))}</label>
                    <textarea id="service-description" class="v1-input" rows="6" required>${isEdit ? escapeHtml(service.description) : ''}</textarea>
                </div>
                <div class="v1-form-row">
                    <div class="v1-field">
                        <label class="v1-label" for="service-price">${escapeHtml(t('svc_price'))}</label>
                        <input type="text" id="service-price" class="v1-input" value="${isEdit ? escapeHtml(service.price) : ''}" placeholder="от 1000 ₽" required>
                    </div>
                    <div class="v1-field">
                        <label class="v1-label" for="service-time">${escapeHtml(t('svc_term'))}</label>
                        <input type="text" id="service-time" class="v1-input" value="${isEdit ? escapeHtml(service.estimated_time) : ''}" placeholder="1-3 дня" required>
                    </div>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="service-frameworks">${escapeHtml(t('svc_tech'))}</label>
                    <input type="text" id="service-frameworks" class="v1-input" value="${isEdit ? escapeHtml(service.frameworks) : ''}" placeholder="Python, JavaScript, React" required>
                </div>
                <div class="v1-field">
                    <label class="v1-label" for="service-payment">${escapeHtml(t('svc_pay'))}</label>
                    <input type="text" id="service-payment" class="v1-input" value="${isEdit ? escapeHtml(service.payment_methods) : ''}" placeholder="Qiwi, СБП, Крипта" required>
                </div>
            </form>
        `,
        footer: `
            <button class="v1-btn" data-close>${escapeHtml(t('common_cancel'))}</button>
            <button class="v1-btn v1-btn-primary" id="save-service-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? escapeHtml(t('common_save')) : escapeHtml(t('common_create'))}
            </button>
        `,
        size: 'lg',
    });
    
    setTimeout(() => {
        const closeBtn = document.querySelector('[data-close]');
        const saveBtn = document.getElementById('save-service-btn');
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (saveBtn) saveBtn.addEventListener('click', () => saveService(service?.id));
    }, 0);
}

async function saveService(id = null) {
    const name = document.getElementById('service-name').value.trim();
    const description = document.getElementById('service-description').value.trim();
    const price = document.getElementById('service-price').value.trim();
    const estimated_time = document.getElementById('service-time').value.trim();
    const frameworks = document.getElementById('service-frameworks').value.trim();
    const payment_methods = document.getElementById('service-payment').value.trim();
    
    if (!name || !description || !price || !estimated_time || !frameworks || !payment_methods) {
        showToast(t('common_required_fields'), 'error');
        return;
    }

    const data = { name, description, price, estimated_time, frameworks, payment_methods };

    try {
        if (id) {
            await servicesApi.update(id, data);
            showToast(t('svc_updated'), 'success');
        } else {
            await servicesApi.create(data);
            showToast(t('svc_created'), 'success');
        }
        closeModal();
        await loadServices();
    } catch (error) {
        showToast(error.message || t('common_save_error'), 'error');
    }
}

async function deleteService(id) {
    confirmModal(t('svc_confirm_delete'), async () => {
        try {
            await servicesApi.delete(id);
            showToast(t('svc_deleted'), 'success');
            await loadServices();
        } catch (error) {
            showToast(error.message || t('common_delete_error'), 'error');
        }
    });
}

async function loadServices() {
    try {
        services = await servicesApi.getAll();
        renderServices();
    } catch (error) {
        const container = document.getElementById('services-content');
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

export function mount() {
    loadServices();
    
    const addBtn = document.getElementById('add-service-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => showServiceModal());
    }
}

export function unmount() {
    services = [];
}
