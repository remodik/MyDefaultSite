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
                        <i class="fas fa-user-plus text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white ide-h">${escapeHtml(t('page_register_title'))}</h1>
                        <p class="text-discord-text mt-2">${escapeHtml(t('page_register_sub'))}</p>
                    </div>

                    <form id="register-form" class="space-y-5">
                        <div>
                            <label class="label" for="username">${escapeHtml(t('field_username_req'))}</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                class="input"
                                placeholder="${escapeHtml(t('ph_username'))}"
                                data-testid="register-username"
                                required
                                autocomplete="username"
                            >
                        </div>

                        <div>
                            <label class="label" for="email">${escapeHtml(t('field_email_opt'))}</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                class="input"
                                placeholder="${escapeHtml(t('ph_email'))}"
                                data-testid="register-email"
                                autocomplete="email"
                            >
                            <p class="text-xs text-discord-text mt-1">${escapeHtml(t('email_hint'))}</p>
                        </div>

                        <div>
                            <label class="label" for="password">${escapeHtml(t('field_password_req'))}</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                class="input"
                                placeholder="${escapeHtml(t('ph_password_register'))}"
                                data-testid="register-password"
                                required
                                minlength="6"
                                autocomplete="new-password"
                            >
                        </div>

                        <div>
                            <label class="label" for="password-confirm">${escapeHtml(t('field_password_confirm'))}</label>
                            <input
                                type="password"
                                id="password-confirm"
                                name="password-confirm"
                                class="input"
                                placeholder="${escapeHtml(t('ph_password_confirm'))}"
                                data-testid="register-password-confirm"
                                required
                                autocomplete="new-password"
                            >
                        </div>

                        <div class="flex items-start gap-3">
                            <input
                                type="checkbox"
                                id="privacy-consent"
                                name="privacy-consent"
                                class="mt-1 flex-shrink-0"
                                required
                            >
                            <label for="privacy-consent" class="text-sm text-discord-text cursor-pointer">
                                ${escapeHtml(t('consent_text_pre'))}
                                <a href="/terms" class="text-discord-accent hover:underline">${escapeHtml(t('consent_terms'))}</a>
                                ${escapeHtml(t('consent_and'))}
                                <a href="/privacy" class="text-discord-accent hover:underline">${escapeHtml(t('consent_privacy'))}</a>,
                                ${escapeHtml(t('consent_text_post'))}
                            </label>
                        </div>

                        <div id="error-message" class="hidden text-discord-red text-sm"></div>

                        <button type="submit" class="btn btn-primary w-full" data-testid="register-submit">
                            <i class="fas fa-user-plus"></i>
                            ${escapeHtml(t('btn_register'))}
                        </button>
                    </form>

                    <div class="flex items-center gap-3 my-6">
                        <div class="flex-1 h-px bg-white/10"></div>
                        <span class="text-discord-text text-xs uppercase">или</span>
                        <div class="flex-1 h-px bg-white/10"></div>
                    </div>

                    <div id="google-signin-button" class="flex justify-center"></div>

                    <div class="mt-6 text-center">
                        <p class="text-discord-text text-sm">
                            ${escapeHtml(t('have_account'))}
                            <a href="/login" class="text-discord-accent hover:underline">${escapeHtml(t('login_link'))}</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    const form = document.getElementById('register-form');
    const errorDiv = document.getElementById('error-message');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = form.username.value.trim();
            const email = form.email.value.trim() || null;
            const password = form.password.value;
            const passwordConfirm = form['password-confirm'].value;

            if (!username || !password) {
                errorDiv.textContent = t('register_required');
                errorDiv.classList.remove('hidden');
                return;
            }

            if (password.length < 6) {
                errorDiv.textContent = t('register_password_short');
                errorDiv.classList.remove('hidden');
                return;
            }

            if (password !== passwordConfirm) {
                errorDiv.textContent = t('register_password_mismatch');
                errorDiv.classList.remove('hidden');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
            errorDiv.classList.add('hidden');

            try {
                const response = await authApi.register(username, password, email);
                login(response.access_token, response.user);
                showToast(t('register_success'), 'success');
                await router.navigate('/');
            } catch (error) {
                errorDiv.textContent = error.message || t('register_failed');
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-user-plus"></i> ${escapeHtml(t('btn_register'))}`;
            }
        });
    }

    renderGoogleButton('google-signin-button', {
        onSuccess: async () => {
            showToast(t('register_success'), 'success');
            await router.navigate('/');
        },
        onError: (error) => {
            errorDiv.textContent = error.message || t('register_failed');
            errorDiv.classList.remove('hidden');
        },
    });
}

export function unmount() {}
