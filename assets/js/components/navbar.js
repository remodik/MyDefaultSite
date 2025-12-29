import { isAuthenticated, isAdmin, getUser, logout } from '../auth.js';
import { router } from '../router.js';

let mobileMenuOpen = false;

export function renderNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    const authenticated = isAuthenticated();
    const admin = isAdmin();
    const user = getUser();
    const currentPath = window.location.pathname;
    
    const navLinks = [
        { path: '/', label: 'Главная', icon: 'fa-home', public: true },
        { path: '/services', label: 'Услуги', icon: 'fa-briefcase', public: true },
        { path: '/projects', label: 'Проекты', icon: 'fa-folder', requireAuth: true },
        { path: '/chat', label: 'Чат', icon: 'fa-comments', requireAuth: true },
        { path: '/contact', label: 'Контакты', icon: 'fa-envelope', public: true },
        { path: '/admin', label: 'Админ', icon: 'fa-shield-alt', requireAdmin: true },
    ];
    
    const filteredLinks = navLinks.filter(link => {
        if (link.requireAdmin) return admin;
        if (link.requireAuth) return authenticated;
        return link.public;
    });
    
    navbar.innerHTML = `
        <div class="navbar">
            <a href="/" class="nav-brand">
                <i class="fas fa-code"></i>
                <span>remod3</span>
            </a>
            
            <button class="mobile-menu-btn" id="mobile-menu-btn">
                <i class="fas fa-bars"></i>
            </button>
            
            <div class="nav-links ${mobileMenuOpen ? 'open' : ''}" id="nav-links">
                ${filteredLinks.map(link => `
                    <a href="${link.path}" class="nav-link ${currentPath === link.path ? 'active' : ''}" data-testid="nav-${link.path.replace('/', '') || 'home'}">
                        <i class="fas ${link.icon}"></i>
                        <span>${link.label}</span>
                    </a>
                `).join('')}
                
                <div class="flex items-center gap-2 ml-4">
                    ${authenticated ? `
                        <div class="flex items-center gap-3">
                            <span class="text-sm text-discord-text hidden sm:inline">
                                <i class="fas fa-user mr-1"></i>${user?.username || 'User'}
                                ${admin ? '<span class="tag tag-primary ml-1">Admin</span>' : ''}
                            </span>
                            <button class="btn btn-secondary btn-sm" id="logout-btn" data-testid="logout-btn">
                                <i class="fas fa-sign-out-alt"></i>
                                <span class="hidden sm:inline">Выход</span>
                            </button>
                        </div>
                    ` : `
                        <a href="/login" class="btn btn-outline btn-sm" data-testid="login-btn">
                            <i class="fas fa-sign-in-alt"></i>
                            <span class="hidden sm:inline">Вход</span>
                        </a>
                        <a href="/register" class="btn btn-primary btn-sm" data-testid="register-btn">
                            <i class="fas fa-user-plus"></i>
                            <span class="hidden sm:inline">Регистрация</span>
                        </a>
                    `}
                </div>
            </div>
        </div>
    `;

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuOpen = !mobileMenuOpen;
            const navLinks = document.getElementById('nav-links');
            if (navLinks) {
                navLinks.classList.toggle('open', mobileMenuOpen);
            }
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logout();
            router.navigate('/');
        });
    }
}

window.addEventListener('auth-changed', renderNavbar);
window.addEventListener('route-changed', () => {
    mobileMenuOpen = false;
    renderNavbar();
});