import { jsonResponse, getUserFromRequest } from "../lib/helpers.js";

async function requireAdmin(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return { error: jsonResponse({ error: "Not signed in." }, 401) };
  if (user.department !== "admin") return { error: jsonResponse({ error: "Admins only." }, 403) };
  return { user };
}

export async function handleListPendingUsers(request, env) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;

  const { results } = await env.DB.prepare(
    `SELECT id, name, email, department, created_at FROM users WHERE is_approved = 0 ORDER BY created_at ASC`
  ).all();

  return jsonResponse(results);
}

export async function handleApproveUser(request, env) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || !body.userId) return jsonResponse({ error: "userId is required." }, 400);

  await env.DB.prepare("UPDATE users SET is_approved = 1 WHERE id = ?").bind(body.userId).run();
  return jsonResponse({ ok: true });
}

export async function handleRejectUser(request, env) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || !body.userId) return jsonResponse({ error: "userId is required." }, 400);

  await env.DB.prepare("DELETE FROM users WHERE id = ? AND is_approved = 0").bind(body.userId).run();
  return jsonResponse({ ok: true });
}
