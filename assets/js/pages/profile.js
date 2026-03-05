import { meApi } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';

let profile = null;

function getInitialLetter(data) {
    const source = data?.display_name || data?.username || '?';
    return source.charAt(0).toUpperCase();
}

function renderAvatar(data) {
    if (data?.avatar_url) {
        const safeUrl = escapeHtml(data.avatar_url);
        return `<img src="${safeUrl}" alt="Avatar" class="profile-avatar-image">`;
    }

    return `
        <div class="profile-avatar-fallback" aria-hidden="true">
            ${escapeHtml(getInitialLetter(data))}
        </div>
    `;
}

function renderProfileContent() {
    const container = document.getElementById('profile-content');
    if (!container || !profile) return;

    const displayName = profile.display_name || profile.username;
    const bio = profile.bio?.trim() ? profile.bio : 'Пользователь пока не добавил описание.';
    const status = profile.status?.trim() ? profile.status : 'Не указан';

    container.innerHTML = `
        <div class="profile-page-grid fade-in">
            <section class="profile-main-card">
                <div class="profile-avatar-wrap">
                    ${renderAvatar(profile)}
                </div>

                <div class="profile-main-meta">
                    <h1 class="profile-display-name">${escapeHtml(displayName)}</h1>
                    <p class="profile-username">@${escapeHtml(profile.username)}</p>

                    <div class="profile-badges-row">
                        <span class="tag tag-primary">
                            <i class="fas fa-circle mr-1"></i>${escapeHtml(status)}
                        </span>
                        <span class="tag">
                            <i class="fas fa-shield-halved mr-1"></i>Аккаунт активен
                        </span>
                    </div>
                </div>
            </section>

            <section class="profile-info-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-user mr-2 text-discord-accent"></i>
                    О себе
                </h2>
                <p class="profile-bio">${escapeHtml(bio)}</p>
            </section>

            <section class="profile-info-card">
                <h2 class="profile-card-title">
                    <i class="fas fa-gear mr-2 text-discord-accent"></i>
                    Настройки приватности
                </h2>
                <div class="profile-meta-row">
                    <span class="profile-meta-label">Личные сообщения</span>
                    <span class="profile-meta-value">
                        ${profile.privacy_dm === 'none' ? 'Никто' : 'Все'}
                    </span>
                </div>
                <a href="/settings" class="btn btn-primary btn-sm mt-4">
                    <i class="fas fa-pen"></i>
                    Редактировать профиль
                </a>
            </section>
        </div>
    `;
}

async function loadProfile() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    try {
        profile = await meApi.getProfile();
        renderProfileContent();
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle text-discord-red"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Не удалось загрузить профиль</h3>
                <p class="text-discord-text mt-2">${escapeHtml(error.message || 'Ошибка запроса')}</p>
            </div>
        `;
        showToast(error.message || 'Ошибка загрузки профиля', 'error');
    }
}

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-user-circle text-discord-accent mr-3"></i>
                        Профиль
                    </h1>
                    <p class="text-discord-text mt-2">Публичная карточка вашего аккаунта</p>
                </div>
                <a href="/settings" class="btn btn-secondary btn-sm">
                    <i class="fas fa-sliders"></i>
                    Настройки
                </a>
            </div>

            <div id="profile-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    loadProfile();
}

export function unmount() {
    profile = null;
}
