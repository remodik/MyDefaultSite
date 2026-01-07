class Router {
    constructor() {
        this.routes = [];
        this.currentPage = null;
        this.notFoundHandler = null;
    }
    
    addRoute(path, handler, options = {}) {
        const pattern = path.replace(/:(\w+)/g, '(?<$1>[^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        
        this.routes.push({
            path,
            regex,
            handler,
            ...options,
        });
    }
    
    setNotFound(handler) {
        this.notFoundHandler = handler;
    }
    
    matchRoute(path) {
        for (const route of this.routes) {
            const match = path.match(route.regex);
            if (match) {
                return {
                    route,
                    params: match.groups || {},
                };
            }
        }
        return null;
    }
    
    async navigate(path, replace = false) {
        if (this.currentPage?.unmount) {
            this.currentPage.unmount();
        }

        const url = new URL(path, window.location.origin);
        const fullPath = url.pathname + url.search;

        if (replace) {
            history.replaceState({ path: fullPath }, '', fullPath);
        } else {
            history.pushState({ path: fullPath }, '', fullPath);
        }

        const routePath = url.pathname;
        const match = this.matchRoute(routePath);

        if (match) {
            const { route, params } = match;

            if (route.requireAuth) {
                const token = localStorage.getItem('auth_token');
                if (!token) {
                    this.navigate('/login', true);
                    return;
                }
            }

            if (route.requireAdmin) {
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;
                if (user?.role !== 'admin') {
                    this.navigate('/', true);
                    return;
                }
            }

            const app = document.getElementById('app');
            if (app) {
                app.innerHTML = route.handler.render(params);
                if (route.handler.mount) {
                    route.handler.mount(params);
                }
                this.currentPage = route.handler;
            }
        } else if (this.notFoundHandler) {
            const app = document.getElementById('app');
            if (app) {
                app.innerHTML = this.notFoundHandler.render();
                if (this.notFoundHandler.mount) {
                    this.notFoundHandler.mount();
                }
                this.currentPage = this.notFoundHandler;
            }
        }

        window.dispatchEvent(new CustomEvent('route-changed', { detail: { path: routePath } }));
    }

    init() {
        window.addEventListener('popstate', (event) => {
            const path = event.state?.path || (window.location.pathname + window.location.search);
            this.navigate(path, true);
        });

        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href');
                if (href.startsWith('/') && !href.startsWith('//')) {
                    event.preventDefault();
                    this.navigate(href);
                }
            }
        });

        const path = (window.location.pathname + window.location.search) || '/';
        this.navigate(path, true);
    }
}

export const router = new Router();
