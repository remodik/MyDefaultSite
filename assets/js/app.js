import { router } from './router.js';
import { renderNavbar } from './components/navbar.js';
import { API_URL } from './api.js';

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
import * as coursesPage from './pages/courses.js';
import * as courseDetailPage from './pages/course-detail.js';
import * as courseReaderPage from './pages/course-reader.js';
import * as notFoundPage from './pages/not-found.js';

window.APP_CONFIG = {
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
router.addRoute('/courses', coursesPage);
router.addRoute('/courses/:id', courseDetailPage);
router.addRoute('/courses/:courseId/parts/:partId', courseReaderPage);

router.setNotFound(notFoundPage);

function initApp() {
    renderNavbar();
    router.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
