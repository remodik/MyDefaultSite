// Login page

import { authApi } from '../api.js';
import { login } from '../auth.js';
import { router } from '../router.js';
import { showToast } from '../utils.js';

export function render() {
    return `
        <div class="min-h-screen flex items-center justify-center px-4 py-8">
            <div class="w-full max-w-md">
                <div class="bg-discord-light rounded-lg shadow-xl p-8 fade-in">
                    <div class="text-center mb-8">
                        <i class="fas fa-user-circle text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white">Вход в аккаунт</h1>
                        <p class="text-discord-text mt-2">Введите данные для входа</p>
                    </div>
                    
                    <form id="login-form" class="space-y-6">
                        <div>
                            <label class="label" for="username">Имя пользователя</label>
                            <input 
                                type="text" 
                                id="username" 
                                name="username" 
                                class="input" 
                                placeholder="Введите имя пользователя"
                                data-testid="login-username"
                                required
                                autocomplete="username"
                            >
                        </div>
                        
                        <div>
                            <label class="label" for="password">Пароль</label>
                            <input 
                                type="password" 
                                id="password" 
                                name="password" 
                                class="input" 
                                placeholder="Введите пароль"
                                data-testid="login-password"
                                required
                                autocomplete="current-password"
                            >
                        </div>
                        
                        <div id="error-message" class="hidden text-discord-red text-sm"></div>
                        
                        <button type="submit" class="btn btn-primary w-full" data-testid="login-submit">
                            <i class="fas fa-sign-in-alt"></i>
                            Войти
                        </button>
                    </form>
                    
                    <div class="mt-6 text-center space-y-2">
                        <a href="/password-reset" class="text-discord-accent hover:underline text-sm">
                            Забыли пароль?
                        </a>
                        <p class="text-discord-text text-sm">
                            Нет аккаунта? 
                            <a href="/register" class="text-discord-accent hover:underline">Зарегистрируйтесь</a>
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
                errorDiv.textContent = 'Заполните все поля';
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
                showToast(`Добро пожаловать, ${response.user.username}!`, 'success');
                router.navigate('/');
            } catch (error) {
                errorDiv.textContent = error.message || 'Ошибка входа. Проверьте данные.';
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
            }
        });
    }
}

export function unmount() {}