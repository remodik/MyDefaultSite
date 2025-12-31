import { adminApi } from '../api.js';
import { showToast, escapeHtml, formatDate } from '../utils.js';
import { confirmModal } from '../components/modal.js';

let users = [];
let resetRequests = [];
let activeTab = 'users';

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-white">
                    <i class="fas fa-shield-alt text-discord-accent mr-3"></i>
                    Админ панель
                </h1>
                <p class="text-discord-text mt-2">Управление пользователями и запросами</p>
            </div>
            
            <div class="flex gap-2 mb-6">
                <button class="btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}" id="tab-users">
                    <i class="fas fa-users"></i>
                    Пользователи
                </button>
                <button class="btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}" id="tab-requests">
                    <i class="fas fa-key"></i>
                    Запросы на сброс
                    <span id="requests-badge" class="hidden ml-2 px-2 py-0.5 bg-discord-red rounded-full text-xs">0</span>
                </button>
            </div>
            
            <div id="admin-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderUsers() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Пользователей нет</h3>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="bg-discord-light rounded-lg overflow-hidden">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Пользователь</th>
                        <th>Email</th>
                        <th>Роль</th>
                        <th>Дата регистрации</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full bg-discord-accent/20 flex items-center justify-center">
                                        <span class="text-discord-accent font-bold">${user.username.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <span class="text-white font-medium">${escapeHtml(user.username)}</span>
                                </div>
                            </td>
                            <td class="text-discord-text">
                                ${user.email ? escapeHtml(user.email) : '<span class="text-discord-text/50">Не указан</span>'}
                            </td>
                            <td>
                                <span class="tag ${user.role === 'admin' ? 'tag-primary' : 'bg-discord-lighter text-white'}">
                                    ${user.role === 'admin' ? 'Админ' : 'Пользователь'}
                                </span>
                            </td>
                            <td class="text-discord-text text-sm">
                                ${formatDate(user.created_at)}
                            </td>
                            <td>
                                <div class="flex gap-2">
                                    <button class="btn btn-secondary btn-sm toggle-role" data-id="${user.id}" data-role="${user.role}">
                                        <i class="fas fa-exchange-alt"></i>
                                        ${user.role === 'admin' ? 'Сделать пользователем' : 'Сделать админом'}
                                    </button>
                                    <button class="btn btn-warning btn-sm reset-password" data-id="${user.id}" data-username="${escapeHtml(user.username)}">
                                        <i class="fas fa-key"></i>
                                        Сброс пароля
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll('.toggle-role').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const currentRole = btn.dataset.role;
            const newRole = currentRole === 'admin' ? 'user' : 'admin';
            toggleUserRole(id, newRole);
        });
    });
    
    container.querySelectorAll('.reset-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const username = btn.dataset.username;
            resetUserPassword(id, username);
        });
    });
}

function renderResetRequests() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    
    if (resetRequests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle text-discord-green"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Нет запросов на сброс</h3>
                <p class="text-discord-text mt-2">Все запросы обработаны</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="space-y-4">
            ${resetRequests.map(req => `
                <div class="bg-discord-light rounded-lg p-6 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-discord-yellow/20 flex items-center justify-center">
                            <i class="fas fa-key text-discord-yellow"></i>
                        </div>
                        <div>
                            <p class="text-white font-semibold">${escapeHtml(req.username)}</p>
                            <p class="text-discord-text text-sm">
                                Запрос от ${formatDate(req.requested_at)}
                            </p>
                            <p class="text-discord-text/70 text-xs mt-1">
                                Пользователь без email запросил сброс пароля
                            </p>
                        </div>
                    </div>
                    <button class="btn btn-success approve-reset" data-id="${req.user_id}" data-username="${escapeHtml(req.username)}">
                        <i class="fas fa-check"></i>
                        Сбросить на qwerty123
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.approve-reset').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const username = btn.dataset.username;
            approveResetRequest(id, username);
        });
    });
}

function updateRequestsBadge() {
    const badge = document.getElementById('requests-badge');
    if (badge) {
        if (resetRequests.length > 0) {
            badge.textContent = resetRequests.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function switchTab(tab) {
    activeTab = tab;
    
    const tabUsers = document.getElementById('tab-users');
    const tabRequests = document.getElementById('tab-requests');
    
    if (tabUsers) {
        tabUsers.className = `btn ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`;
    }
    if (tabRequests) {
        tabRequests.className = `btn ${tab === 'requests' ? 'btn-primary' : 'btn-secondary'}`;
    }
    
    if (tab === 'users') {
        renderUsers();
    } else {
        renderResetRequests();
    }
}

async function toggleUserRole(userId, newRole) {
    try {
        await adminApi.updateUserRole(userId, newRole);
        showToast('Роль изменена', 'success');
        await loadUsers();
    } catch (error) {
        showToast(error.message || 'Ошибка изменения роли', 'error');
    }
}

async function resetUserPassword(userId, username) {
    confirmModal(`Сбросить пароль пользователя ${username} на "qwerty123"?`, async () => {
        try {
            await adminApi.resetUserPassword(userId);
            showToast('Пароль сброшен на qwerty123', 'success');
        } catch (error) {
            showToast(error.message || 'Ошибка сброса пароля', 'error');
        }
    });
}

async function approveResetRequest(userId, username) {
    confirmModal(`Сбросить пароль пользователя ${username} на "qwerty123"?`, async () => {
        try {
            await adminApi.resetUserPassword(userId);
            showToast('Пароль сброшен', 'success');
            await loadResetRequests();
        } catch (error) {
            showToast(error.message || 'Ошибка сброса пароля', 'error');
        }
    });
}

async function loadUsers() {
    try {
        users = await adminApi.getUsers();
        if (activeTab === 'users') {
            renderUsers();
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadResetRequests() {
    try {
        resetRequests = await adminApi.getResetRequests();
        updateRequestsBadge();
        if (activeTab === 'requests') {
            renderResetRequests();
        }
    } catch (error) {
        console.error('Error loading reset requests:', error);
    }
}

export async function mount() {
    activeTab = 'users';

    await Promise.all([
        loadUsers(),
        loadResetRequests(),
    ]);

    const tabUsers = document.getElementById('tab-users');
    const tabRequests = document.getElementById('tab-requests');
    
    if (tabUsers) {
        tabUsers.addEventListener('click', () => switchTab('users'));
    }
    if (tabRequests) {
        tabRequests.addEventListener('click', () => switchTab('requests'));
    }

    renderUsers();
}

export function unmount() {
    users = [];
    resetRequests = [];
    activeTab = 'users';
}