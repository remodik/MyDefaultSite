import { showModal, closeModal } from './modal.js';
import { vaultApi } from './vault-api.js';

export function openVaultSettings() {
    const id = showModal({
        title: 'Доступ агентов',
        size: 'xl',
        content: `
            <section class="vault-settings-section">
            <h4>Новый токен</h4>
            <form class="vault-settings-form" id="vault-token-form">
                <label>Имя агента <input class="vault-input" name="agentName" required pattern="[A-Za-z0-9_.\\-]{1,60}" placeholder="codex"></label>
                <label>Права <select class="vault-input" name="scope"><option value="read-only">Чтение</option><option value="read-write">Чтение и запись</option></select></label>
                <label class="vault-token-folders">Разрешённые папки <small>Через запятую. / даёт доступ ко всем папкам.</small>
                    <input class="vault-input" name="folders" required placeholder="agent/, inbox/">
                </label>
                <button class="vault-btn vault-settings-submit" type="submit">Создать токен</button>
            </form>
            <div id="vault-issued" hidden>Скопируйте токен: после закрытия он больше не показывается.
                <input class="vault-input" readonly aria-label="Новый токен" autocomplete="off">
            </div>
            <p id="vault-settings-error" role="alert"></p>
            </section>
            <section class="vault-settings-section">
                <h4>Токены</h4>
                <div id="vault-token-list" class="vault-settings-list"></div>
            </section>
            <section class="vault-settings-section">
                <h4>Ожидают одобрения</h4>
                <div id="vault-pending-list" class="vault-settings-list"></div>
            </section>
            <section class="vault-settings-section">
                <h4>Журнал изменений</h4>
                <ul id="vault-activity-list" class="vault-settings-list"></ul>
            </section>`,
    });
    const host = document.getElementById(`modal-${id}`);
    if (!host) return;
    host.classList.add('vault-settings-overlay');
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
            const row = node('div', '', tokens);
            row.className = 'vault-token-row';
            const info = node('div', '', row);
            node('strong', token.name, info);
            const access = token.scope === 'read-only' ? 'Чтение' : 'Чтение и запись';
            node('small', `${access} · ${token.prefixes.map(p => p || '/').join(', ')}`, info);
            if (token.revoked) node('small', 'Отозван', row);
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
            const row = node('li', '', log);
            node('div', entry.message, row);
            const meta = node('small', `${entry.author} · ${stamp} · `, row);
            node('code', entry.sha.slice(0, 8), meta).title = entry.sha;
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
