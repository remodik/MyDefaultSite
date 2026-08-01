import { isAuthenticated, isAdmin, getUser, logout } from '../auth.js';
import { router } from '../router.js';
import { t, tf, getLang, setLang, applyDom, LANGS } from '../i18n.js';

const TABS_KEY = 'ide_open_tabs';

// `icon` — настоящее расширение виртуального файла из i18n (file_*), поэтому
// оно же годится для индикатора типа в статус-баре. `dir` — это папка, у неё
// типа файла нет и статус-бар её не показывает.
const FILES = [
    { id: 'home', path: '/', icon: 'js', iconColor: '#38bdf8', file_key: 'file_home', label_key: 'nav_home', public: true },
    { id: 'services', path: '/services', icon: 'js', iconColor: '#0ea5e9', file_key: 'file_services', label_key: 'nav_services', public: true },
    { id: 'works', path: '/works', icon: 'dir', iconColor: '#94a3b8', file_key: 'file_works', label_key: 'nav_works', public: true },
    { id: 'bot', path: '/bot', icon: 'py', iconColor: '#facc15', file_key: 'file_bot', label_key: 'nav_bot', public: true },
    { id: 'courses', path: '/courses', icon: 'md', iconColor: '#a78bfa', file_key: 'file_courses', label_key: 'nav_courses', public: true },
    { id: 'projects', path: '/projects', icon: 'json', iconColor: '#f59e0b', file_key: 'file_projects', label_key: 'nav_projects', requireAuth: true },
    { id: 'chat', path: '/chat', icon: 'js', iconColor: '#f472b6', file_key: 'file_chat', label_key: 'nav_chat', requireAuth: true },
    { id: 'contact', path: '/contact', icon: 'yaml', iconColor: '#22d3ee', file_key: 'file_contact', label_key: 'nav_contacts', public: true },
    { id: 'donate', path: '/donate', icon: 'yml', iconColor: '#f472b6', file_key: 'file_donate', label_key: 'nav_donate', public: true },
    { id: 'profile', path: '/profile', icon: 'js', iconColor: '#86efac', file_key: 'file_profile', label_key: 'nav_profile', requireAuth: true },
    { id: 'admin', path: '/admin', icon: 'js', iconColor: '#f87171', file_key: 'file_admin', label_key: 'nav_admin', requireAdmin: true },
];

function loadTabs() {
    try {
        const raw = localStorage.getItem(TABS_KEY);
        const arr = raw ? JSON.parse(raw) : null;
        if (Array.isArray(arr) && arr.length) return arr.filter(id => FILES.find(f => f.id === id));
    } catch {}
    return ['home'];
}

function saveTabs() {
    try { localStorage.setItem(TABS_KEY, JSON.stringify(openTabs)); } catch {}
}

let openTabs = loadTabs();
let activeId = 'home';
let langMenuOpen = false;

function pathToFileId(path) {
    if (!path) return null;
    if (path === '/') return 'home';
    const clean = path.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
    if (clean === '/') return 'home';
    const direct = FILES.find(f => f.path === clean);
    if (direct) return direct.id;
    const seg = '/' + clean.split('/').filter(Boolean)[0];
    const byPrefix = FILES.find(f => f.path === seg);
    return byPrefix ? byPrefix.id : null;
}

function visibleFiles() {
    const auth = isAuthenticated();
    const admin = isAdmin();
    return FILES.filter(f => {
        if (f.requireAdmin) return admin;
        if (f.requireAuth) return auth;
        return f.public;
    });
}

function fileIconEl(file) {
    const text = file.icon === 'dir' ? '▸' : file.icon.toUpperCase().slice(0, 3);
    return `<span class="v1-file-icon" style="background:${file.iconColor}22;color:${file.iconColor}">${text}</span>`;
}

function fileNameHtml(file) {
    return `<span class="v1-file-name">${escapeHtml(t(file.file_key))}</span>`;
}

function renderSidebar() {
    const el = document.getElementById('ide-sidebar');
    if (!el) return;

    const auth = isAuthenticated();
    const user = getUser();
    const admin = isAdmin();

    const files = visibleFiles();
    const items = files.map(f => {
        const isActive = activeId === f.id;
        return `
        <a href="${f.path}" class="v1-file ${isActive ? 'active' : ''}" data-file-id="${f.id}" title="${escapeHtml(t(f.label_key))}"${isActive ? ' aria-current="page"' : ''}>
            ${fileIconEl(f)}
            ${fileNameHtml(f)}
            ${f.requireAdmin ? '<span class="v1-file-badge">ADMIN</span>' : ''}
        </a>
    `;
    }).join('');

    const userInitial = (user?.username || 'G').charAt(0).toUpperCase();
    const userBlock = auth ? `
        <div class="v1-sidebar-user">
            <div class="v1-sidebar-user-avatar">${userInitial}</div>
            <div class="v1-sidebar-user-info">
                <span class="v1-sidebar-user-name">${escapeHtml(user?.username || 'User')}</span>
                <span class="v1-sidebar-user-role">${admin ? 'ADMIN' : 'USER'}</span>
            </div>
            <button class="v1-sidebar-user-btn" id="sidebar-logout-btn" title="${t('sidebar_logout')}">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    ` : `
        <div class="v1-sidebar-user">
            <div class="v1-sidebar-user-avatar">G</div>
            <div class="v1-sidebar-user-info">
                <span class="v1-sidebar-user-name">${t('sidebar_user')}</span>
                <span class="v1-sidebar-user-role">GUEST</span>
            </div>
            <a href="/login" class="v1-sidebar-user-btn" title="${t('sidebar_login')}">
                <i class="fas fa-sign-in-alt"></i>
            </a>
        </div>
    `;

    el.innerHTML = `
        <div class="v1-explorer-h">${t('explorer')}</div>
        <div class="v1-folder">
            <span style="color: #7dd3fc">▾</span> ${t('sidebar_root')}
        </div>
        ${items}
        <div class="v1-sidebar-spacer"></div>
        ${userBlock}
    `;

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
            router.navigate('/');
        });
    }

    el.querySelectorAll('.v1-file[data-file-id]').forEach(node => {
        node.addEventListener('click', () => closeSidebarOnMobile());
    });
}

function renderTabs() {
    const el = document.getElementById('ide-tabs');
    if (!el) return;

    // Вкладка — контейнер с двумя соседями: ссылкой и кнопкой закрытия.
    // Раньше <button> лежал внутри <a>: невалидный HTML, ломающий клавиатуру
    // и скринридеры.
    const tabsHtml = openTabs.map(id => {
        const f = FILES.find(x => x.id === id);
        if (!f) return '';
        const isActive = activeId === id;
        const name = t(f.file_key);
        return `
            <div class="v1-tab ${isActive ? 'active' : ''}" role="presentation">
                <a href="${f.path}" class="v1-tab-link" data-file-id="${f.id}"${isActive ? ' aria-current="page"' : ''}>
                    ${fileIconEl(f)}
                    <span>${escapeHtml(name)}</span>
                </a>
                <button class="v1-tab-x" data-close="${f.id}" aria-label="${escapeHtml(tf('tab_close', { name }))}">×</button>
            </div>
        `;
    }).join('');

    el.innerHTML = tabsHtml;

    el.querySelectorAll('.v1-tab-x').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeTab(btn.dataset.close);
        });
    });
}

function closeTab(id) {
    const idx = openTabs.indexOf(id);
    if (idx < 0) return;
    openTabs = openTabs.filter(t => t !== id);
    if (!openTabs.length) openTabs = ['home'];
    saveTabs();
    if (activeId === id) {
        const next = openTabs[idx - 1] || openTabs[0] || 'home';
        const f = FILES.find(x => x.id === next);
        router.navigate(f ? f.path : '/');
    } else {
        renderTabs();
    }
}

function renderBreadcrumb() {
    const el = document.getElementById('ide-breadcrumb');
    if (!el) return;
    const f = FILES.find(x => x.id === activeId);
    el.innerHTML = `
        <span style="color: var(--v1-fg-dim)">${t('sidebar_root')}</span>
        <span style="color: var(--v1-fg-dim)"> ›</span>
        <span style="color: #7dd3fc">${escapeHtml(t(f?.file_key || 'file_home'))}</span>
    `;
}

function renderTitle() {
    const f = FILES.find(x => x.id === activeId);

    const titleEl = document.getElementById('ide-title');
    if (titleEl) {
        titleEl.textContent = `remod3 — ${t(f?.file_key || 'file_home')}`;
    }

    // Тип файла показываем, только если он у страницы вообще есть:
    // `works/` — папка, расширения у неё нет.
    const ftEl = document.getElementById('st-filetype');
    if (ftEl) {
        const ext = f?.icon;
        const hasType = Boolean(ext) && ext !== 'dir';
        ftEl.textContent = hasType ? ext.toUpperCase() : '';
        ftEl.hidden = !hasType;
    }
}

function renderLangPicker() {
    const el = document.getElementById('ide-lang');
    if (!el) return;

    const current = getLang();
    const currentLang = LANGS.find(l => l.code === current) || LANGS[0];

    el.innerHTML = `
        <button class="v1-lang-btn" id="ide-lang-btn" title="Language">
            <i class="fas fa-globe" style="font-size:11px"></i>
            <span>${currentLang.label}</span>
            <i class="fas fa-chevron-down" style="font-size:8px"></i>
        </button>
        <div class="v1-lang-menu ${langMenuOpen ? 'open' : ''}" id="ide-lang-menu">
            ${LANGS.map(l => `
                <button class="v1-lang-item ${l.code === current ? 'active' : ''}" data-lang="${l.code}">
                    <span>${l.name}</span>
                    <span class="v1-lang-item-code">${l.label}</span>
                </button>
            `).join('')}
        </div>
    `;

    const btn = document.getElementById('ide-lang-btn');
    const menu = document.getElementById('ide-lang-menu');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        langMenuOpen = !langMenuOpen;
        menu?.classList.toggle('open', langMenuOpen);
    });

    menu?.querySelectorAll('.v1-lang-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = item.dataset.lang;
            if (code) {
                setLang(code);
                langMenuOpen = false;
                menu.classList.remove('open');
            }
        });
    });
}

function renderFooter() {
    const r = document.getElementById('footer-rights');
    const p = document.getElementById('footer-privacy');
    const term = document.getElementById('footer-terms');
    if (r) r.textContent = t('footer_rights');
    if (p) p.textContent = t('footer_privacy');
    if (term) term.textContent = t('footer_terms');

    const wakeText = document.getElementById('wake-banner-text');
    if (wakeText) wakeText.textContent = t('wake_msg');

    renderBackendStatus();
}

/* ---------------------------------------------------------------------------
   Статус-бар: настоящее состояние бэкенда, а не хардкод «Connected».
   Источники — health-пинг в app.js и WebSocket чата в api.js, оба шлют
   событие `backend-status`.
   --------------------------------------------------------------------------- */

const STATUS_STYLE = {
    connected: { key: 'st_online', color: '#86efac' },
    connecting: { key: 'st_connecting', color: '#f59e0b' },
    offline: { key: 'st_offline', color: '#f87171' },
};

let healthState = 'connecting';
let socketState = null;

function getBackendState() {
    return socketState || healthState;
}

function renderBackendStatus() {
    const textEl = document.getElementById('st-online');
    const dotEl = document.getElementById('st-online-dot');
    const style = STATUS_STYLE[getBackendState()] || STATUS_STYLE.connecting;
    if (textEl) textEl.textContent = t(style.key);
    if (dotEl) dotEl.style.color = style.color;
}

window.addEventListener('backend-status', (e) => {
    const next = e?.detail?.state;
    const source = e?.detail?.source || 'health';
    if (source === 'websocket' && next === 'inactive') {
        socketState = null;
    } else if (source === 'websocket' && STATUS_STYLE[next]) {
        socketState = next;
    } else if (STATUS_STYLE[next]) {
        healthState = next;
    } else {
        return;
    }
    renderBackendStatus();
});

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

export function renderNavbar() {
    renderSidebar();
    renderTabs();
    renderBreadcrumb();
    renderTitle();
    renderLangPicker();
    renderFooter();
    bindSidebarToggle();
}

/* ---------------------------------------------------------------------------
   Мобильный сайдбар: затемнение, закрытие по клику вне и по Escape,
   возврат фокуса на гамбургер.
   --------------------------------------------------------------------------- */

// На десктопе сайдбар по умолчанию раскрыт, на мобильном — свёрнут за экран.
const MOBILE_MQ = window.matchMedia('(max-width: 900px)');
let sidebarOpen = !MOBILE_MQ.matches;

function isSidebarOpen() {
    return sidebarOpen;
}

function applySidebarState() {
    const sb = document.getElementById('ide-sidebar');
    const body = document.querySelector('.v1-body');
    const toggle = document.getElementById('ide-sidebar-toggle');
    const explorer = document.getElementById('ide-act-explorer');
    if (!sb) return;

    // .open — выезд поверх контента на мобильном;
    // .sidebar-collapsed на .v1-body — скрытие колонки на десктопе;
    // .sidebar-open — затемнение, оно нужно только на мобильном.
    sb.classList.toggle('open', sidebarOpen);
    if (body) {
        body.classList.toggle('sidebar-collapsed', !sidebarOpen);
        body.classList.toggle('sidebar-open', sidebarOpen && MOBILE_MQ.matches);
    }
    if (toggle) toggle.setAttribute('aria-expanded', String(sidebarOpen));
    if (explorer) {
        explorer.setAttribute('aria-expanded', String(sidebarOpen));
        explorer.classList.toggle('active', sidebarOpen);
    }
}

function setSidebarOpen(open, { restoreFocus = false } = {}) {
    sidebarOpen = Boolean(open);
    applySidebarState();
    if (!sidebarOpen && restoreFocus) {
        const toggle = document.getElementById('ide-sidebar-toggle');
        const explorer = document.getElementById('ide-act-explorer');
        const target = MOBILE_MQ.matches ? toggle : explorer;
        target?.focus();
    }
}

function closeSidebarOnMobile() {
    if (MOBILE_MQ.matches && sidebarOpen) {
        setSidebarOpen(false, { restoreFocus: true });
    }
}

MOBILE_MQ.addEventListener('change', () => {
    setSidebarOpen(!MOBILE_MQ.matches);
});

function bindSidebarToggle() {
    const toggle = document.getElementById('ide-sidebar-toggle');
    const sb = document.getElementById('ide-sidebar');
    if (!toggle || !sb || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setSidebarOpen(!sidebarOpen);
    });

    // Затемнение — псевдоэлемент на .v1-body, поэтому ловим клик по самому
    // .v1-body мимо сайдбара и activity bar.
    const body = document.querySelector('.v1-body');
    body?.addEventListener('click', (e) => {
        if (!sidebarOpen || !MOBILE_MQ.matches) return;
        if (e.target.closest('#ide-sidebar') || e.target.closest('.v1-activity')) return;
        setSidebarOpen(false, { restoreFocus: true });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebarOpen && MOBILE_MQ.matches) {
            setSidebarOpen(false, { restoreFocus: true });
        }
    });

    applySidebarState();
}

document.addEventListener('click', (e) => {
    if (langMenuOpen && !e.target.closest('#ide-lang')) {
        langMenuOpen = false;
        const menu = document.getElementById('ide-lang-menu');
        if (menu) menu.classList.remove('open');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('#ide-act-explorer')) {
        setSidebarOpen(!isSidebarOpen());
    }
    if (e.target.closest('#ide-act-account')) {
        router.navigate(isAuthenticated() ? '/profile' : '/login');
    }
    if (e.target.closest('#ide-act-settings')) {
        if (isAuthenticated()) router.navigate('/settings');
        else router.navigate('/login');
    }
});

window.addEventListener('route-changed', (e) => {
    const path = e?.detail?.path || window.location.pathname;
    const id = pathToFileId(path);
    if (id) {
        activeId = id;
        if (!openTabs.includes(id)) {
            openTabs = [...openTabs, id];
            saveTabs();
        }
    }
    renderSidebar();
    renderTabs();
    renderBreadcrumb();
    renderTitle();
});

window.addEventListener('auth-changed', () => {
    renderSidebar();
    renderTabs();
});

window.addEventListener('lang-changed', () => {
    renderNavbar();
    applyDom(document);
});
