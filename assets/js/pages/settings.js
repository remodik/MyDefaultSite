import { meApi } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';

let formEl = null;
let submitHandler = null;

function setFormDisabled(disabled) {
    if (!formEl) return;
    const controls = formEl.querySelectorAll('input, textarea, select, button');
    controls.forEach((control) => {
        control.disabled = disabled;
    });
}

function fillForm(profile) {
    if (!formEl || !profile) return;
    formEl.display_name.value = profile.display_name || '';
    formEl.bio.value = profile.bio || '';
    formEl.accent_color.value = profile.accent_color || '';
    formEl.privacy_dm.value = profile.privacy_dm === 'none' ? 'none' : 'all';
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
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle text-discord-red"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Не удалось загрузить настройки</h3>
                <p class="text-discord-text mt-2">${escapeHtml(error.message || 'Ошибка запроса')}</p>
            </div>
        `;
        bodyEl.classList.remove('hidden');
        showToast(error.message || 'Ошибка загрузки настроек', 'error');
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
        await meApi.updateProfile(payload);
        showToast('Настройки сохранены', 'success');
    } catch (error) {
        showToast(error.message || 'Не удалось сохранить настройки', 'error');
    } finally {
        setFormDisabled(false);
    }
}

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-3xl">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-3xl font-bold text-white">
                        <i class="fas fa-gear text-discord-accent mr-3"></i>
                        Настройки
                    </h1>
                    <p class="text-discord-text mt-2">Измените публичные данные профиля и приватность DM</p>
                </div>
                <a href="/profile" class="btn btn-secondary btn-sm">
                    <i class="fas fa-arrow-left"></i>
                    К профилю
                </a>
            </div>

            <div class="profile-settings-card">
                <div id="settings-loading" class="flex justify-center py-10">
                    <div class="spinner spinner-lg"></div>
                </div>

                <div id="settings-body" class="hidden">
                    <form id="profile-settings-form" class="space-y-5">
                        <div>
                            <label class="label" for="display-name">Публичное имя</label>
                            <input
                                type="text"
                                id="display-name"
                                name="display_name"
                                class="input"
                                maxlength="50"
                                placeholder="Как вас показывать в чате"
                            >
                        </div>

                        <div>
                            <label class="label" for="bio">О себе</label>
                            <textarea
                                id="bio"
                                name="bio"
                                class="input"
                                rows="4"
                                maxlength="400"
                                placeholder="Кратко о себе"
                            ></textarea>
                        </div>

                        <div>
                            <label class="label" for="accent-color">Accent color (опционально)</label>
                            <input
                                type="text"
                                id="accent-color"
                                name="accent_color"
                                class="input"
                                maxlength="32"
                                placeholder="#5865f2"
                            >
                            <p class="text-xs text-discord-text mt-2">Пока используется как заготовка для будущей персонализации UI.</p>
                        </div>

                        <div>
                            <label class="label" for="privacy-dm">Кто может писать в личку</label>
                            <select id="privacy-dm" name="privacy_dm" class="input">
                                <option value="all">Все</option>
                                <option value="none">Никто</option>
                            </select>
                        </div>

                        <div class="flex items-center justify-end gap-3 pt-2">
                            <a href="/profile" class="btn btn-secondary">Отмена</a>
                            <button type="submit" class="btn btn-primary">
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
    submitHandler = handleSubmit;

    if (formEl) {
        formEl.addEventListener('submit', submitHandler);
    }

    loadSettings();
}

export function unmount() {
    if (formEl && submitHandler) {
        formEl.removeEventListener('submit', submitHandler);
    }
    formEl = null;
    submitHandler = null;
}
