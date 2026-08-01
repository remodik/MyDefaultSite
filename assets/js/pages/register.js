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
                    <i class="fas fa-user-plus v1-auth-icon" aria-hidden="true"></i>
                    <h1 class="v1-auth-title">${escapeHtml(t('page_register_title'))}</h1>
                    <p class="v1-auth-sub">${escapeHtml(t('page_register_sub'))}</p>
                </div>

                <form id="register-form" class="v1-form">
                    <div class="v1-field">
                        <label class="v1-label" for="username">${escapeHtml(t('field_username_req'))}</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_username'))}"
                            data-testid="register-username"
                            required
                            autocomplete="username"
                        >
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="email">${escapeHtml(t('field_email_opt'))}</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_email'))}"
                            data-testid="register-email"
                            autocomplete="email"
                        >
                        <p class="v1-hint">${escapeHtml(t('email_hint'))}</p>
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="password">${escapeHtml(t('field_password_req'))}</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_password_register'))}"
                            data-testid="register-password"
                            required
                            minlength="6"
                            autocomplete="new-password"
                        >
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="password-confirm">${escapeHtml(t('field_password_confirm'))}</label>
                        <input
                            type="password"
                            id="password-confirm"
                            name="password-confirm"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_password_confirm'))}"
                            data-testid="register-password-confirm"
                            required
                            autocomplete="new-password"
                        >
                    </div>

                    <div class="v1-consent">
                        <input
                            type="checkbox"
                            id="privacy-consent"
                            name="privacy-consent"
                            class="v1-checkbox"
                            required
                        >
                        <label for="privacy-consent">
                            ${escapeHtml(t('consent_text_pre'))}
                            <a href="/terms" class="v1-link">${escapeHtml(t('consent_terms'))}</a>
                            ${escapeHtml(t('consent_and'))}
                            <a href="/privacy" class="v1-link">${escapeHtml(t('consent_privacy'))}</a>,
                            ${escapeHtml(t('consent_text_post'))}
                        </label>
                    </div>

                    <div id="error-message" class="v1-msg error hidden"></div>

                    <button type="submit" class="v1-btn v1-btn-primary v1-btn-block" data-testid="register-submit">
                        <i class="fas fa-user-plus"></i>
                        ${escapeHtml(t('btn_register'))}
                    </button>
                </form>

                <div class="v1-divider">${escapeHtml(t('or'))}</div>

                <div id="google-signin-button" class="v1-actions" style="justify-content:center"></div>

                <p class="v1-muted v1-center" style="margin-top:var(--v1-space-5)">
                    ${escapeHtml(t('have_account'))}
                    <a href="/login" class="v1-link">${escapeHtml(t('login_link'))}</a>
                </p>
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
            submitBtn.textContent = t('loading');
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
