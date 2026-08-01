import { t } from '../i18n.js';
import { escapeHtml } from '../utils.js';

export function render() {
    return `
        <div class="v1-doc v1-center">
            <div class="v1-404">404</div>
            <h1 class="v1-page-title">${escapeHtml(t('not_found_h'))}</h1>
            <p class="v1-page-sub" style="margin-inline:auto">${escapeHtml(t('not_found_d'))}</p>
            <div class="v1-cta-row" style="justify-content:center;margin-top:var(--v1-space-6)">
                <a href="/" class="v1-btn v1-btn-primary">
                    <i class="fas fa-home"></i>
                    ${escapeHtml(t('not_found_home'))}
                </a>
            </div>
        </div>
    `;
}

export function mount() {}

export function unmount() {}
