import {
  jsonResponse,
  getUserFromRequest,
  genId,
  STAGES,
  STAGE_NOTIFY_RULES,
  notifyDepartments,
} from "../lib/helpers.js";
import { ensureDefaultBudgets } from "./budgets.js";

export async function handleListTitles(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const { results } = await env.DB.prepare(
    `SELECT t.*, u.name AS created_by_name
     FROM titles t JOIN users u ON u.id = t.created_by
     ORDER BY
       CASE WHEN t.target_release_date IS NULL THEN 1 ELSE 0 END,
       t.target_release_date ASC,
       t.created_at DESC`
  ).all();

  return jsonResponse(results);
}

export async function handleCreateTitle(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!["content", "admin"].includes(user.department)) {
    return jsonResponse({ error: "Only the Content team can add new titles." }, 403);
  }

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const name = (body.name || "").trim();
  if (!name) return jsonResponse({ error: "Title name is required." }, 400);

  const id = genId();
  await env.DB.prepare(
    `INSERT INTO titles (id, name, description, genre, target_audience, target_release_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      name,
      body.description || null,
      body.genre || null,
      body.target_audience || null,
      body.target_release_date || null,
      user.id
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO stage_history (id, title_id, from_stage, to_stage, changed_by) VALUES (?, ?, NULL, 'planning', ?)`
  )
    .bind(genId(), id, user.id)
    .run();

  return jsonResponse({ id }, 201);
}

export async function handleGetTitle(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const title = await env.DB.prepare(
    `SELECT t.*, u.name AS created_by_name FROM titles t JOIN users u ON u.id = t.created_by WHERE t.id = ?`
  )
    .bind(id)
    .first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const { results: history } = await env.DB.prepare(
    `SELECT h.*, u.name AS changed_by_name FROM stage_history h
     JOIN users u ON u.id = h.changed_by WHERE h.title_id = ? ORDER BY h.changed_at ASC`
  )
    .bind(id)
    .all();

  const { results: adDeals } = await env.DB.prepare(
    `SELECT d.*, u.name AS assigned_to_name FROM ad_deals d
     LEFT JOIN users u ON u.id = d.assigned_to WHERE d.title_id = ? ORDER BY d.created_at ASC`
  )
    .bind(id)
    .all();

  const { results: marketingAssignments } = await env.DB.prepare(
    `SELECT m.*, u.name AS user_name FROM marketing_assignments m
     JOIN users u ON u.id = m.user_id WHERE m.title_id = ? ORDER BY m.assigned_at ASC`
  )
    .bind(id)
    .all();

  await ensureDefaultBudgets(env, id);
  const { results: budgets } = await env.DB.prepare(
    `SELECT * FROM marketing_budgets WHERE title_id = ? ORDER BY channel ASC`
  )
    .bind(id)
    .all();

  const { results: digitalPlatforms } = await env.DB.prepare(
    `SELECT * FROM digital_platforms WHERE title_id = ? ORDER BY created_at ASC`
  )
    .bind(id)
    .all();

  return jsonResponse({
    ...title,
    history,
    ad_deals: adDeals,
    marketing_assignments: marketingAssignments,
    budgets,
    digital_platforms: digitalPlatforms,
  });
}

export async function handleUpdateTitle(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const title = await env.DB.prepare("SELECT * FROM titles WHERE id = ?").bind(id).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const fields = [];
  const values = [];

  for (const key of ["name", "description", "genre", "target_audience", "target_release_date"]) {
    if (key in body) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if ("editing_status" in body) {
    if (!["content", "admin"].includes(user.department)) {
      return jsonResponse({ error: "Only Content can update editing status." }, 403);
    }
    if (!["preparing", "completed"].includes(body.editing_status)) {
      return jsonResponse({ error: "Invalid editing status." }, 400);
    }
    fields.push("editing_status = ?");
    values.push(body.editing_status);
  }

  let stageChanged = false;
  if ("stage" in body && body.stage !== title.stage) {
    if (!STAGES.includes(body.stage)) {
      return jsonResponse({ error: "Invalid stage." }, 400);
    }
    fields.push("stage = ?");
    values.push(body.stage);
    stageChanged = true;
  }

  if (fields.length === 0) return jsonResponse({ error: "Nothing to update." }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE titles SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  if (stageChanged) {
    await env.DB.prepare(
      `INSERT INTO stage_history (id, title_id, from_stage, to_stage, changed_by) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(genId(), id, title.stage, body.stage, user.id)
      .run();

    const rule = STAGE_NOTIFY_RULES[body.stage];
    if (rule) {
      await notifyDepartments(env, {
        departments: rule.departments,
        message: rule.message(body.name || title.name),
        titleId: id,
        excludeUserId: user.id,
      });
    }
  }

  return jsonResponse({ ok: true });
}

export async function handleDeleteTitle(request, env, id) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const title = await env.DB.prepare("SELECT created_by FROM titles WHERE id = ?").bind(id).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);
  if (title.created_by !== user.id && user.department !== "admin") {
    return jsonResponse({ error: "You can only remove titles you created." }, 403);
  }

  await env.DB.prepare("DELETE FROM notifications WHERE title_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM stage_history WHERE title_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM titles WHERE id = ?").bind(id).run();

  return jsonResponse({ ok: true });
}
