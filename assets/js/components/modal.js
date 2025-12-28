// Modal component

import { generateId } from '../utils.js';

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
    
    // Close existing modal
    closeModal();
    
    const sizeClass = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        full: 'max-w-4xl',
    }[size] || 'max-w-md';
    
    container.innerHTML = `
        <div class="modal-overlay fade-in" id="modal-${id}">
            <div class="modal ${sizeClass}" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" data-close-modal>
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        </div>
    `;
    
    // Store close callback
    activeModal = { id, onClose };
    
    // Close on overlay click
    const overlay = document.getElementById(`modal-${id}`);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    // Close button
    const closeBtn = overlay.querySelector('[data-close-modal]');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // Close on Escape
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
    return showModal({
        title: 'Подтверждение',
        content: `<p class="text-discord-text">${message}</p>`,
        footer: `
            <button class="btn btn-secondary" data-cancel>Отмена</button>
            <button class="btn btn-danger" data-confirm>Подтвердить</button>
        `,
        onClose: onCancel,
    });
    
    // Wait for DOM update
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
}