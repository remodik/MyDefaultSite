import { generateId } from '../utils.js';
import { t } from '../i18n.js';

let activeModal = null;

export function showModal(options) {
    const {
        title,
        content,
        footer,
        onClose,
        size = 'md',
    } = options;
    
    const id = generateId();
    const container = document.getElementById('modal-container');
    if (!container) return;

    closeModal();
    
    const sizeClass = {
        sm: 'v1-modal-sm',
        md: 'v1-modal-md',
        lg: 'v1-modal-lg',
        xl: 'v1-modal-xl',
        '2xl': 'v1-modal-2xl',
        full: 'v1-modal-full',
    }[size] || 'v1-modal-md';
    
    container.innerHTML = `
        <div class="v1-modal-overlay fade-in" id="modal-${id}">
            <div class="v1-modal ${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${id}">
                <div class="v1-modal-header">
                    <h3 class="v1-modal-title" id="modal-title-${id}">${title}</h3>
                    <button class="v1-modal-close" data-close-modal aria-label="${t('common_close')}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="v1-modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="v1-modal-footer">${footer}</div>` : ''}
            </div>
        </div>
    `;

    activeModal = { id, onClose };

    const overlay = document.getElementById(`modal-${id}`);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    const closeBtn = overlay.querySelector('[data-close-modal]');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', handleEscape);
    
    return id;
}

export function closeModal() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    
    if (activeModal?.onClose) {
        activeModal.onClose();
    }
    
    container.innerHTML = '';
    activeModal = null;
    
    document.removeEventListener('keydown', handleEscape);
}

function handleEscape(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
}

export function confirmModal(message, onConfirm, onCancel) {
    const id = showModal({
        title: t('confirm_title'),
        content: `<p class="v1-muted">${message}</p>`,
        footer: `
        <button class="v1-btn" data-cancel>${t('common_cancel')}</button>
        <button class="v1-btn v1-btn-danger" data-confirm>${t('confirm_ok')}</button>
    `,
        onClose: onCancel,
    });

    setTimeout(() => {
        const confirmBtn = document.querySelector('[data-confirm]');
        const cancelBtn = document.querySelector('[data-cancel]');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                closeModal();
                if (onConfirm) onConfirm();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeModal();
                if (onCancel) onCancel();
            });
        }
    }, 0);

    return id;
}
