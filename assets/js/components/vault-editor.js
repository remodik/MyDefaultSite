// Редактор исходника заметки: CodeMirror 6 как ES-модули с CDN, без сборки.
//
// Все пакеты берутся с esm.sh и закрепляют общие @codemirror/state и
// @codemirror/view через ?deps: два экземпляра state на странице ломают
// CodeMirror («Unrecognized extension value»). Если CDN недоступен или
// загрузка затянулась, редактор откатывается на обычный <textarea> —
// править заметки можно в любом случае.

const STATE = '@codemirror/state@6.7.6';
const VIEW = '@codemirror/view@6.43.15';
const DEPS = `?deps=${STATE},${VIEW}`;
const CDN = 'https://esm.sh';
const LOAD_TIMEOUT_MS = 10000;

let modulesPromise = null;

function loadCodeMirror() {
    if (!modulesPromise) {
        modulesPromise = Promise.all([
            import(`${CDN}/codemirror@6.0.2${DEPS}`),
            import(`${CDN}/${STATE}`),
            import(`${CDN}/${VIEW}`),
            import(`${CDN}/@codemirror/lang-markdown@6.5.2${DEPS}`),
            import(`${CDN}/@codemirror/theme-one-dark@6.1.3${DEPS}`),
        ]).then(([core, state, view, markdown, theme]) => ({
            basicSetup: core.basicSetup,
            EditorState: state.EditorState,
            EditorView: view.EditorView,
            markdown: markdown.markdown,
            oneDark: theme.oneDark,
        }));
        modulesPromise.catch(() => { modulesPromise = null; });
    }
    return modulesPromise;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

function createTextareaEditor(parent, { doc, onChange }) {
    const textarea = document.createElement('textarea');
    textarea.className = 'vault-textarea';
    textarea.spellcheck = false;
    textarea.value = doc;
    textarea.setAttribute('aria-label', 'Исходный текст заметки');
    textarea.addEventListener('input', () => onChange(textarea.value));
    parent.replaceChildren(textarea);
    return {
        kind: 'textarea',
        getValue: () => textarea.value,
        setValue: (text) => { textarea.value = text; },
        focus: () => textarea.focus(),
        destroy: () => textarea.remove(),
    };
}

function createCodeMirrorEditor(parent, { doc, onChange }, cm) {
    const { basicSetup, EditorState, EditorView, markdown, oneDark } = cm;
    let silent = false;
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc,
            extensions: [
                basicSetup,
                markdown(),
                oneDark,
                EditorView.lineWrapping,
                EditorView.theme({
                    '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent' },
                    '.cm-scroller': {
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        lineHeight: '1.6',
                    },
                    '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
                    '.cm-content': { padding: '12px 0 40vh' },
                }, { dark: true }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !silent) onChange(update.state.doc.toString());
                }),
            ],
        }),
    });
    return {
        kind: 'codemirror',
        getValue: () => view.state.doc.toString(),
        setValue: (text) => {
            // Замена текста извне (загрузка новой версии) — не правка пользователя.
            silent = true;
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
            silent = false;
        },
        focus: () => view.focus(),
        destroy: () => view.destroy(),
    };
}

/**
 * Создаёт редактор в `parent`. `onChange(text)` вызывается на каждую правку
 * пользователя. Возвращает { kind, getValue, setValue, focus, destroy }.
 */
export async function createEditor(parent, options) {
    parent.replaceChildren();
    try {
        const cm = await withTimeout(loadCodeMirror(), LOAD_TIMEOUT_MS);
        return createCodeMirrorEditor(parent, options, cm);
    } catch (error) {
        console.warn('CodeMirror недоступен, используется textarea:', error);
        return createTextareaEditor(parent, options);
    }
}
