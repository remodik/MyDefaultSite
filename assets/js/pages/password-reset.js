import { authApi } from '../api.js';
import { router } from '../router.js';
import { showToast } from '../utils.js';

let resetToken = null;
let tokenValid = false;

export function render() {
    return `
        <div class="v1-auth">
            <div class="v1-auth-card fade-in">
                <div class="v1-auth-head">
                    <i class="fas fa-key v1-auth-icon" aria-hidden="true"></i>
                    <h1 class="v1-auth-title">Восстановление пароля</h1>
                </div>

                <div id="step-content">
                    <div class="v1-loading">Загрузка…</div>
                </div>

                <div class="v1-center" style="margin-top:var(--v1-space-5)">
                    <a href="/login" class="v1-link">
                        <i class="fas fa-arrow-left" aria-hidden="true"></i>
                        Вернуться к входу
                    </a>
                </div>
            </div>
        </div>
    `;
}

function renderRequestForm() {
    const container = document.getElementById('step-content');
    if (!container) return;

    container.innerHTML = `
        <p class="v1-muted v1-center" style="margin-bottom:var(--v1-space-5)">
            Введите email, привязанный к вашему аккаунту
        </p>
        <form id="request-form" class="v1-form">
            <div class="v1-field">
                <label class="v1-label" for="email">Email</label>
                <input 
                    type="email" 
                    id="email" 
                    class="v1-input" 
                    placeholder="your@email.com"
                    required
                >
            </div>
            <div id="error-message" class="v1-msg error hidden"></div>
            <div id="success-message" class="v1-msg success hidden"></div>
            <button type="submit" class="v1-btn v1-btn-primary v1-btn-block">
                <i class="fas fa-paper-plane"></i>
                Отправить ссылку
            </button>
        </form>
    `;

    const form = document.getElementById('request-form');
    form.addEventListener('submit', handleRequestSubmit);
}

function renderNewPasswordForm() {
    const container = document.getElementById('step-content');
    if (!container) return;

    container.innerHTML = `
        <div class="v1-state-head success">
            <i class="fas fa-check" aria-hidden="true"></i>
            <p class="v1-muted">
                Введите новый пароль для вашего аккаунта
            </p>
        </div>
        <form id="reset-form" class="v1-form">
            <div class="v1-field">
                <label class="v1-label" for="new-password">Новый пароль</label>
                <input 
                    type="password" 
                    id="new-password" 
                    class="v1-input" 
                    placeholder="Минимум 6 символов"
                    minlength="6"
                    required
                >
            </div>
            <div class="v1-field">
                <label class="v1-label" for="confirm-password">Подтвердите пароль</label>
                <input 
                    type="password" 
                    id="confirm-password" 
                    class="v1-input" 
                    placeholder="Повторите пароль"
                    minlength="6"
                    required
                >
            </div>
            <div id="error-message" class="v1-msg error hidden"></div>
            <button type="submit" class="v1-btn v1-btn-primary v1-btn-block">
                <i class="fas fa-check"></i>
                Сохранить новый пароль
            </button>
        </form>
    `;

    const form = document.getElementById('reset-form');
    form.addEventListener('submit', handleResetSubmit);
}

function renderInvalidToken() {
    const container = document.getElementById('step-content');
    if (!container) return;

    container.innerHTML = `
        <div class="v1-center">
            <div class="v1-state-head danger">
                <i class="fas fa-times" aria-hidden="true"></i>
            </div>
            <h3 class="v1-empty-h">Ссылка недействительна</h3>
            <p class="v1-muted" style="margin-bottom:var(--v1-space-5)">
                Срок действия ссылки истёк или она уже была использована.
            </p>
            <a href="/password-reset" class="v1-btn v1-btn-primary">
                <i class="fas fa-redo"></i>
                Запросить новую ссылку
            </a>
        </div>
    `;
}

async function handleRequestSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const email = emailInput.value.trim();

    if (!email) {
        errorDiv.textContent = 'Введите email';
        errorDiv.classList.remove('hidden');
        successDiv.classList.add('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка…';
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    try {
        const response = await authApi.requestPasswordReset(email);

        successDiv.replaceChildren();
        const icon = document.createElement('i');
        icon.className = 'fas fa-check-circle';
        icon.setAttribute('aria-hidden', 'true');
        successDiv.append(icon, document.createTextNode(response.message || 'Если этот email зарегистрирован, на него будет отправлена ссылка'));
        successDiv.classList.remove('hidden');

        emailInput.value = '';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить ссылку';

    } catch (error) {
        errorDiv.textContent = error.message || 'Произошла ошибка';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить ссылку';
    }
}

async function handleResetSubmit(e) {
    e.preventDefault();

    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorDiv = document.getElementById('error-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!newPassword || !confirmPassword) {
        errorDiv.textContent = 'Заполните все поля';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (newPassword.length < 6) {
        errorDiv.textContent = 'Пароль должен быть не менее 6 символов';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Пароли не совпадают';
        errorDiv.classList.remove('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение…';
    errorDiv.classList.add('hidden');

    try {
        await authApi.resetPassword(resetToken, newPassword);
        showToast('Пароль успешно изменён!', 'success');
        await router.navigate('/login');
    } catch (error) {
        errorDiv.textContent = error.message || 'Ошибка сброса пароля';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Сохранить новый пароль';
    }
}

async function checkToken(token) {
    try {
        await authApi.verifyResetToken(token);
        return true;
    } catch (error) {
        return false;
    }
}

export async function mount() {
    const urlParams = new URLSearchParams(window.location.search);
    resetToken = urlParams.get('token');

    if (resetToken) {
        tokenValid = await checkToken(resetToken);

        if (tokenValid) {
            renderNewPasswordForm();
        } else {
            renderInvalidToken();
        }
    } else {
        renderRequestForm();
    }
}

export function unmount() {
    resetToken = null;
    tokenValid = false;
}
