import { projectsApi, filesApi } from '../api.js';
import { isAdmin } from '../auth.js';
import { showToast, escapeHtml, getFileIcon, getPrismLanguage, renderMarkdown } from '../utils.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { renderFileTree, createRootFolder, createRootFile } from '../components/file-tree.js';

let project = null;
let selectedFile = null;

export function render(params) {
    return `
        <div class="container mx-auto px-4 py-8">
            <div id="project-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderProject() {
    const container = document.getElementById('project-content');
    if (!container || !project) return;
    
    container.innerHTML = `
        <!-- Header -->
        <div class="flex flex-wrap gap-4 justify-between items-center mb-6">
            <div class="flex items-center gap-4">
                <a href="/projects" class="btn btn-secondary btn-sm">
                    <i class="fas fa-arrow-left"></i>
                </a>
                <div>
                    <h1 class="text-2xl font-bold text-white">${escapeHtml(project.name)}</h1>
                    <p class="text-discord-text text-sm mt-1">${escapeHtml(project.description) || 'Нет описания'}</p>
                </div>
            </div>
            
            ${isAdmin() ? `
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" id="add-file-btn">
                        <i class="fas fa-file-plus"></i>
                        Новый файл
                    </button>
                    <button class="btn btn-primary btn-sm" id="add-folder-btn">
                        <i class="fas fa-folder-plus"></i>
                        Новая папка
                    </button>
                    <button class="btn btn-secondary btn-sm" id="upload-file-btn">
                        <i class="fas fa-upload"></i>
                        Загрузить
                    </button>
                    <input type="file" id="file-input" class="hidden" multiple>
                </div>
            ` : ''}
        </div>
        
        <div class="grid lg:grid-cols-4 gap-6">
            <div class="lg:col-span-1">
                <div class="bg-discord-light rounded-lg overflow-hidden">
                    <div class="p-4 border-b border-discord-lighter">
                        <h3 class="text-white font-semibold">
                            <i class="fas fa-folder-tree mr-2"></i>
                            ${(() => {
                                const files = project.files || [];
                                const folders = files.filter(f => f.is_folder).length;
                                const regularFiles = files.length - folders;
                                return folders > 0 || regularFiles > 0
                                    ? `${regularFiles} ${regularFiles === 1 ? 'файл' : 'файлов'}, ${folders} ${folders === 1 ? 'папка' : 'папок'}`
                                    : 'Пусто';
                            })()}
                        </h3>
                    </div>
                    <div class="p-2" id="file-list"></div>
                </div>
            </div>
            
            <div class="lg:col-span-3">
                <div id="file-viewer" class="bg-discord-light rounded-lg min-h-[400px]">
                    ${selectedFile ? renderFileViewer() : renderEmptyViewer()}
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
}

function renderEmptyViewer() {
    return `
        <div class="flex items-center justify-center h-[400px] text-discord-text">
            <div class="text-center">
                <i class="fas fa-file-code text-5xl mb-4 opacity-50"></i>
                <p>Выберите файл для просмотра</p>
            </div>
        </div>
    `;
}

function renderFileViewer() {
    if (!selectedFile) return renderEmptyViewer();
    
    const file = selectedFile;
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(file.file_type);
    const isVideo = ['mp4', 'avi', 'mov', 'webm'].includes(file.file_type);
    const isMarkdown = file.file_type === 'md';
    
    let contentHtml;
    
    if (isImage) {
        const src = file.is_binary ? `data:image/${file.file_type};base64,${file.content}` : file.content;
        contentHtml = `
            <div class="flex items-center justify-center p-8">
                <img src="${src}" alt="${escapeHtml(file.name)}" class="max-w-full max-h-[600px] rounded-lg shadow-lg">
            </div>
        `;
    } else if (isVideo) {
        const src = file.is_binary ? `data:video/${file.file_type};base64,${file.content}` : file.content;
        contentHtml = `
            <div class="flex items-center justify-center p-8">
                <video controls class="max-w-full max-h-[600px] rounded-lg shadow-lg">
                    <source src="${src}" type="video/${file.file_type}">
                    Ваш браузер не поддерживает видео.
                </video>
            </div>
        `;
    } else if (isMarkdown) {
        contentHtml = `
            <div class="markdown-content p-6">
                ${renderMarkdown(file.content)}
            </div>
        `;
    } else {
        const lang = getPrismLanguage(file.file_type);
        contentHtml = `
            <pre class="line-numbers"><code class="language-${lang}">${escapeHtml(file.content)}</code></pre>
        `;
    }
    
    return `
        <div class="file-header">
            <div class="file-name">
                <i class="${getFileIcon(file.file_type)}"></i>
                <span>${escapeHtml(file.name)}</span>
            </div>
            ${isAdmin() ? `
                <div class="flex gap-2">
                    ${!isImage && !isVideo ? `
                        <button class="btn btn-secondary btn-sm" id="edit-file-btn">
                            <i class="fas fa-edit"></i>
                            Редактировать
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm" id="delete-current-file-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        </div>
        <div class="file-content">
            ${contentHtml}
        </div>
    `;
}

function setupEventListeners() {
    if (project.files) {
        renderFileTree(project.files, 'file-list', (file) => {
            selectedFile = file;
            updateFileViewer();
        }, project.id);
    }

    const addFolderBtn = document.getElementById('add-folder-btn');
    if (addFolderBtn) {
        addFolderBtn.addEventListener('click', () => {
            createRootFile(project.id, 'file-list', project.files, (file) => {
                selectedFile = file;
                updateFileViewer();
            });
        });
    }

    const addFileBtn = document.getElementById('add-file-btn');
    if (addFileBtn) {
        addFileBtn.addEventListener('click', () => {
            createRootFolder(project.id, 'file-list', project.files, (file) => {
                selectedFile = file;
                updateFileViewer();
            });
        });
    }

    const uploadFileBtn = document.getElementById('upload-file-btn');
    const fileInput = document.getElementById('file-input');
    if (uploadFileBtn && fileInput) {
        uploadFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileUpload);
    }

    setupViewerListeners();
}

function updateFileViewer() {
    const viewer = document.getElementById('file-viewer');
    if (viewer) {
        viewer.innerHTML = selectedFile ? renderFileViewer() : renderEmptyViewer();
        setupViewerListeners();
    }
}

function setupViewerListeners() {
    const editFileBtn = document.getElementById('edit-file-btn');
    if (editFileBtn) {
        editFileBtn.addEventListener('click', () => showFileModal(selectedFile));
    }

    const deleteCurrentBtn = document.getElementById('delete-current-file-btn');
    if (deleteCurrentBtn) {
        deleteCurrentBtn.addEventListener('click', () => deleteFile(selectedFile.id));
    }

    if (window.Prism) {
        Prism.highlightAll();
    }

    if (window.renderMathInElement && selectedFile?.file_type === 'md') {
        const mdContent = document.querySelector('.markdown-content');
        if (mdContent) {
            renderMathInElement(mdContent, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                ],
                throwOnError: false,
            });
        }
    }
}

function showFileModal(file = null) {
    const isEdit = !!file;
    const fileTypes = [
        { value: 'py', label: 'Python (.py)' },
        { value: 'js', label: 'JavaScript (.js)' },
        { value: 'ts', label: 'TypeScript (.ts)' },
        { value: 'html', label: 'HTML (.html)' },
        { value: 'css', label: 'CSS (.css)' },
        { value: 'json', label: 'JSON (.json)' },
        { value: 'md', label: 'Markdown (.md)' },
        { value: 'txt', label: 'Text (.txt)' },
        { value: 'sql', label: 'SQL (.sql)' },
        { value: 'yml', label: 'YAML (.yml)' },
        { value: 'xml', label: 'XML (.xml)' },
    ];
    
    showModal({
        title: isEdit ? 'Редактировать файл' : 'Новый файл',
        content: `
            <form id="file-form" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="label" for="file-name">Имя файла</label>
                        <input type="text" id="file-name" class="input" value="${isEdit ? escapeHtml(file.name) : ''}" ${isEdit ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label class="label" for="file-type">Тип</label>
                        <select id="file-type" class="input" ${isEdit ? 'disabled' : ''}>
                            ${fileTypes.map(ft => `
                                <option value="${ft.value}" ${(isEdit && file.file_type === ft.value) ? 'selected' : ''}>
                                    ${ft.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="label" for="file-content">Содержимое</label>
                    <textarea id="file-content" class="input font-mono text-sm" rows="15" style="tab-size: 4;">${isEdit ? escapeHtml(file.content) : ''}</textarea>
                </div>
            </form>
        `,
        footer: `
            <button class="btn btn-secondary" data-close>Отмена</button>
            <button class="btn btn-primary" id="save-file-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? 'Сохранить' : 'Создать'}
            </button>
        `,
        size: 'full',
    });
    
    setTimeout(() => {
        const closeBtn = document.querySelector('[data-close]');
        const saveBtn = document.getElementById('save-file-btn');
        const textarea = document.getElementById('file-content');
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (saveBtn) saveBtn.addEventListener('click', () => saveFile(file?.id));

        if (textarea) {
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 4;
                }
            });
        }
    }, 0);
}

let isSaving = false;

async function saveFile(id = null) {
    if (isSaving) return;

    const name = document.getElementById('file-name').value.trim();
    const fileType = document.getElementById('file-type').value;
    const content = document.getElementById('file-content').value;

    if (!name) {
        showToast('Введите имя файла', 'error');
        return;
    }

    isSaving = true;
    const saveBtn = document.getElementById('save-file-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner"></div>';
    }

    try {
        if (id) {
            await filesApi.update(id, { name, content });
            showToast('Файл обновлён', 'success');
        } else {
            await filesApi.create(project.id, name, content, fileType);
            showToast('Файл создан', 'success');
        }
        closeModal();
        await loadProject(project.id);
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения', 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }
    } finally {
        isSaving = false;
    }
}

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    
    for (const file of files) {
        try {
            await filesApi.upload(project.id, file);
            showToast(`Файл ${file.name} загружен`, 'success');
        } catch (error) {
            showToast(`Ошибка загрузки ${file.name}`, 'error');
        }
    }
    
    e.target.value = '';
    await loadProject(project.id);
}

async function deleteFile(id) {
    confirmModal('Удалить этот файл?', async () => {
        try {
            await filesApi.delete(id);
            showToast('Файл удалён', 'success');
            if (selectedFile?.id === id) {
                selectedFile = null;
            }
            await loadProject(project.id);
        } catch (error) {
            showToast(error.message || 'Ошибка удаления', 'error');
        }
    });
}

async function loadProject(projectId) {
    try {
        project = await projectsApi.getById(projectId);

        if (selectedFile) {
            selectedFile = project.files?.find(f => f.id === selectedFile.id) || null;
        }
        if (!selectedFile && project.files?.length > 0) {
            selectedFile = project.files[0];
        }
        
        renderProject();
    } catch (error) {
        const container = document.getElementById('project-content');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-discord-red"></i>
                    <h3 class="text-xl font-semibold text-white mt-4">Проект не найден</h3>
                    <p class="text-discord-text mt-2">${error.message}</p>
                    <a href="/projects" class="btn btn-primary mt-4">
                        <i class="fas fa-arrow-left"></i>
                        Назад к проектам
                    </a>
                </div>
            `;
        }
    }
}

export function mount(params) {
    const projectId = params.id;
    if (projectId) {
        loadProject(projectId);
    }
}

export function unmount() {
    project = null;
    selectedFile = null;
}