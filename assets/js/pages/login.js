import { authApi } from '../api.js';
import { login } from '../auth.js';
import { router } from '../router.js';
import { showToast, escapeHtml } from '../utils.js';
import { t } from '../i18n.js';
import { renderGoogleButton } from '../google-auth.js';

export function render() {
    return `
        <div class="v1-auth">
            <div class="v1-auth-card fade-in">
                <div class="v1-auth-head">
                    <i class="fas fa-user-circle v1-auth-icon" aria-hidden="true"></i>
                    <h1 class="v1-auth-title">${escapeHtml(t('page_login_title'))}</h1>
                    <p class="v1-auth-sub">${escapeHtml(t('page_login_sub'))}</p>
                </div>

                <form id="login-form" class="v1-form">
                    <div class="v1-field">
                        <label class="v1-label" for="username">${escapeHtml(t('field_username'))}</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_username'))}"
                            data-testid="login-username"
                            required
                            autocomplete="username"
                        >
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="password">${escapeHtml(t('field_password'))}</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_password'))}"
                            data-testid="login-password"
                            required
                            autocomplete="current-password"
                        >
                    </div>

                    <div id="error-message" class="v1-msg error hidden"></div>

                    <button type="submit" class="v1-btn v1-btn-primary v1-btn-block" data-testid="login-submit">
                        <i class="fas fa-sign-in-alt"></i>
                        ${escapeHtml(t('btn_signin'))}
                    </button>
                </form>

                <div class="v1-divider">${escapeHtml(t('or'))}</div>

                <div id="google-signin-button" class="v1-actions" style="justify-content:center"></div>

                <div class="v1-vstack-sm v1-center" style="margin-top:var(--v1-space-5);display:flex;flex-direction:column">
                    <a href="/password-reset" class="v1-link" style="font-size:13px">
                        ${escapeHtml(t('forgot_password'))}
                    </a>
                    <p class="v1-muted">
                        ${escapeHtml(t('no_account'))}
                        <a href="/register" class="v1-link">${escapeHtml(t('register_link'))}</a>
                    </p>
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
            submitBtn.textContent = t('loading');
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
