import { adminPurchasesApi, adminApi, adminAutomuteApi, adminDonationsApi, API_URL } from "../api.js";
import { showToast, escapeHtml, formatDate, formatDateTime } from "../utils.js";
import { closeModal, confirmModal, showModal } from "../components/modal.js";

let users = [];
let purchases = [];
let automutePurchases = [];
let donations = [];
let activeTab = "users";
let purchasesFilter = "";
let donationsFilter = "";
let licenseAdminSecret = "";
let licenseFilter = null;
let licenses = [];

export function render() {
  return `
        <div class="v1-doc">
            <div class="v1-page-header">
                <div class="v1-page-header-main">
                    <div class="v1-sec-kicker">// admin.js</div>
                    <h1 class="v1-page-title">
                        <i class="fas fa-shield-alt v1-page-title-icon" aria-hidden="true"></i>Админ панель
                    </h1>
                    <p class="v1-page-sub">Управление пользователями и запросами</p>
                </div>
            </div>

            <div class="v1-subtabs v1-subtabs-wrap" role="tablist">
                <button class="v1-subtab ${activeTab === "users" ? "active" : ""}" id="tab-users" role="tab">
                    <i class="fas fa-users"></i>
                    Пользователи
                </button>
                <button class="v1-subtab ${activeTab === "licenses" ? "active" : ""}" id="tab-licenses" role="tab">
                    <i class="fas fa-key"></i>
                    Лицензии
                </button>
                <button class="v1-subtab ${activeTab === "purchases" ? "active" : ""}" id="tab-purchases" role="tab">
                    <i class="fas fa-shopping-cart"></i>
                    Покупки курсов
                </button>
                <button class="v1-subtab ${activeTab === "automute" ? "active" : ""}" id="tab-automute" role="tab">
                    <i class="fas fa-volume-mute"></i>
                    AutoMute
                </button>
                <button class="v1-subtab ${activeTab === "donations" ? "active" : ""}" id="tab-donations" role="tab">
                    <i class="fas fa-heart"></i>
                    Донаты
                </button>
            </div>

            <div id="admin-content">
                <div class="v1-loading">Загрузка…</div>
            </div>
        </div>
    `;
}

function renderUsers() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-users v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">Пользователей нет</div>
            </div>
        `;
    return;
  }

  container.innerHTML = `
        <div class="v1-table-wrap">
            <table class="v1-table">
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
                                <div class="v1-user-cell">
                                    <div class="v1-user-initial">${escapeHtml(user.username.charAt(0).toUpperCase())}</div>
                                    <strong>${escapeHtml(user.username)}</strong>
                                </div>
                            </td>
                            <td>
                                ${user.email ? escapeHtml(user.email) : '<span class="v1-soft">Не указан</span>'}
                            </td>
                            <td>
                                <span class="v1-badge ${user.role === "admin" ? "v1-badge-info" : ""}">
                                    ${user.role === "admin" ? "Админ" : "Пользователь"}
                                </span>
                            </td>
                            <td>
                                ${formatDate(user.created_at)}
                            </td>
                            <td>
                                <div class="v1-actions">
                                    <button class="v1-btn v1-btn-sm toggle-role" data-id="${user.id}" data-role="${user.role}">
                                        <i class="fas fa-exchange-alt"></i>
                                        ${user.role === "admin" ? "Сделать пользователем" : "Сделать админом"}
                                    </button>
                                    <button class="v1-btn v1-btn-sm reset-password" data-id="${user.id}" data-username="${escapeHtml(user.username)}">
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
    btn.textContent = "Генерация…";
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
        <div class="v1-vstack-lg">
            <div class="v1-card">
                <h3 class="v1-card-h">
                    <i class="fas fa-plus-circle v1-title-icon" aria-hidden="true"></i>
                    Создать ключ
                </h3>
                <div class="v1-form-row v1-form-row-actions">
                    <div class="v1-field">
                        <label class="v1-label">Admin Secret</label>
                        <input
                            id="license-secret-input"
                            type="password"
                            class="v1-input"
                            placeholder="LICENSE_ADMIN_SECRET"
                            value="${escapeHtml(licenseAdminSecret)}"
                        >
                    </div>
                    <button id="gen-key-btn" class="v1-btn v1-btn-primary">
                        <i class="fas fa-key"></i>
                        Сгенерировать ключ
                    </button>
                    <button id="load-keys-btn" class="v1-btn">
                        <i class="fas fa-sync"></i>
                        Загрузить список
                    </button>
                </div>
                <div id="generated-key-wrapper" class="hidden v1-generated-key">
                    <p class="v1-meta-l">Новый ключ:</p>
                    <div class="v1-actions">
                        <code
                            id="generated-key-display"
                            class="v1-license-key"
                        ></code>
                        <button id="copy-key-btn" class="v1-btn v1-btn-sm">
                            <i class="fas fa-copy"></i>
                            Копировать
                        </button>
                    </div>
                </div>
            </div>

            <div class="v1-filters">
                <button class="v1-filter ${licenseFilter === null ? "active" : ""}" data-filter="all">Все</button>
                <button class="v1-filter ${licenseFilter === false ? "active" : ""}" data-filter="free">Свободные</button>
                <button class="v1-filter ${licenseFilter === true ? "active" : ""}" data-filter="used">Использованные</button>
            </div>

            <div class="v1-table-wrap">
                ${
                  licenses.length === 0
                    ? `
                    <div class="v1-empty">
                        <i class="fas fa-key v1-empty-icon" aria-hidden="true"></i>
                        <p>
                            ${
                              licenseAdminSecret
                                ? "Ключей нет или не загружены"
                                : "Введите admin_secret и нажмите «Загрузить список»"
                            }
                        </p>
                    </div>
                `
                    : `
                    <table class="v1-table">
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
                                    <td>${lic.id}</td>
                                    <td>
                                        <code>${escapeHtml(lic.key)}</code>
                                    </td>
                                    <td>
                                        <span class="v1-badge ${lic.used ? "v1-badge-danger" : "v1-badge-success"}">
                                            ${lic.used ? "Использован" : "Свободен"}
                                        </span>
                                    </td>
                                    <td class="v1-table-truncate">
                                        ${lic.hwid ? escapeHtml(lic.hwid.slice(0, 20) + "...") : "—"}
                                    </td>
                                    <td>
                                        ${lic.activated_at ? formatDate(lic.activated_at) : "—"}
                                    </td>
                                    <td>
                                        ${lic.expires_at ? formatDate(lic.expires_at) : "—"}
                                    </td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                    <p class="v1-table-summary">Всего: ${licenses.length}</p>
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
  if (status === "pending") return "v1-badge-warn";
  if (status === "completed") return "v1-badge-success";
  if (status === "cancelled") return "v1-badge-danger";
  return "";
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
            <div class="v1-empty">
                <i class="fas fa-shopping-cart v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">Покупок пока нет</div>
                <p>Здесь будут отображаться оплаты курсов и разделов</p>
            </div>
        `;
    return;
  }

  container.innerHTML = `
        <div class="v1-vstack">
            <div class="v1-actions v1-actions-end">
                <select id="purchases-status-filter" class="v1-input v1-select-compact">
                    <option value="" ${purchasesFilter === "" ? "selected" : ""}>Все статусы</option>
                    <option value="pending" ${purchasesFilter === "pending" ? "selected" : ""}>pending</option>
                    <option value="completed" ${purchasesFilter === "completed" ? "selected" : ""}>completed</option>
                    <option value="cancelled" ${purchasesFilter === "cancelled" ? "selected" : ""}>cancelled</option>
                </select>
            </div>

            <div class="v1-table-wrap">
                <table class="v1-table">
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
                                <td>${purchase.sbp_comment ? escapeHtml(purchase.sbp_comment) : '<span class="v1-soft">—</span>'}</td>
                                <td>
                                    <span class="v1-badge ${getPurchaseStatusClass(purchase.status)}">
                                        ${escapeHtml(getPurchaseStatusLabel(purchase.status))}
                                    </span>
                                </td>
                                <td>${formatDate(purchase.created_at)}</td>
                                <td>
                                    ${
                                      purchase.status === "pending"
                                        ? `
                                        <div class="v1-actions">
                                            <button class="v1-btn v1-btn-primary v1-btn-sm purchase-complete-btn" data-id="${escapeHtml(purchase.id)}">
                                                ✓ Подтвердить
                                            </button>
                                            <button class="v1-btn v1-btn-danger v1-btn-sm purchase-cancel-btn" data-id="${escapeHtml(purchase.id)}">
                                                ✗ Отклонить
                                            </button>
                                        </div>
                                    `
                                        : '<span class="v1-soft">—</span>'
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

function renderDonations() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (donations.length === 0) {
    container.innerHTML = `
            <div class="v1-empty">
                <i class="fas fa-heart v1-empty-icon" aria-hidden="true"></i>
                <div class="v1-empty-h">Донатов пока нет</div>
                <p>Здесь появятся пожертвования через ЮKassa</p>
            </div>
        `;
    return;
  }

  const completed = donations.filter((d) => d.status === "completed");
  const total = completed.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  container.innerHTML = `
        <div class="v1-vstack">
            <div class="v1-actions v1-actions-between">
                <div class="v1-muted">
                    Собрано:
                    <strong class="v1-success-text">${total.toLocaleString("ru-RU")} ₽</strong>
                    <span class="v1-soft">· ${completed.length} шт.</span>
                </div>
                <select id="donations-status-filter" class="v1-input v1-select-compact">
                    <option value="" ${donationsFilter === "" ? "selected" : ""}>Все статусы</option>
                    <option value="pending" ${donationsFilter === "pending" ? "selected" : ""}>pending</option>
                    <option value="completed" ${donationsFilter === "completed" ? "selected" : ""}>completed</option>
                    <option value="cancelled" ${donationsFilter === "cancelled" ? "selected" : ""}>cancelled</option>
                </select>
            </div>

            <div class="v1-table-wrap">
                <table class="v1-table">
                    <thead>
                        <tr>
                            <th>Сумма</th>
                            <th>Сообщение</th>
                            <th>Статус</th>
                            <th>Создан</th>
                            <th>Завершён</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${donations
                          .map(
                            (d) => `
                            <tr>
                                <td><strong>${Number(d.amount || 0).toLocaleString("ru-RU")} ₽</strong></td>
                                <td>${d.message ? escapeHtml(d.message) : '<span class="v1-soft">—</span>'}</td>
                                <td>
                                    <span class="v1-badge ${getPurchaseStatusClass(d.status)}">
                                        ${escapeHtml(getPurchaseStatusLabel(d.status))}
                                    </span>
                                </td>
                                <td>${formatDateTime(d.created_at)}</td>
                                <td>${d.completed_at ? formatDateTime(d.completed_at) : '<span class="v1-soft">—</span>'}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    `;

  const filterSelect = document.getElementById("donations-status-filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", async () => {
      donationsFilter = filterSelect.value;
      await loadDonations(donationsFilter || null);
    });
  }
}

function switchTab(tab) {
  activeTab = tab;

  const tabUsers = document.getElementById("tab-users");
  const tablicenses = document.getElementById("tab-licenses");
  const tabPurchases = document.getElementById("tab-purchases");
  const tabAutomute = document.getElementById("tab-automute");
  const tabDonations = document.getElementById("tab-donations");

  if (tabUsers)
    tabUsers.className = `v1-subtab ${tab === "users" ? "active" : ""}`;
  if (tablicenses)
    tablicenses.className = `v1-subtab ${tab === "licenses" ? "active" : ""}`;
  if (tabPurchases)
    tabPurchases.className = `v1-subtab ${tab === "purchases" ? "active" : ""}`;
  if (tabAutomute)
    tabAutomute.className = `v1-subtab ${tab === "automute" ? "active" : ""}`;
  if (tabDonations)
    tabDonations.className = `v1-subtab ${tab === "donations" ? "active" : ""}`;

  if (tab === "users") {
    renderUsers();
  } else if (tab === "licenses") {
    renderLicenses();
  } else if (tab === "purchases") {
    renderPurchases();
  } else if (tab === "automute") {
    renderAutomute();
  } else if (tab === "donations") {
    renderDonations();
  }
}

function renderAutomute() {
  const container = document.getElementById("admin-content");
  if (!container) return;

  if (!automutePurchases.length) {
    container.innerHTML = `
      <div class="v1-empty">
        <i class="fas fa-volume-mute v1-empty-icon" aria-hidden="true"></i>
        <div class="v1-empty-h">Нет покупок AutoMute</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="v1-table-wrap">
      <table class="v1-table">
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
                  <strong>${escapeHtml(p.username || "—")}</strong>
                  <div class="v1-muted">${escapeHtml(p.email || "")}</div>
                </div>
              </td>
              <td><span class="v1-badge v1-badge-info">${escapeHtml(p.plan)}</span></td>
              <td>${p.amount} ₽</td>
              <td><code>${escapeHtml(p.sbp_comment || "")}</code></td>
              <td>
                ${p.status === "pending" ? '<span class="v1-badge v1-badge-warn">Ожидает</span>'
                  : p.status === "completed" ? '<span class="v1-badge v1-badge-success">Подтверждена</span>'
                  : '<span class="v1-badge v1-badge-danger">Отменена</span>'}
              </td>
              <td>${formatDateTime(p.created_at)}</td>
              <td>${p.license_key ? `<code>${escapeHtml(p.license_key)}</code>` : "—"}</td>
              <td>
                ${p.status === "pending" ? `
                  <div class="v1-actions">
                    <button class="v1-icon-btn am-confirm-btn" data-id="${escapeHtml(p.id)}" aria-label="Подтвердить">
                      <i class="fas fa-check"></i>
                    </button>
                    <button class="v1-icon-btn danger am-cancel-btn" data-id="${escapeHtml(p.id)}" aria-label="Отклонить">
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
  showModal({
    title: "Новый пароль",
    content: `
      <div class="v1-center v1-vstack">
        <p class="v1-muted">Новый пароль для пользователя <strong>${escapeHtml(username)}</strong>:</p>
        <div class="v1-code-box"><code id="new-password-value">${escapeHtml(password)}</code></div>
        <p class="v1-muted">Скопируйте его и передайте пользователю.</p>
      </div>
    `,
    footer: `
      <button class="v1-btn" id="close-password-modal">Закрыть</button>
      <button class="v1-btn v1-btn-primary" id="copy-password-btn">📋 Скопировать</button>
    `,
  });

  setTimeout(() => {
    document.getElementById("close-password-modal")?.addEventListener("click", closeModal);
    document.getElementById("copy-password-btn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(password);
        showToast("Пароль скопирован", "success");
        closeModal();
      } catch {
        fallbackCopyTextToClipboard(password);
      }
    });
  }, 0);
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
      showToast("Пароль скопирован", "success");
      closeModal();
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
    button.textContent = "Обновление…";
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

async function loadDonations(status = null) {
  try {
    donations = await adminDonationsApi.getAll(status);
    if (activeTab === "donations") {
      renderDonations();
    }
  } catch (error) {
    showToast(error.message || "Ошибка загрузки донатов", "error");
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
    loadDonations(),
  ]);

  const tabUsers = document.getElementById("tab-users");
  const tabLicenses = document.getElementById("tab-licenses");
  const tabPurchases = document.getElementById("tab-purchases");
  const tabAutomute = document.getElementById("tab-automute");
  const tabDonations = document.getElementById("tab-donations");

  if (tabUsers) tabUsers.addEventListener("click", () => switchTab("users"));
  if (tabLicenses)
    tabLicenses.addEventListener("click", () => switchTab("licenses"));
  if (tabPurchases)
    tabPurchases.addEventListener("click", () => switchTab("purchases"));
  if (tabAutomute)
    tabAutomute.addEventListener("click", () => switchTab("automute"));
  if (tabDonations)
    tabDonations.addEventListener("click", () => switchTab("donations"));

  renderUsers();
}

export function unmount() {
  users = [];
  purchases = [];
  automutePurchases = [];
  donations = [];
  activeTab = "users";
  purchasesFilter = "";
  donationsFilter = "";
}
