import { jsonResponse, getUserFromRequest } from "../lib/helpers.js";

export async function handleListNotifications(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const { results } = await env.DB.prepare(
    `SELECT n.*, t.name AS title_name FROM notifications n
     LEFT JOIN titles t ON t.id = n.title_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all();

  return jsonResponse(results);
}

export async function handleMarkNotificationsRead(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const body = await request.json().catch(() => ({}));
  if (body.markAllRead) {
    await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(user.id).run();
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: "Nothing to update." }, 400);
}
