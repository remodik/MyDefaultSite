import { projectsApi, filesApi } from "../api.js";
import { isAdmin } from "../auth.js";
import {
  showToast,
  escapeHtml,
  getFileIcon,
  getPrismLanguage,
  renderMarkdown,
  getFileTypeFromName,
  isMarkdownType,
} from "../utils.js";
import { showModal, closeModal, confirmModal } from "../components/modal.js";
import {
  renderFileTree,
  createRootFolder,
  createRootFile,
  getFolderPathUnderCursor,
  highlightFolder,
  clearFolderHighlight,
} from "../components/file-tree.js";

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
  const container = document.getElementById("project-content");
  if (!container || !project) return;

  container.innerHTML = `
        <div class="flex flex-wrap gap-4 justify-between items-center mb-6">
            <div class="flex items-center gap-4">
                <a href="/projects" class="btn btn-secondary btn-sm">
                    <i class="fas fa-arrow-left"></i>
                </a>
                <div>
                    <h1 class="text-2xl font-bold text-white">${escapeHtml(project.name)}</h1>
                    <p class="text-discord-text text-sm mt-1">${escapeHtml(project.description) || "Нет описания"}</p>
                </div>
            </div>

            ${
              isAdmin()
                ? `
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
            `
                : ""
            }
        </div>

        <div id="dd-overlay" style="
            display:none; position:fixed; inset:0; z-index:998;
            background:rgba(88,101,242,.15); backdrop-filter:blur(2px);
            border:3px dashed #5865f2; pointer-events:none;
            flex-direction:column; align-items:center; justify-content:center; gap:10px;
        ">
            <i class="fas fa-cloud-upload-alt" style="font-size:52px;color:#5865f2;"></i>
            <span id="dd-overlay-label" style="font-size:18px;font-weight:700;color:#f2f3f5;">Загрузить в корень</span>
            <span style="font-size:12px;color:#b5bac1;">Наведите на папку чтобы загрузить в неё</span>
        </div>

        <style>
            .dd-folder-highlight > .file-tree-item-content {
                background: rgba(88,101,242,.25) !important;
                outline: 2px dashed #5865f2;
                outline-offset: -2px;
            }
        </style>

        <div class="grid lg:grid-cols-4 gap-6">
            <div class="lg:col-span-1">
                <div class="bg-discord-light rounded-lg overflow-hidden">
                    <div class="p-4 border-b border-discord-lighter">
                        <h3 class="text-white font-semibold">
                            <i class="fas fa-folder-tree mr-2"></i>
                            ${(() => {
                              const files = project.files || [];
                              const folders = files.filter(
                                (f) => f.is_folder,
                              ).length;
                              const regularFiles = files.length - folders;
                              return folders > 0 || regularFiles > 0
                                ? `${regularFiles} ${regularFiles === 1 ? "файл" : "файлов"}, ${folders} ${folders === 1 ? "папка" : "папок"}`
                                : "Пусто";
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
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "ico"].includes(
    file.file_type,
  );
  const isVideo = ["mp4", "avi", "mov", "webm"].includes(file.file_type);
  const isMarkdown = isMarkdownType(file.file_type);
  const nonPreviewTypes = [
    "zip",
    "rar",
    "7z",
    "ppt",
    "pptx",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "pdf",
  ];
  const isUnsupported =
    file.is_folder ||
    nonPreviewTypes.includes((file.file_type || "").toLowerCase()) ||
    (file.is_binary && !isImage && !isVideo);

  let contentHtml;

  if (file.is_folder) {
    contentHtml = `
            <div class="flex items-center justify-center p-8 text-discord-text">
                <div class="text-center">
                    <i class="fas fa-folder text-4xl mb-3 opacity-60"></i>
                    <p>Это папка. Выберите файл для просмотра.</p>
                </div>
            </div>
        `;
  } else if (isUnsupported) {
    const mimeType = file.is_binary
      ? `application/${file.file_type || "octet-stream"}`
      : "text/plain;charset=utf-8";
    const downloadLink = file.content
      ? file.is_binary
        ? `data:${mimeType};base64,${file.content}`
        : `data:${mimeType},${encodeURIComponent(file.content)}`
      : null;
    contentHtml = `
            <div class="flex items-center justify-center p-8 text-discord-text">
                <div class="text-center max-w-md">
                    <i class="fas fa-file-archive text-4xl mb-3 opacity-60"></i>
                    <p>Предпросмотр для этого типа файла недоступен.</p>
                    ${
                      downloadLink
                        ? `
                        <a class="btn btn-secondary btn-sm mt-4 inline-flex items-center gap-2"
                           href="${downloadLink}" download="${escapeHtml(file.name)}">
                            <i class="fas fa-download"></i>
                            Скачать файл
                        </a>
                    `
                        : '<p class="text-sm mt-2">Файл пустой или не содержит данных для скачивания.</p>'
                    }
                </div>
            </div>
        `;
  } else if (isImage) {
    const src = file.is_binary
      ? `data:image/${file.file_type};base64,${file.content}`
      : file.content;
    contentHtml = `
            <div class="flex items-center justify-center p-8">
                <img src="${src}" alt="${escapeHtml(file.name)}"
                     class="max-w-full max-h-[600px] rounded-lg shadow-lg">
            </div>
        `;
  } else if (isVideo) {
    const src = file.is_binary
      ? `data:video/${file.file_type};base64,${file.content}`
      : file.content;
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
            ${
              isAdmin()
                ? `
                <div class="flex gap-2">
                    ${
                      !isImage && !isVideo && !isUnsupported
                        ? `
                        <button class="btn btn-secondary btn-sm" id="edit-file-btn">
                            <i class="fas fa-edit"></i>
                            Редактировать
                        </button>
                    `
                        : ""
                    }
                    <button class="btn btn-danger btn-sm" id="delete-current-file-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `
                : ""
            }
        </div>
        <div class="file-content">
            ${contentHtml}
        </div>
    `;
}

function setupEventListeners() {
  if (project.files) {
    renderFileTree(
      project.files,
      "file-list",
      (file) => {
        selectedFile = file;
        updateFileViewer();
      },
      project.id,
    );
  }

  const addFolderBtn = document.getElementById("add-folder-btn");
  if (addFolderBtn) {
    addFolderBtn.addEventListener("click", () => {
      createRootFolder(project.id, "file-list", project.files, (file) => {
        selectedFile = file;
        updateFileViewer();
      });
    });
  }

  const addFileBtn = document.getElementById("add-file-btn");
  if (addFileBtn) {
    addFileBtn.addEventListener("click", () => {
      createRootFile(project.id, "file-list", project.files, (file) => {
        selectedFile = file;
        updateFileViewer();
      });
    });
  }

  const uploadFileBtn = document.getElementById("upload-file-btn");
  const fileInput = document.getElementById("file-input");
  if (uploadFileBtn && fileInput) {
    uploadFileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileUpload);
  }

  setupViewerListeners();
  setupDragDropZone();
}

function updateFileViewer() {
  const viewer = document.getElementById("file-viewer");
  if (viewer) {
    viewer.innerHTML = selectedFile ? renderFileViewer() : renderEmptyViewer();
    setupViewerListeners();
  }
}

function setupViewerListeners() {
  const editFileBtn = document.getElementById("edit-file-btn");
  if (editFileBtn) {
    editFileBtn.addEventListener("click", () => showFileModal(selectedFile));
  }

  const deleteCurrentBtn = document.getElementById("delete-current-file-btn");
  if (deleteCurrentBtn) {
    deleteCurrentBtn.addEventListener("click", () =>
      deleteFile(selectedFile.id),
    );
  }

  if (window.Prism) {
    Prism.highlightAll();
  }

  if (window.renderMathInElement && isMarkdownType(selectedFile?.file_type)) {
    const mdContent = document.querySelector(".markdown-content");
    if (mdContent) {
      renderMathInElement(mdContent, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }
}

let dragCounter = 0;
let ddCurrentTarget = "";

function setupDragDropZone() {
  document.addEventListener("dragenter", onDragEnter);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("drop", onDrop);
}

function teardownDragDropZone() {
  document.removeEventListener("dragenter", onDragEnter);
  document.removeEventListener("dragleave", onDragLeave);
  document.removeEventListener("dragover", onDragOver);
  document.removeEventListener("drop", onDrop);
  dragCounter = 0;
  ddCurrentTarget = "";
}

function hasFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
}

function getFolderUnderCursor(e) {
  if (!project?.files) return "";
  // Дерево теперь в shadow DOM — путь папки достаём через хелпер компонента.
  return getFolderPathUnderCursor("file-list", e.clientX, e.clientY);
}

function applyTarget(path) {
  if (path === ddCurrentTarget) return;
  ddCurrentTarget = path;

  const label = document.getElementById("dd-overlay-label");
  if (label) {
    label.textContent = path ? `Загрузить в «${path}»` : "Загрузить в корень";
  }

  highlightFolder("file-list", path);
}

function showOverlay() {
  const o = document.getElementById("dd-overlay");
  if (o) o.style.display = "flex";
}

function hideOverlay() {
  const o = document.getElementById("dd-overlay");
  if (o) o.style.display = "none";
  clearFolderHighlight("file-list");
}

function onDragEnter(e) {
  if (!hasFiles(e)) return;
  dragCounter++;
  if (dragCounter === 1) {
    applyTarget(getFolderUnderCursor(e));
    showOverlay();
  }
}

function onDragLeave(e) {
  if (!hasFiles(e)) return;
  // relatedTarget === null означает, что курсор покинул окно целиком —
  // финального dragleave может не быть, поэтому сбрасываем принудительно.
  if (e.relatedTarget === null || e.relatedTarget === undefined) {
    dragCounter = 0;
    ddCurrentTarget = "";
    hideOverlay();
    return;
  }
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    ddCurrentTarget = "";
    hideOverlay();
  }
}

function onDragOver(e) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  applyTarget(getFolderUnderCursor(e));
}

async function onDrop(e) {
  if (!hasFiles(e)) return;
  e.preventDefault();

  const targetPath = getFolderUnderCursor(e);

  dragCounter = 0;
  ddCurrentTarget = "";
  hideOverlay();

  if (!isAdmin()) {
    showToast("Только администратор может загружать файлы", "error");
    return;
  }

  const entries = Array.from(e.dataTransfer.items || [])
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.() || null)
    .filter(Boolean);

  if (!entries.length) return;

  const ops = [];
  for (const entry of entries) {
    await collectEntries(entry, targetPath, ops);
  }
  await runUploadQueue(ops);
}

// Рекурсивно разворачивает перетащенные entry в плоский список операций
// (папки идут перед своими файлами, чтобы успеть создаться до загрузки в них).
async function collectEntries(entry, parentPath, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) =>
      entry.file(resolve, reject),
    ).catch(() => null);
    if (!file) return;
    out.push({
      kind: "file",
      file,
      name: entry.name,
      parentPath,
      displayPath: parentPath ? `${parentPath}/${entry.name}` : entry.name,
    });
    return;
  }

  if (entry.isDirectory) {
    const folderPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    out.push({
      kind: "folder",
      name: entry.name,
      parentPath,
      displayPath: folderPath,
    });
    const children = await readDirEntries(entry);
    for (const child of children) {
      await collectEntries(child, folderPath, out);
    }
  }
}

function readDirEntries(dirEntry) {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const all = [];

    function readBatch() {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        },
        () => resolve(all),
      );
    }

    readBatch();
  });
}

async function handleFileUpload(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;

  const ops = files.map((file) => ({
    kind: "file",
    file,
    name: file.name,
    parentPath: "",
    displayPath: file.name,
  }));
  await runUploadQueue(ops);
}

// ---- Очередь загрузки -------------------------------------------------------

let uploadState = null;

async function runUploadQueue(ops) {
  if (!ops.length) return;

  // Если предыдущая загрузка ещё идёт — прерываем её перед новой.
  if (uploadState?.active) cancelAllUploads(true);

  const items = ops.map((op, idx) => ({
    ...op,
    idx,
    status: op.kind === "folder" ? "done" : "pending",
    error: null,
    // У каждого файла свой контроллер — для отмены по отдельности.
    controller: op.kind === "file" ? new AbortController() : null,
  }));

  uploadState = {
    items,
    active: true,
    done: 0,
    failed: 0,
  };

  renderUploadQueue();
  await processUploadQueue();
}

async function processUploadQueue() {
  const state = uploadState;

  for (const item of state.items) {
    // Файл могли отменить, пока он ждал очереди.
    if (item.status === "cancelled") continue;

    if (item.kind === "folder") {
      try {
        await filesApi.createFolder(project.id, item.name, item.parentPath);
      } catch {
        // папка могла уже существовать — не критично
      }
      continue;
    }

    item.status = "uploading";
    renderUploadQueue();

    try {
      await filesApi.upload(
        project.id,
        item.file,
        item.parentPath,
        item.controller.signal,
      );
      item.status = "done";
      state.done++;
    } catch (err) {
      if (item.controller.signal.aborted || err.name === "AbortError") {
        item.status = "cancelled";
      } else {
        item.status = "error";
        item.error = err.message || "Ошибка";
        state.failed++;
      }
    }
    renderUploadQueue();
  }

  state.active = false;
  renderUploadQueue();

  if (project) await loadProject(project.id);
}

// Отмена одного файла: ждущий — просто помечаем, активный — прерываем запрос.
function cancelUploadItem(idx) {
  const item = uploadState?.items?.[idx];
  if (!item || item.kind !== "file") return;
  if (item.status === "pending") {
    item.status = "cancelled";
  } else if (item.status === "uploading") {
    item.controller.abort();
  }
  renderUploadQueue();
}

function cancelAllUploads(silent = false) {
  if (!uploadState) return;
  for (const item of uploadState.items) {
    if (item.kind !== "file") continue;
    if (item.status === "pending") item.status = "cancelled";
    else if (item.status === "uploading") item.controller.abort();
  }
  if (!silent) showToast("Загрузка прервана", "warning");
  renderUploadQueue();
}

function renderUploadQueue() {
  const state = uploadState;
  let panel = document.getElementById("upload-queue");

  if (!state) {
    if (panel) panel.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "upload-queue";
    document.body.appendChild(panel);
  }

  const fileItems = state.items.filter((i) => i.kind === "file");
  const total = fileItems.length;
  const finished = fileItems.filter((i) =>
    ["done", "error", "cancelled"].includes(i.status),
  ).length;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  const icon = {
    pending: '<i class="fas fa-clock" style="color:#949ba4;"></i>',
    uploading: '<div class="spinner" style="width:14px;height:14px;"></div>',
    done: '<i class="fas fa-check-circle" style="color:#23a559;"></i>',
    error: '<i class="fas fa-exclamation-circle" style="color:#f23f43;"></i>',
    cancelled: '<i class="fas fa-ban" style="color:#f0b232;"></i>',
  };

  const headerText = state.active
    ? `Загрузка ${finished}/${total}`
    : state.failed
      ? `Готово: ${state.done}, ошибок: ${state.failed}`
      : `Загружено: ${state.done}`;

  // Сохраняем позицию прокрутки списка, чтобы перерисовка не кидала вверх.
  const prevScroll =
    document.getElementById("upload-queue-list")?.scrollTop || 0;

  panel.innerHTML = `
    <div style="
        position:fixed; right:20px; bottom:20px; z-index:1000; width:340px;
        max-width:calc(100vw - 40px); background:#2b2d31; color:#f2f3f5;
        border:1px solid #1e1f22; border-radius:10px;
        box-shadow:0 10px 30px rgba(0,0,0,.45); overflow:hidden;
        font-size:13px;">
      <div style="display:flex; align-items:center; gap:8px; padding:10px 12px;
                  border-bottom:1px solid #404249;">
        <i class="fas fa-cloud-upload-alt" style="color:#5865f2;"></i>
        <span style="font-weight:600; flex:1;">${headerText}</span>
        ${
          state.active
            ? `<button id="upload-cancel-btn" class="btn btn-danger btn-sm">
                 <i class="fas fa-stop"></i> Отменить всё
               </button>`
            : `<button id="upload-close-btn" class="btn btn-secondary btn-sm">
                 Закрыть
               </button>`
        }
      </div>
      <div style="height:4px; background:#1e1f22;">
        <div style="height:100%; width:${pct}%; background:#5865f2;
                    transition:width .2s;"></div>
      </div>
      <div id="upload-queue-list" style="max-height:240px; overflow:auto; padding:6px;">
        ${
          total
            ? fileItems
                .map(
                  (i) => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 6px;">
              <span style="width:16px; text-align:center; flex-shrink:0;">${icon[i.status] || ""}</span>
              <span title="${escapeHtml(i.displayPath)}" style="
                  flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                  ${i.status === "cancelled" ? "color:#949ba4;text-decoration:line-through;" : ""}">
                ${escapeHtml(i.displayPath)}
              </span>
              ${i.status === "error" ? `<span style="color:#f23f43; font-size:11px;">${escapeHtml(i.error || "")}</span>` : ""}
              ${
                i.status === "pending" || i.status === "uploading"
                  ? `<button class="upload-item-cancel" data-idx="${i.idx}" title="Отменить файл"
                       style="flex-shrink:0; width:20px; height:20px; display:flex;
                              align-items:center; justify-content:center; border:none;
                              background:transparent; color:#b5bac1; cursor:pointer;
                              border-radius:4px;">
                       <i class="fas fa-times"></i>
                     </button>`
                  : ""
              }
            </div>`,
                )
                .join("")
            : '<div style="padding:8px; color:#949ba4;">Нет файлов</div>'
        }
      </div>
    </div>
  `;

  const cancelBtn = document.getElementById("upload-cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => cancelAllUploads());

  panel.querySelectorAll(".upload-item-cancel").forEach((btn) => {
    btn.addEventListener("click", () =>
      cancelUploadItem(Number(btn.dataset.idx)),
    );
  });

  const closeBtn = document.getElementById("upload-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      uploadState = null;
      renderUploadQueue();
    });
  }

  // Возвращаем прокрутку списка на прежнее место.
  const list = document.getElementById("upload-queue-list");
  if (list) list.scrollTop = prevScroll;
}

function showFileModal(file = null) {
  const isEdit = !!file;

  showModal({
    title: isEdit ? "Редактировать файл" : "Новый файл",
    content: `
            <form id="file-form" class="space-y-4">
               <div>
                    <label class="label" for="file-name">Имя файла</label>
                    <input type="text" id="file-name" class="input"
                           value="${isEdit ? escapeHtml(file.name) : ""}"
                           ${isEdit ? "readonly" : ""} required>
                    ${!isEdit ? '<p class="text-discord-text text-xs mt-2">Тип определяется автоматически по расширению (например, README.md).</p>' : ""}
                </div>
                <div>
                    <label class="label" for="file-content">Содержимое</label>
                    <textarea id="file-content" class="input font-mono text-sm"
                              rows="15" style="tab-size:4;">${isEdit ? escapeHtml(file.content) : ""}</textarea>
                </div>
            </form>
        `,
    footer: `
            <button class="btn btn-secondary" data-close>Отмена</button>
            <button class="btn btn-primary" id="save-file-btn">
                <i class="fas fa-save"></i>
                ${isEdit ? "Сохранить" : "Создать"}
            </button>
        `,
    size: "full",
  });

  setTimeout(() => {
    const closeBtn = document.querySelector("[data-close]");
    const saveBtn = document.getElementById("save-file-btn");
    const textarea = document.getElementById("file-content");

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (saveBtn) saveBtn.addEventListener("click", () => saveFile(file?.id));

    if (textarea) {
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const s = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value =
            textarea.value.substring(0, s) +
            "    " +
            textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = s + 4;
        }
      });
    }
  }, 0);
}

let isSaving = false;

async function saveFile(id = null) {
  if (isSaving) return;

  const name = document.getElementById("file-name").value.trim();
  const content = document.getElementById("file-content").value;

  if (!name) {
    showToast("Введите имя файла", "error");
    return;
  }

  isSaving = true;
  const saveBtn = document.getElementById("save-file-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner"></div>';
  }

  try {
    if (id) {
      await filesApi.update(id, { name, content });
      showToast("Файл обновлён", "success");
    } else {
      await filesApi.create(
        project.id,
        name,
        content,
        getFileTypeFromName(name),
      );
      showToast("Файл создан", "success");
    }
    closeModal();
    await loadProject(project.id);
  } catch (error) {
    showToast(error.message || "Ошибка сохранения", "error");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
    }
  } finally {
    isSaving = false;
  }
}

async function deleteFile(id) {
  confirmModal("Удалить этот файл?", async () => {
    try {
      await filesApi.delete(id);
      showToast("Файл удалён", "success");
      if (selectedFile?.id === id) selectedFile = null;
      await loadProject(project.id);
    } catch (error) {
      showToast(error.message || "Ошибка удаления", "error");
    }
  });
}

async function loadProject(projectId) {
  try {
    project = await projectsApi.getById(projectId);

    if (selectedFile) {
      selectedFile =
        project.files?.find((f) => f.id === selectedFile.id) || null;
    }
    if (!selectedFile && project.files?.length > 0) {
      selectedFile = project.files[0];
    }

    renderProject();
  } catch (error) {
    const container = document.getElementById("project-content");
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
  teardownDragDropZone();
  if (uploadState?.active) cancelAllUploads(true);
  uploadState = null;
  renderUploadQueue();
  project = null;
  selectedFile = null;
}
