import {
  FileTree,
  prepareFileTreeInput,
  themeToTreeStyles,
} from "@pierre/trees";
import { filesApi, projectsApi } from "../api.js";
import { getFileTypeFromName, showToast } from "../utils.js";
import { closeModal, showModal } from "./modal.js";

// ---- Состояние компонента ---------------------------------------------------

let tree = null; // экземпляр FileTree
let currentFiles = []; // последний project.files
let currentContainerId = null;
let currentProjectId = null;
let onSelectCb = null;
let selectedItem = null;

const TREE_THEME = themeToTreeStyles({
  type: "dark",
  bg: "#2b2d31",
  fg: "#f2f3f5",
  colors: {
    "list.hoverBackground": "#313338",
    "list.activeSelectionBackground": "#404249",
    "list.focusBackground": "#404249",
    "list.inactiveSelectionBackground": "#404249",
    focusBorder: "#5865f2",
  },
});

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

export function renderFileTree(files, containerId, onSelect, projectId) {
  const host = document.getElementById(containerId);
  if (!host) return;

  currentFiles = files || [];
  currentContainerId = containerId;
  currentProjectId = projectId;
  onSelectCb = onSelect;

  // Пересобираем дерево с нуля (проект небольшой — это дёшево и надёжно).
  if (tree) {
    try {
      tree.unmount();
    } catch {}
    tree = null;
  }
  host.innerHTML = "";
  Object.assign(host.style, TREE_THEME);
  host.style.height = host.style.height || "60vh";

  const paths = buildTreePaths(currentFiles);

  if (!paths.length) {
    host.innerHTML =
      '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Нет файлов</p></div>';
    return;
  }

  tree = new FileTree({
    preparedInput: prepareFileTreeInput(paths),
    icons: { set: "standard", colored: true },
    search: true,
    density: "default",
    // Подсветка папки-цели при перетаскивании файлов из ОС.
    unsafeCSS: `
      .ft-drop-hover {
        background: rgba(88,101,242,.25) !important;
        outline: 2px dashed #5865f2;
        outline-offset: -2px;
        border-radius: 6px;
      }
    `,
    initialExpansion: "open",
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

// Перечитывает файлы с сервера и перерисовывает дерево.
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

export function createRootFile(projectId, containerId, files, onSelect) {
  currentProjectId = projectId;
  currentContainerId = containerId;
  onSelectCb = onSelect;
  promptName({
    title: "Создать файл",
    label: "Имя файла",
    placeholder: "example.js",
    onSubmit: async (name) => {
      try {
        await filesApi.create(
          projectId,
          name,
          "",
          getFileTypeFromName(name),
          "",
          false,
        );
        showToast("Файл создан", "success");
      } catch (err) {
        showToast(err.message || "Ошибка", "error");
      }
      await refreshTree();
    },
  });
}

export function createRootFolder(projectId, containerId, files, onSelect) {
  currentProjectId = projectId;
  currentContainerId = containerId;
  onSelectCb = onSelect;
  promptName({
    title: "Создать папку",
    label: "Имя папки",
    placeholder: "my-folder",
    onSubmit: async (name) => {
      try {
        await filesApi.createFolder(projectId, name, "");
        showToast("Папка создана", "success");
      } catch (err) {
        showToast(err.message || "Ошибка", "error");
      }
      await refreshTree();
    },
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
