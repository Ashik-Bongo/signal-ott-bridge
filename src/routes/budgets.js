import { jsonResponse, getUserFromRequest, genId } from "../lib/helpers.js";

function canManageSales(user) {
  return user && ["marketing_sales", "admin"].includes(user.department);
}

const DEFAULT_BUDGETS = { offline: 2000 };

export async function ensureDefaultBudgets(env, titleId) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO marketing_budgets (id, title_id, channel, budget_amount) VALUES (?, ?, 'offline', ?)"
  )
    .bind(genId(), titleId, DEFAULT_BUDGETS.offline)
    .run();
}

export async function handleUpdateBudget(request, env, titleId, channel) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!canManageSales(user)) return jsonResponse({ error: "Marketing & Sales only." }, 403);
  if (channel !== "offline") return jsonResponse({ error: "Invalid channel." }, 400);

  const title = await env.DB.prepare("SELECT id FROM titles WHERE id = ?").bind(titleId).first();
  if (!title) return jsonResponse({ error: "Title not found." }, 404);

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  await ensureDefaultBudgets(env, titleId);

  const fields = [];
  const values = [];

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
  values.push(titleId, channel);

  await env.DB.prepare(
    `UPDATE marketing_budgets SET ${fields.join(", ")} WHERE title_id = ? AND channel = ?`
  )
    .bind(...values)
    .run();

  return jsonResponse({ ok: true });
}
