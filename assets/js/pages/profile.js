import { automuteApi, meApi, resolveApiUrl } from '../api.js';
import { closeModal, showModal } from '../components/modal.js';
import { applyUserAccentColor, escapeHtml, formatDateTime, showToast } from '../utils.js';

let profile = null;
let subscription = null;
let logs = null;
let activeTab = 'profile';

const AUTOMUTE_PLANS = [
    { id: '1d', label: '1 день', price: 19, badge: 'Попробовать' },
    { id: '7d', label: '7 дней', price: 119, badge: 'Популярный' },
    { id: '30d', label: '30 дней', price: 529, badge: 'Выгодный' },
];

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
        <div class="v1-subtabs" role="tablist">
            <button class="v1-subtab ${activeTab === 'profile' ? 'active' : ''}" data-tab="profile" role="tab" aria-selected="${activeTab === 'profile'}">
                <i class="fas fa-user"></i> Профиль
            </button>
            <button class="v1-subtab ${activeTab === 'automute' ? 'active' : ''}" data-tab="automute" role="tab" aria-selected="${activeTab === 'automute'}">
                <i class="fas fa-volume-mute"></i> AutoMute
            </button>
        </div>
    `;
}

function renderProfileTab() {
    if (!profile) return '<div class="v1-loading">Загрузка…</div>';

    const displayName = profile.display_name || profile.username;
    const hasBio = Boolean(profile.bio?.trim());
    const bio = hasBio ? profile.bio : '«Пользователь пока ничего не написал о себе»';
    const status = profile.status?.trim() ? profile.status : 'Не указан';

    return `
        <div class="profile-page-grid fade-in">
            <section class="profile-main-card v1-card">
                <div class="profile-avatar-wrap">
                    ${renderAvatar(profile)}
                </div>

                <div class="profile-main-meta">
                    <h1 class="profile-display-name">${escapeHtml(displayName)}</h1>
                    <p class="profile-username">@${escapeHtml(profile.username)}</p>

                    <div class="profile-badges-row">
                        <span class="v1-badge v1-badge-info">
                            <i class="fas fa-circle"></i>${escapeHtml(status)}
                        </span>
                        <span class="v1-badge">
                            <i class="fas fa-shield-halved"></i>Аккаунт активен
                        </span>
                    </div>
                </div>
            </section>

            <section class="profile-info-card v1-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-user v1-title-icon"></i>
                    О себе
                </h2>
                <p class="profile-bio ${hasBio ? '' : 'is-placeholder'}">${escapeHtml(bio)}</p>
            </section>

            <section class="profile-info-card v1-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-gear v1-title-icon"></i>
                    Настройки приватности
                </h2>
                <div class="profile-meta-row">
                    <span class="profile-meta-label">Личные сообщения</span>
                    <span class="profile-meta-value">
                        ${profile.privacy_dm === 'none' ? 'Никто' : 'Все'}
                    </span>
                </div>
                <a href="/settings" class="v1-btn v1-btn-primary v1-btn-sm" style="margin-top:var(--v1-space-4)">
                    <i class="fas fa-pen"></i>
                    Редактировать профиль
                </a>
            </section>
        </div>
    `;
}

function renderTariffCards() {
    return `
        <div class="v1-plan-grid">
            ${AUTOMUTE_PLANS.map((p) => `
                <div class="v1-card v1-plan-card">
                    <div class="v1-actions v1-actions-between">
                        <h4 class="v1-card-h">${p.label}</h4>
                        <span class="v1-badge v1-badge-info">${p.badge}</span>
                    </div>
                    <div class="v1-price">${p.price} <span>₽</span></div>
                    <button class="v1-btn v1-btn-primary v1-btn-sm automute-buy-btn" data-plan="${p.id}">
                        <i class="fas fa-shopping-cart"></i> Купить
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function renderSubscriptionStatusCard() {
    if (!subscription) {
        return `
            <div class="v1-card v1-callout">
                <h3 class="v1-card-h">
                    <i class="fas fa-circle-info v1-title-icon"></i>
                    Купите подписку, чтобы пользоваться модом
                </h3>
                <p class="v1-muted">
                    После оплаты администратор подтвердит покупку — здесь появится ваш лицензионный ключ.
                </p>
            </div>
            ${renderTariffCards()}
        `;
    }

    if (subscription.active) {
        const days = subscription.seconds_left ? Math.floor(subscription.seconds_left / 86400) : 0;
        const hours = subscription.seconds_left
            ? Math.floor((subscription.seconds_left % 86400) / 3600) : 0;
        return `
            <div class="v1-card v1-callout success">
                <div class="v1-actions v1-actions-between">
                    <div>
                        <h3 class="v1-card-h">
                            <i class="fas fa-circle-check" aria-hidden="true"></i>
                            Подписка активна
                        </h3>
                        <p class="v1-muted">
                            Тариф: <strong>${escapeHtml(subscription.plan || '?')}</strong>
                            · истекает ${formatDateTime(subscription.expires_at)}
                            (осталось ${days}д ${hours}ч)
                        </p>
                    </div>
                    <div class="v1-key-block">
                        <p class="v1-meta-l">Лицензионный ключ:</p>
                        <code>${escapeHtml(subscription.license_key || '—')}</code>
                    </div>
                </div>
            </div>
        `;
    }

    if (subscription.pending_purchase) {
        const p = subscription.pending_purchase;
        return `
            <div class="v1-card v1-callout warning">
                <h3 class="v1-card-h">
                    <i class="fas fa-hourglass-half" aria-hidden="true"></i>
                    Покупка ожидает подтверждения
                </h3>
                <p class="v1-muted">
                    Тариф ${escapeHtml(p.plan)} на ${p.amount} ₽,
                    комментарий <code>${escapeHtml(p.sbp_comment || '')}</code>
                </p>
            </div>
        `;
    }

    return `
        <div class="v1-card v1-callout danger">
            <h3 class="v1-card-h">
                <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                Подписка истекла
            </h3>
            <p class="v1-muted">Выберите новый тариф, чтобы продлить.</p>
        </div>
        ${renderTariffCards()}
    `;
}

function showSbpModal(sbp) {
    showModal({
        title: 'Оплата через СБП',
        size: 'md',
        content: `
            <div class="v1-vstack">
                <p class="v1-muted">
                    Переведите <strong>${sbp.amount} ₽</strong>
                    на <strong>${escapeHtml(sbp.phone)}</strong>
                    (${escapeHtml(sbp.bank)}) с комментарием:
                </p>
                <div class="v1-code-box">
                    <code>${escapeHtml(sbp.comment)}</code>
                </div>
                <p class="v1-muted">Получатель: ${escapeHtml(sbp.recipient)}</p>
                <p class="v1-muted">
                    После того как вы переведёте деньги — администратор подтвердит покупку,
                    и здесь появится лицензионный ключ для активации мода.
                </p>
            </div>
        `,
        footer: `
            <button class="v1-btn" id="automute-close-sbp">Закрыть</button>
            <button class="v1-btn v1-btn-primary" id="automute-copy-sbp" data-comment="${escapeHtml(sbp.comment)}">
                <i class="fas fa-copy"></i> Скопировать комментарий
            </button>
        `,
    });

    setTimeout(() => {
        const close = document.getElementById('automute-close-sbp');
        const copy = document.getElementById('automute-copy-sbp');
        if (close) close.addEventListener('click', closeModal);
        if (copy) {
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(copy.dataset.comment);
                    showToast('Комментарий скопирован', 'success');
                } catch {
                    showToast('Не удалось скопировать', 'error');
                }
            });
        }
    }, 0);
}

async function handleBuy(plan) {
    try {
        const res = await automuteApi.subscribe(plan);
        if (res?.confirmation_url) {
            showToast('Переходим к оплате…', 'info');
            window.location.href = res.confirmation_url;
            return;
        }
        if (res?.sbp) {
            showSbpModal(res.sbp);
        } else {
            showToast('Покупка создана', 'success');
        }
        await loadAutomuteData();
        renderProfileContent();
    } catch (e) {
        showToast(e.message || 'Ошибка покупки', 'error');
    }
}

function renderLogsList() {
    if (!logs) {
        return '<div class="v1-loading">Загрузка…</div>';
    }
    if (!logs.items?.length) {
        return `
            <div class="v1-empty">
                <i class="fas fa-list-alt v1-empty-icon" aria-hidden="true"></i>
                <p>Логов пока нет — мод ничего не отправлял.</p>
            </div>
        `;
    }

    return `
        <div class="v1-table-wrap">
                <table class="v1-table">
                    <thead>
                        <tr>
                            <th>Время</th>
                            <th>Игрок</th>
                            <th>Категория</th>
                            <th>Слово</th>
                            <th>Сервер</th>
                            <th>Скрин</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.items.map((log) => `
                            <tr>
                                <td>${formatDateTime(log.triggered_at)}</td>
                                <td><code>${escapeHtml(log.player_name)}</code></td>
                                <td>${escapeHtml(log.category_name)}</td>
                                <td>${escapeHtml(log.word || '')}</td>
                                <td>${escapeHtml(log.server_address || '—')}</td>
                                <td>
                                    ${log.screenshot_url
                                        ? `<a href="${escapeHtml(resolveApiUrl(log.screenshot_url))}" target="_blank" rel="noopener" class="v1-link">📷</a>`
                                        : '—'}
                                </td>
                            </tr>
                            ${log.triggered_message ? `
                                <tr>
                                    <td colspan="6" class="v1-table-note">
                                        <i class="fas fa-quote-right"></i>${escapeHtml(log.triggered_message)}
                                    </td>
                                </tr>
                            ` : ''}
                        `).join('')}
                    </tbody>
                </table>
        </div>
    `;
}

function renderAutomuteTab() {
    return `
        <div class="fade-in">
            ${renderSubscriptionStatusCard()}

            <h2 class="v1-section-title">
                <i class="fas fa-list-check v1-title-icon"></i>
                Логи нарушений
                <span>
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

    container.querySelectorAll('.v1-subtab').forEach((btn) => {
        btn.addEventListener('click', async () => {
            activeTab = btn.dataset.tab;
            if (activeTab === 'automute' && (!subscription || !logs)) {
                await loadAutomuteData();
            }
            renderProfileContent();
        });
    });

    container.querySelectorAll('.automute-buy-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleBuy(btn.dataset.plan));
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
            <div class="v1-empty">
                <i class="fas fa-exclamation-triangle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
                <div class="v1-empty-h">Не удалось загрузить профиль</div>
                <p>${escapeHtml(error.message || 'Ошибка запроса')}</p>
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
        <div class="v1-doc v1-doc-narrow">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// profile.js</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-user-circle v1-page-title-icon" aria-hidden="true"></i>Профиль
                    </h1>
                    <p class="v1-page-sub">Публичная карточка вашего аккаунта</p>
                </div>
                <a href="/settings" class="v1-btn v1-btn-sm">
                    <i class="fas fa-sliders"></i>
                    Настройки
                </a>
            </div>

            <div id="profile-content">
                <div class="v1-loading">Загрузка…</div>
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
