import { jsonResponse, getUserFromRequest, genId } from "../lib/helpers.js";

function canManageSales(user) {
  return user && ["marketing_sales", "admin"].includes(user.department);
}

export async function handleCreateDigitalPlatform(request, env, titleId) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  const title = await env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(titleId).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const body = await request.json().catch(() => null);
  const name = (body && body.platform_name || "").trim();
  if (!name) return jsonResponse({ error: "Platform name is required." }, 400);

  const id = genId();
  await env.DB.prepare(
    "INSERT INTO digital_platforms (id, title_id, platform_name) VALUES (?, ?, ?)"
  )
    .bind(id, titleId, name)
    .run();

  return jsonResponse({ id }, 201);
}

export async function handleUpdateDigitalPlatform(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  const platform = await env.DB.prepare("SELECT id FROM digital_platforms WHERE id = ?").bind(id).first();
  if (!platform) return jsonResponse({ error: "Platform not found." }, 404);

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const fields = [];
  const values = [];

  if ("platform_name" in body) {
    const name = (body.platform_name || "").trim();
    if (!name) return jsonResponse({ error: "Platform name can't be empty." }, 400);
    fields.push("platform_name = ?");
    values.push(name);
  }
  for (const key of ["budget_amount", "spent_before_publish", "spent_after_publish"]) {
    if (key in body) {
      const num = Number(body[key]);
      if (Number.isNaN(num) || num < 0) {
        return jsonResponse({ error: `${key} must be a non-negative number.` }, 400);
      }
      fields.push(`${key} = ?`);
      values.push(num);
    }
  }

  if (fields.length === 0) return jsonResponse({ error: "Nothing to update." }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE digital_platforms SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return jsonResponse({ ok: true });
}

export async function handleDeleteDigitalPlatform(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  await env.DB.prepare("DELETE FROM digital_platforms WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}
