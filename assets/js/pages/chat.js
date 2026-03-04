import { createChatWebSocket, getToken } from '../api.js';
import { getUser } from '../auth.js';
import { showToast, escapeHtml, formatTime } from '../utils.js';

const MAX_RECONNECT_ATTEMPTS = 5;
const GROUP_WINDOW_MS = 2 * 60 * 1000;
const SCROLL_BOTTOM_THRESHOLD = 72;

let ws = null;
let messages = [];
let reconnectAttempts = 0;
let shouldStickToBottom = true;

let messagesEl = null;
let formEl = null;
let inputEl = null;
let scrollBottomBtnEl = null;

function toTimestampMs(value) {
    if (!value) return Date.now();
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? Date.now() : time;
}

function normalizeIncomingMessage(rawMessage) {
    return {
        id: rawMessage?.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user_id: rawMessage?.user_id || '',
        username: rawMessage?.username || 'Unknown',
        message: String(rawMessage?.message || ''),
        timestamp: rawMessage?.timestamp || new Date().toISOString(),
        type: rawMessage?.type === 'system' ? 'system' : 'message',
        systemIcon: rawMessage?.systemIcon || 'info-circle',
        systemType: rawMessage?.systemType || 'info',
    };
}

function isNearBottom(container) {
    if (!container) return true;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom <= SCROLL_BOTTOM_THRESHOLD;
}

function scrollToBottom({ smooth = false } = {}) {
    if (!messagesEl) return;
    messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
    });
}

function updateScrollBottomButton() {
    if (!scrollBottomBtnEl) return;
    const hasMessages = messages.some((msg) => msg.type !== 'system');
    scrollBottomBtnEl.classList.toggle('is-visible', hasMessages && !shouldStickToBottom);
}

function setInputDisabled(disabled) {
    if (!inputEl || !formEl) return;
    const sendBtn = formEl.querySelector('button[type="submit"]');
    inputEl.disabled = disabled;
    if (sendBtn) sendBtn.disabled = disabled;
}

function updateConnectionStatus(state) {
    const status = document.getElementById('connection-status');
    if (!status) return;

    if (state === 'connected') {
        setInputDisabled(false);
        status.innerHTML = `
            <span class="chat-status-dot is-connected"></span>
            <span class="chat-status-text is-connected">Подключено</span>
        `;
        return;
    }

    if (state === 'connecting') {
        setInputDisabled(true);
        status.innerHTML = `
            <span class="chat-status-dot is-connecting pulse"></span>
            <span class="chat-status-text">Подключение...</span>
        `;
        return;
    }

    setInputDisabled(true);
    status.innerHTML = `
        <span class="chat-status-dot is-disconnected pulse"></span>
        <span class="chat-status-text is-disconnected">Отключено</span>
    `;
}

function buildMessageGroups() {
    const currentUser = getUser();
    const currentUserId = currentUser?.id;
    const groups = [];

    for (const item of messages) {
        if (item.type === 'system') {
            groups.push({
                type: 'system',
                id: item.id,
                text: item.message,
                timestamp: item.timestamp,
                systemIcon: item.systemIcon || 'info-circle',
                systemType: item.systemType || 'info',
            });
            continue;
        }

        const isOwn = item.user_id === currentUserId;
        const timestampMs = toTimestampMs(item.timestamp);
        const prevGroup = groups[groups.length - 1];

        const canMergeWithPrev =
            prevGroup &&
            prevGroup.type === 'message_group' &&
            prevGroup.user_id === item.user_id &&
            timestampMs - prevGroup.lastTimestampMs < GROUP_WINDOW_MS;

        if (canMergeWithPrev) {
            prevGroup.items.push(item);
            prevGroup.lastTimestampMs = timestampMs;
            continue;
        }

        groups.push({
            type: 'message_group',
            id: `group-${item.id}`,
            user_id: item.user_id,
            username: item.username,
            isOwn,
            lastTimestampMs: timestampMs,
            items: [item],
        });
    }

    return groups;
}

function formatMessageText(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function getBubbleShapeClass(index, total) {
    if (total === 1) return 'is-single';
    if (index === 0) return 'is-first';
    if (index === total - 1) return 'is-last';
    return 'is-middle';
}

function renderMessageGroup(group) {
    const { isOwn, username, items } = group;
    const safeUsername = escapeHtml(username || 'Unknown');
    const timeLabel = formatTime(items[items.length - 1]?.timestamp);

    return `
        <div class="chat-group ${isOwn ? 'is-own' : 'is-other'}">
            ${isOwn ? '' : `
                <div class="chat-avatar" aria-hidden="true">
                    <span>${safeUsername.charAt(0).toUpperCase()}</span>
                </div>
            `}

            <div class="chat-group-content">
                ${isOwn ? '' : `<div class="chat-group-author">${safeUsername}</div>`}
                <div class="chat-group-bubbles">
                    ${items.map((msg, index) => `
                        <div class="chat-bubble ${getBubbleShapeClass(index, items.length)}">
                            ${formatMessageText(msg.message)}
                        </div>
                    `).join('')}
                </div>
                <div class="chat-group-time">${timeLabel}</div>
            </div>
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="chat-empty-state">
            <div class="chat-empty-icon">
                <i class="fas fa-comment-dots"></i>
            </div>
            <h3>Пока нет сообщений. Напишите первое.</h3>
        </div>
    `;
}

function renderMessages({ forceBottom = false } = {}) {
    if (!messagesEl) return;

    const previousScrollTop = messagesEl.scrollTop;
    const previousScrollHeight = messagesEl.scrollHeight;
    const wasNearBottom = isNearBottom(messagesEl);

    const groups = buildMessageGroups();
    const hasMessageGroups = groups.some((group) => group.type === 'message_group');

    if (!hasMessageGroups) {
        messagesEl.innerHTML = renderEmptyState();
        shouldStickToBottom = true;
        updateScrollBottomButton();
        return;
    }

    messagesEl.innerHTML = groups
        .map((group) => {
            if (group.type === 'system') {
                return `
                    <div class="chat-notification chat-notification-${escapeHtml(group.systemType)} fade-in">
                        <i class="fas fa-${escapeHtml(group.systemIcon)} mr-2"></i>
                        ${escapeHtml(group.text)}
                    </div>
                `;
            }
            return renderMessageGroup(group);
        })
        .join('');

    if (forceBottom || wasNearBottom || shouldStickToBottom) {
        scrollToBottom();
    } else {
        const delta = messagesEl.scrollHeight - previousScrollHeight;
        messagesEl.scrollTop = previousScrollTop + delta;
    }

    shouldStickToBottom = isNearBottom(messagesEl);
    updateScrollBottomButton();
}

function addSystemNotification(text, type = 'info') {
    const iconType = type === 'join' ? 'user-plus' : type === 'leave' ? 'user-minus' : 'info-circle';
    messages.push(
        normalizeIncomingMessage({
            id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            message: text,
            timestamp: new Date().toISOString(),
            type: 'system',
            systemIcon: iconType,
            systemType: type,
        }),
    );
    renderMessages();
}

function connectWebSocket() {
    const token = getToken();
    if (!token) {
        showToast('Требуется авторизация', 'error');
        return;
    }

    updateConnectionStatus('connecting');

    ws = createChatWebSocket(
        token,
        (data) => {
            if (data.type === 'history') {
                messages = (data.messages || []).map((msg) => normalizeIncomingMessage(msg));
                shouldStickToBottom = true;
                renderMessages({ forceBottom: true });
                return;
            }

            if (data.type === 'message') {
                messages.push(normalizeIncomingMessage(data.data));
                renderMessages();
                return;
            }

            if (data.type === 'user_joined') {
                addSystemNotification(`${data.username} присоединился к чату`, 'join');
                return;
            }

            if (data.type === 'user_left') {
                addSystemNotification(`${data.username} покинул чат`, 'leave');
            }
        },
        () => {
            reconnectAttempts = 0;
            updateConnectionStatus('connected');
        },
        () => {
            updateConnectionStatus('disconnected');
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

            reconnectAttempts += 1;
            setTimeout(() => {
                if (document.getElementById('chat-messages')) {
                    connectWebSocket();
                }
            }, 2000 * reconnectAttempts);
        },
        (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('disconnected');
        },
    );
}

function sendMessage(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Нет подключения к чату', 'error');
        return false;
    }

    const sanitizedText = text.trim();
    if (!sanitizedText) return false;

    ws.send(JSON.stringify({ message: sanitizedText }));
    return true;
}

function autoresizeTextarea() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    const nextHeight = Math.min(inputEl.scrollHeight, 160);
    inputEl.style.height = `${nextHeight}px`;
}

function handleFormSubmit(event) {
    event.preventDefault();
    if (!inputEl) return;

    const text = inputEl.value;
    if (!text.trim()) return;

    const sent = sendMessage(text);
    if (sent) {
        inputEl.value = '';
        autoresizeTextarea();
    }
}

function handleInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (formEl) {
            formEl.requestSubmit();
        }
    }
}

function handleMessagesScroll() {
    shouldStickToBottom = isNearBottom(messagesEl);
    updateScrollBottomButton();
}

function handleScrollToBottomClick() {
    shouldStickToBottom = true;
    scrollToBottom({ smooth: true });
    updateScrollBottomButton();
}

export function render() {
    return `
        <div class="chat-container">
            <div class="chat-topbar">
                <div class="chat-topbar-main">
                    <i class="fas fa-hashtag chat-room-icon"></i>
                    <div>
                        <h1 class="chat-room-title">Общая комната</h1>
                        <p class="chat-room-subtitle">Сообщения в реальном времени</p>
                    </div>
                </div>
                <div id="connection-status" class="chat-connection-status">
                    <span class="chat-status-dot is-connecting pulse"></span>
                    <span class="chat-status-text">Подключение...</span>
                </div>
            </div>

            <div class="chat-main">
                <div class="chat-messages" id="chat-messages">
                    <div class="flex justify-center py-12">
                        <div class="spinner spinner-lg"></div>
                    </div>
                </div>
                <button type="button" id="chat-scroll-bottom-btn" class="chat-scroll-bottom-btn" aria-label="Прокрутить вниз">
                    <i class="fas fa-chevron-down"></i>
                    <span>Вниз</span>
                </button>
            </div>

            <div class="chat-input-container">
                <form id="chat-form" class="chat-input">
                    <textarea
                        id="message-input"
                        class="input chat-textarea"
                        placeholder="Введите сообщение..."
                        autocomplete="off"
                        data-testid="chat-message-input"
                        maxlength="1000"
                        rows="1"
                        disabled
                    ></textarea>
                    <button type="submit" class="btn btn-primary btn-sm chat-send-btn" data-testid="chat-send-btn" disabled>
                        <i class="fas fa-paper-plane"></i>
                        <span class="chat-send-label">Отправить</span>
                    </button>
                </form>
            </div>
        </div>
    `;
}

export function mount() {
    messages = [];
    reconnectAttempts = 0;
    shouldStickToBottom = true;

    messagesEl = document.getElementById('chat-messages');
    formEl = document.getElementById('chat-form');
    inputEl = document.getElementById('message-input');
    scrollBottomBtnEl = document.getElementById('chat-scroll-bottom-btn');

    if (formEl) {
        formEl.addEventListener('submit', handleFormSubmit);
    }

    if (inputEl) {
        inputEl.addEventListener('keydown', handleInputKeyDown);
        inputEl.addEventListener('input', autoresizeTextarea);
        autoresizeTextarea();
    }

    if (messagesEl) {
        messagesEl.addEventListener('scroll', handleMessagesScroll, { passive: true });
    }

    if (scrollBottomBtnEl) {
        scrollBottomBtnEl.addEventListener('click', handleScrollToBottomClick);
        updateScrollBottomButton();
    }

    connectWebSocket();
}

export function unmount() {
    if (formEl) {
        formEl.removeEventListener('submit', handleFormSubmit);
    }
    if (inputEl) {
        inputEl.removeEventListener('keydown', handleInputKeyDown);
        inputEl.removeEventListener('input', autoresizeTextarea);
    }
    if (messagesEl) {
        messagesEl.removeEventListener('scroll', handleMessagesScroll);
    }
    if (scrollBottomBtnEl) {
        scrollBottomBtnEl.removeEventListener('click', handleScrollToBottomClick);
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    messages = [];
    reconnectAttempts = 0;
    shouldStickToBottom = true;

    messagesEl = null;
    formEl = null;
    inputEl = null;
    scrollBottomBtnEl = null;
}
