import {
  FileTree,
  prepareFileTreeInput,
  themeToTreeStyles,
} from "@pierre/trees";
import { filesApi, projectsApi } from "../api.js";
import { getFileTypeFromName, showToast } from "../utils.js";
import { closeModal, confirmModal, showModal } from "./modal.js";

// ---- Состояние компонента ---------------------------------------------------

let tree = null; // экземпляр FileTree
let currentFiles = []; // последний project.files
let currentContainerId = null;
let currentProjectId = null;
let onSelectCb = null;
let selectedItem = null;

const TREE_THEME = {
  ...themeToTreeStyles({
    type: "dark",
    bg: "#3a3d44",
    fg: "#f2f3f5",
    colors: {
      "list.hoverBackground": "rgba(255,255,255,0.10)",
      "list.activeSelectionBackground": "rgba(88,101,242,0.32)",
      "list.focusBackground": "rgba(88,101,242,0.32)",
      "list.inactiveSelectionBackground": "rgba(255,255,255,0.06)",
      focusBorder: "#5865f2",
    },
  }),
  "--trees-theme-input-bg": "#43464e",
};

// ---- Преобразование данных --------------------------------------------------

// project.files -> массив путей для дерева. Папки помечаем завершающим "/",
// чтобы пустые папки тоже отображались.
function buildTreePaths(files) {
  return files
    .map((f) => {
      if (!f.path) return null;
      if (f.is_folder) return f.path.endsWith("/") ? f.path : `${f.path}/`;
      return f.path;
    })
    .filter(Boolean);
}

const normPath = (p) => (p || "").replace(/\/+$/, "");

function findByPath(path) {
  const n = normPath(path);
  return currentFiles.find((f) => normPath(f.path) === n) || null;
}

// ---- Рендер -----------------------------------------------------------------

// Снимает список раскрытых папок с текущего дерева (в форме с завершающим "/").
function captureExpandedPaths() {
  if (!tree) return null;
  const out = [];
  for (const f of currentFiles) {
    if (!f.is_folder || !f.path) continue;
    const slash = f.path.endsWith("/") ? f.path : `${f.path}/`;
    const h = tree.getItem(slash) || tree.getItem(normPath(f.path));
    if (h && h.isDirectory?.() && h.isExpanded?.()) out.push(slash);
  }
  return out;
}

const emptyMarkup =
  '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Нет файлов</p></div>';

export function renderFileTree(files, containerId, onSelect, projectId) {
  const host = document.getElementById(containerId);
  if (!host) return;

  // [DIAG] временная диагностика — удалить после разбора
  const _diag = {
    hadTree: !!tree,
    prevPid: currentProjectId,
    newPid: projectId,
    samePid: projectId === currentProjectId,
    liveHost: !!(
      tree &&
      tree.getFileTreeContainer?.() === host &&
      host.isConnected &&
      host.shadowRoot
    ),
  };

  const newPaths = buildTreePaths(files || []);

  if (
    tree &&
    tree.getFileTreeContainer?.() === host &&
    host.isConnected &&
    host.shadowRoot
  ) {
    const keepExpanded = captureExpandedPaths() || [];
    console.warn("🌲 FAST-PATH", { ..._diag, keepLen: keepExpanded.length });
    currentFiles = files || [];
    currentContainerId = containerId;
    currentProjectId = projectId;
    onSelectCb = onSelect;
    if (newPaths.length) {
      tree.resetPaths(newPaths, { initialExpandedPaths: keepExpanded });
    } else {
      try {
        tree.unmount();
      } catch {}
      tree = null;
      host.innerHTML = emptyMarkup;
    }
    return;
  }

  let preservedExpansion = null;
  if (tree && projectId === currentProjectId) {
    preservedExpansion = captureExpandedPaths();
  }
  console.warn("🌲 FULL-MOUNT", {
    ..._diag,
    preservedLen: preservedExpansion ? preservedExpansion.length : "NULL→ВСЕ РАСКРОЮТСЯ",
    preserved: preservedExpansion,
  });
  if (tree) {
    try {
      tree.unmount();
    } catch {}
    tree = null;
  }

  currentFiles = files || [];
  currentContainerId = containerId;
  currentProjectId = projectId;
  onSelectCb = onSelect;

  host.innerHTML = "";
  Object.assign(host.style, TREE_THEME);
  host.style.height = host.style.height || "60vh";

  if (!newPaths.length) {
    host.innerHTML = emptyMarkup;
    return;
  }

  tree = new FileTree({
    preparedInput: prepareFileTreeInput(newPaths),
    icons: { set: "standard", colored: true },
    search: true,
    density: "default",
    unsafeCSS: `
      svg[data-icon-token="default"] {
        color: #c2c5cd !important;
        fill: #c2c5cd !important;
      }
      .ft-drop-hover {
        background: rgba(88,101,242,.25) !important;
        outline: 2px dashed #5865f2;
        outline-offset: -2px;
        border-radius: 6px;
      }
    `,
    initialExpansion: "closed",
    initialExpandedPaths:
      preservedExpansion ||
      currentFiles
        .filter((f) => f.is_folder && f.path)
        .map((f) => (f.path.endsWith("/") ? f.path : `${f.path}/`)),
    initialSelectedPaths: selectedItem ? [normPath(selectedItem.path)] : [],
    dragAndDrop: {
      onDropComplete: handleDropComplete,
      onDropError: (err) => showToast(err || "Не удалось переместить", "error"),
    },
    renaming: {
      onRename: handleRename,
      onError: (err) => showToast(err || "Не удалось переименовать", "error"),
    },
    onSelectionChange: handleSelectionChange,
  });

  tree.render({ fileTreeContainer: host });

  host.addEventListener("contextmenu", onTreeContextMenu);
}

// ---- Обработчики действий дерева ---------------------------------------------

function handleSelectionChange(selectedPaths) {
  const p = selectedPaths && selectedPaths[0];
  if (!p) return;
  const file = findByPath(p);
  if (!file) return;
  selectedItem = file;
  if (!file.is_folder && onSelectCb) onSelectCb(file);
}

async function handleRename(event) {
  const file = findByPath(event.sourcePath);
  if (!file) return;
  const newName = normPath(event.destinationPath).split("/").pop();
  try {
    await filesApi.rename(file.id, newName);
    showToast("Переименовано", "success");
  } catch (err) {
    showToast(err.message || "Ошибка переименования", "error");
  }
  await refreshTree();
}

async function handleDropComplete(result) {
  const destDir = normPath(result.target?.directoryPath || "");
  let moved = 0;
  for (const dragged of result.draggedPaths || []) {
    const file = findByPath(dragged);
    if (!file) continue;
    try {
      await filesApi.move(file.id, destDir);
      moved++;
    } catch (err) {
      showToast(err.message || "Ошибка перемещения", "error");
    }
  }
  if (moved) showToast("Перемещено", "success");
  await refreshTree();
}

async function refreshTree() {
  if (!currentProjectId) return;
  try {
    const updated = await projectsApi.getById(currentProjectId);
    renderFileTree(
      updated.files || [],
      currentContainerId,
      onSelectCb,
      currentProjectId,
    );
  } catch (err) {
    showToast(err.message || "Не удалось обновить дерево", "error");
  }
}

// ---- Создание файлов/папок (вызывается кнопками на странице) -----------------

function promptName({ title, label, placeholder, onSubmit }) {
  showModal({
    title,
    content: `
        <div class="space-y-4">
            <div>
                <label class="label">${label}</label>
                <input type="text" id="ft-name-input" class="input" placeholder="${placeholder}" />
            </div>
        </div>`,
    footer: `
            <button class="btn btn-secondary" data-action="cancel">Отмена</button>
            <button class="btn btn-primary" data-action="ok">Создать</button>`,
  });

  setTimeout(() => {
    const okBtn = document.querySelector('[data-action="ok"]');
    const cancelBtn = document.querySelector('[data-action="cancel"]');
    const input = document.getElementById("ft-name-input");
    if (input) input.focus();
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeModal());
    if (okBtn) {
      okBtn.addEventListener("click", async () => {
        const name = (input?.value || "").trim();
        if (!name) {
          showToast("Введите имя", "error");
          return;
        }
        closeModal();
        await onSubmit(name);
      });
    }
  }, 0);
}

// Создание файла/папки внутри parentPath ("" = корень).
function createInFolder(parentPath, isFolder) {
  promptName({
    title: isFolder ? "Создать папку" : "Создать файл",
    label: isFolder ? "Имя папки" : "Имя файла",
    placeholder: isFolder ? "my-folder" : "example.js",
    onSubmit: async (name) => {
      try {
        if (isFolder) {
          await filesApi.createFolder(currentProjectId, name, parentPath);
          showToast("Папка создана", "success");
        } else {
          await filesApi.create(
            currentProjectId,
            name,
            "",
            getFileTypeFromName(name),
            parentPath,
            false,
          );
          showToast("Файл создан", "success");
        }
      } catch (err) {
        showToast(err.message || "Ошибка", "error");
      }
      await refreshTree();
    },
  });
}

export function createRootFile(projectId, containerId, files, onSelect) {
  currentProjectId = projectId;
  currentContainerId = containerId;
  onSelectCb = onSelect;
  createInFolder("", false);
}

export function createRootFolder(projectId, containerId, files, onSelect) {
  currentProjectId = projectId;
  currentContainerId = containerId;
  onSelectCb = onSelect;
  createInFolder("", true);
}

// ---- Контекстное меню --------------------------------------------------------

let contextMenuEl = null;

function closeTreeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
  document.removeEventListener("click", closeTreeContextMenu);
}

function onTreeContextMenu(e) {
  const host = document.getElementById(currentContainerId);
  const sr = host?.shadowRoot;
  if (!sr) return;
  e.preventDefault();
  closeTreeContextMenu();

  const hit = sr.elementFromPoint(e.clientX, e.clientY);
  const row = hit?.closest?.("[data-item-path]");
  const rawPath = row?.getAttribute("data-item-path") || "";
  const isFolder = row?.getAttribute("data-item-type") === "folder";
  const file = row ? findByPath(rawPath) : null;

  const items = [];
  if (isFolder || !row) {
    const parent = isFolder ? normPath(rawPath) : "";
    items.push({
      icon: "fa-file-circle-plus",
      label: "Новый файл",
      action: () => createInFolder(parent, false),
    });
    items.push({
      icon: "fa-folder-plus",
      label: "Новая папка",
      action: () => createInFolder(parent, true),
    });
  }
  if (file) {
    items.push({ divider: true });
    items.push({
      icon: "fa-pen",
      label: "Переименовать",
      action: () => tree?.startRenaming(rawPath),
    });
    items.push({
      icon: "fa-trash",
      label: "Удалить",
      danger: true,
      action: () => deleteEntry(file),
    });
  }
  if (!items.length) return;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = items
    .map((it, i) =>
      it.divider
        ? '<div class="context-menu-divider"></div>'
        : `<button class="context-menu-item ${it.danger ? "danger" : ""}" data-i="${i}">
             <i class="fas ${it.icon}"></i><span>${it.label}</span>
           </button>`,
    )
    .join("");

  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  document.body.appendChild(menu);
  contextMenuEl = menu;

  items.forEach((it, i) => {
    if (it.divider) return;
    const btn = menu.querySelector(`[data-i="${i}"]`);
    if (btn) {
      btn.addEventListener("click", () => {
        closeTreeContextMenu();
        it.action();
      });
    }
  });

  setTimeout(() => document.addEventListener("click", closeTreeContextMenu), 0);
}

function deleteEntry(file) {
  const message = file.is_folder
    ? "Удалить папку и всё её содержимое?"
    : "Удалить этот файл?";
  confirmModal(message, async () => {
    try {
      await filesApi.delete(file.id);
      showToast("Удалено", "success");
      if (selectedItem?.id === file.id) selectedItem = null;
    } catch (err) {
      showToast(err.message || "Ошибка удаления", "error");
    }
    await refreshTree();
  });
}

// ---- Вспомогательное для загрузки файлов (drag-drop из ОС) -------------------

// Возвращает путь папки под курсором (или "" — корень). Дерево живёт в shadow
// DOM, поэтому используем shadowRoot.elementFromPoint и data-item-path.
export function getFolderPathUnderCursor(containerId, x, y) {
  const host = document.getElementById(containerId);
  const sr = host?.shadowRoot;
  if (!sr) return "";
  const hit = sr.elementFromPoint(x, y);
  const row = hit?.closest?.("[data-item-path]");
  if (!row) return "";
  const path = row.getAttribute("data-item-path") || "";
  if (row.getAttribute("data-item-type") === "folder") return normPath(path);
  // Навели на файл — целимся в его папку.
  const idx = normPath(path).lastIndexOf("/");
  return idx === -1 ? "" : normPath(path).slice(0, idx);
}

export function highlightFolder(containerId, folderPath) {
  const host = document.getElementById(containerId);
  const sr = host?.shadowRoot;
  if (!sr) return;
  sr.querySelectorAll(".ft-drop-hover").forEach((el) =>
    el.classList.remove("ft-drop-hover"),
  );
  if (!folderPath) return;
  const row = sr.querySelector(
    `[data-item-path="${CSS.escape(folderPath + "/")}"]`,
  );
  if (row) row.classList.add("ft-drop-hover");
}

export function clearFolderHighlight(containerId) {
  highlightFolder(containerId, "");
}
