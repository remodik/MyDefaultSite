import { automuteApi } from '../api.js';
import { isAuthenticated } from '../auth.js';
import { router } from '../router.js';
import { showModal, closeModal } from '../components/modal.js';
import { escapeHtml, formatDateTime, showToast } from '../utils.js';

const PLANS = [
    { id: '1d', label: '1 день', price: 19, badge: 'Попробовать', accent: 'discord-blurple' },
    { id: '7d', label: '7 дней', price: 119, badge: 'Популярный', accent: 'discord-green' },
    { id: '30d', label: '30 дней', price: 529, badge: 'Выгодный', accent: 'discord-yellow' },
];

let subscription = null;

function planCard(plan) {
    return `
        <article class="v1-card v1-plan-card">
            <div class="v1-actions v1-actions-between">
                <h3 class="v1-card-h">${plan.label}</h3>
                <span class="v1-badge v1-badge-info">${plan.badge}</span>
            </div>
            <div class="v1-price">${plan.price} <span>₽</span></div>
            <ul class="v1-check-list">
                <li><i class="fas fa-check"></i>Безлимит категорий</li>
                <li><i class="fas fa-check"></i>Логи нарушений на сервере</li>
                <li><i class="fas fa-check"></i>Скриншоты-доказательства</li>
                <li><i class="fas fa-check"></i>Чёрный/белый список</li>
            </ul>
            <button class="v1-btn v1-btn-primary automute-buy-btn" data-plan="${plan.id}">
                <i class="fas fa-shopping-cart"></i>
                Купить
            </button>
        </article>
    `;
}

function renderSubscriptionStatus() {
    if (!subscription) {
        return '';
    }

    if (subscription.active) {
        const expiresIso = subscription.expires_at;
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
                            · истекает ${formatDateTime(expiresIso)}
                        </p>
                        <p class="v1-muted">
                            Осталось: <strong>${days}д ${hours}ч</strong>
                        </p>
                    </div>
                    <div class="v1-key-block">
                        <p class="v1-meta-l">Ваш ключ для мода:</p>
                        <code>${escapeHtml(subscription.license_key || '—')}</code>
                    </div>
                </div>
                <div class="v1-actions" style="margin-top:var(--v1-space-4)">
                    <a href="/profile" class="v1-btn v1-btn-sm">
                        <i class="fas fa-list"></i> Мои логи
                    </a>
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
                    Ожидает подтверждения админом
                </h3>
                <p class="v1-muted">
                    Тариф ${escapeHtml(p.plan)} · ${p.amount} ₽ ·
                    комментарий: <code>${escapeHtml(p.sbp_comment || '')}</code>
                </p>
            </div>
        `;
    }

    if (subscription.license_key) {
        return `
            <div class="v1-card v1-callout danger">
                <h3 class="v1-card-h">
                    <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                    Подписка истекла
                </h3>
                <p class="v1-muted">Купите новый тариф ниже, чтобы продолжить пользоваться модом.</p>
            </div>
        `;
    }

    return '';
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
                    и в вашем профиле появится лицензионный ключ для активации мода.
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
    if (!isAuthenticated()) {
        showToast('Чтобы купить — авторизуйтесь', 'warning');
        router.navigate('/login');
        return;
    }
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
        await loadSubscription();
        rerender();
    } catch (e) {
        showToast(e.message || 'Ошибка покупки', 'error');
    }
}

async function loadSubscription() {
    if (!isAuthenticated()) {
        subscription = null;
        return;
    }
    try {
        subscription = await automuteApi.getMySubscription();
    } catch {
        subscription = null;
    }
}

function rerender() {
    const root = document.getElementById('automute-page');
    if (!root) return;
    root.innerHTML = pageHtml();
    bindHandlers();
}

function pageHtml() {
    return `
        <div class="v1-doc v1-doc-narrow">
            <div class="v1-page-header v1-center-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// automute.js</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-volume-mute v1-page-title-icon" aria-hidden="true"></i>AutoMute
                    </h1>
                    <p class="v1-page-sub">
                    Клиентский мод для Minecraft 1.20.4 (Fabric) — автоматически наказывает
                    игроков за слова в чате. Логи нарушений хранятся на сервере с привязкой
                    к вашему аккаунту, скриншоты сохраняются как доказательства.
                </p>
            </div>
            </div>

            ${renderSubscriptionStatus()}

            <div class="v1-plan-grid">
                ${PLANS.map(planCard).join('')}
            </div>

            <div class="v1-card">
                <h3 class="v1-card-h">
                    <i class="fas fa-circle-info v1-title-icon" aria-hidden="true"></i>Как это работает
                </h3>
                <ol class="v1-steps-list">
                    <li>Выберите тариф и нажмите «Купить» — появятся реквизиты СБП.</li>
                    <li>Переведите указанную сумму с комментарием.</li>
                    <li>После подтверждения админом в вашем профиле появится лицензионный ключ.</li>
                    <li>Вставьте ключ в моде (клавиша M → Активация) — мод привяжется к вашему ПК.</li>
                    <li>Срок подписки начинает идти с момента подтверждения админом.</li>
                </ol>
            </div>
        </div>
    `;
}

function bindHandlers() {
    document.querySelectorAll('.automute-buy-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleBuy(btn.dataset.plan));
    });
}

export function render() {
    return `<div id="automute-page">${pageHtml()}</div>`;
}

export async function mount() {
    await loadSubscription();
    rerender();
}

export function unmount() {
    subscription = null;
}
