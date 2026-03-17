import { resolveApiUrl, usersApi } from '../api.js';
import { getUser } from '../auth.js';
import { escapeHtml } from '../utils.js';

let popupEl = null;
let activeUserId = '';
let activeAnchorEl = null;
let listenersAttached = false;
let renderRequestId = 0;

function ensurePopupElement() {
    if (popupEl) return popupEl;

    popupEl = document.createElement('div');
    popupEl.className = 'user-popup';
    popupEl.setAttribute('role', 'dialog');
    popupEl.setAttribute('aria-label', 'Профиль пользователя');
    popupEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="write-message"]');
        if (!button) return;
        const userId = button.getAttribute('data-user-id') || '';
        if (!userId) return;
        window.dispatchEvent(new CustomEvent('user-popup:write', { detail: { userId } }));
        hideUserPopup();
    });
    document.body.appendChild(popupEl);

    return popupEl;
}

function attachListeners() {
    if (listenersAttached) return;
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleEscape, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    listenersAttached = true;
}

function detachListeners() {
    if (!listenersAttached) return;
    document.removeEventListener('mousedown', handleOutsideClick, true);
    document.removeEventListener('keydown', handleEscape, true);
    window.removeEventListener('resize', handleReposition);
    window.removeEventListener('scroll', handleReposition, true);
    listenersAttached = false;
}

function handleOutsideClick(event) {
    if (!popupEl || !popupEl.classList.contains('is-visible')) return;
    const target = event.target;
    if (popupEl.contains(target)) return;
    if (activeAnchorEl && activeAnchorEl.contains(target)) return;
    hideUserPopup();
}

function handleEscape(event) {
    if (event.key === 'Escape') {
        hideUserPopup();
    }
}

function handleReposition() {
    positionPopup();
}

function getInitial(profile) {
    const source = profile?.display_name || profile?.username || '?';
    return source.charAt(0).toUpperCase();
}

function renderLoading() {
    if (!popupEl) return;
    popupEl.innerHTML = `
        <div class="user-popup-loading">
            <div class="spinner"></div>
        </div>
    `;
}

function renderError(message) {
    if (!popupEl) return;
    popupEl.innerHTML = `
        <div class="user-popup-error">
            ${escapeHtml(message || 'Не удалось загрузить профиль')}
        </div>
    `;
}

function renderProfile(profile) {
    if (!popupEl) return;
    const displayName = profile?.display_name || profile?.username || 'Пользователь';
    const username = profile?.username ? `@${profile.username}` : '';
    const bio = (profile?.bio || '').trim();
    const currentUserId = getUser()?.id;
    const canWrite = Boolean(profile?.id && profile.id !== currentUserId && profile?.can_receive_dm !== false);

    popupEl.innerHTML = `
        <div class="user-popup-head">
            <div class="user-popup-avatar-wrap">
                ${profile?.avatar_url
        ? `<img src="${escapeHtml(resolveApiUrl(profile.avatar_url))}" alt="" class="user-popup-avatar-image">`
        : `<span class="user-popup-avatar-fallback">${escapeHtml(getInitial(profile))}</span>`}
            </div>
            <div class="user-popup-meta">
                <div class="user-popup-display-name">${escapeHtml(displayName)}</div>
                <div class="user-popup-username">${escapeHtml(username)}</div>
            </div>
        </div>
        ${bio ? `<div class="user-popup-bio">${escapeHtml(bio)}</div>` : ''}
        ${canWrite
        ? `<button type="button" class="btn btn-primary btn-sm user-popup-message-btn" data-action="write-message" data-user-id="${escapeHtml(profile.id)}">Написать</button>`
        : ''}
    `;
}

function positionPopup() {
    if (!popupEl || !activeAnchorEl || !popupEl.classList.contains('is-visible')) return;

    const anchorRect = activeAnchorEl.getBoundingClientRect();
    const margin = 10;

    popupEl.style.left = '0px';
    popupEl.style.top = '0px';
    const popupRect = popupEl.getBoundingClientRect();

    let left = anchorRect.right + margin;
    if (left + popupRect.width > window.innerWidth - margin) {
        left = anchorRect.left - popupRect.width - margin;
    }
    if (left < margin) {
        left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - popupRect.width - margin));
    }

    let top = anchorRect.top + (anchorRect.height - popupRect.height) / 2;
    if (top < margin) top = margin;
    if (top + popupRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - popupRect.height - margin);
    }

    const overlapsAnchor = left < anchorRect.right && left + popupRect.width > anchorRect.left;
    if (overlapsAnchor) {
        left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - popupRect.width - margin));
        top = anchorRect.bottom + margin;
        if (top + popupRect.height > window.innerHeight - margin) {
            top = anchorRect.top - popupRect.height - margin;
        }
        if (top < margin) top = margin;
    }

    popupEl.style.left = `${Math.round(left)}px`;
    popupEl.style.top = `${Math.round(top)}px`;
}

export async function showUserPopup(userId, anchorElement) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId || !anchorElement) {
        hideUserPopup();
        return;
    }

    ensurePopupElement();
    renderRequestId += 1;
    const requestId = renderRequestId;
    activeUserId = normalizedUserId;
    activeAnchorEl = anchorElement;
    popupEl.classList.add('is-visible');
    attachListeners();
    renderLoading();
    positionPopup();

    try {
        const profile = await usersApi.getProfile(normalizedUserId);
        if (requestId !== renderRequestId || activeUserId !== normalizedUserId) return;
        renderProfile(profile);
        positionPopup();
    } catch (error) {
        if (requestId !== renderRequestId || activeUserId !== normalizedUserId) return;
        renderError(error.message);
        positionPopup();
    }
}

export function hideUserPopup() {
    renderRequestId += 1;
    activeUserId = '';
    activeAnchorEl = null;
    if (popupEl) {
        popupEl.classList.remove('is-visible');
        popupEl.innerHTML = '';
    }
    detachListeners();
}
