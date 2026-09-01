import { jsonResponse } from "./lib/helpers.js";
import { handleRegister, handleLogin, handleLogout, handleMe } from "./routes/auth.js";
import {
  handleListTitles,
  handleCreateTitle,
  handleGetTitle,
  handleUpdateTitle,
  handleDeleteTitle,
} from "./routes/titles.js";
import { handleListNotifications, handleMarkNotificationsRead } from "./routes/notifications.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path.startsWith("/api/")) {
        // ----- auth -----
        if (path === "/api/auth/register" && method === "POST") return await handleRegister(request, env);
        if (path === "/api/auth/login" && method === "POST") return await handleLogin(request, env);
        if (path === "/api/auth/logout" && method === "POST") return await handleLogout(request, env);
        if (path === "/api/auth/me" && method === "GET") return await handleMe(request, env);

        // ----- titles -----
        if (path === "/api/titles" && method === "GET") return await handleListTitles(request, env);
        if (path === "/api/titles" && method === "POST") return await handleCreateTitle(request, env);

        const titleMatch = path.match(/^\/api\/titles\/([^/]+)$/);
        if (titleMatch) {
          const id = titleMatch[1];
          if (method === "GET") return await handleGetTitle(request, env, id);
          if (method === "PATCH") return await handleUpdateTitle(request, env, id);
          if (method === "DELETE") return await handleDeleteTitle(request, env, id);
        }

        // ----- notifications -----
        if (path === "/api/notifications" && method === "GET") return await handleListNotifications(request, env);
        if (path === "/api/notifications" && method === "PATCH") return await handleMarkNotificationsRead(request, env);

        return jsonResponse({ error: "Not found." }, 404);
      }

      // Everything else: serve the static frontend (index.html, style.css, app.js)
      return env.ASSETS.fetch(request);
    } catch (err) {
      return jsonResponse({ error: "Server error: " + err.message }, 500);
    }
  },
};
