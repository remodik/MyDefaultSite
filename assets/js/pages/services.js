// Services page

import { servicesApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { showToast, escapeHtml } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';

let services = [];

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-briefcase text-discord-accent mr-3"></i>
                        Услуги
                    </h1>
                    <p class="text-discord-text mt-2">Услуги которые я предоставляю</p>
                </div>
                ${isAdmin() ? `
                    <button class="btn btn-primary" id="add-service-btn" data-testid="add-service-btn">
                        <i class="fas fa-plus"></i>
                        Добавить услугу
                    </button>
                ` : ''}
            </div>
            
            <div id="services-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderServices() {
    const container = document.getElementById('services-content');
    if (!container) return;
    
    if (services.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-briefcase"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Услуг пока нет</h3>
                <p class="text-discord-text mt-2">Скоро здесь появятся доступные услуги</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="grid md:grid-cols-2 gap-6">
            ${services.map(service => `
                <div class="service-card fade-in" data-service-id="${service.id}">
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-xl font-bold text-white">${escapeHtml(service.name)}</h3>
                        ${isAdmin() ? `
                            <div class="flex gap-2">
                                <button class="btn btn-secondary btn-sm edit-service" data-id="${service.id}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-danger btn-sm delete-service" data-id="${service.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    
                    <p class="text-discord-text mb-4">${escapeHtml(service.description)}</p>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <span class="text-discord-text text-sm">Цена</span>
                            <p class="text-discord-green font-bold text-lg">${escapeHtml(service.price)}</p>
                        </div>
                        <div>
                            <span class="text-discord-text text-sm">Срок</span>
                            <p class="text-white font-semibold">${escapeHtml(service.estimated_time)}</p>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <span class="text-discord-text text-sm">Технологии</span>
                        <div class="skills-container mt-2">
                            ${service.frameworks.split(',').map(fw => `
                                <span class="tag tag-primary">${escapeHtml(fw.trim())}</span>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div>
                        <span class="text-discord-text text-sm">Способы оплаты</span>
                        <p class="text-white mt-1">${escapeHtml(service.payment_methods)}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Event listeners for admin actions
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
        title: isEdit ? 'Редактировать услугу' : 'Новая услуга',
        content: `
            <form id="service-form" class="space-y-4">
                <div>
                    <label class="label" for="service-name">Название</label>
                    <input type="text" id="service-name" class="input" value="${isEdit ? escapeHtml(service.name) : ''}" required>
                </div>
                <div>
                    <label class="label" for="service-description">Описание</label>
                    <textarea id="service-description" class="input" rows="3" required>${isEdit ? escapeHtml(service.description) : ''}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="label" for="service-price">Цена</label>
                        <input type="text" id="service-price" class="input" value="${isEdit ? escapeHtml(service.price) : ''}" placeholder="от 1000 ₽" required>
                    </div>
                    <div>
                        <label class="label" for="service-time">Срок</label>
                        <input type="text" id="service-time" class="input" value="${isEdit ? escapeHtml(service.estimated_time) : ''}" placeholder="1-3 дня" required>
                    </div>
                </div>
                <div>
                    <label class="label" for="service-frameworks">Технологии (через запятую)</label>
                    <input type="text" id="service-frameworks" class="input" value="${isEdit ? escapeHtml(service.frameworks) : ''}" placeholder="Python, JavaScript, React" required>
                </div>
                <div>
                    <label class="label" for="service-payment">Способы оплаты</label>
                    <input type="text" id="service-payment" class="input" value="${isEdit ? escapeHtml(service.payment_methods) : ''}" placeholder="Qiwi, СБП, Крипта" required>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" data-close>Отмена</button>
            <button class="btn btn-primary" id="save-service-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? 'Сохранить' : 'Создать'}
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
        showToast('Заполните все поля', 'error');
        return;
    }
    
    const data = { name, description, price, estimated_time, frameworks, payment_methods };
    
    try {
        if (id) {
            await servicesApi.update(id, data);
            showToast('Услуга обновлена', 'success');
        } else {
            await servicesApi.create(data);
            showToast('Услуга создана', 'success');
        }
        closeModal();
        loadServices();
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения', 'error');
    }
}

async function deleteService(id) {
    confirmModal('Удалить эту услугу?', async () => {
        try {
            await servicesApi.delete(id);
            showToast('Услуга удалена', 'success');
            loadServices();
        } catch (error) {
            showToast(error.message || 'Ошибка удаления', 'error');
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
    loadServices();
    
    const addBtn = document.getElementById('add-service-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => showServiceModal());
    }
}

export function unmount() {
    services = [];
}