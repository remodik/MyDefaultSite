import { authApi } from '../api.js';
import { router } from '../router.js';
import { showToast } from '../utils.js';

let step = 'request';
let usernameOrEmail = '';

export function render() {
    return `
        <div class="min-h-screen flex items-center justify-center px-4 py-8">
            <div class="w-full max-w-md">
                <div class="bg-discord-light rounded-lg shadow-xl p-8 fade-in">
                    <div class="text-center mb-8">
                        <i class="fas fa-key text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white">Восстановление пароля</h1>
                    </div>
                    
                    <div id="step-content"></div>
                    
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

function renderStepContent() {
    const container = document.getElementById('step-content');
    if (!container) return;
    
    if (step === 'request') {
        container.innerHTML = `
            <p class="text-discord-text mb-6 text-center">
                Введите имя пользователя или email
            </p>
            <form id="request-form" class="space-y-6">
                <div>
                    <label class="label" for="username-email">Имя пользователя или Email</label>
                    <input 
                        type="text" 
                        id="username-email" 
                        class="input" 
                        placeholder="Введите данные"
                        required
                    >
                </div>
                <div id="error-message" class="hidden text-discord-red text-sm"></div>
                <button type="submit" class="btn btn-primary w-full">
                    <i class="fas fa-paper-plane"></i>
                    Отправить запрос
                </button>
            </form>
        `;
        
        const form = document.getElementById('request-form');
        form.addEventListener('submit', handleRequestSubmit);
        
    } else if (step === 'code') {
        container.innerHTML = `
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-discord-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-envelope text-discord-green text-2xl"></i>
                </div>
                <p class="text-discord-text">
                    Код восстановления отправлен на ваш email
                </p>
            </div>
            <form id="reset-form" class="space-y-5">
                <div>
                    <label class="label" for="code">Код восстановления</label>
                    <input 
                        type="text" 
                        id="code" 
                        class="input text-center text-2xl tracking-widest" 
                        placeholder="000000"
                        maxlength="6"
                        required
                    >
                </div>
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
                <div id="error-message" class="hidden text-discord-red text-sm"></div>
                <button type="submit" class="btn btn-primary w-full">
                    <i class="fas fa-check"></i>
                    Сбросить пароль
                </button>
            </form>
        `;
        
        const form = document.getElementById('reset-form');
        form.addEventListener('submit', handleResetSubmit);
        
    } else if (step === 'no-email') {
        container.innerHTML = `
            <div class="text-center">
                <div class="w-16 h-16 bg-discord-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-exclamation-triangle text-discord-yellow text-2xl"></i>
                </div>
                <p class="text-discord-text mb-4">
                    У вашего аккаунта нет привязанного email.
                </p>
                <p class="text-discord-text mb-6">
                    Запрос на сброс пароля отправлен администратору.
                    Ожидайте обработки запроса.
                </p>
                <div class="bg-discord-darker rounded-lg p-4">
                    <p class="text-sm text-discord-text">
                        Свяжитесь с администратором для получения нового пароля.
                    </p>
                </div>
            </div>
        `;
    }
}

async function handleRequestSubmit(e) {
    e.preventDefault();

    const input = document.getElementById('username-email');
    const errorDiv = document.getElementById('error-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    usernameOrEmail = input.value.trim();

    if (!usernameOrEmail) {
        errorDiv.textContent = 'Введите имя пользователя или email';
        errorDiv.classList.remove('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
    errorDiv.classList.add('hidden');

    try {
        const response = await authApi.requestPasswordReset(usernameOrEmail);

        if (response.has_email) {
            step = 'code';
            showToast('Код отправлен на ваш email', 'success');
        } else {
            step = 'no-email';
            showToast('Запрос отправлен администратору', 'info');
        }

        renderStepContent();
    } catch (error) {
        errorDiv.textContent = error.message || 'Пользователь не найден';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить запрос';
    }
}

async function handleResetSubmit(e) {
    e.preventDefault();

    const code = document.getElementById('code').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const errorDiv = document.getElementById('error-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!code || !newPassword) {
        errorDiv.textContent = 'Заполните все поля';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (newPassword.length < 6) {
        errorDiv.textContent = 'Пароль должен быть не менее 6 символов';
        errorDiv.classList.remove('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
    errorDiv.classList.add('hidden');

    try {
        await authApi.resetPassword(usernameOrEmail, code, newPassword);
        showToast('Пароль успешно изменён!', 'success');
        router.navigate('/login');
    } catch (error) {
        errorDiv.textContent = error.message || 'Неверный или истёкший код';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Сбросить пароль';
    }
}

export function mount() {
    step = 'request';
    usernameOrEmail = '';
    renderStepContent();
}

export function unmount() {
    step = 'request';
    usernameOrEmail = '';
}
