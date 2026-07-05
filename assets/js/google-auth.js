import { authApi } from './api.js';
import { login } from './auth.js';

function waitForGoogleSdk() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }
        const start = Date.now();
        const interval = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > 5000) {
                clearInterval(interval);
                reject(new Error('Google SDK failed to load'));
            }
        }, 100);
    });
}

export async function renderGoogleButton(containerId, { onSuccess, onError } = {}) {
    const clientId = window.APP_CONFIG?.GOOGLE_CLIENT_ID;
    const container = document.getElementById(containerId);
    if (!clientId || !container) return;

    try {
        await waitForGoogleSdk();
    } catch (error) {
        return;
    }

    window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
            try {
                const result = await authApi.googleLogin(response.credential);
                login(result.access_token, result.user);
                onSuccess?.(result);
            } catch (error) {
                onError?.(error);
            }
        },
    });

    window.google.accounts.id.renderButton(container, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'continue_with',
    });
}
