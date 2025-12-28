// Chat page

import { createChatWebSocket, getToken } from '../api.js';
import { getUser } from '../auth.js';
import { showToast, escapeHtml, formatTime } from '../utils.js';

let ws = null;
let messages = [];
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export function render() {
    return `
        <div class="chat-container">
            <div class="bg-discord-light border-b border-discord-lighter px-6 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-comments text-discord-accent text-2xl"></i>
                        <div>
                            <h1 class="text-xl font-bold text-white">Чат</h1>
                            <p class="text-discord-text text-sm">Общайтесь с другими пользователями</p>
                        </div>
                    </div>
                    <div id="connection-status" class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full bg-discord-yellow pulse"></span>
                        <span class="text-sm text-discord-text">Подключение...</span>
                    </div>
                </div>
            </div>
            
            <div class="chat-messages" id="chat-messages">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
            
            <div class="chat-input-container">
                <form id="chat-form" class="chat-input">
                    <input 
                        type="text" 
                        id="message-input" 
                        class="input flex-1" 
                        placeholder="Введите сообщение..."
                        autocomplete="off"
                        data-testid="chat-message-input"
                        maxlength="1000"
                    >
                    <button type="submit" class="btn btn-primary" data-testid="chat-send-btn">
                        <i class="fas fa-paper-plane"></i>
                        Отправить
                    </button>
                </form>
            </div>
        </div>
    `;
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="flex items-center justify-center h-full text-discord-text">
                <div class="text-center">
                    <i class="fas fa-comments text-5xl mb-4 opacity-50"></i>
                    <p>Сообщений пока нет</p>
                    <p class="text-sm mt-2">Будьте первым!</p>
                </div>
            </div>
        `;
        return;
    }
    
    const currentUser = getUser();
    
    container.innerHTML = messages.map(msg => {
        const isOwn = msg.user_id === currentUser?.id;
        const time = formatTime(msg.timestamp);
        
        return `
            <div class="chat-message ${isOwn ? 'flex-row-reverse' : ''}">
                <div class="w-10 h-10 rounded-full bg-discord-accent/20 flex items-center justify-center flex-shrink-0">
                    <span class="text-discord-accent font-bold">${msg.username.charAt(0).toUpperCase()}</span>
                </div>
                <div class="chat-message-content ${isOwn ? 'items-end' : ''}">
                    <div class="chat-message-header ${isOwn ? 'flex-row-reverse' : ''}">
                        <span class="chat-message-username ${isOwn ? 'text-discord-accent' : ''}">
                            ${escapeHtml(msg.username)}
                        </span>
                        <span class="chat-message-time">${time}</span>
                    </div>
                    <div class="chat-message-text ${isOwn ? 'bg-discord-accent/20 text-white' : 'bg-discord-lighter'} rounded-lg px-4 py-2 max-w-md">
                        ${escapeHtml(msg.message)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function addNotification(text, type = 'info') {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = 'chat-notification fade-in';
    notification.innerHTML = `
        <i class="fas fa-${type === 'join' ? 'user-plus text-discord-green' : 'user-minus text-discord-red'} mr-2"></i>
        ${escapeHtml(text)}
    `;
    container.appendChild(notification);
    container.scrollTop = container.scrollHeight;
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    if (!status) return;
    
    if (connected) {
        status.innerHTML = `
            <span class="w-3 h-3 rounded-full bg-discord-green"></span>
            <span class="text-sm text-discord-green">Подключено</span>
        `;
    } else {
        status.innerHTML = `
            <span class="w-3 h-3 rounded-full bg-discord-red pulse"></span>
            <span class="text-sm text-discord-red">Отключено</span>
        `;
    }
}

function connectWebSocket() {
    const token = getToken();
    if (!token) {
        showToast('Требуется авторизация', 'error');
        return;
    }
    
    ws = createChatWebSocket(
        token,
        // onMessage
        (data) => {
            if (data.type === 'history') {
                messages = data.messages || [];
                renderMessages();
            } else if (data.type === 'message') {
                messages.push(data.data);
                renderMessages();
            } else if (data.type === 'user_joined') {
                addNotification(`${data.username} присоединился к чату`, 'join');
            } else if (data.type === 'user_left') {
                addNotification(`${data.username} покинул чат`, 'leave');
            }
        },
        // onOpen
        () => {
            updateConnectionStatus(true);
            reconnectAttempts = 0;
        },
        // onClose
        (event) => {
            updateConnectionStatus(false);
            
            // Try to reconnect
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(() => {
                    if (document.getElementById('chat-messages')) {
                        connectWebSocket();
                    }
                }, 2000 * reconnectAttempts);
            }
        },
        // onError
        (error) => {
            updateConnectionStatus(false);
            console.error('WebSocket error:', error);
        }
    );
}

function sendMessage(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Нет подключения к чату', 'error');
        return;
    }
    
    if (!text.trim()) return;
    
    ws.send(JSON.stringify({ message: text.trim() }));
}

export function mount() {
    messages = [];
    reconnectAttempts = 0;
    
    connectWebSocket();
    
    const form = document.getElementById('chat-form');
    const input = document.getElementById('message-input');
    
    if (form && input) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value;
            if (text.trim()) {
                sendMessage(text);
                input.value = '';
            }
        });
    }
}

export function unmount() {
    if (ws) {
        ws.close();
        ws = null;
    }
    messages = [];
    reconnectAttempts = 0;
}