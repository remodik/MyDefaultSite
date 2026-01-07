const API_URL = (function() {
    if (typeof window !== 'undefined' && window.APP_CONFIG?.API_URL !== undefined) {
        return window.APP_CONFIG.API_URL;
    }
    return '';
})();

function getToken() {
    return localStorage.getItem('auth_token');
}

async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const config = {
        ...options,
        headers,
    };
    
    const response = await fetch(`${API_URL}${endpoint}`, config);
    
    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.dispatchEvent(new CustomEvent('auth-changed'));
        throw new Error('Unauthorized');
    }
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Request failed');
    }
    
    return response.json();
}

export const authApi = {
    async register(username, password, email = null) {
        const body = { username, password };
        if (email) body.email = email;
        return apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },
    
    async login(username, password) {
        return apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },
    
    async getMe() {
        return apiRequest('/api/auth/me');
    },
    
    async requestPasswordReset(email) {
        return apiRequest('/api/auth/password-reset-request', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    },

    async verifyResetToken(token) {
        return apiRequest(`/api/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
    },

    async resetPassword(token, newPassword) {
        return apiRequest('/api/auth/password-reset', {
            method: 'POST',
            body: JSON.stringify({
                token,
                new_password: newPassword,
            }),
        });
    },
};

export const projectsApi = {
    async getAll() {
        return apiRequest('/api/projects');
    },
    
    async getById(id) {
        return apiRequest(`/api/projects/${id}`);
    },
    
    async create(name, description = '') {
        return apiRequest('/api/projects', {
            method: 'POST',
            body: JSON.stringify({ name, description }),
        });
    },
    
    async update(id, data) {
        return apiRequest(`/api/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    async delete(id) {
        return apiRequest(`/api/projects/${id}`, {
            method: 'DELETE',
        });
    },
};

export const filesApi = {
    async getById(id) {
        return apiRequest(`/api/files/${id}`);
    },
    
    async create(projectId, name, content = '', fileType = '', parentPath = '', isFolder = false) {
        return apiRequest('/api/files', {
            method: 'POST',
            body: JSON.stringify({
                project_id: projectId,
                name,
                content,
                file_type: fileType,
                parent_path: parentPath,
                is_folder: isFolder
            }),
        });
    },
    
    async upload(projectId, file, parentPath = '') {
        const token = getToken();
        const formData = new FormData();
        formData.append('project_id', projectId);
        formData.append('file', file);
        if (parentPath) {
            formData.append('parent_path', parentPath);
        }
        
        const response = await fetch(`${API_URL}/api/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(error.detail);
        }
        
        return response.json();
    },
    
    async update(id, data) {
        return apiRequest(`/api/files/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    async delete(id) {
        return apiRequest(`/api/files/${id}`, {
            method: 'DELETE',
        });
    },

    async move(id, newParentPath) {
        return apiRequest(`/api/files/${id}/move`, {
            method: 'PUT',
            body: JSON.stringify({
                new_parent_path: newParentPath,
            }),
        });
    },

    async rename(id, newName) {
        return apiRequest(`/api/files/${id}/rename?new_name=${encodeURIComponent(newName)}`, {
            method: 'PUT',
        });
    },

    async createFolder(projectId, name, parentPath = '') {
        return apiRequest(`/api/folders`, {
            method: 'POST',
            body: JSON.stringify({
                project_id: projectId,
                name,
                parent_path: parentPath,
            }),
        })
    }
};

export const servicesApi = {
    async getAll() {
        return apiRequest('/api/services');
    },
    
    async create(data) {
        return apiRequest('/api/services', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    async update(id, data) {
        return apiRequest(`/api/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    async delete(id) {
        return apiRequest(`/api/services/${id}`, {
            method: 'DELETE',
        });
    },
};

export const contactApi = {
    async send(data) {
        return apiRequest('/api/contact', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};

export const adminApi = {
    async getUsers() {
        return apiRequest('/api/admin/users');
    },
    
    async updateUserRole(userId, role) {
        return apiRequest(`/api/admin/users/${userId}/role?role=${role}`, {
            method: 'PUT',
        });
    },
    
    async resetUserPassword(userId) {
        return apiRequest(`/api/admin/reset-password/${userId}`, {
            method: 'POST',
        });
    },
    
    async getResetRequests() {
        return apiRequest('/api/admin/reset-requests');
    },
};

export function createChatWebSocket(token, onMessage, onOpen, onClose, onError) {
    let wsUrl;
    if (API_URL) {
        const wsProtocol = API_URL.startsWith('https') ? 'wss' : 'ws';
        wsUrl = API_URL.replace(/^https?/, wsProtocol);
    } else {
        const loc = window.location;
        const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProtocol}//${loc.host}`;
    }
    
    const ws = new WebSocket(`${wsUrl}/api/ws/chat?token=${token}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        if (onOpen) onOpen();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
    };
    
    ws.onclose = (event) => {
        console.log('WebSocket closed', event.code, event.reason);
        if (onClose) onClose(event);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error', error);
        if (onError) onError(error);
    };
    
    return ws;
}

export { API_URL, getToken };