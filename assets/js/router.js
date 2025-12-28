// SPA Router

class Router {
    constructor() {
        this.routes = [];
        this.currentPage = null;
        this.notFoundHandler = null;
    }
    
    addRoute(path, handler, options = {}) {
        // Convert path pattern to regex
        // :param becomes a named capture group
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
        // Cleanup current page
        if (this.currentPage?.unmount) {
            this.currentPage.unmount();
        }
        
        // Update URL
        if (replace) {
            history.replaceState({ path }, '', path);
        } else {
            history.pushState({ path }, '', path);
        }
        
        // Find matching route
        const match = this.matchRoute(path);
        
        if (match) {
            const { route, params } = match;
            
            // Check auth requirements
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
            
            // Render page
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
        
        // Update navbar
        window.dispatchEvent(new CustomEvent('route-changed', { detail: { path } }));
    }
    
    init() {
        // Handle back/forward navigation
        window.addEventListener('popstate', (event) => {
            const path = event.state?.path || window.location.pathname;
            this.navigate(path, true);
        });
        
        // Handle link clicks
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href');
                // Only handle internal links
                if (href.startsWith('/') && !href.startsWith('//')) {
                    event.preventDefault();
                    this.navigate(href);
                }
            }
        });
        
        // Navigate to current URL
        const path = window.location.pathname || '/';
        this.navigate(path, true);
    }
}

export const router = new Router();