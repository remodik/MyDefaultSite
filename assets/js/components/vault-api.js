import { API_URL, getToken } from '../api.js';

// Ошибка API vault: кроме текста несёт HTTP-статус и поля из detail
// (например current_hash при конфликте правок).
export class VaultApiError extends Error {
    constructor(message, status, data = {}) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

function encodePath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
}

function authHeaders(extra = {}) {
    const token = getToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request(endpoint, options = {}) {
    const headers = authHeaders(options.body ? { 'Content-Type': 'application/json' } : {});
    let response;
    try {
        response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    } catch {
        throw new VaultApiError('Сервер недоступен. Проверьте соединение.', 0);
    }

    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.dispatchEvent(new CustomEvent('auth-changed'));
        throw new VaultApiError('Сессия истекла — войдите заново.', 401);
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body.detail;
        if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
            throw new VaultApiError(detail.message || 'Ошибка запроса', response.status, detail);
        }
        const message = typeof detail === 'string' ? detail : 'Ошибка запроса';
        throw new VaultApiError(message, response.status);
    }
    return response.status === 204 ? null : response.json();
}

function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '' && value !== false) {
            search.set(key, String(value));
        }
    }
    const text = search.toString();
    return text ? `?${text}` : '';
}

export const vaultApi = {
    listNotes: (filters) => request(`/api/vault/notes${query(filters)}`).then((r) => r.notes),
    listTags: () => request('/api/vault/tags').then((r) => r.tags),
    readNote: (path) => request(`/api/vault/notes/${encodePath(path)}`),
    createNote: (path, content = '') =>
        request('/api/vault/notes', { method: 'POST', body: JSON.stringify({ path, content }) }),
    saveNote: (path, content, expectedHash) =>
        request(`/api/vault/notes/${encodePath(path)}`, {
            method: 'PUT',
            body: JSON.stringify({ content, expected_hash: expectedHash || null }),
        }),
    moveNote: (path, newPath) =>
        request('/api/vault/notes/move', { method: 'POST', body: JSON.stringify({ path, new_path: newPath }) }),
    trashNote: (path) =>
        request('/api/vault/notes/trash', { method: 'POST', body: JSON.stringify({ path }) }),
    render: (content, path) =>
        request('/api/vault/render', { method: 'POST', body: JSON.stringify({ content, path: path || null }) })
            .then((r) => r.html),

    // Картинка отдаётся только с заголовком Authorization, поэтому <img src>
    // на неё поставить нельзя — качаем blob и отдаём object URL.
    async fileUrl(path) {
        const response = await fetch(`${API_URL}/api/vault/files/${encodePath(path)}`, { headers: authHeaders() });
        if (!response.ok) throw new VaultApiError('Файл недоступен', response.status);
        return URL.createObjectURL(await response.blob());
    },
};
