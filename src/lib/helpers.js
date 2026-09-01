// Shared helpers used across route handlers.

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function genId() {
  return crypto.randomUUID();
}

export function genToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader() {
  return "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export async function getUserFromRequest(request, env) {
  const token = getCookie(request, "session");
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.department
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  )
    .bind(token)
    .first();
  return row || null;
}

export const DEPARTMENTS = ["content", "marketing_sales", "rnd", "admin"];
export const STAGES = ["planning", "in_production", "post_production", "ready_for_release", "released"];

export const STAGE_NOTIFY_RULES = {
  in_production: {
    departments: ["marketing_sales"],
    message: (name) => `"${name}" has entered production. Start early campaign concepting.`,
  },
  post_production: {
    departments: ["marketing_sales"],
    message: (name) => `"${name}" is in post-production. Begin pricing and partner outreach prep.`,
  },
  ready_for_release: {
    departments: ["marketing_sales", "rnd"],
    message: (name) =>
      `"${name}" is ready for release. Marketing/Sales: launch the campaign. R&D: prepare encoding and recommendation tagging.`,
  },
  released: {
    departments: ["marketing_sales", "rnd", "content"],
    message: (name) => `"${name}" has gone live on the platform.`,
  },
};

export async function notifyDepartments(env, { departments, message, titleId, excludeUserId }) {
  if (!departments || departments.length === 0) return;
  const placeholders = departments.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id FROM users WHERE department IN (${placeholders})`
  )
    .bind(...departments)
    .all();
  const recipients = results.filter((u) => u.id !== excludeUserId);
  if (recipients.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT INTO notifications (id, user_id, title_id, message) VALUES (?, ?, ?, ?)`
  );
  await env.DB.batch(recipients.map((u) => stmt.bind(genId(), u.id, titleId, message)));
}
