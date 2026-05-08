import { adminPurchasesApi, adminApi, adminAutomuteApi, API_URL } from "../api.js";
import { showToast, escapeHtml, formatDate, formatDateTime } from "../utils.js";
import { confirmModal } from "../components/modal.js";

let users = [];
let purchases = [];
let automutePurchases = [];
let activeTab = "users";
let purchasesFilter = "";
let licenseAdminSecret = "";
let licenseFilter = null;
let licenses = [];

export function render() {
  return `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-white">
                    <i class="fas fa-shield-alt text-discord-accent mr-3"></i>
                    Админ панель
                </h1>
                <p class="text-discord-text mt-2">Управление пользователями и запросами</p>
            </div>

            <div class="flex gap-2 mb-6">
                <button class="btn ${activeTab === "users" ? "btn-primary" : "btn-secondary"}" id="tab-users">
                    <i class="fas fa-users"></i>
                    Пользователи
                </button>
                <button class="btn ${activeTab === "licenses" ? "btn-primary" : "btn-secondary"}" id="tab-licenses">
                    <i class="fas fa-key"></i>
                    Лицензии
                </button>
                <button class="btn ${activeTab === "purchases" ? "btn-primary" : "btn-secondary"}" id="tab-purchases">
                    <i class="fas fa-shopping-cart"></i>
                    Покупки курсов
                </button>
                <button class="btn ${activeTab === "automute" ? "btn-primary" : "btn-secondary"}" id="tab-automute">
                    <i class="fas fa-volume-mute"></i>
                    AutoMute
                </button>
            </div>

            <div id="admin-content">
                <div class="flex justify-center py-12">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        </div>
    `;
}

function renderUsers() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Пользователей нет</h3>
            </div>
        `;
    return;
  }

  container.innerHTML = `
        <div class="bg-discord-light rounded-lg overflow-hidden">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Пользователь</th>
                        <th>Email</th>
                        <th>Роль</th>
                        <th>Дата регистрации</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${users
                      .map(
                        (user) => `
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full bg-discord-accent/20 flex items-center justify-center">
                                        <span class="text-discord-accent font-bold">${user.username.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <span class="text-white font-medium">${escapeHtml(user.username)}</span>
                                </div>
                            </td>
                            <td class="text-discord-text">
                                ${user.email ? escapeHtml(user.email) : '<span class="text-discord-text/50">Не указан</span>'}
                            </td>
                            <td>
                                <span class="tag ${user.role === "admin" ? "tag-primary" : "bg-discord-lighter text-white"}">
                                    ${user.role === "admin" ? "Админ" : "Пользователь"}
                                </span>
                            </td>
                            <td class="text-discord-text text-sm">
                                ${formatDate(user.created_at)}
                            </td>
                            <td>
                                <div class="flex gap-2">
                                    <button class="btn btn-secondary btn-sm toggle-role" data-id="${user.id}" data-role="${user.role}">
                                        <i class="fas fa-exchange-alt"></i>
                                        ${user.role === "admin" ? "Сделать пользователем" : "Сделать админом"}
                                    </button>
                                    <button class="btn btn-warning btn-sm reset-password" data-id="${user.id}" data-username="${escapeHtml(user.username)}">
                                        <i class="fas fa-key"></i>
                                        Сброс пароля
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;

  container.querySelectorAll(".toggle-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const currentRole = btn.dataset.role;
      const newRole = currentRole === "admin" ? "user" : "admin";
      toggleUserRole(id, newRole);
    });
  });

  container.querySelectorAll(".reset-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const username = btn.dataset.username;
      resetUserPassword(id, username);
    });
  });
}

async function loadLicenses(filter = null) {
  if (!licenseAdminSecret) return;
  let url = `${API_URL}/api/admin/licenses?admin_secret=${encodeURIComponent(licenseAdminSecret)}`;
  if (filter === true) url += "&used=true";
  if (filter === false) url += "&used=false";

  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      showToast(err.detail || "Ошибка загрузки ключей", "error");
      return;
    }
    const data = await resp.json();
    licenses = data.items || [];
    licenseFilter = filter;
    if (activeTab === "licenses") renderLicenses();
  } catch (e) {
    showToast("Ошибка сети", "error");
  }
}

async function generateLicenseKey() {
  const secret = document.getElementById("license-secret-input")?.value.trim();
  if (!secret) {
    showToast("Введите admin_secret", "warning");
    return;
  }
  licenseAdminSecret = secret;

  const btn = document.getElementById("gen-key-btn");
  const initial = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';
  }

  try {
    const resp = await fetch(
      `${API_URL}/api/generate_key?admin_secret=${encodeURIComponent(secret)}`,
      { method: "GET" },
    );
    const data = await resp.json();
    if (!resp.ok) {
      showToast(data.detail || "Ошибка генерации", "error");
      return;
    }
    const display = document.getElementById("generated-key-display");
    if (display) {
      display.textContent = data.key;
      display.parentElement.classList.remove("hidden");
    }
    showToast("Ключ сгенерирован!", "success");
    await loadLicenses(licenseFilter);
  } catch (e) {
    showToast("Ошибка сети", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = initial;
    }
  }
}

function renderLicenses() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  container.innerHTML = `
        <div class="space-y-6">
            <div class="bg-discord-light rounded-lg p-6 border border-discord-lighter/40">
                <h3 class="text-white font-bold text-lg mb-4">
                    <i class="fas fa-plus-circle text-discord-accent mr-2"></i>
                    Создать ключ
                </h3>
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-60">
                        <label class="label">Admin Secret</label>
                        <input
                            id="license-secret-input"
                            type="password"
                            class="input"
                            placeholder="LICENSE_ADMIN_SECRET"
                            value="${escapeHtml(licenseAdminSecret)}"
                        >
                    </div>
                    <button id="gen-key-btn" class="btn btn-primary">
                        <i class="fas fa-key"></i>
                        Сгенерировать ключ
                    </button>
                    <button id="load-keys-btn" class="btn btn-secondary">
                        <i class="fas fa-sync"></i>
                        Загрузить список
                    </button>
                </div>
                <div id="generated-key-wrapper" class="hidden mt-5">
                    <p class="text-discord-text text-sm mb-2">Новый ключ:</p>
                    <div class="flex items-center gap-3">
                        <code
                            id="generated-key-display"
                            class="text-2xl font-mono font-bold text-white tracking-widest bg-discord-darker px-4 py-3 rounded-lg select-all border border-discord-lighter/40"
                        ></code>
                        <button id="copy-key-btn" class="btn btn-outline btn-sm">
                            <i class="fas fa-copy"></i>
                            Копировать
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex gap-2">
                <button class="btn btn-sm ${licenseFilter === null ? "btn-primary" : "btn-secondary"}" data-filter="all">Все</button>
                <button class="btn btn-sm ${licenseFilter === false ? "btn-primary" : "btn-secondary"}" data-filter="free">Свободные</button>
                <button class="btn btn-sm ${licenseFilter === true ? "btn-primary" : "btn-secondary"}" data-filter="used">Использованные</button>
            </div>

            <div class="bg-discord-light rounded-lg overflow-hidden">
                ${
                  licenses.length === 0
                    ? `
                    <div class="empty-state">
                        <i class="fas fa-key"></i>
                        <p class="mt-3 text-discord-text">
                            ${
                              licenseAdminSecret
                                ? "Ключей нет или не загружены"
                                : "Введите admin_secret и нажмите «Загрузить список»"
                            }
                        </p>
                    </div>
                `
                    : `
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Ключ</th>
                                <th>Статус</th>
                                <th>HWID</th>
                                <th>Активирован</th>
                                <th>Истекает</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${licenses
                              .map(
                                (lic) => `
                                <tr>
                                    <td class="text-discord-text text-sm">${lic.id}</td>
                                    <td>
                                        <code class="text-white font-mono tracking-wider select-all">${escapeHtml(lic.key)}</code>
                                    </td>
                                    <td>
                                        <span class="tag ${lic.used ? "tag-danger" : "tag-success"}">
                                            ${lic.used ? "Использован" : "Свободен"}
                                        </span>
                                    </td>
                                    <td class="text-discord-text text-xs font-mono max-w-xs truncate">
                                        ${lic.hwid ? escapeHtml(lic.hwid.slice(0, 20) + "...") : "—"}
                                    </td>
                                    <td class="text-discord-text text-sm">
                                        ${lic.activated_at ? formatDate(lic.activated_at) : "—"}
                                    </td>
                                    <td class="text-discord-text text-sm">
                                        ${lic.expires_at ? formatDate(lic.expires_at) : "—"}
                                    </td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                    <p class="text-discord-text text-xs text-right p-3">Всего: ${licenses.length}</p>
                `
                }
            </div>
        </div>
    `;

  document
    .getElementById("gen-key-btn")
    ?.addEventListener("click", generateLicenseKey);

  document
    .getElementById("load-keys-btn")
    ?.addEventListener("click", async () => {
      const secret = document
        .getElementById("license-secret-input")
        ?.value.trim();
      if (!secret) {
        showToast("Введите admin_secret", "warning");
        return;
      }
      licenseAdminSecret = secret;
      await loadLicenses(licenseFilter);
    });

  document
    .getElementById("copy-key-btn")
    ?.addEventListener("click", async () => {
      const key =
        document.getElementById("generated-key-display")?.textContent || "";
      if (!key) return;
      try {
        await navigator.clipboard.writeText(key);
        showToast("Ключ скопирован", "success");
      } catch {
        showToast(key, "info");
      }
    });

  container.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const f = btn.dataset.filter;
      const filter = f === "all" ? null : f === "used";
      await loadLicenses(filter);
    });
  });

  const keyDisplay = document.getElementById("generated-key-display");
  if (keyDisplay?.textContent) {
    keyDisplay.parentElement.parentElement.classList.remove("hidden");
  }
}

function getPurchaseStatusClass(status) {
  if (status === "pending") return "tag-warning";
  if (status === "completed") return "tag-success";
  if (status === "cancelled") return "tag-danger";
  return "tag";
}

function getPurchaseStatusLabel(status) {
  if (status === "pending") return "Ожидает";
  if (status === "completed") return "Подтверждена";
  if (status === "cancelled") return "Отклонена";
  return status;
}

function getPurchaseTargetLabel(purchase) {
  if (purchase.part_title) {
    const courseTitle = purchase.course_title || "Курс удалён";
    return `${courseTitle} / ${purchase.part_title}`;
  }

  if (purchase.course_title) {
    return purchase.course_title;
  }

  return "Курс/раздел удалён";
}

function renderPurchases() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (purchases.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-cart"></i>
                <h3 class="text-xl font-semibold text-white mt-4">Покупок пока нет</h3>
                <p class="text-discord-text mt-2">Здесь будут отображаться оплаты курсов и разделов</p>
            </div>
        `;
    return;
  }

  container.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-end">
                <select id="purchases-status-filter" class="input max-w-xs">
                    <option value="" ${purchasesFilter === "" ? "selected" : ""}>Все статусы</option>
                    <option value="pending" ${purchasesFilter === "pending" ? "selected" : ""}>pending</option>
                    <option value="completed" ${purchasesFilter === "completed" ? "selected" : ""}>completed</option>
                    <option value="cancelled" ${purchasesFilter === "cancelled" ? "selected" : ""}>cancelled</option>
                </select>
            </div>

            <div class="bg-discord-light rounded-lg overflow-hidden">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Пользователь</th>
                            <th>Курс/раздел</th>
                            <th>Сумма</th>
                            <th>Комментарий СБП</th>
                            <th>Статус</th>
                            <th>Дата</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${purchases
                          .map(
                            (purchase) => `
                            <tr>
                                <td>${escapeHtml(purchase.username)}</td>
                                <td>${escapeHtml(getPurchaseTargetLabel(purchase))}</td>
                                <td>${Number(purchase.amount || 0).toLocaleString("ru-RU")} ₽</td>
                                <td>${purchase.sbp_comment ? escapeHtml(purchase.sbp_comment) : '<span class="text-discord-text/60">—</span>'}</td>
                                <td>
                                    <span class="tag ${getPurchaseStatusClass(purchase.status)}">
                                        ${escapeHtml(getPurchaseStatusLabel(purchase.status))}
                                    </span>
                                </td>
                                <td>${formatDate(purchase.created_at)}</td>
                                <td>
                                    ${
                                      purchase.status === "pending"
                                        ? `
                                        <div class="flex gap-2">
                                            <button class="btn btn-success btn-sm purchase-complete-btn" data-id="${escapeHtml(purchase.id)}">
                                                ✓ Подтвердить
                                            </button>
                                            <button class="btn btn-danger btn-sm purchase-cancel-btn" data-id="${escapeHtml(purchase.id)}">
                                                ✗ Отклонить
                                            </button>
                                        </div>
                                    `
                                        : '<span class="text-discord-text/60">—</span>'
                                    }
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;

  const filterSelect = document.getElementById("purchases-status-filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", async () => {
      purchasesFilter = filterSelect.value;
      await loadPurchases(purchasesFilter || null);
    });
  }

  container.querySelectorAll(".purchase-complete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const purchaseId = btn.dataset.id;
      if (!purchaseId) return;
      await updatePurchaseStatus(purchaseId, "completed", btn);
    });
  });

  container.querySelectorAll(".purchase-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const purchaseId = btn.dataset.id;
      if (!purchaseId) return;

      confirmModal("Отклонить покупку?", async () => {
        await updatePurchaseStatus(purchaseId, "cancelled", btn);
      });
    });
  });
}

function switchTab(tab) {
  activeTab = tab;

  const tabUsers = document.getElementById("tab-users");
  const tablicenses = document.getElementById("tab-licenses");
  const tabPurchases = document.getElementById("tab-purchases");
  const tabAutomute = document.getElementById("tab-automute");

  if (tabUsers)
    tabUsers.className = `btn ${tab === "users" ? "btn-primary" : "btn-secondary"}`;
  if (tablicenses)
    tablicenses.className = `btn ${tab === "licenses" ? "btn-primary" : "btn-secondary"}`;
  if (tabPurchases)
    tabPurchases.className = `btn ${tab === "purchases" ? "btn-primary" : "btn-secondary"}`;
  if (tabAutomute)
    tabAutomute.className = `btn ${tab === "automute" ? "btn-primary" : "btn-secondary"}`;

  if (tab === "users") {
    renderUsers();
  } else if (tab === "licenses") {
    renderLicenses();
  } else if (tab === "purchases") {
    renderPurchases();
  } else if (tab === "automute") {
    renderAutomute();
  }
}

function renderAutomute() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (!automutePurchases.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-volume-mute"></i>
        <h3 class="text-xl font-semibold text-white mt-4">Нет покупок AutoMute</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="bg-discord-light rounded-lg overflow-hidden">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Тариф</th>
            <th>Сумма</th>
            <th>Комментарий СБП</th>
            <th>Статус</th>
            <th>Создано</th>
            <th>Ключ</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${automutePurchases.map((p) => `
            <tr>
              <td>
                <div>
                  <div class="text-white">${escapeHtml(p.username || "—")}</div>
                  <div class="text-xs text-discord-text">${escapeHtml(p.email || "")}</div>
                </div>
              </td>
              <td><span class="tag tag-primary">${escapeHtml(p.plan)}</span></td>
              <td>${p.amount} ₽</td>
              <td><code class="text-discord-text">${escapeHtml(p.sbp_comment || "")}</code></td>
              <td>
                ${p.status === "pending" ? '<span class="tag tag-warning">Ожидает</span>'
                  : p.status === "completed" ? '<span class="tag tag-success">Подтверждена</span>'
                  : '<span class="tag tag-danger">Отменена</span>'}
              </td>
              <td>${formatDateTime(p.created_at)}</td>
              <td>${p.license_key ? `<code class="text-white select-all">${escapeHtml(p.license_key)}</code>` : "—"}</td>
              <td>
                ${p.status === "pending" ? `
                  <div class="flex gap-1">
                    <button class="btn btn-success btn-sm am-confirm-btn" data-id="${escapeHtml(p.id)}">
                      <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-danger btn-sm am-cancel-btn" data-id="${escapeHtml(p.id)}">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                ` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".am-confirm-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      confirmModal("Подтвердить покупку и выдать ключ?", async () => {
        try {
          const res = await adminAutomuteApi.confirmPurchase(id);
          showToast(`Ключ выдан: ${res.license_key}`, "success");
          await loadAutomutePurchases();
          renderAutomute();
        } catch (e) {
          showToast(e.message || "Ошибка подтверждения", "error");
        }
      });
    });
  });

  container.querySelectorAll(".am-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      confirmModal("Отменить покупку?", async () => {
        try {
          await adminAutomuteApi.cancelPurchase(id);
          showToast("Покупка отменена", "success");
          await loadAutomutePurchases();
          renderAutomute();
        } catch (e) {
          showToast(e.message || "Ошибка отмены", "error");
        }
      });
    });
  });
}

async function loadAutomutePurchases() {
  try {
    automutePurchases = await adminAutomuteApi.getPurchases();
  } catch (e) {
    automutePurchases = [];
    showToast(e.message || "Ошибка загрузки покупок AutoMute", "error");
  }
}

async function toggleUserRole(userId, newRole) {
  try {
    await adminApi.updateUserRole(userId, newRole);
    showToast("Роль изменена", "success");
    await loadUsers();
  } catch (error) {
    showToast(error.message || "Ошибка изменения роли", "error");
  }
}

function showNewPasswordModal(username, password) {
  const message = `
        <div class="text-center">
            <p class="mb-2">Новый пароль для пользователя <b>${username}</b>:</p>
            <div class="bg-discord-darker p-3 rounded text-xl font-mono select-all tracking-wider mb-2">
                ${password}
            </div>
            <p class="text-sm text-discord-text">Скопируйте его и передайте пользователю.</p>
        </div>
    `;

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
    `;

  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
        background: #36393f; color: white; padding: 24px;
        border-radius: 8px; max-width: 400px; width: 90%; max-height: 80vh;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    `;

  modalContent.innerHTML = `
        <div class="text-center">${message}</div>
        <div style="margin-top: 16px; text-align: center; gap: 8px; display: flex; justify-content: center;">
            <button id="copyBtn" style="background: #43b581; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">📋 Скопировать</button>
            <button id="closeBtn" style="background: #4f545c; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">✕ Закрыть</button>
        </div>
    `;

  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) modalOverlay.remove();
  };

  document.getElementById("closeBtn").onclick = () => modalOverlay.remove();

  document.getElementById("copyBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(password);
      document.getElementById("copyBtn").textContent = "✅ Скопировано!";
      setTimeout(() => modalOverlay.remove(), 1500);
    } catch (err) {
      console.error("Копирование не удалось:", err);
      fallbackCopyTextToClipboard(password);
    }
  };

  const escHandler = (e) => {
    if (e.key === "Escape") {
      modalOverlay.remove();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;

  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand("copy");
    if (successful) {
      document.getElementById("copyBtn").textContent = "✅ Скопировано!";
      setTimeout(() => modalOverlay.remove(), 1500);
    } else {
      throw new Error("Fallback тоже не сработал");
    }
  } catch (err) {
    console.error("Fallback failed:", err);
    alert("Не удалось скопировать. Выделите пароль вручную.");
  } finally {
    document.body.removeChild(textArea);
  }
}

async function resetUserPassword(userId, username) {
  confirmModal(
    `Сбросить пароль пользователя ${username}? Будет сгенерирован новый случайный пароль.`,
    async () => {
      try {
        const response = await adminApi.resetUserPassword(userId);
        const message = response.message || "";
        const newPassword = message.replace("Password reset to ", "");

        showNewPasswordModal(username, newPassword);
      } catch (error) {
        showToast(error.message || "Ошибка сброса пароля", "error");
      }
    },
  );
}

async function updatePurchaseStatus(purchaseId, status, button = null) {
  const initialText = button ? button.innerHTML : "";
  if (button) {
    button.disabled = true;
    button.innerHTML = '<div class="spinner"></div>';
  }

  try {
    await adminPurchasesApi.updateStatus(purchaseId, status);
    showToast("Статус покупки обновлён", "success");
    await loadPurchases(purchasesFilter || null);
  } catch (error) {
    showToast(error.message || "Ошибка обновления статуса", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = initialText;
    }
  }
}

async function loadUsers() {
  try {
    users = await adminApi.getUsers();
    if (activeTab === "users") {
      renderUsers();
    }
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

async function loadPurchases(status = null) {
  try {
    purchases = await adminPurchasesApi.getAll(status);
    if (activeTab === "purchases") {
      renderPurchases();
    }
  } catch (error) {
    showToast(error.message || "Ошибка загрузки покупок", "error");
  }
}

export async function mount() {
  activeTab = "users";
  purchasesFilter = "";

  await Promise.all([
    loadUsers(),
    loadLicenses(),
    loadPurchases(),
    loadAutomutePurchases(),
  ]);

  const tabUsers = document.getElementById("tab-users");
  const tabLicenses = document.getElementById("tab-licenses");
  const tabPurchases = document.getElementById("tab-purchases");
  const tabAutomute = document.getElementById("tab-automute");

  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (tabLicenses)
    tabLicenses.addEventListener("click", () => switchTab("licenses"));
  if (tabPurchases)
    tabPurchases.addEventListener("click", () => switchTab("purchases"));
  if (tabAutomute)
    tabAutomute.addEventListener("click", () => switchTab("automute"));

  renderUsers();
}

export function unmount() {
  users = [];
  purchases = [];
  automutePurchases = [];
  activeTab = "users";
  purchasesFilter = "";
}
