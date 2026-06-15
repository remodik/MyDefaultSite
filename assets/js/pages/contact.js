import { contactApi } from '../api.js';
import { showToast, escapeHtml } from '../utils.js';
import { t } from '../i18n.js';

export function render() {
    return `
        <div class="v1-doc" style="max-width:760px">
            <div class="v1-page-header" style="justify-content:flex-start">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// contact.yml</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-envelope v1-page-title-icon"></i>${escapeHtml(t('page_contact_title'))}
                    </h1>
                    <p class="v1-page-sub">${escapeHtml(t('page_contact_sub'))}</p>
                </div>
            </div>

            <div class="v1-panel fade-in">
                <form id="contact-form" class="v1-form">
                    <div class="v1-form-row">
                        <div class="v1-field">
                            <label class="v1-label" for="contact-name">${escapeHtml(t('field_name'))} *</label>
                            <input
                                type="text"
                                id="contact-name"
                                class="v1-input"
                                placeholder="${escapeHtml(t('ph_name'))}"
                                data-testid="contact-name"
                                required
                            >
                        </div>
                        <div class="v1-field">
                            <label class="v1-label" for="contact-email">${escapeHtml(t('field_email'))} *</label>
                            <input
                                type="email"
                                id="contact-email"
                                class="v1-input"
                                placeholder="your@email.com"
                                data-testid="contact-email"
                                required
                            >
                        </div>
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="contact-phone">${escapeHtml(t('field_phone'))}</label>
                        <input
                            type="tel"
                            id="contact-phone"
                            class="v1-input"
                            placeholder="+7 (999) 123-45-67"
                            data-testid="contact-phone"
                        >
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="contact-subject">${escapeHtml(t('field_subject'))} *</label>
                        <input
                            type="text"
                            id="contact-subject"
                            class="v1-input"
                            placeholder="${escapeHtml(t('ph_subject'))}"
                            data-testid="contact-subject"
                            required
                        >
                    </div>

                    <div class="v1-field">
                        <label class="v1-label" for="contact-message">${escapeHtml(t('field_message'))} *</label>
                        <textarea
                            id="contact-message"
                            class="v1-input"
                            rows="5"
                            placeholder="${escapeHtml(t('ph_message'))}"
                            data-testid="contact-message"
                            required
                        ></textarea>
                    </div>

                    <div id="contact-error" class="v1-msg error hidden"></div>
                    <div id="contact-success" class="v1-msg success hidden"></div>

                    <button type="submit" class="v1-btn v1-btn-primary v1-btn-lg" data-testid="contact-submit">
                        <i class="fas fa-paper-plane"></i>
                        ${escapeHtml(t('btn_send'))}
                    </button>
                </form>
            </div>

            <div class="v1-contact-grid">
                <div class="v1-contact-card">
                    <i class="fas fa-envelope"></i>
                    <h3>${escapeHtml(t('contact_card_email'))}</h3>
                    <a href="mailto:slenderzet@gmail.com">slenderzet@gmail.com</a>
                </div>
                <div class="v1-contact-card">
                    <i class="fab fa-telegram"></i>
                    <h3>${escapeHtml(t('contact_card_tg'))}</h3>
                    <a href="https://t.me/remod3" target="_blank" rel="noopener">@remod3</a>
                </div>
                <div class="v1-contact-card">
                    <i class="fab fa-discord"></i>
                    <h3>${escapeHtml(t('contact_card_discord'))}</h3>
                    <a href="https://discord.gg/nKkQdDgWfC" target="_blank" rel="noopener">
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
