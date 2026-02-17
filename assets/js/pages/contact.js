import { contactApi } from '../api.js';
import { showToast } from '../utils.js';

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-2xl">
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-white">
                    <i class="fas fa-envelope text-discord-accent mr-3"></i>
                    Контакты
                </h1>
                <p class="text-discord-text mt-2">Свяжитесь со мной</p>
            </div>
            
            <div class="bg-discord-light rounded-lg p-8 shadow-xl fade-in">
                <form id="contact-form" class="space-y-6">
                    <div class="grid md:grid-cols-2 gap-6">
                        <div>
                            <label class="label" for="contact-name">Имя *</label>
                            <input 
                                type="text" 
                                id="contact-name" 
                                class="input" 
                                placeholder="Ваше имя"
                                data-testid="contact-name"
                                required
                            >
                        </div>
                        <div>
                            <label class="label" for="contact-email">Email *</label>
                            <input 
                                type="email" 
                                id="contact-email" 
                                class="input" 
                                placeholder="your@email.com"
                                data-testid="contact-email"
                                required
                            >
                        </div>
                    </div>
                    
                    <div>
                        <label class="label" for="contact-phone">Телефон (необязательно)</label>
                        <input 
                            type="tel" 
                            id="contact-phone" 
                            class="input" 
                            placeholder="+7 (999) 123-45-67"
                            data-testid="contact-phone"
                        >
                    </div>
                    
                    <div>
                        <label class="label" for="contact-subject">Тема *</label>
                        <input 
                            type="text" 
                            id="contact-subject" 
                            class="input" 
                            placeholder="Тема сообщения"
                            data-testid="contact-subject"
                            required
                        >
                    </div>
                    
                    <div>
                        <label class="label" for="contact-message">Сообщение *</label>
                        <textarea 
                            id="contact-message" 
                            class="input" 
                            rows="5" 
                            placeholder="Ваше сообщение..."
                            data-testid="contact-message"
                            required
                        ></textarea>
                    </div>
                    
                    <div id="contact-error" class="hidden text-discord-red text-sm"></div>
                    <div id="contact-success" class="hidden text-discord-green text-sm"></div>
                    
                    <button type="submit" class="btn btn-primary w-full" data-testid="contact-submit">
                        <i class="fas fa-paper-plane"></i>
                        Отправить сообщение
                    </button>
                </form>
            </div>
            
            <div class="mt-8 grid md:grid-cols-3 gap-6">
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fas fa-envelope text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">Email</h3>
                    <a href="mailto:slenderzet@gmail.com" class="text-discord-accent hover:underline">
                        slenderzet@gmail.com
                    </a>
                </div>
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fab fa-telegram text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">Telegram</h3>
                    <a href="https://t.me/remod3" target="_blank" class="text-discord-accent hover:underline">
                        @remod3
                    </a>
                </div>
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fab fa-discord text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">Discord</h3>
                    <a href="https://discord.gg/nKkQdDgWfC" target="_blank" class="text-discord-accent hover:underline">
                        Сервер
                    </a>
                </div>
            </div>
        </div>
    `;
}

export function mount() {
    const form = document.getElementById('contact-form');
    const errorDiv = document.getElementById('contact-error');
    const successDiv = document.getElementById('contact-success');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('contact-name').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const phone = document.getElementById('contact-phone').value.trim() || null;
            const subject = document.getElementById('contact-subject').value.trim();
            const message = document.getElementById('contact-message').value.trim();
            
            if (!name || !email || !subject || !message) {
                errorDiv.textContent = 'Заполните все обязательные поля';
                errorDiv.classList.remove('hidden');
                successDiv.classList.add('hidden');
                return;
            }
            
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner mx-auto"></div>';
            errorDiv.classList.add('hidden');
            successDiv.classList.add('hidden');
            
            try {
                await contactApi.send({ name, email, phone, subject, message });
                
                successDiv.innerHTML = `
                    <div class="flex items-center gap-2">
                        <i class="fas fa-check-circle"></i>
                        Сообщение успешно отправлено! Я отвечу вам в ближайшее время.
                    </div>
                `;
                successDiv.classList.remove('hidden');
                showToast('Сообщение отправлено!', 'success');

                form.reset();
            } catch (error) {
                errorDiv.textContent = error.message || 'Ошибка отправки. Попробуйте позже.';
                errorDiv.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить сообщение';
            }
        });
    }
}

export function unmount() {}