import { contactApi } from '../api.js';
import { showToast, escapeHtml } from '../utils.js';
import { t } from '../i18n.js';

export function render() {
    return `
        <div class="container mx-auto px-4 py-8 max-w-2xl">
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-white">
                    <i class="fas fa-envelope text-discord-accent mr-3"></i>
                    ${escapeHtml(t('page_contact_title'))}
                </h1>
                <p class="text-discord-text mt-2">${escapeHtml(t('page_contact_sub'))}</p>
            </div>

            <div class="bg-discord-light rounded-lg p-8 shadow-xl fade-in">
                <form id="contact-form" class="space-y-6">
                    <div class="grid md:grid-cols-2 gap-6">
                        <div>
                            <label class="label" for="contact-name">${escapeHtml(t('field_name'))} *</label>
                            <input
                                type="text"
                                id="contact-name"
                                class="input"
                                placeholder="${escapeHtml(t('ph_name'))}"
                                data-testid="contact-name"
                                required
                            >
                        </div>
                        <div>
                            <label class="label" for="contact-email">${escapeHtml(t('field_email'))} *</label>
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
                        <label class="label" for="contact-phone">${escapeHtml(t('field_phone'))}</label>
                        <input
                            type="tel"
                            id="contact-phone"
                            class="input"
                            placeholder="+7 (999) 123-45-67"
                            data-testid="contact-phone"
                        >
                    </div>

                    <div>
                        <label class="label" for="contact-subject">${escapeHtml(t('field_subject'))} *</label>
                        <input
                            type="text"
                            id="contact-subject"
                            class="input"
                            placeholder="${escapeHtml(t('ph_subject'))}"
                            data-testid="contact-subject"
                            required
                        >
                    </div>

                    <div>
                        <label class="label" for="contact-message">${escapeHtml(t('field_message'))} *</label>
                        <textarea
                            id="contact-message"
                            class="input"
                            rows="5"
                            placeholder="${escapeHtml(t('ph_message'))}"
                            data-testid="contact-message"
                            required
                        ></textarea>
                    </div>

                    <div id="contact-error" class="hidden text-discord-red text-sm"></div>
                    <div id="contact-success" class="hidden text-discord-green text-sm"></div>

                    <button type="submit" class="btn btn-primary w-full" data-testid="contact-submit">
                        <i class="fas fa-paper-plane"></i>
                        ${escapeHtml(t('btn_send'))}
                    </button>
                </form>
            </div>

            <div class="mt-8 grid md:grid-cols-3 gap-6">
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fas fa-envelope text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">${escapeHtml(t('contact_card_email'))}</h3>
                    <a href="mailto:slenderzet@gmail.com" class="text-discord-accent hover:underline">
                        slenderzet@gmail.com
                    </a>
                </div>
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fab fa-telegram text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">${escapeHtml(t('contact_card_tg'))}</h3>
                    <a href="https://t.me/remod3" target="_blank" class="text-discord-accent hover:underline">
                        @remod3
                    </a>
                </div>
                <div class="bg-discord-light rounded-lg p-6 text-center">
                    <i class="fab fa-discord text-3xl text-discord-accent mb-4"></i>
                    <h3 class="text-white font-semibold mb-2">${escapeHtml(t('contact_card_discord'))}</h3>
                    <a href="https://discord.gg/nKkQdDgWfC" target="_blank" class="text-discord-accent hover:underline">
                        ${escapeHtml(t('contact_discord_server'))}
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
                errorDiv.textContent = t('contact_required');
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
                        ${escapeHtml(t('contact_success'))}
                    </div>
                `;
                successDiv.classList.remove('hidden');
                showToast(t('contact_sent_toast'), 'success');

                form.reset();
            } catch (error) {
                errorDiv.textContent = error.message || t('contact_send_err');
                errorDiv.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> ${escapeHtml(t('btn_send'))}`;
            }
        });
    }
}

export function unmount() {}
