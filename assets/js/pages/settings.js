import { meApi, resolveApiUrl } from '../api.js';
import { applyUserAccentColor, escapeHtml, showToast } from '../utils.js';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

let formEl = null;
let avatarPreviewEl = null;
let avatarInputEl = null;
let avatarUploadBtnEl = null;
let avatarDeleteBtnEl = null;

let submitHandler = null;
let avatarChangeHandler = null;
let avatarPickHandler = null;
let avatarDeleteHandler = null;

let currentProfile = null;

function setFormDisabled(disabled) {
    if (!formEl) return;
    const controls = formEl.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
        control.disabled = disabled;
    });
}

function getAvatarInitial(profile) {
    const source = profile?.display_name || profile?.username || '?';
    return source.charAt(0).toUpperCase();
}

function renderAvatarPreview(profile) {
    if (!avatarPreviewEl) return;

    if (profile?.avatar_url) {
        avatarPreviewEl.innerHTML = `<img src="${escapeHtml(resolveApiUrl(profile.avatar_url))}" alt="Аватар" class="settings-avatar-image">`;
    } else {
        avatarPreviewEl.innerHTML = `<span class="settings-avatar-fallback">${escapeHtml(getAvatarInitial(profile))}</span>`;
    }

    if (avatarDeleteBtnEl) {
        avatarDeleteBtnEl.disabled = !profile?.avatar_url;
    }
}

function fillForm(profile) {
    if (!formEl || !profile) return;
    currentProfile = profile;
    formEl.display_name.value = profile.display_name || '';
    formEl.bio.value = profile.bio || '';
    formEl.accent_color.value = profile.accent_color || '';
    formEl.privacy_dm.value = profile.privacy_dm === 'none' ? 'none' : 'all';
    renderAvatarPreview(profile);
    applyUserAccentColor(profile.accent_color || null);
}

async function loadSettings() {
    const loadingEl = document.getElementById('settings-loading');
    const bodyEl = document.getElementById('settings-body');
    if (!loadingEl || !bodyEl) return;

    try {
        const profile = await meApi.getProfile();
        fillForm(profile);
        loadingEl.classList.add('hidden');
        bodyEl.classList.remove('hidden');
    } catch (error) {
        loadingEl.classList.add('hidden');
        bodyEl.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-exclamation-triangle v1-empty-icon" style="color:var(--v1-red)" aria-hidden="true"></i>
                <div class="v1-empty-h">Не удалось загрузить настройки</div>
                <p>${escapeHtml(error.message || 'Ошибка запроса')}</p>
            </div>
        `;
        bodyEl.classList.remove('hidden');
        showToast(error.message || 'Ошибка загрузки настроек', 'error');
    }
}

function validateAvatar(file) {
    if (!file) return 'Файл не выбран';
    if (!file.type || !file.type.startsWith('image/')) return 'Можно загружать только изображения';
    if (file.size > AVATAR_MAX_BYTES) return 'Размер файла должен быть до 5MB';
    return '';
}

function openAvatarPicker() {
    avatarInputEl?.click();
}

async function handleAvatarSelected(event) {
    const file = event.target.files?.[0];
    const validationError = validateAvatar(file);
    if (validationError) {
        if (file) showToast(validationError, 'warning');
        if (avatarInputEl) avatarInputEl.value = '';
        return;
    }

    setFormDisabled(true);
    try {
        const profile = await meApi.uploadAvatar(file);
        fillForm(profile);
        showToast('Аватар обновлён', 'success');
    } catch (error) {
        showToast(error.message || 'Не удалось загрузить аватар', 'error');
    } finally {
        if (avatarInputEl) avatarInputEl.value = '';
        setFormDisabled(false);
    }
}

async function handleDeleteAvatar() {
    if (!currentProfile?.avatar_url) {
        showToast('Аватар уже удалён', 'info');
        return;
    }

    setFormDisabled(true);
    try {
        const profile = await meApi.deleteAvatar();
        fillForm(profile);
        showToast('Аватар удалён', 'success');
    } catch (error) {
        showToast(error.message || 'Не удалось удалить аватар', 'error');
    } finally {
        setFormDisabled(false);
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    if (!formEl) return;

    const payload = {
        display_name: formEl.display_name.value.trim(),
        bio: formEl.bio.value,
        accent_color: formEl.accent_color.value.trim() || null,
        privacy_dm: formEl.privacy_dm.value,
    };

    setFormDisabled(true);
    try {
        const profile = await meApi.updateProfile(payload);
        fillForm(profile);
        showToast('Настройки сохранены', 'success');
    } catch (error) {
        showToast(error.message || 'Не удалось сохранить настройки', 'error');
    } finally {
        setFormDisabled(false);
    }
}

export function render() {
    return `
        <div class="v1-doc v1-doc-compact">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// settings.js</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-gear v1-page-title-icon" aria-hidden="true"></i>Настройки
                    </h1>
                    <p class="v1-page-sub">Измените публичные данные профиля и приватность DM</p>
                </div>
                <a href="/profile" class="v1-btn v1-btn-sm">
                    <i class="fas fa-arrow-left"></i>
                    К профилю
                </a>
            </div>

            <div class="profile-settings-card v1-card">
                <div id="settings-loading" class="v1-loading">Загрузка…</div>

                <div id="settings-body" class="hidden">
                    <form id="profile-settings-form" class="v1-form">
                        <section class="settings-avatar-section">
                            <label class="v1-label">Аватар</label>
                            <div class="settings-avatar-row">
                                <button type="button" id="settings-avatar-preview" class="settings-avatar-preview" aria-label="Выбрать фото профиля"></button>
                                <div class="settings-avatar-actions">
                                    <input id="settings-avatar-input" type="file" accept="image/*" class="hidden">
                                    <div class="settings-avatar-buttons">
                                        <button type="button" id="settings-avatar-upload" class="v1-btn v1-btn-sm">
                                            <i class="fas fa-upload"></i>
                                            Загрузить фото
                                        </button>
                                        <button type="button" id="settings-avatar-delete" class="v1-btn v1-btn-danger v1-btn-sm">
                                            <i class="fas fa-trash"></i>
                                            Удалить
                                        </button>
                                    </div>
                                    <p class="settings-avatar-hint">Поддерживаются только изображения, размер до 5MB.</p>
                                </div>
                            </div>
                        </section>

                        <div class="v1-field">
                            <label class="v1-label" for="display-name">Публичное имя</label>
                            <input
                                type="text"
                                id="display-name"
                                name="display_name"
                                class="v1-input"
                                maxlength="50"
                                placeholder="Как вас показывать в чате"
                            >
                        </div>

                        <div class="v1-field">
                            <label class="v1-label" for="bio">О себе</label>
                            <textarea
                                id="bio"
                                name="bio"
                                class="v1-input"
                                rows="4"
                                maxlength="400"
                                placeholder="Кратко о себе"
                            ></textarea>
                        </div>

                        <div class="v1-field">
                            <label class="v1-label" for="accent-color">Accent color (опционально)</label>
                            <input
                                type="text"
                                id="accent-color"
                                name="accent_color"
                                class="v1-input"
                                maxlength="32"
                                placeholder="#007acc"
                            >
                        </div>

                        <div class="v1-field">
                            <label class="v1-label" for="privacy-dm">Кто может писать в личку</label>
                            <select id="privacy-dm" name="privacy_dm" class="v1-input">
                                <option value="all">Все</option>
                                <option value="none">Никто</option>
                            </select>
                        </div>

                        <div class="v1-actions v1-actions-end">
                            <a href="/profile" class="v1-btn">Отмена</a>
                            <button type="submit" class="v1-btn v1-btn-primary">
                                <i class="fas fa-save"></i>
                                Сохранить
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    formEl = document.getElementById('profile-settings-form');
    avatarPreviewEl = document.getElementById('settings-avatar-preview');
    avatarInputEl = document.getElementById('settings-avatar-input');
    avatarUploadBtnEl = document.getElementById('settings-avatar-upload');
    avatarDeleteBtnEl = document.getElementById('settings-avatar-delete');

    submitHandler = handleSubmit;
    avatarChangeHandler = handleAvatarSelected;
    avatarPickHandler = openAvatarPicker;
    avatarDeleteHandler = handleDeleteAvatar;

    formEl?.addEventListener('submit', submitHandler);
    avatarInputEl?.addEventListener('change', avatarChangeHandler);
    avatarPreviewEl?.addEventListener('click', avatarPickHandler);
    avatarUploadBtnEl?.addEventListener('click', avatarPickHandler);
    avatarDeleteBtnEl?.addEventListener('click', avatarDeleteHandler);

    loadSettings();
}

export function unmount() {
    formEl?.removeEventListener('submit', submitHandler);
    avatarInputEl?.removeEventListener('change', avatarChangeHandler);
    avatarPreviewEl?.removeEventListener('click', avatarPickHandler);
    avatarUploadBtnEl?.removeEventListener('click', avatarPickHandler);
    avatarDeleteBtnEl?.removeEventListener('click', avatarDeleteHandler);

    formEl = null;
    avatarPreviewEl = null;
    avatarInputEl = null;
    avatarUploadBtnEl = null;
    avatarDeleteBtnEl = null;
    submitHandler = null;
    avatarChangeHandler = null;
    avatarPickHandler = null;
    avatarDeleteHandler = null;
    currentProfile = null;
}
