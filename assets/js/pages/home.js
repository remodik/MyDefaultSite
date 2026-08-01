import { isAuthenticated } from '../auth.js';
import { router } from '../router.js';
import { projectsApi, servicesApi } from '../api.js';
import { t } from '../i18n.js';

const STACK = [
    'WebSockets', 'JWT', 'REST API', 'JavaScript', 'Vanilla JS', 'CSS',
    'Docker', 'Python', 'FastAPI', 'discord.py', 'SQLAlchemy', 'PostgreSQL',
];

// Вместо самооценки в процентах — проверяемые факты: что именно сделано на
// этом стеке и куда посмотреть. `href` необязателен.
const STACK_FACTS = [
    { key: 'skill_python', fact: 'stack_python_fact' },
    { key: 'skill_discord', fact: 'stack_discord_fact', href: '/bot' },
    { key: 'skill_js', fact: 'stack_js_fact' },
    { key: 'skill_fastapi', fact: 'stack_fastapi_fact', href: '/services' },
];

const CHIPS = ['Python', 'FastAPI', 'discord.py', 'SQLAlchemy', 'JavaScript', 'PostgreSQL'];

export function render() {
    const stackHtml = [...STACK, ...STACK]
        .map(s => `<span><i>·</i>${esc(s)}</span>`)
        .join('');

    const stackHtml2 = STACK_FACTS.map(s => `
        <li class="v1-stack-item">
            <span class="v1-stack-name">${esc(t(s.key))}</span>
            <span class="v1-stack-fact">${esc(t(s.fact))}</span>
            ${s.href ? `<a class="v1-stack-link" href="${s.href}">${esc(t('stack_view'))} →</a>` : ''}
        </li>
    `).join('');

    const chipsHtml = CHIPS.map(c => `<span class="v1-chip">${esc(c)}</span>`).join('');

    return `
        <div class="v1-doc">
            <div class="v1-hero">
                <div class="v1-hero-left">
                    <div class="v1-tagline">
                        <span class="v1-tagline-c">// </span>
                        <span class="v1-tagline-1">${esc(t('python_developer'))}</span>
                        <span class="v1-tagline-c"> · </span>
                        <span class="v1-tagline-2">${esc(t('discord_bots'))}</span>
                        <span class="v1-tagline-c"> · </span>
                        <span class="v1-tagline-3">${esc(t('web_apps'))}</span>
                    </div>
                    <h1 class="v1-h1">
                        <span class="v1-h1-accent">re</span><span>mod3</span><span class="v1-cursor">_</span>
                    </h1>
                    <p class="v1-sub">
                        <span class="tk">const</span> <span class="tv">creates</span> <span class="tp">=</span> <span class="ts">"${esc(t('hero_what'))}"</span><span class="tp">;</span>
                    </p>
                    <p class="v1-desc">${esc(t('hero_desc'))}</p>
                    <div class="v1-cta-row">
                        <a class="v1-btn v1-btn-primary" href="/projects">
                            <span style="opacity:.6">$</span> ${esc(t('cta_projects'))}
                        </a>
                        <a class="v1-btn" href="/contact">→ ${esc(t('cta_write'))}</a>
                        <a class="v1-btn v1-btn-support" href="/donate">
                            <i class="fas fa-heart"></i> ${esc(t('cta_support'))}
                        </a>
                    </div>
                </div>

                <div class="v1-hero-right">
                    <div class="v1-avail">
                        <span class="v1-dot"></span> ${esc(t('available'))}
                    </div>
                    <div class="v1-avatar-box">
                        <div class="v1-avatar-inner">
                            <picture>
                                <source srcset="/assets/images/blue_avatar.webp" type="image/webp" />
                                <img id="v1-avatar-img" src="/assets/images/blue_avatar.png"
                                     alt="" width="240" height="240" decoding="async" />
                            </picture>
                        </div>
                    </div>
                    <div class="v1-stats">
                        ${isAuthenticated() ? `
                            <div class="v1-stat">
                                <div class="v1-stat-n" id="stat-projects-n">—</div>
                                <div class="v1-stat-l">${esc(t('projects_done'))}</div>
                            </div>
                        ` : ''}
                        <div class="v1-stat">
                            <div class="v1-stat-n">2+</div>
                            <div class="v1-stat-l">${esc(t('years_exp'))}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="v1-marquee">
                <div class="v1-marquee-track">${stackHtml}</div>
            </div>

            <section class="v1-sec">
                <div class="v1-sec-kicker">${esc(t('about_kicker'))}</div>
                <h2 class="v1-sec-h">
                    ${esc(t('about_h'))}<span class="v1-sec-h-accent">${esc(t('about_name'))}</span>
                </h2>
                <div class="v1-twocol">
                    <div>
                        <p>${esc(t('about_p1'))}</p>
                        <p>${esc(t('about_p2'))}</p>
                        <div class="v1-chips">${chipsHtml}</div>
                    </div>
                    <div class="v1-stack-block">
                        <div class="v1-stack-h">${esc(t('stack_h'))}</div>
                        <ul class="v1-stack">${stackHtml2}</ul>
                    </div>
                </div>
            </section>

            <section class="v1-sec">
                <div class="v1-sec-kicker">${esc(t('services_kicker'))}</div>
                <h2 class="v1-sec-h">${esc(t('services_h'))}</h2>
                <div class="v1-svc-grid" id="v1-services-grid">
                    <div class="v1-loading">${esc(t('loading'))}</div>
                </div>
                <div style="margin-top:32px;text-align:center">
                    <a href="/services" class="v1-btn">${esc(t('all_services'))} →</a>
                </div>
            </section>

            <section class="v1-sec">
                <div class="v1-sec-kicker">${esc(t('projects_kicker'))}</div>
                <h2 class="v1-sec-h">${esc(t('projects_h'))}</h2>
                <div class="v1-prj-grid" id="v1-projects-grid">
                    ${isAuthenticated()
                        ? `<div class="v1-loading">${esc(t('loading'))}</div>`
                        : `<div class="v1-empty"><i class="fas fa-lock" style="display:block;font-size:24px;margin-bottom:12px;opacity:.5"></i>${esc(t('auth_to_view_projects'))}</div>`
                    }
                </div>
                ${isAuthenticated() ? `
                    <div style="margin-top:32px;text-align:center">
                        <a href="/projects" class="v1-btn">${esc(t('all_projects'))} →</a>
                    </div>
                ` : ''}
            </section>

            <section class="v1-cta">
                <div class="v1-cta-kicker">// ${esc(t('cta_kicker'))}</div>
                <h2 class="v1-cta-h">
                    ${esc(t('cta_h_a'))} <span class="v1-cta-h-accent">${esc(t('cta_h_b'))}</span>
                </h2>
                <div class="v1-cta-row">
                    <a class="v1-btn v1-btn-primary v1-btn-lg" href="/contact">
                        <i class="fas fa-paper-plane"></i> ${esc(t('write_me'))}
                    </a>
                    <a class="v1-btn v1-btn-lg" href="https://t.me/remod3" target="_blank" rel="noopener">
                        <i class="fab fa-telegram"></i> ${esc(t('telegram'))}
                    </a>
                    <a class="v1-btn v1-btn-lg v1-btn-support" href="/donate">
                        <i class="fas fa-heart"></i> ${esc(t('cta_support'))}
                    </a>
                </div>
            </section>
        </div>
    `;
}

export async function mount() {
    bindAvatarFallback();
    await loadServices();
    if (isAuthenticated()) {
        await loadProjects();
        await loadProjectCount();
    }
}

// Фолбэк аватара — обработчиком, а не HTML-строкой внутри inline-onerror.
function bindAvatarFallback() {
    const img = document.getElementById('v1-avatar-img');
    if (!img) return;

    const showInitial = () => {
        const box = img.closest('.v1-avatar-inner');
        if (!box) return;
        const initial = document.createElement('span');
        initial.className = 'v1-avatar-initial';
        initial.textContent = 'R';
        box.replaceChildren(initial);
    };

    img.addEventListener('error', showInitial, { once: true });
    if (img.complete && img.naturalWidth === 0) showInitial();
}

async function loadProjectCount() {
    try {
        const projects = await projectsApi.getAll();
        const el = document.getElementById('stat-projects-n');
        if (el) el.textContent = `${projects.length}+`;
    } catch {}
}

async function loadServices() {
    const grid = document.getElementById('v1-services-grid');
    if (!grid) return;

    try {
        const services = await servicesApi.getAll();
        if (!services.length) {
            grid.innerHTML = `<div class="v1-empty">${esc(t('services_soon'))}</div>`;
            return;
        }

        // Код-хедер — одна строка-подпись: путь модуля. Данные (name, price)
        // не дублируются, они ниже в теле карточки.
        grid.innerHTML = services.slice(0, 6).map((s, i) => `
            <div class="v1-svc">
                <div class="v1-svc-head">
                    <div class="v1-svc-line"><span style="color:var(--v1-fg-dim)">//</span> <span style="color:#7dd3fc">services</span><span style="color:#94a3b8">/</span><span style="color:#c084fc">svc_${i + 1}</span><span style="color:#94a3b8">.js</span></div>
                </div>
                <div class="v1-svc-body">
                    <div class="v1-svc-title">${esc(s.name)}</div>
                    <div class="v1-svc-desc">${esc(truncate(s.description || '', 160))}</div>
                    ${s.price ? `<div class="v1-svc-price">${esc(s.price)}</div>` : ''}
                </div>
            </div>
        `).join('');

    } catch {
        grid.innerHTML = `<div class="v1-empty">${esc(t('services_failed'))}</div>`;
    }
}

async function loadProjects() {
    const grid = document.getElementById('v1-projects-grid');
    if (!grid) return;

    try {
        const projects = await projectsApi.getAll();
        if (!projects.length) {
            grid.innerHTML = `<div class="v1-empty">${esc(t('projects_empty'))}</div>`;
            return;
        }

        grid.innerHTML = projects.slice(0, 6).map(p => {
            const hash = ((p.id || '') + 'deadbeef').toString().slice(0, 7);
            return `
                <div class="v1-prj" data-id="${esc(p.id)}">
                    <div class="v1-prj-head">
                        <span class="v1-prj-tag">commit</span>
                        <span class="v1-prj-hash">${esc(hash)}</span>
                    </div>
                    <div class="v1-prj-title">${esc(p.name)}</div>
                    <div class="v1-prj-desc">${esc(p.description || '')}</div>
                    <a class="v1-prj-link" href="/projects/${esc(p.id)}">→ ${esc(t('open'))}</a>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.v1-prj').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('a')) return;
                router.navigate(`/projects/${card.dataset.id}`);
            });
        });

    } catch {
        grid.innerHTML = `<div class="v1-empty">${esc(t('projects_failed'))}</div>`;
    }
}

function truncate(s, max) {
    s = String(s || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}
