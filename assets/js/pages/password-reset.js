import { authApi } from '../api.js';
import { router } from '../router.js';
import { showToast } from '../utils.js';

let resetToken = null;
let tokenValid = false;

export function render() {
    return `
        <div class="min-h-screen flex items-center justify-center px-4 py-8">
            <div class="w-full max-w-md">
                <div class="bg-discord-light rounded-lg shadow-xl p-8 fade-in">
                    <div class="text-center mb-8">
                        <i class="fas fa-key text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white">Восстановление пароля</h1>
                    </div>
                    
                    <div id="step-content">
                        <div class="flex justify-center py-8">
                            <div class="spinner spinner-lg"></div>
                        </div>
                    </div>
                    
                    <div class="mt-6 text-center">
                        <a href="/login" class="text-discord-accent hover:underline text-sm">
                            <i class="fas fa-arrow-left mr-1"></i>
                            Вернуться к входу
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderRequestForm() {
    const container = document.getElementById('step-content');
    if (!container) return;

    container.innerHTML = `
        <p class="text-discord-text mb-6 text-center">
            Введите email, привязанный к вашему аккаунту
        </p>
        <form id="request-form" class="space-y-6">
            <div>
                <label class="label" for="email">Email</label>
                <input 
                    type="email" 
                    id="email" 
                    class="input" 
                    placeholder="your@email.com"
                    required
                >
            </div>
            <div id="error-message" class="hidden text-discord-red text-sm"></div>
            <div id="success-message" class="hidden text-discord-green text-sm"></div>
            <button type="submit" class="btn btn-primary w-full">
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
        <div class="text-center mb-6">
            <div class="w-16 h-16 bg-discord-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-check text-discord-green text-2xl"></i>
            </div>
            <p class="text-discord-text">
                Введите новый пароль для вашего аккаунта
            </p>
        </div>
        <form id="reset-form" class="space-y-5">
            <div>
                <label class="label" for="new-password">Новый пароль</label>
                <input 
                    type="password" 
                    id="new-password" 
                    class="input" 
                    placeholder="Минимум 6 символов"
                    minlength="6"
                    required
                >
            </div>
            <div>
                <label class="label" for="confirm-password">Подтвердите пароль</label>
                <input 
                    type="password" 
                    id="confirm-password" 
                    class="input" 
                    placeholder="Повторите пароль"
                    minlength="6"
                    required
                >
            </div>
            <div id="error-message" class="hidden text-discord-red text-sm"></div>
            <button type="submit" class="btn btn-primary w-full">
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
        <div class="text-center">
            <div class="w-16 h-16 bg-discord-red/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-times text-discord-red text-2xl"></i>
            </div>
            <h3 class="text-white font-semibold mb-2">Ссылка недействительна</h3>
            <p class="text-discord-text mb-6">
                Срок действия ссылки истёк или она уже была использована.
            </p>
            <a href="/password-reset" class="btn btn-primary">
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
    submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    try {
        const response = await authApi.requestPasswordReset(email);

        successDiv.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="fas fa-check-circle"></i>
                <span>${response.message || 'Если этот email зарегистрирован, на него будет отправлена ссылка'}</span>
            </div>
        `;
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
    submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
    errorDiv.classList.add('hidden');

    try {
        await authApi.resetPassword(resetToken, newPassword);
        showToast('Пароль успешно изменён!', 'success');
        router.navigate('/login');
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