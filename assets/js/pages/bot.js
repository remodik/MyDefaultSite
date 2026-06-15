import { t } from '../i18n.js';
import { escapeHtml } from '../utils.js';

const INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1206275841395392552';

const SEO_TITLE = 'remod3Bot — Discord bot for moderation, stats and clans';
const SEO_DESCRIPTION = 'remod3Bot combines moderation, audit logs, activity stats, points & role shop, clans with seasons and leaderboards.';

const FACT_KEYS = ['bot_fact_clans', 'bot_fact_audit', 'bot_fact_econ', 'bot_fact_boards'];

const SYSTEMS = [
    { icon: '📜', t_key: 'bot_sys1_t', d_key: 'bot_sys1_d' },
    { icon: '📊', t_key: 'bot_sys2_t', d_key: 'bot_sys2_d' },
    { icon: '🛍️', t_key: 'bot_sys3_t', d_key: 'bot_sys3_d' },
    { icon: '🏰', t_key: 'bot_sys4_t', d_key: 'bot_sys4_d' },
    { icon: '🏆', t_key: 'bot_sys5_t', d_key: 'bot_sys5_d' },
    { icon: '🛡️', t_key: 'bot_sys6_t', d_key: 'bot_sys6_d' },
    { icon: '🏷️', t_key: 'bot_sys7_t', d_key: 'bot_sys7_d' },
];

const STEP_KEYS = ['bot_step1', 'bot_step2', 'bot_step3'];

const FAQ = [
    { q: 'bot_faq1_q', a: 'bot_faq1_a' },
    { q: 'bot_faq2_q', a: 'bot_faq2_a' },
    { q: 'bot_faq3_q', a: 'bot_faq3_a' },
    { q: 'bot_faq4_q', a: 'bot_faq4_a' },
    { q: 'bot_faq5_q', a: 'bot_faq5_a' },
];

let restoreMeta = null;

function setPageMeta() {
    const previousTitle = document.title;
    let descriptionMeta = document.querySelector('meta[name="description"]');
    let createdDescriptionMeta = false;
    const previousDescription = descriptionMeta ? descriptionMeta.getAttribute('content') || '' : '';

    if (!descriptionMeta) {
        descriptionMeta = document.createElement('meta');
        descriptionMeta.setAttribute('name', 'description');
        document.head.appendChild(descriptionMeta);
        createdDescriptionMeta = true;
    }

    document.title = SEO_TITLE;
    descriptionMeta.setAttribute('content', SEO_DESCRIPTION);

    return () => {
        document.title = previousTitle;
        if (createdDescriptionMeta) {
            descriptionMeta.remove();
            return;
        }
        descriptionMeta.setAttribute('content', previousDescription);
    };
}

export function render() {
    return `
        <div class="bot-page relative overflow-hidden">
            <div class="bot-glow bot-glow-left"></div>
            <div class="bot-glow bot-glow-right"></div>

            <div class="container mx-auto px-4 py-10 max-w-6xl relative z-10">
                <section class="bot-hero fade-in">
                    <div class="bot-hero-content">
                        <h1 class="bot-title">${escapeHtml(t('bot_title_full'))}</h1>
                        <h2 class="bot-subheading">${escapeHtml(t('bot_subheading'))}</h2>
                        <p class="bot-subtitle">${escapeHtml(t('bot_hero_desc'))}</p>
                        <div class="bot-cta-row">
                            <a href="${INVITE_URL}" target="_blank" rel="noopener noreferrer" class="v1-btn v1-btn-primary">
                                <i class="fab fa-discord"></i>
                                ${escapeHtml(t('bot_add_to_server'))}
                            </a>
                            <a href="#features" class="v1-btn">
                                <i class="fas fa-terminal"></i>
                                ${escapeHtml(t('bot_commands_link'))}
                            </a>
                            <a href="https://panel.remod3.ru/" target="_blank" rel="noopener noreferrer" class="v1-btn v1-btn-primary">
                                <i class="fas fa-cog"></i>
                                ${escapeHtml(t('bot_panel_link'))}
                            </a>                         
                        </div>
                    </div>
                </section>

                <section class="bot-mini-stats bot-section fade-in">
                    <div class="bot-mini-stats-grid">
                        ${FACT_KEYS.map(key => `
                            <article class="bot-mini-stat-card">
                                <i class="fas fa-check-circle"></i>
                                <p>${escapeHtml(t(key))}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="features">
                    <h2 class="bot-section-title">${escapeHtml(t('bot_systems_h'))}</h2>
                    <div class="bot-grid">
                        ${SYSTEMS.map(system => `
                            <article class="bot-card fade-in">
                                <h3 class="bot-card-title">${system.icon} ${escapeHtml(t(system.t_key))}</h3>
                                <p class="bot-card-text">${escapeHtml(t(system.d_key))}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="how">
                    <h2 class="bot-section-title">${escapeHtml(t('bot_howto_h'))}</h2>
                    <div class="bot-steps">
                        ${STEP_KEYS.map((key, index) => `
                            <article class="bot-step-card">
                                <span class="bot-step-number">${index + 1}</span>
                                <p>${escapeHtml(t(key))}</p>
                            </article>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-section" id="faq">
                    <h2 class="bot-section-title">${escapeHtml(t('bot_faq_h'))}</h2>
                    <div class="bot-faq-list">
                        ${FAQ.map((item, index) => `
                            <details class="bot-faq-item" ${index === 0 ? 'open' : ''}>
                                <summary>${escapeHtml(t(item.q))}</summary>
                                <p>${escapeHtml(t(item.a))}</p>
                            </details>
                        `).join('')}
                    </div>
                </section>

                <section class="bot-bottom-cta">
                    <h2>${escapeHtml(t('bot_ready_h'))}</h2>
                    <div class="bot-cta-row">
                        <a href="${INVITE_URL}" target="_blank" rel="noopener noreferrer" class="v1-btn v1-btn-primary">
                            <i class="fab fa-discord"></i>
                            ${escapeHtml(t('bot_add_to_server'))}
                        </a>
                        <a href="#features" class="v1-btn">
                            <i class="fas fa-terminal"></i>
                            ${escapeHtml(t('bot_commands_link'))}
                        </a>
                    </div>
                </section>
            </div>
        </div>
    `;
}

export function mount() {
    restoreMeta = setPageMeta();
}

export function unmount() {
    if (restoreMeta) {
        restoreMeta();
        restoreMeta = null;
    }
}
