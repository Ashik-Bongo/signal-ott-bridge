import { jsonResponse, getUserFromRequest, DEPARTMENTS } from "../lib/helpers.js";

export async function handleListUsers(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);

  const url = new URL(request.url);
  const department = url.searchParams.get("department");

  let query = "SELECT id, name, department FROM users WHERE is_approved = 1";
  const binds = [];
  if (department) {
    if (!DEPARTMENTS.includes(department)) return jsonResponse({ error: "Invalid department." }, 400);
    query += " AND department = ?";
    binds.push(department);
  }
  query += " ORDER BY name ASC";

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse(results);
}
