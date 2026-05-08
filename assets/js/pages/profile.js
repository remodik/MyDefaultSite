import { automuteApi, meApi, resolveApiUrl } from '../api.js';
import { applyUserAccentColor, escapeHtml, formatDateTime, showToast } from '../utils.js';

let profile = null;
let subscription = null;
let logs = null;
let activeTab = 'profile'; // 'profile' | 'automute'

function getInitialLetter(data) {
    const source = data?.display_name || data?.username || '?';
    return source.charAt(0).toUpperCase();
}

function renderAvatar(data) {
    if (data?.avatar_url) {
        const safeUrl = escapeHtml(resolveApiUrl(data.avatar_url));
        return `<img src="${safeUrl}" alt="Avatar" class="profile-avatar-image">`;
    }

    return `
        <div class="profile-avatar-fallback" aria-hidden="true">
            ${escapeHtml(getInitialLetter(data))}
        </div>
    `;
}

function renderTabs() {
    return `
        <div class="flex gap-2 mb-6 border-b border-discord-darkest">
            <button class="profile-tab-btn ${activeTab === 'profile' ? 'active' : ''}" data-tab="profile">
                <i class="fas fa-user mr-1"></i> Профиль
            </button>
            <button class="profile-tab-btn ${activeTab === 'automute' ? 'active' : ''}" data-tab="automute">
                <i class="fas fa-volume-mute mr-1"></i> AutoMute
            </button>
        </div>
    `;
}

function renderProfileTab() {
    if (!profile) return '<div class="flex justify-center py-12"><div class="spinner spinner-lg"></div></div>';

    const displayName = profile.display_name || profile.username;
    const hasBio = Boolean(profile.bio?.trim());
    const bio = hasBio ? profile.bio : '«Пользователь пока ничего не написал о себе»';
    const status = profile.status?.trim() ? profile.status : 'Не указан';

    return `
        <div class="profile-page-grid fade-in">
            <section class="profile-main-card">
                <div class="profile-avatar-wrap">
                    ${renderAvatar(profile)}
                </div>

                <div class="profile-main-meta">
                    <h1 class="profile-display-name">${escapeHtml(displayName)}</h1>
                    <p class="profile-username">@${escapeHtml(profile.username)}</p>

                    <div class="profile-badges-row">
                        <span class="tag tag-primary">
                            <i class="fas fa-circle mr-1"></i>${escapeHtml(status)}
                        </span>
                        <span class="tag">
                            <i class="fas fa-shield-halved mr-1"></i>Аккаунт активен
                        </span>
                    </div>
                </div>
            </section>

            <section class="profile-info-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-user mr-2 text-discord-accent"></i>
                    О себе
                </h2>
                <p class="profile-bio ${hasBio ? '' : 'is-placeholder'}">${escapeHtml(bio)}</p>
            </section>

            <section class="profile-info-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-gear mr-2 text-discord-accent"></i>
                    Настройки приватности
                </h2>
                <div class="profile-meta-row">
                    <span class="profile-meta-label">Личные сообщения</span>
                    <span class="profile-meta-value">
                        ${profile.privacy_dm === 'none' ? 'Никто' : 'Все'}
                    </span>
                </div>
                <a href="/settings" class="btn btn-primary btn-sm mt-4">
                    <i class="fas fa-pen"></i>
                    Редактировать профиль
                </a>
            </section>
        </div>
    `;
}

function renderSubscriptionStatusCard() {
    if (!subscription) {
        return `
            <div class="card p-4 mb-4">
                <p class="text-discord-text">
                    У вас нет подписки. <a href="/automute" class="text-discord-accent">Оформить</a>.
                </p>
            </div>
        `;
    }

    if (subscription.active) {
        const days = subscription.seconds_left ? Math.floor(subscription.seconds_left / 86400) : 0;
        const hours = subscription.seconds_left
            ? Math.floor((subscription.seconds_left % 86400) / 3600) : 0;
        return `
            <div class="card p-4 mb-4 border-l-4 border-discord-green">
                <div class="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h3 class="text-lg font-bold text-white">
                            <i class="fas fa-circle-check text-discord-green mr-2"></i>
                            Подписка активна
                        </h3>
                        <p class="text-discord-text mt-1">
                            Тариф: <span class="text-white font-semibold">${escapeHtml(subscription.plan || '?')}</span>
                            · истекает ${formatDateTime(subscription.expires_at)}
                            (осталось ${days}д ${hours}ч)
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-discord-text text-xs mb-1">Лицензионный ключ:</p>
                        <code class="text-white font-mono select-all">${escapeHtml(subscription.license_key || '—')}</code>
                    </div>
                </div>
            </div>
        `;
    }

    if (subscription.pending_purchase) {
        const p = subscription.pending_purchase;
        return `
            <div class="card p-4 mb-4 border-l-4 border-discord-yellow">
                <h3 class="text-lg font-bold text-white">
                    <i class="fas fa-hourglass-half text-discord-yellow mr-2"></i>
                    Покупка ожидает подтверждения
                </h3>
                <p class="text-discord-text mt-1">
                    Тариф ${escapeHtml(p.plan)} на ${p.amount} ₽,
                    комментарий <code class="text-white">${escapeHtml(p.sbp_comment || '')}</code>
                </p>
            </div>
        `;
    }

    return `
        <div class="card p-4 mb-4 border-l-4 border-discord-red">
            <p class="text-discord-text">
                Подписка истекла. <a href="/automute" class="text-discord-accent">Продлить</a>.
            </p>
        </div>
    `;
}

function renderLogsList() {
    if (!logs) {
        return '<div class="flex justify-center py-6"><div class="spinner"></div></div>';
    }
    if (!logs.items?.length) {
        return `
            <div class="card p-6 text-center">
                <i class="fas fa-list-alt text-3xl text-discord-text mb-2"></i>
                <p class="text-discord-text">Логов пока нет — мод ничего не отправлял.</p>
            </div>
        `;
    }

    return `
        <div class="card overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-discord-darkest">
                        <tr>
                            <th class="text-left px-3 py-2 text-discord-text">Время</th>
                            <th class="text-left px-3 py-2 text-discord-text">Игрок</th>
                            <th class="text-left px-3 py-2 text-discord-text">Категория</th>
                            <th class="text-left px-3 py-2 text-discord-text">Слово</th>
                            <th class="text-left px-3 py-2 text-discord-text">Сервер</th>
                            <th class="text-left px-3 py-2 text-discord-text">Скрин</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.items.map((log) => `
                            <tr class="border-t border-discord-darkest">
                                <td class="px-3 py-2 text-discord-text whitespace-nowrap">${formatDateTime(log.triggered_at)}</td>
                                <td class="px-3 py-2 text-white font-mono">${escapeHtml(log.player_name)}</td>
                                <td class="px-3 py-2 text-white">${escapeHtml(log.category_name)}</td>
                                <td class="px-3 py-2 text-discord-text">${escapeHtml(log.word || '')}</td>
                                <td class="px-3 py-2 text-discord-text">${escapeHtml(log.server_address || '—')}</td>
                                <td class="px-3 py-2">
                                    ${log.screenshot_url
                                        ? `<a href="${escapeHtml(resolveApiUrl(log.screenshot_url))}" target="_blank" class="text-discord-accent">📷</a>`
                                        : '<span class="text-discord-text">—</span>'}
                                </td>
                            </tr>
                            ${log.triggered_message ? `
                                <tr class="border-t border-discord-darkest bg-discord-darker">
                                    <td colspan="6" class="px-3 py-1 text-xs text-discord-text">
                                        <i class="fas fa-quote-right mr-1"></i>${escapeHtml(log.triggered_message)}
                                    </td>
                                </tr>
                            ` : ''}
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderAutomuteTab() {
    return `
        <div class="fade-in">
            ${renderSubscriptionStatusCard()}

            <h2 class="text-xl font-bold text-white mb-3 mt-6">
                <i class="fas fa-list-check text-discord-accent mr-2"></i>
                Логи нарушений
                <span class="text-sm font-normal text-discord-text ml-2">
                    (отправлены модом и хранятся на сервере)
                </span>
            </h2>
            ${renderLogsList()}
        </div>
    `;
}

function renderProfileContent() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    container.innerHTML = `
        ${renderTabs()}
        <div id="profile-tab-content">
            ${activeTab === 'profile' ? renderProfileTab() : renderAutomuteTab()}
        </div>
    `;

    container.querySelectorAll('.profile-tab-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            activeTab = btn.dataset.tab;
            if (activeTab === 'automute' && (!subscription || !logs)) {
                await loadAutomuteData();
            }
            renderProfileContent();
        });
    });
}

async function loadProfile() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    try {
        profile = await meApi.getProfile();
        applyUserAccentColor(profile?.accent_color || null);
        renderProfileContent();
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle text-discord-red"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Не удалось загрузить профиль</h3>
                <p class="text-discord-text mt-2">${escapeHtml(error.message || 'Ошибка запроса')}</p>
            </div>
        `;
        showToast(error.message || 'Ошибка загрузки профиля', 'error');
    }
}

async function loadAutomuteData() {
    try {
        subscription = await automuteApi.getMySubscription();
    } catch {
        subscription = null;
    }
    try {
        logs = await automuteApi.getMyLogs(100, 0);
    } catch {
        logs = { items: [], total: 0 };
    }
}

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-5xl">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-user-circle text-discord-accent mr-3"></i>
                        Профиль
                    </h1>
                    <p class="text-discord-text mt-2">Публичная карточка вашего аккаунта</p>
                </div>
                <a href="/settings" class="btn btn-secondary btn-sm">
                    <i class="fas fa-sliders"></i>
                    Настройки
                </a>
            </div>

            <div id="profile-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    activeTab = 'profile';
    loadProfile();
}

export function unmount() {
    profile = null;
    subscription = null;
    logs = null;
    activeTab = 'profile';
}
