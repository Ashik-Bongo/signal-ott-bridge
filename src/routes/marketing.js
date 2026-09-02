import { jsonResponse, getUserFromRequest, genId } from "../lib/helpers.js";

function canManageSales(user) {
  return user && ["marketing_sales", "admin"].includes(user.department);
}

export async function handleAddMarketingAssignment(request, env, titleId) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  const title = await env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(titleId).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const body = await request.json().catch(() => null);
  if (!body || !body.channel || !body.user_id) {
    return jsonResponse({ error: "channel and user_id are required." }, 400);
  }
  if (!["social_media", "offline"].includes(body.channel)) {
    return jsonResponse({ error: "Invalid channel." }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM marketing_assignments WHERE title_id = ? AND channel = ? AND user_id = ?"
  )
    .bind(titleId, body.channel, body.user_id)
    .first();
  if (existing) return jsonResponse({ error: "That person is already assigned to this channel." }, 409);

  const id = genId();
  await env.DB.prepare(
    "INSERT INTO marketing_assignments (id, title_id, channel, user_id) VALUES (?, ?, ?, ?)"
  )
    .bind(id, titleId, body.channel, body.user_id)
    .run();

  return jsonResponse({ id }, 201);
}

export async function handleRemoveMarketingAssignment(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  await env.DB.prepare("DELETE FROM marketing_assignments WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}
