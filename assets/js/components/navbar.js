import { isAuthenticated, isAdmin, getUser, logout } from '../auth.js';
import { router } from '../router.js';
import { t, getLang, setLang, applyDom, LANGS } from '../i18n.js';

const TABS_KEY = 'ide_open_tabs';

const FILES = [
    { id: 'home', path: '/', icon: 'tsx', iconColor: '#38bdf8', file_key: 'file_home', label_key: 'nav_home', public: true },
    { id: 'services', path: '/services', icon: 'ts', iconColor: '#0ea5e9', file_key: 'file_services', label_key: 'nav_services', public: true },
    { id: 'works', path: '/works', icon: 'dir', iconColor: '#94a3b8', file_key: 'file_works', label_key: 'nav_works', public: true },
    { id: 'bot', path: '/bot', icon: 'py', iconColor: '#facc15', file_key: 'file_bot', label_key: 'nav_bot', public: true },
    { id: 'courses', path: '/courses', icon: 'md', iconColor: '#a78bfa', file_key: 'file_courses', label_key: 'nav_courses', public: true },
    { id: 'projects', path: '/projects', icon: 'json', iconColor: '#f59e0b', file_key: 'file_projects', label_key: 'nav_projects', requireAuth: true },
    { id: 'chat', path: '/chat', icon: 'sock', iconColor: '#ec4899', file_key: 'file_chat', label_key: 'nav_chat', requireAuth: true },
    { id: 'contact', path: '/contact', icon: 'yml', iconColor: '#22d3ee', file_key: 'file_contact', label_key: 'nav_contacts', public: true },
    { id: 'donate', path: '/donate', icon: 'yml', iconColor: '#f472b6', file_key: 'file_donate', label_key: 'nav_donate', public: true },
    { id: 'profile', path: '/profile', icon: 'usr', iconColor: '#86efac', file_key: 'file_profile', label_key: 'nav_profile', requireAuth: true },
    { id: 'admin', path: '/admin', icon: 'lck', iconColor: '#f87171', file_key: 'file_admin', label_key: 'nav_admin', requireAdmin: true },
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
    return `<span class="v1-file-name">${t(file.file_key)}</span>`;
}

function renderSidebar() {
    const el = document.getElementById('ide-sidebar');
    if (!el) return;

    const auth = isAuthenticated();
    const user = getUser();
    const admin = isAdmin();

    const files = visibleFiles();
    const items = files.map(f => `
        <a href="${f.path}" class="v1-file ${activeId === f.id ? 'active' : ''}" data-file-id="${f.id}" title="${t(f.label_key)}">
            ${fileIconEl(f)}
            ${fileNameHtml(f)}
            ${f.requireAdmin ? '<span class="v1-file-badge">ADMIN</span>' : ''}
        </a>
    `).join('');

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

    const tabsHtml = openTabs.map(id => {
        const f = FILES.find(x => x.id === id);
        if (!f) return '';
        const isActive = activeId === id;
        return `
            <a href="${f.path}" class="v1-tab ${isActive ? 'active' : ''}" data-file-id="${f.id}">
                ${fileIconEl(f)}
                <span>${t(f.file_key)}</span>
                <button class="v1-tab-x" data-close="${f.id}" aria-label="Close">×</button>
            </a>
        `;
    }).join('');

    el.innerHTML = tabsHtml + `
        <div class="v1-tab-controls">
            <span title="Split">⫶</span>
        </div>
    `;

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
        <span style="color: #64748b">${t('sidebar_root')}</span>
        <span style="color: #475569"> ›</span>
        <span style="color: #7dd3fc">${escapeHtml(t(f?.file_key || 'file_home'))}</span>
    `;
}

function renderTitle() {
    const titleEl = document.getElementById('ide-title');
    if (titleEl) {
        const f = FILES.find(x => x.id === activeId);
        titleEl.textContent = `remod3 — ${t(f?.file_key || 'file_home')}`;
    }
    const ftEl = document.getElementById('st-filetype');
    if (ftEl) {
        const f = FILES.find(x => x.id === activeId);
        ftEl.textContent = (f?.icon || 'tsx').toUpperCase();
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

function closeSidebarOnMobile() {
    const sb = document.getElementById('ide-sidebar');
    if (sb) sb.classList.remove('open');
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

    const stOnline = document.getElementById('st-online');
    if (stOnline) stOnline.textContent = t('st_online');
    const stBranch = document.getElementById('st-branch');
    if (stBranch) stBranch.textContent = t('st_branch');
}

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

function bindSidebarToggle() {
    const toggle = document.getElementById('ide-sidebar-toggle');
    const sb = document.getElementById('ide-sidebar');
    if (!toggle || !sb || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sb.classList.toggle('open');
    });
}

document.addEventListener('click', (e) => {
    if (langMenuOpen && !e.target.closest('#ide-lang')) {
        langMenuOpen = false;
        const menu = document.getElementById('ide-lang-menu');
        if (menu) menu.classList.remove('open');
    }
});

document.addEventListener('click', (e) => {
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
