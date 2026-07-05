import { authApi } from '../api.js';
import { login } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml } from '../utils.js';
import { t } from '../i18n.js';
import { renderGoogleButton } from '../google-auth.js';

export function render() {
    return `
        <div class="min-h-screen flex items-center justify-center px-4 py-8">
            <div class="w-full max-w-md">
                <div class="bg-discord-light rounded-lg shadow-xl p-8 fade-in">
                    <div class="text-center mb-8">
                        <i class="fas fa-user-circle text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white ide-h">${escapeHtml(t('page_login_title'))}</h1>
                        <p class="text-discord-text mt-2">${escapeHtml(t('page_login_sub'))}</p>
                    </div>

                    <form id="login-form" class="space-y-6">
                        <div>
                            <label class="label" for="username">${escapeHtml(t('field_username'))}</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                class="input"
                                placeholder="${escapeHtml(t('ph_username'))}"
                                data-testid="login-username"
                                required
                                autocomplete="username"
                            >
                        </div>

                        <div>
                            <label class="label" for="password">${escapeHtml(t('field_password'))}</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                class="input"
                                placeholder="${escapeHtml(t('ph_password'))}"
                                data-testid="login-password"
                                required
                                autocomplete="current-password"
                            >
                        </div>

                        <div id="error-message" class="hidden text-discord-red text-sm"></div>

                        <button type="submit" class="btn btn-primary w-full" data-testid="login-submit">
                            <i class="fas fa-sign-in-alt"></i>
                            ${escapeHtml(t('btn_signin'))}
                        </button>
                    </form>

                    <div class="flex items-center gap-3 my-6">
                        <div class="flex-1 h-px bg-white/10"></div>
                        <span class="text-discord-text text-xs uppercase">или</span>
                        <div class="flex-1 h-px bg-white/10"></div>
                    </div>

                    <div id="google-signin-button" class="flex justify-center"></div>

                    <div class="mt-6 text-center space-y-2">
                        <a href="/password-reset" class="text-discord-accent hover:underline text-sm">
                            ${escapeHtml(t('forgot_password'))}
                        </a>
                        <p class="text-discord-text text-sm">
                            ${escapeHtml(t('no_account'))}
                            <a href="/register" class="text-discord-accent hover:underline">${escapeHtml(t('register_link'))}</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('error-message');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = form.username.value.trim();
            const password = form.password.value;

            if (!username || !password) {
                errorDiv.textContent = t('common_required_fields');
                errorDiv.classList.remove('hidden');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
            errorDiv.classList.add('hidden');

            try {
                const response = await authApi.login(username, password);
                login(response.access_token, response.user);
                showToast(`${t('welcome_back')} ${response.user.username}`, 'success');
                await router.navigate('/');
            } catch (error) {
                errorDiv.textContent = error.message || t('login_failed');
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> ${escapeHtml(t('btn_signin'))}`;
            }
        });
    }

    renderGoogleButton('google-signin-button', {
        onSuccess: async (result) => {
            showToast(`${t('welcome_back')} ${result.user.username}`, 'success');
            await router.navigate('/');
        },
        onError: (error) => {
            errorDiv.textContent = error.message || t('login_failed');
            errorDiv.classList.remove('hidden');
        },
    });
}

export function unmount() {}
