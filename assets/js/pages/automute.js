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
        <div class="card p-6 flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <h3 class="text-2xl font-bold text-white">${plan.label}</h3>
                <span class="tag tag-primary">${plan.badge}</span>
            </div>
            <div class="text-4xl font-bold text-white">${plan.price} <span class="text-base text-discord-text">₽</span></div>
            <ul class="text-sm text-discord-text space-y-1">
                <li><i class="fas fa-check text-discord-green mr-2"></i>Безлимит категорий</li>
                <li><i class="fas fa-check text-discord-green mr-2"></i>Логи нарушений на сервере</li>
                <li><i class="fas fa-check text-discord-green mr-2"></i>Скриншоты-доказательства</li>
                <li><i class="fas fa-check text-discord-green mr-2"></i>Чёрный/белый список</li>
            </ul>
            <button class="btn btn-success automute-buy-btn" data-plan="${plan.id}">
                <i class="fas fa-shopping-cart"></i>
                Купить
            </button>
        </div>
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
            <div class="card p-6 mb-6 border-l-4 border-discord-green">
                <div class="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h3 class="text-xl font-bold text-white">
                            <i class="fas fa-circle-check text-discord-green mr-2"></i>
                            Подписка активна
                        </h3>
                        <p class="text-discord-text mt-1">
                            Тариф: <span class="text-white font-semibold">${escapeHtml(subscription.plan || '?')}</span>
                            · истекает ${formatDateTime(expiresIso)}
                        </p>
                        <p class="text-discord-text mt-1">
                            Осталось: <span class="text-white">${days}д ${hours}ч</span>
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-discord-text text-sm">Ваш ключ для мода:</p>
                        <code class="text-white font-mono text-lg select-all">${escapeHtml(subscription.license_key || '—')}</code>
                    </div>
                </div>
                <div class="mt-4 flex gap-2">
                    <a href="/profile" class="btn btn-secondary btn-sm">
                        <i class="fas fa-list"></i> Мои логи
                    </a>
                </div>
            </div>
        `;
    }

    if (subscription.pending_purchase) {
        const p = subscription.pending_purchase;
        return `
            <div class="card p-6 mb-6 border-l-4 border-discord-yellow">
                <h3 class="text-xl font-bold text-white">
                    <i class="fas fa-hourglass-half text-discord-yellow mr-2"></i>
                    Ожидает подтверждения админом
                </h3>
                <p class="text-discord-text mt-1">
                    Тариф ${escapeHtml(p.plan)} · ${p.amount} ₽ ·
                    комментарий: <code class="text-white">${escapeHtml(p.sbp_comment || '')}</code>
                </p>
            </div>
        `;
    }

    if (subscription.license_key) {
        return `
            <div class="card p-6 mb-6 border-l-4 border-discord-red">
                <h3 class="text-xl font-bold text-white">
                    <i class="fas fa-circle-exclamation text-discord-red mr-2"></i>
                    Подписка истекла
                </h3>
                <p class="text-discord-text mt-1">Купите новый тариф ниже, чтобы продолжить пользоваться модом.</p>
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
            <div class="flex flex-col gap-3">
                <p class="text-discord-text">
                    Переведите <span class="text-white font-semibold">${sbp.amount} ₽</span>
                    на <span class="text-white">${escapeHtml(sbp.phone)}</span>
                    (${escapeHtml(sbp.bank)}) с комментарием:
                </p>
                <div class="bg-discord-darkest p-3 rounded">
                    <code class="text-white font-mono text-lg select-all">${escapeHtml(sbp.comment)}</code>
                </div>
                <p class="text-discord-text text-sm">Получатель: ${escapeHtml(sbp.recipient)}</p>
                <p class="text-discord-text text-sm">
                    После того как вы переведёте деньги — администратор подтвердит покупку,
                    и в вашем профиле появится лицензионный ключ для активации мода.
                </p>
            </div>
        `,
        footer: `
            <button class="btn btn-secondary" id="automute-close-sbp">Закрыть</button>
            <button class="btn btn-primary" id="automute-copy-sbp" data-comment="${escapeHtml(sbp.comment)}">
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
        <div class="container mx-auto px-4 py-8 max-w-5xl">
            <div class="mb-8 text-center">
                <h1 class="text-4xl font-bold text-white mb-2">
                    <i class="fas fa-volume-mute text-discord-accent mr-2"></i>AutoMute
                </h1>
                <p class="text-discord-text max-w-2xl mx-auto">
                    Клиентский мод для Minecraft 1.20.4 (Fabric) — автоматически наказывает
                    игроков за слова в чате. Логи нарушений хранятся на сервере с привязкой
                    к вашему аккаунту, скриншоты сохраняются как доказательства.
                </p>
            </div>

            ${renderSubscriptionStatus()}

            <div class="grid md:grid-cols-3 gap-6 mb-8">
                ${PLANS.map(planCard).join('')}
            </div>

            <div class="card p-6 mb-6">
                <h3 class="text-xl font-bold text-white mb-3">
                    <i class="fas fa-circle-info text-discord-accent mr-2"></i>Как это работает
                </h3>
                <ol class="text-discord-text space-y-2 list-decimal list-inside">
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
