import { t, tf, getLang } from "./i18n.js";

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLang(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString(getLang(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t("time_now");
  if (minutes < 60) return tf("time_min", { n: minutes });
  if (hours < 24) return tf("time_hour", { n: hours });
  if (days < 7) return tf("time_day", { n: days });

  return formatDate(dateStr);
}

const TOAST_TIMEOUT = 4000;

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `v1-toast v1-toast-${type}`;

  const iconName =
    {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle",
    }[type] || "fa-info-circle";

  const icon = document.createElement("i");
  icon.className = `fas ${iconName}`;
  icon.setAttribute("aria-hidden", "true");

  // message нередко приходит из error.message с сервера — вставляем текстом,
  // а не через innerHTML.
  const text = document.createElement("span");
  text.className = "v1-toast-text";
  text.textContent = message == null ? "" : String(message);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "v1-toast-close";
  close.setAttribute("aria-label", t("toast_close"));
  close.textContent = "×";

  toast.append(icon, text, close);
  container.appendChild(toast);

  let removeTimer = null;
  const dismiss = () => {
    if (removeTimer) clearTimeout(removeTimer);
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    removeTimer = setTimeout(() => toast.remove(), 300);
  };

  close.addEventListener("click", dismiss);
  removeTimer = setTimeout(dismiss, TOAST_TIMEOUT);
}

export function clearToasts() {
  const container = document.getElementById("toast-container");
  if (container) container.replaceChildren();
}

// Тост про предыдущую страницу на следующей уже не к месту.
if (typeof window !== "undefined") {
  window.addEventListener("route-changed", clearToasts);
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function applyUserAccentColor(accentColor) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;

  const value = String(accentColor || "").trim();
  const isValidColor = Boolean(
    value &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", value),
  );

  if (isValidColor) {
    root.style.setProperty("--user-accent", value);
    return;
  }

  root.style.removeProperty("--user-accent");
}

export function getFileIcon(fileType) {
  const icons = {
    py: "fab fa-python",
    js: "fab fa-js-square",
    ts: "fab fa-js-square",
    html: "fab fa-html5",
    css: "fab fa-css3-alt",
    json: "fas fa-code",
    md: "fab fa-markdown",
    markdown: "fab fa-markdown",
    mdx: "fab fa-markdown",
    mdown: "fab fa-markdown",
    mkd: "fab fa-markdown",
    mkdn: "fab fa-markdown",
    mdwn: "fab fa-markdown",
    txt: "fas fa-file-alt",
    png: "fas fa-image",
    jpg: "fas fa-image",
    jpeg: "fas fa-image",
    gif: "fas fa-image",
    webp: "fas fa-image",
    mp4: "fas fa-video",
    avi: "fas fa-video",
    mov: "fas fa-video",
    webm: "fas fa-video",
    pdf: "fas fa-file-pdf",
  };
  return icons[fileType] || "fas fa-file";
}

export function getPrismLanguage(fileType) {
  const languages = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    html: "markup",
    css: "css",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    mdx: "markdown",
    mdown: "markdown",
    mkd: "markdown",
    mkdn: "markdown",
    mdwn: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    xml: "markup",
    svg: "markup",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    dockerfile: "docker",
    toml: "toml",
    ini: "ini",
    env: "bash",
    gitignore: "bash",
  };
  return languages[fileType] || "plaintext";
}

export function renderMarkdown(content) {
  if (!window.marked) return escapeHtml(content);

  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    highlight: function (code, lang) {
      if (window.Prism && lang && Prism.languages[lang]) {
        try {
          return Prism.highlight(code, Prism.languages[lang], lang);
        } catch (e) {
          console.error("Prism highlight error:", e);
        }
      }
      return escapeHtml(code);
    },
  });

  let html = marked.parse(content);

  if (window.katex && window.renderMathInElement) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    renderMathInElement(tempDiv, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
    html = tempDiv.innerHTML;
  }

  return html;
}

export function getFileTypeFromName(name) {
  if (!name) return "txt";
  const trimmedName = name.split("/").pop();
  if (!trimmedName) return "txt";
  const dotCount = (trimmedName.match(/\./g) || []).length;
  if (trimmedName.startsWith(".") && dotCount === 1) {
    return trimmedName.slice(1).toLowerCase() || "txt";
  }
  const lastDot = trimmedName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === trimmedName.length - 1) {
    return "txt";
  }
  return trimmedName.slice(lastDot + 1).toLowerCase() || "txt";
}

export function isMarkdownType(fileType) {
  return ["md", "markdown", "mdx", "mdown", "mkd", "mkdn", "mdwn"].includes(
    (fileType || "").toLowerCase(),
  );
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
