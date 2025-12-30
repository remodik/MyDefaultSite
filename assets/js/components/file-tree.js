import {filesApi} from '../api.js';
import {showToast} from '../utils.js';
import {showModal} from './modal.js';

let expandedFolders = new Set();
let selectedItem = null;
let contextMenuElement = null;
let draggedItem = null;

export function buildFileTree(files) {
    const root = [];
    const pathMap = new Map();

    const sortedFiles = [...files].sort((a, b) => {
        if (a.is_folder !== b.is_folder) {
            return a.is_folder ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    sortedFiles.forEach(file => {
        const item = { ...file, children: [] };
        pathMap.set(file.path, item);

        if (!file.parent_path) {
            root.push(item);
        } else {
            const parent = pathMap.get(file.parent_path);
            if (parent) {
                parent.children.push(item);
            } else {
                root.push(item);
            }
        }
    });

    return root;
}

function getFileIcon(file) {
    if (file.is_folder) {
        const isExpanded = expandedFolders.has(file.id);
        return `<i class="fas fa-folder${isExpanded ? '-open' : ''} folder-icon ${isExpanded ? 'open' : ''}"></i>`;
    }

    const iconMap = {
        'py': 'fab fa-python file-icon py',
        'js': 'fab fa-js file-icon js',
        'ts': 'fab fa-js file-icon js',
        'html': 'fab fa-html5 file-icon html',
        'css': 'fab fa-css3 file-icon css',
        'json': 'fas fa-brackets-curly file-icon json',
        'md': 'fab fa-markdown file-icon md',
        'txt': 'fas fa-file-alt file-icon txt',
        'jpg': 'fas fa-image',
        'jpeg': 'fas fa-image',
        'png': 'fas fa-image',
        'gif': 'fas fa-image',
        'mp4': 'fas fa-video',
        'pdf': 'fas fa-file-pdf',
    };

    const icon = iconMap[file.file_type] || 'fas fa-file';
    return `<i class="${icon}"></i>`;
}

function renderTreeItem(item, onSelect, onContextMenu, projectId) {
    const isExpanded = expandedFolders.has(item.id);
    const isSelected = selectedItem?.id === item.id;
    const hasChildren = item.is_folder && item.children.length > 0;

    return `
        <div class="file-tree-item" data-item-id="${item.id}">
            <div
                class="file-tree-item-content ${isSelected ? 'selected' : ''}"
                data-item-id="${item.id}"
                draggable="true"
            >
                <span class="file-tree-toggle ${!hasChildren ? 'empty' : ''} ${isExpanded ? 'expanded' : ''}" data-item-id="${item.id}">
                    <i class="fas fa-chevron-right"></i>
                </span>
                <span class="file-tree-icon">
                    ${getFileIcon(item)}
                </span>
                <span class="file-tree-name" title="${item.name}">${item.name}</span>
                <div class="file-tree-actions">
                    <button class="file-tree-action-btn" data-action="menu" data-item-id="${item.id}" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
            ${item.is_folder && isExpanded ? `
                <div class="file-tree-children">
                    ${item.children.map(child => renderTreeItem(child, onSelect, onContextMenu, projectId)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

export function renderFileTree(files, containerId, onSelect, projectId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tree = buildFileTree(files);

    container.innerHTML = `
        <div class="file-tree">
            ${tree.length > 0
        ? tree.map(item => renderTreeItem(item, onSelect, null, projectId)).join('')
        : '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No files yet</p></div>'
    }
        </div>
    `;
    attachTreeEventListeners(container, files, onSelect, projectId);
}

function attachTreeEventListeners(container, files, onSelect, projectId) {
    container.querySelectorAll('.file-tree-toggle:not(.empty)').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = toggle.dataset.itemId;

            if (expandedFolders.has(itemId)) {
                expandedFolders.delete(itemId);
            } else {
                expandedFolders.add(itemId);
            }

            renderFileTree(files, container.id, onSelect, projectId);
        });
    });

    container.querySelectorAll('.file-tree-item-content').forEach(content => {
        content.addEventListener('click', (e) => {
            if (e.target.closest('.file-tree-action-btn') || e.target.closest('.file-tree-toggle')) {
                return;
            }

            const itemId = content.dataset.itemId;
            const item = findItemById(files, itemId);

            if (item && !item.is_folder) {
                selectedItem = item;
                onSelect(item);
                renderFileTree(files, container.id, onSelect, projectId);
            } else if (item && item.is_folder) {
                if (expandedFolders.has(itemId)) {
                    expandedFolders.delete(itemId);
                } else {
                    expandedFolders.add(itemId);
                }
                renderFileTree(files, container.id, onSelect, projectId);
            }
        });
    });

    container.querySelectorAll('[data-action="menu"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.dataset.itemId;
            const item = findItemById(files, itemId);

            if (item) {
                showContextMenu(e, item, projectId, files, onSelect, container.id);
            }
        });
    });

    setupDragAndDrop(container, files, onSelect, projectId);
}

function findItemById(files, id) {
    for (const file of files) {
        if (file.id === id) return file;
    }
    return null;
}

function showContextMenu(event, item, projectId, files, onSelect, containerId) {
    // Remove existing menu
    if (contextMenuElement) {
        contextMenuElement.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const menuItems = [];

    if (item.is_folder) {
        menuItems.push(
            { icon: 'fa-file-plus', label: 'New File', action: () => createNewFile(item, projectId, files, onSelect, containerId) },
            { icon: 'fa-folder-plus', label: 'New Folder', action: () => createNewFolder(item, projectId, files, onSelect, containerId) },
            { divider: true }
        );
    }

    menuItems.push(
        { icon: 'fa-edit', label: 'Rename', action: () => renameItem(item, projectId, files, onSelect, containerId) },
        { icon: 'fa-trash', label: 'Delete', action: () => deleteItem(item, projectId, files, onSelect, containerId), danger: true }
    );

    menu.innerHTML = menuItems.map(item => {
        if (item.divider) {
            return '<div class="context-menu-divider"></div>';
        }
        return `
            <button class="context-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.label}">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </button>
        `;
    }).join('');

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;

    document.body.appendChild(menu);
    contextMenuElement = menu;

    menuItems.forEach((item, index) => {
        if (!item.divider) {
            const btn = menu.querySelector(`[data-action="${item.label}"]`);
            if (btn) {
                btn.addEventListener('click', () => {
                    item.action();
                    closeContextMenu();
                });
            }
        }
    });

    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    if (contextMenuElement) {
        contextMenuElement.remove();
        contextMenuElement = null;
    }
    document.removeEventListener('click', closeContextMenu);
}

async function createNewFile(folder, projectId, files, onSelect, containerId) {
    showModal(
        'Create New File',
        `
        <div class="space-y-4">
            <div>
                <label class="label">File Name</label>
                <input type="text" id="new-file-name" class="input" placeholder="example.js" />
            </div>
            <div>
                <label class="label">File Type</label>
                <select id="new-file-type" class="input">
                    <option value="txt">Text (.txt)</option>
                    <option value="js">JavaScript (.js)</option>
                    <option value="py">Python (.py)</option>
                    <option value="html">HTML (.html)</option>
                    <option value="css">CSS (.css)</option>
                    <option value="json">JSON (.json)</option>
                    <option value="md">Markdown (.md)</option>
                </select>
            </div>
        </div>
        `,
        async () => {
            const name = document.getElementById('new-file-name').value.trim();
            const fileType = document.getElementById('new-file-type').value;

            if (!name) {
                showToast('Please enter a file name', 'error');
                return false;
            }

            try {
                await filesApi.create(projectId, name, '', fileType, folder.path, false);
                showToast('File created successfully', 'success');

                const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                renderFileTree(updatedProject.files, containerId, onSelect, projectId);
                return true;
            } catch (error) {
                showToast(error.message, 'error');
                return false;
            }
        }
    );
}

async function createNewFolder(parentFolder, projectId, files, onSelect, containerId) {
    showModal(
        'Create New Folder',
        `
        <div class="space-y-4">
            <div>
                <label class="label">Folder Name</label>
                <input type="text" id="new-folder-name" class="input" placeholder="my-folder" />
            </div>
        </div>
        `,
        async () => {
            const name = document.getElementById('new-folder-name').value.trim();

            if (!name) {
                showToast('Please enter a folder name', 'error');
                return false;
            }

            try {
                await filesApi.createFolder(projectId, name, parentFolder ? parentFolder.path : '');
                showToast('Folder created successfully', 'success');

                if (parentFolder) {
                    expandedFolders.add(parentFolder.id);
                }

                const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                renderFileTree(updatedProject.files, containerId, onSelect, projectId);
                return true;
            } catch (error) {
                showToast(error.message, 'error');
                return false;
            }
        }
    );
}

async function renameItem(item, projectId, files, onSelect, containerId) {
    showModal(
        `Rename ${item.is_folder ? 'Folder' : 'File'}`,
        `
        <div class="space-y-4">
            <div>
                <label class="label">New Name</label>
                <input type="text" id="rename-input" class="input" value="${item.name}" />
            </div>
        </div>
        `,
        async () => {
            const newName = document.getElementById('rename-input').value.trim();

            if (!newName) {
                showToast('Please enter a name', 'error');
                return false;
            }

            if (newName === item.name) {
                return true;
            }

            try {
                await filesApi.rename(item.id, newName);
                showToast('Renamed successfully', 'success');

                const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                renderFileTree(updatedProject.files, containerId, onSelect, projectId);
                return true;
            } catch (error) {
                showToast(error.message, 'error');
                return false;
            }
        }
    );
}

async function deleteItem(item, projectId, files, onSelect, containerId) {
    const message = item.is_folder
        ? 'Are you sure you want to delete this folder and all its contents?'
        : 'Are you sure you want to delete this file?';

    showModal(
        `Delete ${item.is_folder ? 'Folder' : 'File'}`,
        `<p>${message}</p>`,
        async () => {
            try {
                await filesApi.delete(item.id);
                showToast('Deleted successfully', 'success');

                if (selectedItem?.id === item.id) {
                    selectedItem = null;
                }

                const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                renderFileTree(updatedProject.files, containerId, onSelect, projectId);
                return true;
            } catch (error) {
                showToast(error.message, 'error');
                return false;
            }
        }
    );
}

function setupDragAndDrop(container, files, onSelect, projectId) {
    container.querySelectorAll('.file-tree-item-content').forEach(content => {
        const itemId = content.dataset.itemId;
        const item = findItemById(files, itemId);

        content.addEventListener('dragstart', (e) => {
            draggedItem = item;
            content.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
        });

        content.addEventListener('dragend', (e) => {
            content.classList.remove('dragging');
            draggedItem = null;
        });

        if (item.is_folder) {
            content.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                if (draggedItem && draggedItem.id !== item.id && !item.path.startsWith(draggedItem.path)) {
                    content.classList.add('drag-over');
                }
            });

            content.addEventListener('dragleave', (e) => {
                content.classList.remove('drag-over');
            });

            content.addEventListener('drop', async (e) => {
                e.preventDefault();
                content.classList.remove('drag-over');

                if (!draggedItem || draggedItem.id === item.id) {
                    return;
                }

                if (item.path.startsWith(draggedItem.path)) {
                    showToast('Cannot move folder into itself', 'error');
                    return;
                }

                try {
                    await filesApi.move(draggedItem.id, item.path);
                    showToast('Moved successfully', 'success');

                    expandedFolders.add(item.id);

                    const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                    renderFileTree(updatedProject.files, container.id, onSelect, projectId);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        }
    });

    const tree = container.querySelector('.file-tree');
    if (tree) {
        tree.addEventListener('dragover', (e) => {
            if (!e.target.closest('.file-tree-item-content')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        });

        tree.addEventListener('drop', async (e) => {
            if (!e.target.closest('.file-tree-item-content')) {
                e.preventDefault();

                if (!draggedItem) {
                    return;
                }

                try {
                    await filesApi.move(draggedItem.id, '');
                    showToast('Moved to root', 'success');

                    const updatedProject = await import('../api.js').then(m => m.projectsApi.getById(projectId));
                    renderFileTree(updatedProject.files, container.id, onSelect, projectId);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            }
        });
    }
}

export async function createRootFolder(projectId, containerId, files, onSelect) {
    await createNewFolder(null, projectId, files, onSelect, containerId);
}

export async function createRootFile(projectId, containerId, files, onSelect) {
    await createNewFile({ path: '' }, projectId, files, onSelect, containerId);
}

export function clearSelection() {
    selectedItem = null;
}

export function getSelectedItem() {
    return selectedItem;
}