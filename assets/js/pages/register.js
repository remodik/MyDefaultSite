// Register page

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
                        <i class="fas fa-user-plus text-6xl text-discord-accent mb-4"></i>
                        <h1 class="text-2xl font-bold text-white">Регистрация</h1>
                        <p class="text-discord-text mt-2">Создайте новый аккаунт</p>
                    </div>
                    
                    <form id="register-form" class="space-y-5">
                        <div>
                            <label class="label" for="username">Имя пользователя *</label>
                            <input 
                                type="text" 
                                id="username" 
                                name="username" 
                                class="input" 
                                placeholder="Введите имя пользователя"
                                data-testid="register-username"
                                required
                                autocomplete="username"
                            >
                        </div>
                        
                        <div>
                            <label class="label" for="email">Email (опционально)</label>
                            <input 
                                type="email" 
                                id="email" 
                                name="email" 
                                class="input" 
                                placeholder="Введите email"
                                data-testid="register-email"
                                autocomplete="email"
                            >
                            <p class="text-xs text-discord-text mt-1">Для восстановления пароля</p>
                        </div>
                        
                        <div>
                            <label class="label" for="password">Пароль *</label>
                            <input 
                                type="password" 
                                id="password" 
                                name="password" 
                                class="input" 
                                placeholder="Минимум 6 символов"
                                data-testid="register-password"
                                required
                                minlength="6"
                                autocomplete="new-password"
                            >
                        </div>
                        
                        <div>
                            <label class="label" for="password-confirm">Подтвердите пароль *</label>
                            <input 
                                type="password" 
                                id="password-confirm" 
                                name="password-confirm" 
                                class="input" 
                                placeholder="Повторите пароль"
                                data-testid="register-password-confirm"
                                required
                                autocomplete="new-password"
                            >
                        </div>
                        
                        <div id="error-message" class="hidden text-discord-red text-sm"></div>
                        
                        <button type="submit" class="btn btn-primary w-full" data-testid="register-submit">
                            <i class="fas fa-user-plus"></i>
                            Зарегистрироваться
                        </button>
                    </form>
                    
                    <div class="mt-6 text-center">
                        <p class="text-discord-text text-sm">
                            Уже есть аккаунт? 
                            <a href="/login" class="text-discord-accent hover:underline">Войти</a>
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
                errorDiv.textContent = 'Заполните обязательные поля';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            if (password.length < 6) {
                errorDiv.textContent = 'Пароль должен быть не менее 6 символов';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            if (password !== passwordConfirm) {
                errorDiv.textContent = 'Пароли не совпадают';
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
                showToast('Регистрация успешна!', 'success');
                router.navigate('/');
            } catch (error) {
                errorDiv.textContent = error.message || 'Ошибка регистрации';
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Зарегистрироваться';
            }
        });
    }
}

export function unmount() {}