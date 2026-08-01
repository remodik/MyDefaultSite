import { t } from '../i18n.js';
import { escapeHtml, showToast } from '../utils.js';
import { donateApi } from '../api.js';

// Telegram — реальный запасной способ договориться (реквизиты/счёт).
const TELEGRAM_URL = 'https://t.me/remod3';

const PRESETS = [100, 250, 500, 1000, 2000, 5000];
const DEFAULT_AMOUNT = 500;
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 300000;

let restoreTitle = null;

export function render() {
    const presetsHtml = PRESETS.map(v => `
        <button type="button" class="v1-amount ${v === DEFAULT_AMOUNT ? 'active' : ''}" data-amount="${v}">
            ${v.toLocaleString('ru-RU')} ₽
        </button>
    `).join('');

    return `
        <div class="v1-doc" style="max-width:760px">
            <div class="v1-page-header" style="justify-content:flex-start">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// FUNDING.yml</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-heart v1-page-title-icon" style="color:#f472b6"></i>${escapeHtml(t('page_donate_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_donate_sub'))}</p>
                </div>
            </div>

            <div class="v1-panel fade-in">
                <p style="color:var(--v1-fg-dim);line-height:1.65;margin-bottom:18px">${escapeHtml(t('donate_lead'))}</p>

                <div class="v1-field" style="margin-bottom:18px">
                    <span class="v1-label">${escapeHtml(t('donate_amount_h'))}</span>
                    <div class="v1-amount-grid" id="donate-presets">
                        ${presetsHtml}
                    </div>
                </div>

                <div class="v1-form-row" style="margin-bottom:18px">
                    <div class="v1-field">
                        <label class="v1-label" for="donate-custom">${escapeHtml(t('donate_amount_custom'))}</label>
                        <input type="number" id="donate-custom" class="v1-input" min="${MIN_AMOUNT}" max="${MAX_AMOUNT}"
                               inputmode="numeric" placeholder="500">
                    </div>
                    <div class="v1-field">
                        <label class="v1-label" for="donate-message">${escapeHtml(t('donate_message_label'))}</label>
                        <input type="text" id="donate-message" class="v1-input" maxlength="200"
                               placeholder="${escapeHtml(t('donate_message_ph'))}">
                    </div>
                </div>

                <button type="button" class="v1-btn v1-btn-primary v1-btn-lg" id="donate-pay" style="width:100%;justify-content:center">
                    <i class="fas fa-heart"></i> ${escapeHtml(t('donate_pay_btn'))} · <span id="donate-pay-amount">${DEFAULT_AMOUNT} ₽</span>
                </button>
            </div>

            <section class="v1-sec">
                <div class="v1-sec-kicker">// ${escapeHtml(t('donate_other_h'))}</div>
                <h2 class="v1-sec-h">${escapeHtml(t('donate_other_h'))}</h2>
                <div class="v1-card-grid">
                    <article class="v1-method">
                        <div class="v1-method-head">
                            <span class="v1-method-icon" style="background:rgba(34,158,217,.14);color:#229ed9">
                                <i class="fab fa-telegram"></i>
                            </span>
                            <span class="v1-method-name">Telegram</span>
                        </div>
                        <p class="v1-method-desc">${escapeHtml(t('donate_d_tg'))}</p>
                        <a class="v1-btn" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Telegram →</a>
                    </article>
                    <article class="v1-method">
                        <div class="v1-method-head">
                            <span class="v1-method-icon" style="background:rgba(125,211,252,.12);color:var(--v1-sky)">
                                <i class="fas fa-comment-dots"></i>
                            </span>
                            <span class="v1-method-name">${escapeHtml(t('donate_contact_t'))}</span>
                        </div>
                        <p class="v1-method-desc">${escapeHtml(t('donate_contact_d'))}</p>
                        <a class="v1-btn" href="/contact">${escapeHtml(t('cta_write'))} →</a>
                    </article>
                </div>
            </section>

            <section class="v1-sec">
                <div class="v1-sec-kicker">// ${escapeHtml(t('donate_why_h'))}</div>
                <h2 class="v1-sec-h">${escapeHtml(t('donate_why_h'))}</h2>
                <div class="v1-panel">
                    <div class="v1-why">
                        <div class="v1-why-item"><i class="fas fa-check"></i><span>${escapeHtml(t('donate_why_1'))}</span></div>
                        <div class="v1-why-item"><i class="fas fa-check"></i><span>${escapeHtml(t('donate_why_2'))}</span></div>
                        <div class="v1-why-item"><i class="fas fa-check"></i><span>${escapeHtml(t('donate_why_3'))}</span></div>
                    </div>
                </div>
            </section>

            <section class="v1-cta">
                <div class="v1-cta-kicker">// thanks</div>
                <h2 class="v1-cta-h">${escapeHtml(t('donate_thanks_h'))}</h2>
                <p class="v1-page-sub" style="margin:0 auto;text-align:center">${escapeHtml(t('donate_thanks_d'))}</p>
            </section>
        </div>
    `;
}

function currentAmount() {
    const custom = document.getElementById('donate-custom')?.value.trim();
    if (custom) return parseInt(custom, 10);
    const active = document.querySelector('.v1-amount.active');
    return active ? parseInt(active.dataset.amount, 10) : DEFAULT_AMOUNT;
}

function syncPayLabel() {
    const el = document.getElementById('donate-pay-amount');
    const amount = currentAmount();
    if (el) el.textContent = Number.isFinite(amount) ? `${amount.toLocaleString('ru-RU')} ₽` : '— ₽';
}

export function mount() {
    restoreTitle = document.title;
    document.title = `remod3 — ${t('page_donate_title')}`;

    // Возврат с ЮKassa: ?thanks=1
    if (new URLSearchParams(window.location.search).get('thanks') === '1') {
        showToast(t('donate_thanks_toast'), 'success');
    }

    const presets = document.getElementById('donate-presets');
    const custom = document.getElementById('donate-custom');
    const payBtn = document.getElementById('donate-pay');

    presets?.querySelectorAll('.v1-amount').forEach(btn => {
        btn.addEventListener('click', () => {
            presets.querySelectorAll('.v1-amount').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (custom) custom.value = '';
            syncPayLabel();
        });
    });

    custom?.addEventListener('input', () => {
        if (custom.value.trim()) {
            presets?.querySelectorAll('.v1-amount').forEach(b => b.classList.remove('active'));
        }
        syncPayLabel();
    });

    payBtn?.addEventListener('click', async () => {
        const amount = currentAmount();
        if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            showToast(t('donate_amount_invalid'), 'error');
            return;
        }

        const message = document.getElementById('donate-message')?.value.trim() || null;
        const initial = payBtn.innerHTML;
        payBtn.disabled = true;
        payBtn.textContent = t('loading');

        try {
            const { confirmation_url } = await donateApi.create(amount, message);
            if (confirmation_url) {
                window.location.href = confirmation_url;
                return;
            }
            throw new Error('no confirmation_url');
        } catch (error) {
            showToast(error?.message || t('donate_pay_error'), 'error');
            payBtn.disabled = false;
            payBtn.innerHTML = initial;
        }
    });

    syncPayLabel();
}

export function unmount() {
    if (restoreTitle !== null) {
        document.title = restoreTitle;
        restoreTitle = null;
    }
}
