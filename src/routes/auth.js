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
  ALLOWED_EMAIL_DOMAIN,
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
  if (!email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) {
    return jsonResponse({ error: `Only ${ALLOWED_EMAIL_DOMAIN} email addresses can sign up.` }, 403);
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

  // New accounts start unapproved (is_approved = 0) — an Admin must approve
  // them before they can sign in. No session is issued here.
  await env.DB.prepare(
    "INSERT INTO users (id, name, email, password_hash, salt, department, is_approved) VALUES (?, ?, ?, ?, ?, ?, 0)"
  )
    .bind(id, name, email, password_hash, salt, department)
    .run();

  return jsonResponse({
    ok: true,
    pendingApproval: true,
    message: "Account created. An admin needs to approve you before you can sign in.",
  }, 201);
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
    "SELECT id, name, email, password_hash, salt, department, is_approved FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user) return jsonResponse({ error: "Incorrect email or password." }, 401);

  const computed = await hashPassword(password, user.salt);
  if (computed !== user.password_hash) {
    return jsonResponse({ error: "Incorrect email or password." }, 401);
  }

  if (!user.is_approved) {
    return jsonResponse({ error: "Your account is awaiting admin approval." }, 403);
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
