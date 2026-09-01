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
  try {
    t = await api(`/api/titles/${id}`);
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
      <h4>History</h4>
      ${history || "<p class='detail-desc'>No history yet.</p>"}
    </div>
    ${canEdit ? `
    <div class="detail-section" style="display:flex; gap:14px;">
      <button class="btn-ghost" id="detail-edit-btn">Edit details</button>
      <div class="detail-danger"><button id="detail-delete-btn">Remove title</button></div>
    </div>` : ""}
  `;

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
