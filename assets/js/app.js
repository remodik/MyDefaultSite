import { router } from './router.js';
import { renderNavbar } from './components/navbar.js';
import { API_URL, meApi } from './api.js';
import { isAuthenticated } from './auth.js';
import { applyUserAccentColor } from './utils.js';
import { getLang, applyDom } from './i18n.js';

import * as homePage from './pages/home.js';
import * as loginPage from './pages/login.js';
import * as registerPage from './pages/register.js';
import * as passwordResetPage from './pages/password-reset.js';
import * as servicesPage from './pages/services.js';
import * as projectsPage from './pages/projects.js';
import * as projectDetailPage from './pages/project-detail.js';
import * as chatPage from './pages/chat.js';
import * as profilePage from './pages/profile.js';
import * as settingsPage from './pages/settings.js';
import * as contactPage from './pages/contact.js';
import * as botPage from './pages/bot.js';
import * as adminPanelPage from './pages/admin-panel.js';
import * as notFoundPage from './pages/not-found.js';
import * as privacyPage from './pages/privacy.js';
import * as termsPage from './pages/terms.js';
import * as worksPage from './pages/works.js';
import * as workDetailPage from './pages/work-detail.js';
import * as donatePage from './pages/donate.js';

window.APP_CONFIG = {
    ...window.APP_CONFIG,
    API_URL: API_URL || 'http://localhost:8001'
};

router.addRoute('/', homePage);
router.addRoute('/login', loginPage);
router.addRoute('/register', registerPage);
router.addRoute('/password-reset', passwordResetPage);
router.addRoute('/services', servicesPage);
router.addRoute('/projects', projectsPage, { requireAuth: true });
router.addRoute('/projects/:id', projectDetailPage, { requireAuth: true });
router.addRoute('/chat', chatPage, { requireAuth: true });
router.addRoute('/profile', profilePage, { requireAuth: true });
router.addRoute('/settings', settingsPage, { requireAuth: true });
router.addRoute('/contact', contactPage);
router.addRoute('/bot', botPage);
router.addRoute('/admin', adminPanelPage, { requireAuth: true, requireAdmin: true });
router.addRoute('/works', worksPage);
router.addRoute('/works/:slug', workDetailPage);
router.addRoute('/donate', donatePage);

router.addRoute('/privacy', privacyPage);
router.addRoute('/terms', termsPage);
router.setNotFound(notFoundPage);

async function registerOptionalCourseRoutes() {
    try {
        const [coursesPage, courseDetailPage, courseReaderPage] = await Promise.all([
            import('./pages/courses.js'),
            import('./pages/course-detail.js'),
            import('./pages/course-reader.js'),
        ]);

        router.addRoute('/courses', coursesPage);
        router.addRoute('/courses/:id', courseDetailPage);
        router.addRoute('/courses/:courseId/parts/:partId', courseReaderPage);
    } catch (error) {
        console.warn('Courses pages are unavailable, skipping courses routes:', error);
    }
}

async function registerOptionalAutomuteRoute() {
    try {
        const automutePage = await import('./pages/automute.js');
        router.addRoute('/automute', automutePage);
    } catch (error) {
        console.warn('AutoMute page is unavailable, skipping automute route:', error);
    }
}

async function checkBackendAwake() {
    const banner = document.getElementById('wake-banner');
    if (!banner || !API_URL || API_URL.includes('localhost') || API_URL.includes('127.0.0.1')) return;

    const showTimer = setTimeout(() => banner.classList.remove('hidden'), 2000);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        await fetch(`${API_URL}/api/health`, { method: 'HEAD', signal: controller.signal }).catch(() =>
            fetch(`${API_URL}/`, { method: 'HEAD', signal: controller.signal })
        );
        clearTimeout(timeout);
    } catch { } finally {
        clearTimeout(showTimer);
        banner.classList.add('hidden');
    }
}

async function initApp() {
    document.documentElement.lang = getLang();
    applyDom(document);

    await checkBackendAwake();
    await Promise.all([
        registerOptionalCourseRoutes(),
        registerOptionalAutomuteRoute(),
    ]);
    renderNavbar();
    await syncUserAccentColor();
    router.init();
}

async function syncUserAccentColor() {
    if (!isAuthenticated()) {
        applyUserAccentColor(null);
        return;
    }

    try {
        const profile = await meApi.getProfile();
        applyUserAccentColor(profile?.accent_color || null);
    } catch {
        applyUserAccentColor(null);
    }
}

window.addEventListener('auth-changed', () => {
    syncUserAccentColor();
});

window.addEventListener('lang-changed', () => {
    applyDom(document);
    const path = window.location.pathname + window.location.search;
    router.navigate(path, true);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
