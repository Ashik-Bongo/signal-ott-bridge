import {
  jsonResponse,
  genId,
  genToken,
  hashPassword,
  sessionCookieHeader,
  getCookie,
  clearSessionCookieHeader,
  getUserFromRequest,
  DEPARTMENTS,
} from "../lib/helpers.js";

export async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const department = body.department;

  if (!name || !email || !password || !department) {
    return jsonResponse({ error: "Name, email, password, and department are all required." }, 400);
  }
  if (password.length < 8) {
    return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
  }
  if (!DEPARTMENTS.includes(department)) {
    return jsonResponse({ error: "Choose a valid department." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return jsonResponse({ error: "An account with this email already exists." }, 409);
  }

  const salt = crypto.randomUUID();
  const password_hash = await hashPassword(password, salt);
  const id = genId();

  await env.DB.prepare(
    "INSERT INTO users (id, name, email, password_hash, salt, department) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, name, email, password_hash, salt, department)
    .run();

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, id, expires)
    .run();

  return jsonResponse({ id, name, email, department }, 201, {
    "Set-Cookie": sessionCookieHeader(token, 604800),
  });
}

export async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body." }, 400);

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return jsonResponse({ error: "Email and password are required." }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, name, email, password_hash, salt, department FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user) return jsonResponse({ error: "Incorrect email or password." }, 401);

  const computed = await hashPassword(password, user.salt);
  if (computed !== user.password_hash) {
    return jsonResponse({ error: "Incorrect email or password." }, 401);
  }

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, user.id, expires)
    .run();

  return jsonResponse(
    { id: user.id, name: user.name, email: user.email, department: user.department },
    200,
    { "Set-Cookie": sessionCookieHeader(token, 604800) }
  );
}

export async function handleLogout(request, env) {
  const token = getCookie(request, "session");
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookieHeader() });
}

export async function handleMe(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  return jsonResponse(user);
}
