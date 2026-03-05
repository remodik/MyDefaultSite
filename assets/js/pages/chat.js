import { conversationsApi, createChatWebSocket, getToken, meApi, usersApi } from '../api.js';
import { getUser } from '../auth.js';
import { debounce, escapeHtml, formatRelativeTime, formatTime, showToast } from '../utils.js';

const MAX_RECONNECT_ATTEMPTS = 5;
const DM_POLL_INTERVAL_MS = 2500;
const SCROLL_BOTTOM_THRESHOLD = 72;

let ws = null;
let dmPollTimer = null;
let reconnectAttempts = 0;
let mounted = false;

let mode = 'global';
let activeConversationId = null;
let activeDmUserId = null;

let globalConnectionState = 'connecting';
let dmConnectionState = 'connected';

let globalMessages = [];
let dmMessages = [];
let conversations = [];
let searchResults = [];
let shouldStickToBottom = true;
let isSending = false;

let messagesEl = null;
let formEl = null;
let inputEl = null;
let scrollBottomBtnEl = null;
let roomIconEl = null;
let roomTitleEl = null;
let roomSubtitleEl = null;
let connectionStatusEl = null;
let conversationsListEl = null;
let searchInputEl = null;
let searchResultsEl = null;

function normalizeMessage(raw) {
    return {
        id: raw?.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: raw?.type === 'system' ? 'system' : 'message',
        user_id: raw?.user_id || raw?.sender_id || '',
        username: raw?.display_name || raw?.username || 'Unknown',
        message: String(raw?.message ?? raw?.text ?? ''),
        timestamp: raw?.timestamp || raw?.created_at || new Date().toISOString(),
        systemType: raw?.systemType || 'info',
        systemIcon: raw?.systemIcon || 'info-circle',
    };
}

function activeMessages() {
    return mode === 'dm' ? dmMessages : globalMessages;
}

function isNearBottom(container) {
    if (!container) return true;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance <= SCROLL_BOTTOM_THRESHOLD;
}

function scrollToBottom(smooth = false) {
    if (!messagesEl) return;
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function updateScrollButton() {
    if (!scrollBottomBtnEl) return;
    const hasRealMessages = activeMessages().some((item) => item.type === 'message');
    scrollBottomBtnEl.classList.toggle('is-visible', hasRealMessages && !shouldStickToBottom);
}

function setInputDisabled(disabled) {
    if (!inputEl || !formEl) return;
    const submit = formEl.querySelector('button[type="submit"]');
    inputEl.disabled = disabled;
    if (submit) submit.disabled = disabled || isSending;
}

function renderConnectionStatus() {
    if (!connectionStatusEl) return;
    const state = mode === 'dm' ? dmConnectionState : globalConnectionState;
    if (state === 'connected') {
        connectionStatusEl.innerHTML = `
            <span class="chat-status-dot is-connected"></span>
            <span class="chat-status-text is-connected">Подключено</span>
        `;
        return;
    }
    if (state === 'connecting') {
        connectionStatusEl.innerHTML = `
            <span class="chat-status-dot is-connecting pulse"></span>
            <span class="chat-status-text">Подключение...</span>
        `;
        return;
    }
    connectionStatusEl.innerHTML = `
        <span class="chat-status-dot is-disconnected pulse"></span>
        <span class="chat-status-text is-disconnected">Отключено</span>
    `;
}

function syncInputState() {
    if (mode === 'global') {
        setInputDisabled(globalConnectionState !== 'connected');
        return;
    }
    setInputDisabled(false);
}

function setGlobalConnectionState(nextState) {
    globalConnectionState = nextState;
    if (mode === 'global') {
        renderConnectionStatus();
        syncInputState();
    }
}

function setDmConnectionState(nextState) {
    dmConnectionState = nextState;
    if (mode === 'dm') {
        renderConnectionStatus();
        syncInputState();
    }
}

function renderEmptyState() {
    if (mode === 'dm') {
        return `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="fas fa-user-friends"></i></div>
                <h3>Начните диалог, найдите пользователя справа.</h3>
            </div>
        `;
    }
    return `
        <div class="chat-empty-state">
            <div class="chat-empty-icon"><i class="fas fa-comment-dots"></i></div>
            <h3>Пока нет сообщений. Напишите первое.</h3>
        </div>
    `;
}

function renderMessages(forceBottom = false) {
    if (!messagesEl) return;
    const beforeHeight = messagesEl.scrollHeight;
    const beforeTop = messagesEl.scrollTop;
    const wasNearBottom = isNearBottom(messagesEl);
    const items = activeMessages();

    if (!items.length) {
        messagesEl.innerHTML = renderEmptyState();
        shouldStickToBottom = true;
        updateScrollButton();
        return;
    }

    const currentUserId = getUser()?.id;
    messagesEl.innerHTML = items.map((item) => {
        if (item.type === 'system') {
            return `
                <div class="chat-notification chat-notification-${escapeHtml(item.systemType)}">
                    <i class="fas fa-${escapeHtml(item.systemIcon)} mr-2"></i>${escapeHtml(item.message)}
                </div>
            `;
        }

        const own = item.user_id === currentUserId;
        return `
            <div class="chat-group ${own ? 'is-own' : 'is-other'}">
                ${own ? '' : `<div class="chat-avatar"><span>${escapeHtml(item.username.charAt(0).toUpperCase())}</span></div>`}
                <div class="chat-group-content">
                    ${own ? '' : `<div class="chat-group-author">${escapeHtml(item.username)}</div>`}
                    <div class="chat-group-bubbles">
                        <div class="chat-bubble is-single">${escapeHtml(item.message).replace(/\n/g, '<br>')}</div>
                    </div>
                    <div class="chat-group-time">${formatTime(item.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');

    if (forceBottom || shouldStickToBottom || wasNearBottom) {
        scrollToBottom();
    } else {
        const delta = messagesEl.scrollHeight - beforeHeight;
        messagesEl.scrollTop = beforeTop + delta;
    }

    shouldStickToBottom = isNearBottom(messagesEl);
    updateScrollButton();
}

function currentConversation() {
    return conversations.find((item) => item.id === activeConversationId) || null;
}

function updateHeader() {
    if (!roomIconEl || !roomTitleEl || !roomSubtitleEl) return;
    if (mode === 'dm') {
        const dialogName = currentConversation()?.partner?.display_name
            || currentConversation()?.partner?.username
            || 'пользователем';
        roomIconEl.className = 'fas fa-user chat-room-icon';
        roomTitleEl.textContent = `Диалог с ${dialogName}`;
        roomSubtitleEl.textContent = 'Личные сообщения';
    } else {
        roomIconEl.className = 'fas fa-hashtag chat-room-icon';
        roomTitleEl.textContent = 'Общая комната';
        roomSubtitleEl.textContent = 'Сообщения в реальном времени';
    }
    renderConnectionStatus();
    syncInputState();
}

function setDmInUrl(userId = null) {
    const url = new URL(window.location.href);
    if (userId) url.searchParams.set('dm', userId);
    else url.searchParams.delete('dm');
    const path = `${url.pathname}${url.search}`;
    history.replaceState({ path }, '', path);
}

function avatarHtml(partner) {
    if (partner?.avatar_url) {
        return `<img src="${escapeHtml(partner.avatar_url)}" alt="" class="dm-item-avatar-image">`;
    }
    const source = partner?.display_name || partner?.username || '?';
    return `<span class="dm-item-avatar-fallback">${escapeHtml(source.charAt(0).toUpperCase())}</span>`;
}

function renderConversationsList() {
    if (!conversationsListEl) return;

    conversationsListEl.innerHTML = `
        <button class="dm-item dm-item-global ${mode === 'global' ? 'is-active' : ''}" data-action="global-room">
            <div class="dm-item-avatar"><span class="dm-item-avatar-fallback">#</span></div>
            <div class="dm-item-content">
                <div class="dm-item-row"><span class="dm-item-name">Общая комната</span></div>
                <div class="dm-item-preview">Публичный чат сайта</div>
            </div>
        </button>

        ${conversations.map((item) => {
            const active = mode === 'dm' && item.id === activeConversationId;
            const partner = item.partner || {};
            const name = partner.display_name || partner.username || 'Пользователь';
            const preview = item.last_message?.trim() || 'Нет сообщений';
            const time = item.last_message_at ? formatRelativeTime(item.last_message_at) : '';

            return `
                <button class="dm-item ${active ? 'is-active' : ''}" data-conversation-id="${escapeHtml(item.id)}">
                    <div class="dm-item-avatar">${avatarHtml(partner)}</div>
                    <div class="dm-item-content">
                        <div class="dm-item-row">
                            <span class="dm-item-name">${escapeHtml(name)}</span>
                            <span class="dm-item-time">${escapeHtml(time)}</span>
                        </div>
                        <div class="dm-item-preview">${escapeHtml(preview)}</div>
                    </div>
                </button>
            `;
        }).join('') || `
            <div class="chat-sidebar-empty">
                <i class="fas fa-comments"></i>
                <p>Начните диалог, найдите пользователя справа.</p>
            </div>
        `}
    `;
}

function renderSearchResults() {
    if (!searchResultsEl || !searchInputEl) return;
    const query = searchInputEl.value.trim();
    if (!query) {
        searchResultsEl.classList.add('hidden');
        searchResultsEl.innerHTML = '';
        return;
    }
    if (!searchResults.length) {
        searchResultsEl.classList.remove('hidden');
        searchResultsEl.innerHTML = `<div class="dm-search-empty">Ничего не найдено</div>`;
        return;
    }
    searchResultsEl.classList.remove('hidden');
    searchResultsEl.innerHTML = searchResults.map((item) => `
        <button class="dm-search-item ${item.can_receive_dm === false ? 'is-disabled' : ''}" data-user-id="${escapeHtml(item.id)}" ${item.can_receive_dm === false ? 'data-disabled="1"' : ''}>
            <span class="dm-search-name">${escapeHtml(item.display_name || item.username)}</span>
            <span class="dm-search-meta">@${escapeHtml(item.username)}</span>
            ${item.can_receive_dm === false ? '<span class="dm-search-badge">DM закрыты</span>' : ''}
        </button>
    `).join('');
}

async function loadConversations(silent = false) {
    try {
        conversations = await meApi.getConversations();
        conversations.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        renderConversationsList();
    } catch (error) {
        if (!silent) showToast(error.message || 'Не удалось загрузить диалоги', 'error');
    }
}

async function loadDmMessages(forceBottom = false, silent = false) {
    if (!activeConversationId) return;
    try {
        const items = await conversationsApi.getMessages(activeConversationId, { limit: 50 });
        dmMessages = (items || []).map(normalizeMessage);
        if (mode === 'dm') renderMessages(forceBottom);
        setDmConnectionState('connected');
    } catch (error) {
        setDmConnectionState('disconnected');
        if (!silent) showToast(error.message || 'Не удалось загрузить DM сообщения', 'error');
    }
}

function stopDmPolling() {
    if (dmPollTimer) clearInterval(dmPollTimer);
    dmPollTimer = null;
}

function startDmPolling() {
    stopDmPolling();
    dmPollTimer = setInterval(() => {
        if (!mounted || mode !== 'dm') return;
        loadDmMessages(false, true);
    }, DM_POLL_INTERVAL_MS);
}

function activateGlobal(updateUrl = true) {
    mode = 'global';
    activeConversationId = null;
    activeDmUserId = null;
    stopDmPolling();
    if (updateUrl) setDmInUrl(null);
    updateHeader();
    renderConversationsList();
    renderMessages();
}

async function activateConversation(conversation, updateUrl = true) {
    if (!conversation?.id) return;
    mode = 'dm';
    activeConversationId = conversation.id;
    activeDmUserId = conversation.partner?.id || null;
    if (updateUrl) setDmInUrl(activeDmUserId);
    setDmConnectionState('connecting');
    updateHeader();
    renderConversationsList();
    await loadDmMessages(true);
    startDmPolling();
}

async function startConversationWithUser(userId) {
    const existing = conversations.find((item) => item.partner?.id === userId);
    if (existing) {
        await activateConversation(existing);
        return;
    }
    try {
        const conversation = await conversationsApi.createOrGet(userId);
        conversations = [conversation, ...conversations.filter((item) => item.id !== conversation.id)];
        renderConversationsList();
        await activateConversation(conversation);
        await loadConversations(true);
        searchResults = [];
        if (searchInputEl) searchInputEl.value = '';
        renderSearchResults();
    } catch (error) {
        showToast(error.message || 'Не удалось создать диалог', 'error');
    }
}

async function sendMessage(text) {
    const payload = text.trim();
    if (!payload) return false;

    if (mode === 'global') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast('Нет подключения к общему чату', 'error');
            return false;
        }
        ws.send(JSON.stringify({ message: payload }));
        return true;
    }

    if (!activeConversationId) {
        showToast('Сначала выберите диалог', 'warning');
        return false;
    }

    try {
        const message = await conversationsApi.sendMessage(activeConversationId, payload);
        dmMessages.push(normalizeMessage(message));
        renderMessages(true);
        await loadConversations(true);
        setDmConnectionState('connected');
        return true;
    } catch (error) {
        setDmConnectionState('disconnected');
        showToast(error.message || 'Не удалось отправить сообщение', 'error');
        return false;
    }
}

function connectWebSocket() {
    const token = getToken();
    if (!token) return;

    setGlobalConnectionState('connecting');
    ws = createChatWebSocket(
        token,
        (data) => {
            if (data.type === 'history') {
                globalMessages = (data.messages || []).map(normalizeMessage);
                if (mode === 'global') renderMessages(true);
                return;
            }
            if (data.type === 'message') {
                globalMessages.push(normalizeMessage(data.data));
                if (mode === 'global') renderMessages();
                return;
            }
            if (data.type === 'user_joined') {
                globalMessages.push(normalizeMessage({ type: 'system', message: `${data.username} присоединился к чату`, systemType: 'join', systemIcon: 'user-plus' }));
                if (mode === 'global') renderMessages();
                return;
            }
            if (data.type === 'user_left') {
                globalMessages.push(normalizeMessage({ type: 'system', message: `${data.username} покинул чат`, systemType: 'leave', systemIcon: 'user-minus' }));
                if (mode === 'global') renderMessages();
            }
        },
        () => {
            reconnectAttempts = 0;
            setGlobalConnectionState('connected');
        },
        () => {
            setGlobalConnectionState('disconnected');
            if (!mounted || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
            reconnectAttempts += 1;
            setTimeout(() => {
                if (mounted && document.getElementById('chat-messages')) connectWebSocket();
            }, 2000 * reconnectAttempts);
        },
        () => setGlobalConnectionState('disconnected'),
    );
}

async function applyModeFromUrl() {
    const dmUserId = (new URL(window.location.href).searchParams.get('dm') || '').trim();
    if (!dmUserId) {
        activateGlobal(false);
        return;
    }
    const conversation = conversations.find((item) => item.partner?.id === dmUserId);
    if (!conversation) {
        activateGlobal(false);
        return;
    }
    await activateConversation(conversation, false);
}

const handleSearchInput = debounce(async () => {
    if (!searchInputEl) return;
    const query = searchInputEl.value.trim();
    if (!query) {
        searchResults = [];
        renderSearchResults();
        return;
    }
    try {
        searchResults = await usersApi.search(query, 20);
    } catch (error) {
        searchResults = [];
        showToast(error.message || 'Ошибка поиска пользователей', 'error');
    }
    renderSearchResults();
}, 250);

export function render() {
    return `
        <div class="chat-shell">
            <div class="chat-topbar">
                <div class="chat-topbar-main">
                    <i id="chat-room-icon" class="fas fa-hashtag chat-room-icon"></i>
                    <div>
                        <h1 id="chat-room-title" class="chat-room-title">Общая комната</h1>
                        <p id="chat-room-subtitle" class="chat-room-subtitle">Сообщения в реальном времени</p>
                    </div>
                </div>
                <div id="connection-status" class="chat-connection-status"></div>
            </div>

            <div class="chat-layout">
                <section class="chat-column">
                    <div class="chat-main">
                        <div class="chat-messages" id="chat-messages"></div>
                        <button type="button" id="chat-scroll-bottom-btn" class="chat-scroll-bottom-btn" aria-label="Прокрутить вниз">
                            <i class="fas fa-chevron-down"></i><span>Вниз</span>
                        </button>
                    </div>
                    <div class="chat-input-container">
                        <form id="chat-form" class="chat-input">
                            <textarea id="message-input" class="input chat-textarea" placeholder="Введите сообщение..." maxlength="1000" rows="1" disabled></textarea>
                            <button type="submit" class="btn btn-primary btn-sm chat-send-btn" disabled>
                                <i class="fas fa-paper-plane"></i><span class="chat-send-label">Отправить</span>
                            </button>
                        </form>
                    </div>
                </section>

                <aside class="chat-sidebar">
                    <div class="chat-sidebar-header">
                        <h2>Диалоги</h2>
                        <button type="button" id="new-dialog-btn" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Новый диалог</button>
                    </div>
                    <div class="chat-sidebar-search-wrap">
                        <input id="dm-search-input" type="text" class="input" placeholder="Поиск по нику..." autocomplete="off">
                        <div id="dm-search-results" class="dm-search-results hidden"></div>
                    </div>
                    <div id="dm-conversations-list" class="dm-conversations-list"></div>
                </aside>
            </div>
        </div>
    `;
}

export async function mount() {
    mounted = true;
    reconnectAttempts = 0;
    shouldStickToBottom = true;
    mode = 'global';
    activeConversationId = null;
    activeDmUserId = null;

    messagesEl = document.getElementById('chat-messages');
    formEl = document.getElementById('chat-form');
    inputEl = document.getElementById('message-input');
    scrollBottomBtnEl = document.getElementById('chat-scroll-bottom-btn');
    roomIconEl = document.getElementById('chat-room-icon');
    roomTitleEl = document.getElementById('chat-room-title');
    roomSubtitleEl = document.getElementById('chat-room-subtitle');
    connectionStatusEl = document.getElementById('connection-status');
    conversationsListEl = document.getElementById('dm-conversations-list');
    searchInputEl = document.getElementById('dm-search-input');
    searchResultsEl = document.getElementById('dm-search-results');

    if (formEl) {
        formEl.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!inputEl || isSending) return;
            const text = inputEl.value;
            if (!text.trim()) return;
            isSending = true;
            syncInputState();
            const sent = await sendMessage(text);
            if (sent) {
                inputEl.value = '';
                inputEl.style.height = 'auto';
            }
            isSending = false;
            syncInputState();
        });
    }

    if (inputEl) {
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                formEl?.requestSubmit();
            }
        });
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
        });
        inputEl.style.height = 'auto';
    }

    messagesEl?.addEventListener('scroll', () => {
        shouldStickToBottom = isNearBottom(messagesEl);
        updateScrollButton();
    }, { passive: true });

    scrollBottomBtnEl?.addEventListener('click', () => {
        shouldStickToBottom = true;
        scrollToBottom(true);
        updateScrollButton();
    });

    conversationsListEl?.addEventListener('click', (event) => {
        const globalBtn = event.target.closest('[data-action="global-room"]');
        if (globalBtn) {
            activateGlobal();
            return;
        }
        const item = event.target.closest('[data-conversation-id]');
        if (!item) return;
        const conversation = conversations.find((entry) => entry.id === item.dataset.conversationId);
        if (conversation) activateConversation(conversation);
    });

    searchResultsEl?.addEventListener('click', (event) => {
        const item = event.target.closest('[data-user-id]');
        if (!item || item.dataset.disabled === '1') return;
        startConversationWithUser(item.dataset.userId || '');
    });

    searchInputEl?.addEventListener('input', handleSearchInput);

    document.getElementById('new-dialog-btn')?.addEventListener('click', () => {
        searchInputEl?.focus();
    });

    updateHeader();
    renderMessages();
    renderConversationsList();
    updateScrollButton();

    connectWebSocket();
    await loadConversations();
    await applyModeFromUrl();
}

export function unmount() {
    mounted = false;
    stopDmPolling();
    if (ws) {
        ws.close();
        ws = null;
    }
    globalMessages = [];
    dmMessages = [];
    conversations = [];
    searchResults = [];
}
