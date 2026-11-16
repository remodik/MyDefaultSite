import { showModal, closeModal } from './modal.js';
import { vaultApi } from './vault-api.js';

export function openVaultSettings() {
    const id = showModal({
        title: 'Доступ агентов',
        size: 'lg',
        content: `
            <form class="vault-settings-form" id="vault-token-form">
                <label>Имя агента <input class="vault-input" name="agentName" required pattern="[A-Za-z0-9_.\\-]{1,60}" placeholder="codex"></label>
                <label>Права <select class="vault-input" name="scope"><option value="read-only">Чтение</option><option value="read-write">Чтение и запись</option></select></label>
                <label>Папки через запятую (/ — весь vault)
                    <input class="vault-input" name="folders" required placeholder="agent/, inbox/">
                </label>
                <button class="v1-btn" type="submit">Создать токен</button>
            </form>
            <p id="vault-issued" hidden>Скопируйте токен: после закрытия он больше не показывается.
                <input class="vault-input" readonly aria-label="Новый токен" autocomplete="off">
            </p>
            <p id="vault-settings-error" role="alert"></p>
            <h3>Токены</h3><div id="vault-token-list"></div>
            <h3>Ожидают одобрения</h3><div id="vault-pending-list"></div>
            <h3>Журнал изменений</h3><ul id="vault-activity-list"></ul>`,
    });
    const host = document.getElementById(`modal-${id}`);
    if (!host) return;
    const find = (selector) => host.querySelector(selector);
    const node = (tag, text, parent) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        parent.append(el);
        return el;
    };
    const button = (parent, label, call) => {
        const el = node('button', label, parent);
        el.type = 'button';
        el.className = 'v1-btn v1-btn-sm';
        el.onclick = () => guarded(el, call);
        return el;
    };
    async function guarded(el, call) {
        const error = find('#vault-settings-error');
        error.textContent = '';
        el.disabled = true;
        try { await call(); } catch (err) { error.textContent = err.message; }
        finally { el.disabled = false; }
    }

    async function load() {
        const [settings, activity] = await Promise.all([vaultApi.settings(), vaultApi.activity()]);
        if (!host.isConnected) return;
        const tokens = find('#vault-token-list');
        tokens.replaceChildren();
        for (const token of settings.tokens) {
            const row = node('p', `${token.name} · ${token.scope} · ${token.prefixes.map(p => p || '/').join(', ')} · `, tokens);
            if (token.revoked) row.append('отозван');
            else button(row, 'Отозвать', async () => { await vaultApi.revokeToken(token.id); await load(); });
        }
        if (!settings.tokens.length) tokens.textContent = 'Токенов нет';
        const pending = find('#vault-pending-list');
        pending.replaceChildren();
        for (const req of settings.pending) {
            const row = node('details', '', pending);
            node('summary', `${req.agent}: ${req.action} · ${req.path}${req.new_path ? ' → ' + req.new_path : ''}`, row);
            node('p', req.reason === 'destructive' ? 'Перемещение или корзина' : 'За пределами разрешённых папок', row);
            if (req.content) node('pre', req.content, row);
            const preview = node('div', '', row);
            let seen = null;
            const approve = button(row, 'Одобрить', async () => { await vaultApi.decide(req.id, true, seen); await load(); });
            if (req.action !== 'create') {
                approve.disabled = true;
                button(row, 'Показать текущую версию', async () => {
                    approve.disabled = true;
                    const note = await vaultApi.readNote(req.path);
                    seen = note.hash;
                    preview.replaceChildren();
                    node('pre', note.content, preview);
                    if (req.expected_hash && req.expected_hash !== seen) {
                        node('p', 'Версия изменилась. Отклоните запрос и попросите агента повторить его.', preview);
                    } else approve.disabled = false;
                });
            }
            button(row, 'Отклонить', async () => { await vaultApi.decide(req.id, false); await load(); });
        }
        if (!settings.pending.length) pending.textContent = 'Нет ожидающих запросов';
        const log = find('#vault-activity-list');
        log.replaceChildren();
        for (const entry of activity) {
            const stamp = new Date(Number(entry.time) * 1000).toLocaleString();
            node('li', `${stamp} · ${entry.author} · ${entry.message} · ${entry.sha.slice(0, 12)}`, log);
        }
        if (!activity.length) node('li', 'Пока нет коммитов', log);
    }

    const form = find('#vault-token-form');
    form.onsubmit = (event) => {
        event.preventDefault();
        void guarded(form.querySelector('button'), async () => {
            const fields = new FormData(form);
            const token = await vaultApi.issueToken({
                name: fields.get('agentName'), scope: fields.get('scope'),
                prefixes: fields.get('folders').split(',').map(s => s.trim()).filter(Boolean),
            });
            const issued = find('#vault-issued');
            issued.hidden = false;
            const input = issued.querySelector('input');
            input.value = token.token;
            input.focus();
            input.select();
            form.reset();
            await load();
        });
    };
    void load().catch(err => { find('#vault-settings-error').textContent = err.message; });
    return () => { if (host.isConnected) closeModal(); };
}
