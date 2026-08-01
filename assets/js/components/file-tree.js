import {
  FileTree,
  prepareFileTreeInput,
  themeToTreeStyles,
} from "@pierre/trees";
import { filesApi, projectsApi } from "../api.js";
import { escapeHtml, getFileTypeFromName, showToast } from "../utils.js";
import { t } from "../i18n.js";
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

  // Сначала собираем папки, чьё собственное состояние = раскрыто.
  const expandedSet = new Set();
  for (const f of currentFiles) {
    if (!f.is_folder || !f.path) continue;
    const p = normPath(f.path);
    const h = tree.getItem(`${p}/`) || tree.getItem(p);
    if (h && h.isDirectory?.() && h.isExpanded?.()) expandedSet.add(p);
  }

  // Оставляем только те, у кого ВСЕ предки тоже раскрыты. Иначе потомок
  // свёрнутой папки в initialExpandedPaths заставит библиотеку раскрыть саму
  // свёрнутую папку (она форсит раскрытие предков, чтобы показать потомка).
  const out = [];
  for (const p of expandedSet) {
    const segs = p.split("/");
    let allAncestorsExpanded = true;
    for (let i = 1; i < segs.length; i++) {
      if (!expandedSet.has(segs.slice(0, i).join("/"))) {
        allAncestorsExpanded = false;
        break;
      }
    }
    if (allAncestorsExpanded) out.push(`${p}/`);
  }
  return out;
}

// Считается на каждый вызов: язык может смениться без перезагрузки страницы.
const emptyMarkup = () =>
  `<div class="v1-empty"><i class="fas fa-folder-open v1-empty-icon" aria-hidden="true"></i><p>${escapeHtml(t("ft_empty"))}</p></div>`;

export function renderFileTree(files, containerId, onSelect, projectId) {
  const host = document.getElementById(containerId);
  if (!host) return;

  const newPaths = buildTreePaths(files || []);

  if (
    tree &&
    tree.getFileTreeContainer?.() === host &&
    host.isConnected &&
    host.shadowRoot
  ) {
    const keepExpanded = captureExpandedPaths() || [];
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
      host.innerHTML = emptyMarkup();
    }
    return;
  }

  let preservedExpansion = null;
  if (tree && projectId === currentProjectId) {
    preservedExpansion = captureExpandedPaths();
  }
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
    host.innerHTML = emptyMarkup();
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
      onDropError: (err) => showToast(err || t("ft_move_failed"), "error"),
    },
    renaming: {
      onRename: handleRename,
      onError: (err) => showToast(err || t("ft_rename_failed"), "error"),
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
    showToast(t("ft_renamed"), "success");
  } catch (err) {
    showToast(err.message || t("ft_rename_failed"), "error");
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
      showToast(err.message || t("ft_move_failed"), "error");
    }
  }
  if (moved) showToast(t("ft_moved"), "success");
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
    showToast(err.message || t("ft_refresh_failed"), "error");
  }
}

// ---- Создание файлов/папок (вызывается кнопками на странице) -----------------

function promptName({ title, label, placeholder, onSubmit }) {
  showModal({
    title,
    content: `
        <div class="v1-form">
            <div class="v1-field">
                <label class="v1-label" for="ft-name-input">${escapeHtml(label)}</label>
                <input type="text" id="ft-name-input" class="v1-input" placeholder="${escapeHtml(placeholder)}" />
            </div>
        </div>`,
    footer: `
            <button class="v1-btn" data-action="cancel">${escapeHtml(t("common_cancel"))}</button>
            <button class="v1-btn v1-btn-primary" data-action="ok">${escapeHtml(t("common_create"))}</button>`,
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
          showToast(t("ft_enter_name"), "error");
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
    title: isFolder ? t("ft_new_folder") : t("ft_new_file"),
    label: isFolder ? t("ft_folder_name") : t("ft_file_name"),
    placeholder: isFolder ? "my-folder" : "example.js",
    onSubmit: async (name) => {
      try {
        if (isFolder) {
          await filesApi.createFolder(currentProjectId, name, parentPath);
          showToast(t("ft_folder_created"), "success");
        } else {
          await filesApi.create(
            currentProjectId,
            name,
            "",
            getFileTypeFromName(name),
            parentPath,
            false,
          );
          showToast(t("ft_file_created"), "success");
        }
      } catch (err) {
        showToast(err.message || t("common_save_error"), "error");
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
      label: t("ft_new_file"),
      action: () => createInFolder(parent, false),
    });
    items.push({
      icon: "fa-folder-plus",
      label: t("ft_new_folder"),
      action: () => createInFolder(parent, true),
    });
  }
  if (file) {
    items.push({ divider: true });
    items.push({
      icon: "fa-pen",
      label: t("common_rename"),
      action: () => tree?.startRenaming(rawPath),
    });
    items.push({
      icon: "fa-trash",
      label: t("common_delete"),
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
    ? t("ft_delete_folder_confirm")
    : t("ft_delete_file_confirm");
  confirmModal(message, async () => {
    try {
      await filesApi.delete(file.id);
      showToast(t("ft_deleted"), "success");
      if (selectedItem?.id === file.id) selectedItem = null;
    } catch (err) {
      showToast(err.message || t("common_delete_error"), "error");
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
