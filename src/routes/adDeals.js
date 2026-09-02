import { jsonResponse, getUserFromRequest, genId } from "../lib/helpers.js";

function canManageSales(user) {
  return user && ["marketing_sales", "admin"].includes(user.department);
}

export async function handleCreateAdDeal(request, env, titleId) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  const title = await env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(titleId).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const body = await request.json().catch(() => null);
  const clientName = (body && body.client_name || "").trim();
  if (!clientName) return jsonResponse({ error: "Client name is required." }, 400);

  const id = genId();
  await env.DB.prepare(
    `INSERT INTO ad_deals (id, title_id, client_name) VALUES (?, ?, ?)`
  )
    .bind(id, titleId, clientName)
    .run();

  return jsonResponse({ id }, 201);
}

export async function handleUpdateAdDeal(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  const deal = await env.DB.prepare("SELECT id FROM ad_deals WHERE id = ?").bind(id).first();
  if (!deal) return jsonResponse({ error: "Ad deal not found." }, 404);

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const fields = [];
  const values = [];

  if ("status" in body) {
    if (!["available", "locked"].includes(body.status)) {
      return jsonResponse({ error: "Invalid status." }, 400);
    }
    fields.push("status = ?");
    values.push(body.status);
  }
  if ("assigned_to" in body) {
    fields.push("assigned_to = ?");
    values.push(body.assigned_to || null);
  }
  if ("notes" in body) {
    fields.push("notes = ?");
    values.push(body.notes || null);
  }
  if ("client_name" in body) {
    const name = (body.client_name || "").trim();
    if (!name) return jsonResponse({ error: "Client name can't be empty." }, 400);
    fields.push("client_name = ?");
    values.push(name);
  }

  if (fields.length === 0) return jsonResponse({ error: "Nothing to update." }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE ad_deals SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return jsonResponse({ ok: true });
}

export async function handleDeleteAdDeal(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);

  await env.DB.prepare("DELETE FROM ad_deals WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}
