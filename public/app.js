const STAGES = [
  { key: "planning", label: "Planning" },
  { key: "in_production", label: "In production" },
  { key: "post_production", label: "Post-production" },
  { key: "ready_for_release", label: "Ready for release" },
  { key: "released", label: "Released" },
];

const DEPT_LABELS = {
  content: "Content",
  marketing_sales: "Marketing & Sales",
  rnd: "R&D",
  admin: "Admin",
};

let CURRENT_USER = null;
let TITLES_CACHE = [];
let notifPollTimer = null;

// ---------- fetch helper ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || "Something went wrong.");
  return data;
}

// ---------- boot ----------
window.addEventListener("DOMContentLoaded", async () => {
  wireAuthScreen();
  wireAppShell();
  wireModals();

  try {
    const me = await api("/api/auth/me");
    CURRENT_USER = me;
    enterApp();
  } catch (_) {
    // not signed in — auth screen already shown by default
  }
});

// ---------- auth screen ----------
function wireAuthScreen() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      document.getElementById("login-form").hidden = !isLogin;
      document.getElementById("register-form").hidden = isLogin;
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    const fd = new FormData(e.target);
    try {
      const user = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      CURRENT_USER = user;
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("register-error");
    errEl.textContent = "";
    const fd = new FormData(e.target);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          department: fd.get("department"),
        }),
      });
      e.target.reset();
      errEl.style.color = "var(--teal)";
      errEl.textContent = "Account created. An admin needs to approve you before you can sign in.";
      // Note: deliberately staying on this tab so the message stays visible.
      document.querySelector('.auth-tab[data-tab="login"]').click();
    } catch (err) {
      errEl.style.color = "var(--red)";
      errEl.textContent = err.message;
    }
  });
}

function enterApp() {
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;
  document.getElementById("me-name").textContent = CURRENT_USER.name;
  document.getElementById("me-dept").textContent = DEPT_LABELS[CURRENT_USER.department] || CURRENT_USER.department;

  const newTitleBtn = document.getElementById("new-title-btn");
  newTitleBtn.hidden = !["content", "admin"].includes(CURRENT_USER.department);

  const adminNavItem = document.getElementById("admin-nav-item");
  adminNavItem.hidden = CURRENT_USER.department !== "admin";

  loadTitles();
  loadNotifications();
  notifPollTimer = setInterval(loadNotifications, 20000);
}

// ---------- app shell nav ----------
function wireAppShell() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.getElementById("board-view").hidden = view !== "board";
      document.getElementById("calendar-view").hidden = view !== "calendar";
      document.getElementById("admin-view").hidden = view !== "admin";
      document.getElementById("view-title").textContent =
        view === "board" ? "Release board" : view === "calendar" ? "Calendar" : "Pending accounts";
      if (view === "calendar") renderCalendar();
      if (view === "admin") loadPendingUsers();
    });
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    clearInterval(notifPollTimer);
    location.reload();
  });

  document.getElementById("notif-bell").addEventListener("click", () => {
    const panel = document.getElementById("notif-panel");
    panel.hidden = !panel.hidden;
  });
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".notif-wrap");
    if (!wrap.contains(e.target)) document.getElementById("notif-panel").hidden = true;
  });
  document.getElementById("notif-mark-read").addEventListener("click", async () => {
    await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ markAllRead: true }) });
    loadNotifications();
  });
}

// ---------- titles ----------
async function loadTitles() {
  const list = document.getElementById("titles-list");
  try {
    TITLES_CACHE = await api("/api/titles");
    renderTitles();
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderTitles() {
  const list = document.getElementById("titles-list");
  if (TITLES_CACHE.length === 0) {
    list.innerHTML = `<p class="empty-state">No titles yet. ${
      ["content", "admin"].includes(CURRENT_USER.department) ? "Add one with \u201c+ New title.\u201d" : "Content will add the first one soon."
    }</p>`;
    return;
  }
  list.innerHTML = TITLES_CACHE.map(titleRowHtml).join("");
  list.querySelectorAll(".title-row").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

function stageIndex(stage) { return STAGES.findIndex((s) => s.key === stage); }
function canManageSales() { return CURRENT_USER && ["marketing_sales", "admin"].includes(CURRENT_USER.department); }

function titleRowHtml(t) {
  const idx = stageIndex(t.stage);
  const segs = STAGES.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    return `<div class="stage-seg ${cls}"></div>`;
  }).join("");
  const labels = STAGES.map((s, i) => `<span class="stage-label ${i <= idx ? "reached" : ""}">${s.label}</span>`).join("");
  const dateText = t.target_release_date ? formatDate(t.target_release_date) : "No date set";

  return `
  <div class="title-row" data-id="${t.id}">
    <div class="title-row-top">
      <span class="title-name">${escapeHtml(t.name)}</span>
      <span class="title-meta">${dateText}</span>
    </div>
    <div class="stage-strip">${segs}</div>
    <div class="stage-labels">${labels}</div>
  </div>`;
}

// ---------- new / edit title modal ----------
function wireModals() {
  document.getElementById("new-title-btn").addEventListener("click", () => openTitleModal());
  document.getElementById("modal-close").addEventListener("click", () => closeModal("title-modal"));
  document.getElementById("detail-close").addEventListener("click", () => closeModal("detail-modal"));

  document.getElementById("title-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("title-form-error");
    errEl.textContent = "";
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name"),
      description: fd.get("description"),
      genre: fd.get("genre"),
      target_audience: fd.get("target_audience"),
      target_release_date: fd.get("target_release_date") || null,
    };
    const id = fd.get("id");
    try {
      if (id) {
        await api(`/api/titles/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/titles", { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal("title-modal");
      loadTitles();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

function openTitleModal(title = null) {
  closeAllModals();
  const form = document.getElementById("title-form");
  form.reset();
  document.getElementById("title-form-error").textContent = "";
  document.getElementById("modal-heading").textContent = title ? "Edit title" : "New title";
  if (title) {
    form.id.value = title.id;
    form.name.value = title.name;
    form.description.value = title.description || "";
    form.genre.value = title.genre || "";
    form.target_audience.value = title.target_audience || "";
    form.target_release_date.value = title.target_release_date || "";
  }
  document.getElementById("title-modal").hidden = false;
}

function closeModal(id) { document.getElementById(id).hidden = true; }

function closeAllModals() {
  document.getElementById("title-modal").hidden = true;
  document.getElementById("detail-modal").hidden = true;
}

// Close on backdrop click or Escape, and never allow two modals open together.
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllModals();
});

// ---------- detail drawer ----------
async function openDetail(id) {
  closeAllModals();
  const modal = document.getElementById("detail-modal");
  const body = document.getElementById("detail-body");
  modal.hidden = false;
  body.innerHTML = "<p class='empty-state'>Loading…</p>";

  let t;
  let salesUsers = [];
  try {
    t = await api(`/api/titles/${id}`);
    if (canManageSales()) {
      salesUsers = await api("/api/users?department=marketing_sales");
    }
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${err.message}</p>`;
    return;
  }

  document.getElementById("detail-heading").textContent = t.name;

  const canEdit = t.created_by === CURRENT_USER.id || CURRENT_USER.department === "admin";
  const stagePicker = STAGES.map(
    (s) => `<button class="stage-btn ${s.key === t.stage ? "active" : ""}" data-stage="${s.key}">${s.label}</button>`
  ).join("");

  const history = t.history
    .map(
      (h) =>
        `<div class="history-item"><b>${STAGES.find((s) => s.key === h.to_stage)?.label || h.to_stage}</b> — ${h.changed_by_name}, ${formatDateTime(h.changed_at)}</div>`
    )
    .join("");

  const salesEditable = canManageSales();
  const canEditEditingStatus = CURRENT_USER && ["content", "admin"].includes(CURRENT_USER.department);
  const adDealsHtml = adDealsSectionHtml(t.ad_deals, salesUsers, salesEditable);
  const marketingHtml = marketingSectionHtml(t.marketing_assignments, salesUsers, salesEditable);
  const showBudgets = stageIndex(t.stage) >= stageIndex("post_production");
  const showEditingStatus = stageIndex(t.stage) >= stageIndex("post_production");
  const offlineBudget = (t.budgets || []).find((b) => b.channel === "offline");
  const budgetHtml = showBudgets ? budgetSectionHtml(t.digital_platforms, offlineBudget, salesEditable) : "";

  body.innerHTML = `
    <div class="detail-section">
      <h4>Overview</h4>
      <p class="detail-desc">${escapeHtml(t.description || "No description yet.")}</p>
      <p class="detail-desc" style="margin-top:6px">
        ${t.genre ? `Genre: ${escapeHtml(t.genre)} &nbsp;·&nbsp; ` : ""}
        ${t.target_audience ? `Audience: ${escapeHtml(t.target_audience)} &nbsp;·&nbsp; ` : ""}
        Target release: ${t.target_release_date ? formatDate(t.target_release_date) : "not set"}
      </p>
    </div>
    <div class="detail-section">
      <h4>Move stage</h4>
      <div class="stage-picker">${stagePicker}</div>
    </div>
    <div class="detail-section">
      <h4>Ad sales</h4>
      ${adDealsHtml}
    </div>
    <div class="detail-section">
      <h4>Marketing assignments</h4>
      ${marketingHtml}
    </div>
    ${showEditingStatus ? `
    <div class="detail-section">
      <h4>Editing team</h4>
      <div class="editing-status-row">
        <button class="editing-status-pill ${t.editing_status}" id="editing-status-toggle" ${canEditEditingStatus ? "" : "disabled"}>
          ${t.editing_status === "completed" ? "Completed" : "Preparing"}
        </button>
        ${!canEditEditingStatus ? "<span class='detail-desc'>Only Content can change this.</span>" : ""}
      </div>
    </div>` : ""}
    ${showBudgets ? `
    <div class="detail-section">
      <h4>Marketing budget</h4>
      ${budgetHtml}
    </div>` : ""}
    <div class="detail-section">
      <h4>History</h4>
      ${history || "<p class='detail-desc'>No history yet.</p>"}
    </div>
    ${canEdit ? `
    <div class="detail-section" style="display:flex; gap:14px;">
      <button class="btn-ghost" id="detail-edit-btn">Edit details</button>
      <div class="detail-danger"><button id="detail-delete-btn">Remove title</button></div>
    </div>` : ""}
  `;

  wireAdDealsSection(t.id, salesUsers, salesEditable);
  wireMarketingSection(t.id, salesUsers, salesEditable);
  if (showBudgets) wireBudgetSection(t.id, salesEditable);

  const editingBtn = document.getElementById("editing-status-toggle");
  if (editingBtn && canEditEditingStatus) {
    editingBtn.addEventListener("click", async () => {
      const newStatus = t.editing_status === "completed" ? "preparing" : "completed";
      try {
        await api(`/api/titles/${t.id}`, { method: "PATCH", body: JSON.stringify({ editing_status: newStatus }) });
        openDetail(t.id);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  body.querySelectorAll(".stage-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const newStage = btn.dataset.stage;
      if (newStage === t.stage) return;
      try {
        await api(`/api/titles/${t.id}`, { method: "PATCH", body: JSON.stringify({ stage: newStage }) });
        closeModal("detail-modal");
        loadTitles();
        loadNotifications();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  const editBtn = body.querySelector("#detail-edit-btn");
  if (editBtn) editBtn.addEventListener("click", () => { closeModal("detail-modal"); openTitleModal(t); });

  const delBtn = body.querySelector("#detail-delete-btn");
  if (delBtn) delBtn.addEventListener("click", async () => {
    if (!confirm(`Remove "${t.name}"? This can't be undone.`)) return;
    try {
      await api(`/api/titles/${t.id}`, { method: "DELETE" });
      closeModal("detail-modal");
      loadTitles();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- marketing budget section ----------
function fmtMoney(n) {
  return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function budgetSectionHtml(platforms, offlineBudget, editable) {
  const remaining = (b) => Number(b.budget_amount) - Number(b.spent_before_publish) - Number(b.spent_after_publish);

  const platformRows = (platforms || [])
    .map((p) => {
      const rem = remaining(p);
      const remClass = rem < 0 ? "negative" : "positive";
      const field = (label, key, value) => editable
        ? `<div class="budget-field">
            <label>${label}</label>
            <input type="number" min="0" step="1" data-platform-id="${p.id}" data-field="${key}" value="${value}" />
          </div>`
        : `<div class="budget-field"><label>${label}</label><span>${fmtMoney(value)}</span></div>`;

      return `
      <div class="platform-row" data-id="${p.id}">
        <div class="platform-row-head">
          ${editable
            ? `<input type="text" class="platform-name-input" data-platform-id="${p.id}" value="${escapeHtml(p.platform_name)}" style="font-size:13px;font-weight:600;flex:1;margin-right:8px" />`
            : `<span class="platform-name">${escapeHtml(p.platform_name)}</span>`}
          ${editable ? `<button class="icon-remove" data-remove-platform="${p.id}" title="Remove">✕</button>` : ""}
        </div>
        ${field("Budget", "budget_amount", p.budget_amount)}
        ${field("Spent before publish", "spent_before_publish", p.spent_before_publish)}
        ${field("Spent after publish", "spent_after_publish", p.spent_after_publish)}
        <div class="budget-remaining ${remClass}"><span>Remaining</span><span>${fmtMoney(rem)}</span></div>
      </div>`;
    })
    .join("");

  const addPlatformForm = editable
    ? `<div class="add-inline-form">
        <input type="text" id="new-platform-input" placeholder="Platform name (e.g. Facebook)" />
        <button id="add-platform-btn">+ Add platform</button>
      </div>`
    : "";

  const digitalColumn = `
    <div>
      <div class="budget-title" style="margin-bottom:10px">Digital platforms</div>
      ${platformRows || "<p class='detail-desc'>No platforms added yet.</p>"}
      ${addPlatformForm}
    </div>`;

  const ob = offlineBudget || { budget_amount: 0, spent_before_publish: 0, spent_after_publish: 0 };
  const offRem = remaining(ob);
  const offRemClass = offRem < 0 ? "negative" : "positive";
  const offField = (label, key, value) => editable
    ? `<div class="budget-field">
        <label>${label}</label>
        <input type="number" min="0" step="1" data-channel="offline" data-field="${key}" value="${value}" />
      </div>`
    : `<div class="budget-field"><label>${label}</label><span>${fmtMoney(value)}</span></div>`;

  const offlineColumn = `
    <div class="budget-card">
      <div class="budget-title">Offline marketing</div>
      ${offField("Total budget", "budget_amount", ob.budget_amount)}
      ${offField("Spent before publish", "spent_before_publish", ob.spent_before_publish)}
      ${offField("Spent after publish", "spent_after_publish", ob.spent_after_publish)}
      <div class="budget-remaining ${offRemClass}"><span>Remaining</span><span>${fmtMoney(offRem)}</span></div>
    </div>`;

  return `<div class="budget-grid">${digitalColumn}${offlineColumn}</div>`;
}

function wireBudgetSection(titleId, editable) {
  if (!editable) return;
  const body = document.getElementById("detail-body");

  body.querySelectorAll('[data-channel="offline"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value === "" ? 0 : Number(input.value);
      if (Number.isNaN(value) || value < 0) { alert("Enter a valid, non-negative number."); openDetail(titleId); return; }
      try {
        await api(`/api/titles/${titleId}/budgets/offline`, { method: "PATCH", body: JSON.stringify({ [input.dataset.field]: value }) });
        openDetail(titleId);
      } catch (err) { alert(err.message); }
    });
  });

  body.querySelectorAll('input[data-platform-id][data-field]').forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value === "" ? 0 : Number(input.value);
      if (Number.isNaN(value) || value < 0) { alert("Enter a valid, non-negative number."); openDetail(titleId); return; }
      try {
        await api(`/api/digital-platforms/${input.dataset.platformId}`, { method: "PATCH", body: JSON.stringify({ [input.dataset.field]: value }) });
        openDetail(titleId);
      } catch (err) { alert(err.message); }
    });
  });

  body.querySelectorAll('.platform-name-input').forEach((input) => {
    input.addEventListener("change", async () => {
      const name = input.value.trim();
      if (!name) { alert("Platform name can't be empty."); openDetail(titleId); return; }
      try {
        await api(`/api/digital-platforms/${input.dataset.platformId}`, { method: "PATCH", body: JSON.stringify({ platform_name: name }) });
        openDetail(titleId);
      } catch (err) { alert(err.message); }
    });
  });

  body.querySelectorAll('[data-remove-platform]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this platform?")) return;
      try {
        await api(`/api/digital-platforms/${btn.dataset.removePlatform}`, { method: "DELETE" });
        openDetail(titleId);
      } catch (err) { alert(err.message); }
    });
  });

  const addBtn = document.getElementById("add-platform-btn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const input = document.getElementById("new-platform-input");
      const name = input.value.trim();
      if (!name) return;
      try {
        await api(`/api/titles/${titleId}/digital-platforms`, { method: "POST", body: JSON.stringify({ platform_name: name }) });
        openDetail(titleId);
      } catch (err) { alert(err.message); }
    });
  }
}

// ---------- ad sales section ----------
function adDealsSectionHtml(deals, salesUsers, editable) {
  const rows = (deals || [])
    .map((d) => {
      const assignOptions = salesUsers
        .map((u) => `<option value="${u.id}" ${d.assigned_to === u.id ? "selected" : ""}>${escapeHtml(u.name)}</option>`)
        .join("");
      return `
      <div class="ad-deal-row" data-id="${d.id}">
        <div class="ad-deal-info">
          <span class="ad-deal-client">${escapeHtml(d.client_name)}</span>
          <span class="ad-deal-meta">${d.assigned_to_name ? "Assigned to " + escapeHtml(d.assigned_to_name) : "Unassigned"}</span>
        </div>
        <div class="ad-deal-actions">
          ${editable ? `
            <button class="status-pill ${d.status}" data-action="toggle-status">${d.status === "locked" ? "Locked" : "Available"}</button>
            <select class="assign-select" data-action="assign">
              <option value="">Unassigned</option>
              ${assignOptions}
            </select>
            <button class="icon-remove" data-action="remove" title="Remove">✕</button>
          ` : `<span class="status-pill ${d.status}">${d.status === "locked" ? "Locked" : "Available"}</span>`}
        </div>
      </div>`;
    })
    .join("");

  const empty = "<p class='detail-desc'>No ad clients yet.</p>";
  const addForm = editable
    ? `<div class="add-inline-form">
        <input type="text" id="new-ad-client-input" placeholder="Client name" />
        <button id="add-ad-client-btn">+ Add client</button>
      </div>`
    : "";

  return (rows || empty) + addForm;
}

function wireAdDealsSection(titleId, salesUsers, editable) {
  const body = document.getElementById("detail-body");

  body.querySelectorAll(".ad-deal-row").forEach((row) => {
    const dealId = row.dataset.id;

    const statusBtn = row.querySelector('[data-action="toggle-status"]');
    if (statusBtn) {
      statusBtn.addEventListener("click", async () => {
        const newStatus = statusBtn.classList.contains("locked") ? "available" : "locked";
        try {
          await api(`/api/ad-deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
          openDetail(titleId);
        } catch (err) {
          alert(err.message);
        }
      });
    }

    const assignSelect = row.querySelector('[data-action="assign"]');
    if (assignSelect) {
      assignSelect.addEventListener("change", async () => {
        try {
          await api(`/api/ad-deals/${dealId}`, {
            method: "PATCH",
            body: JSON.stringify({ assigned_to: assignSelect.value || null }),
          });
          openDetail(titleId);
        } catch (err) {
          alert(err.message);
        }
      });
    }

    const removeBtn = row.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener("click", async () => {
        if (!confirm("Remove this client from the ad list?")) return;
        try {
          await api(`/api/ad-deals/${dealId}`, { method: "DELETE" });
          openDetail(titleId);
        } catch (err) {
          alert(err.message);
        }
      });
    }
  });

  const addBtn = document.getElementById("add-ad-client-btn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const input = document.getElementById("new-ad-client-input");
      const name = input.value.trim();
      if (!name) return;
      try {
        await api(`/api/titles/${titleId}/ad-deals`, { method: "POST", body: JSON.stringify({ client_name: name }) });
        openDetail(titleId);
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

// ---------- marketing assignments section ----------
function marketingSectionHtml(assignments, salesUsers, editable) {
  const channels = [
    { key: "social_media", label: "Social media" },
    { key: "offline", label: "Offline marketing" },
  ];

  return channels
    .map((ch) => {
      const people = (assignments || []).filter((a) => a.channel === ch.key);
      const chips = people
        .map(
          (a) => `
        <span class="chip">
          ${escapeHtml(a.user_name)}
          ${editable ? `<button class="icon-remove" data-remove-assignment="${a.id}" title="Remove">✕</button>` : ""}
        </span>`
        )
        .join("");

      const availableUsers = salesUsers.filter((u) => !people.some((p) => p.user_id === u.id));
      const addControl = editable && availableUsers.length > 0
        ? `<div class="add-inline-form">
            <select class="assign-select" data-add-channel="${ch.key}" style="flex:1">
              <option value="">Assign someone…</option>
              ${availableUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}
            </select>
          </div>`
        : "";

      return `
      <div class="channel-group">
        <div class="channel-label">${ch.label}</div>
        <div class="chip-row">${chips || "<span class='detail-desc'>Nobody assigned yet.</span>"}</div>
        ${addControl}
      </div>`;
    })
    .join("");
}

function wireMarketingSection(titleId, salesUsers, editable) {
  const body = document.getElementById("detail-body");

  body.querySelectorAll("[data-remove-assignment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.removeAssignment;
      try {
        await api(`/api/marketing-assignments/${id}`, { method: "DELETE" });
        openDetail(titleId);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  body.querySelectorAll("[data-add-channel]").forEach((select) => {
    select.addEventListener("change", async () => {
      if (!select.value) return;
      try {
        await api(`/api/titles/${titleId}/marketing-assignments`, {
          method: "POST",
          body: JSON.stringify({ channel: select.dataset.addChannel, user_id: select.value }),
        });
        openDetail(titleId);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// ---------- calendar ----------
function renderCalendar() {
  const container = document.getElementById("calendar-list");
  const withDates = TITLES_CACHE.filter((t) => t.target_release_date)
    .sort((a, b) => a.target_release_date.localeCompare(b.target_release_date));

  if (withDates.length === 0) {
    container.innerHTML = "<p class='empty-state'>No release dates set yet.</p>";
    return;
  }

  const groups = {};
  withDates.forEach((t) => {
    const d = new Date(t.target_release_date + "T00:00:00");
    const key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    (groups[key] = groups[key] || []).push(t);
  });

  container.innerHTML = Object.entries(groups)
    .map(([month, items]) => `
      <div class="calendar-month">
        <h3>${month}</h3>
        ${items.map((t) => {
          const d = new Date(t.target_release_date + "T00:00:00");
          const stage = STAGES.find((s) => s.key === t.stage);
          return `
          <div class="calendar-row" data-id="${t.id}">
            <span class="calendar-date">${d.getDate()}</span>
            <span class="calendar-title">${escapeHtml(t.name)}</span>
            <span class="calendar-stage-tag tag-${t.stage}">${stage?.label}</span>
          </div>`;
        }).join("")}
      </div>
    `).join("");

  container.querySelectorAll(".calendar-row").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

// ---------- admin: pending accounts ----------
async function loadPendingUsers() {
  const list = document.getElementById("pending-users-list");
  list.innerHTML = "<p class='empty-state'>Loading…</p>";
  let items;
  try {
    items = await api("/api/admin/pending-users");
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
    return;
  }
  if (items.length === 0) {
    list.innerHTML = "<p class='empty-state'>No pending accounts right now.</p>";
    return;
  }
  list.innerHTML = items
    .map(
      (u) => `
    <div class="pending-row" data-id="${u.id}">
      <div class="pending-info">
        <span class="pending-name">${escapeHtml(u.name)}</span>
        <span class="pending-meta">${escapeHtml(u.email)} · ${DEPT_LABELS[u.department] || u.department}</span>
      </div>
      <div class="pending-actions">
        <button class="btn-approve" data-action="approve">Approve</button>
        <button class="btn-reject" data-action="reject">Reject</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll(".pending-row").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="approve"]').addEventListener("click", async () => {
      try {
        await api("/api/admin/approve-user", { method: "POST", body: JSON.stringify({ userId: id }) });
        loadPendingUsers();
      } catch (err) {
        alert(err.message);
      }
    });
    row.querySelector('[data-action="reject"]').addEventListener("click", async () => {
      if (!confirm("Reject and remove this account request?")) return;
      try {
        await api("/api/admin/reject-user", { method: "POST", body: JSON.stringify({ userId: id }) });
        loadPendingUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// ---------- notifications ----------
async function loadNotifications() {
  let items;
  try {
    items = await api("/api/notifications");
  } catch (_) {
    return;
  }
  const unread = items.filter((n) => !n.is_read).length;
  const badge = document.getElementById("notif-badge");
  badge.hidden = unread === 0;
  badge.textContent = unread;

  const list = document.getElementById("notif-list");
  if (items.length === 0) {
    list.innerHTML = "<p class='notif-empty'>No notifications yet.</p>";
    return;
  }
  list.innerHTML = items
    .map(
      (n) => `
    <div class="notif-item ${n.is_read ? "" : "unread"}">
      ${escapeHtml(n.message)}
      <span class="notif-time">${formatDateTime(n.created_at)}</span>
    </div>`
    )
    .join("");
}

// ---------- utils ----------
function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function formatDateTime(iso) {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
