// Auth state management

const AUTH_TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

export function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getUser() {
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch {
            return null;
        }
    }
    return null;
}

export function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser() {
    localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
    return !!getToken();
}

export function isAdmin() {
    const user = getUser();
    return user?.role === 'admin';
}

export function login(token, user) {
    setToken(token);
    setUser(user);
    window.dispatchEvent(new CustomEvent('auth-changed'));
}

export function logout() {
    removeToken();
    removeUser();
    window.dispatchEvent(new CustomEvent('auth-changed'));
}