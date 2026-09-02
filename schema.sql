-- OTT Bridge database schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  department TEXT NOT NULL CHECK(department IN ('content','marketing_sales','rnd','admin')),
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  target_audience TEXT,
  stage TEXT NOT NULL DEFAULT 'planning'
    CHECK(stage IN ('planning','in_production','post_production','ready_for_release','released')),
  editing_status TEXT NOT NULL DEFAULT 'preparing' CHECK(editing_status IN ('preparing','completed')),
  target_release_date TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stage_history (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(title_id) REFERENCES titles(id),
  FOREIGN KEY(changed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title_id TEXT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_titles_stage ON titles(stage);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS ad_deals (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','locked')),
  assigned_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(title_id) REFERENCES titles(id),
  FOREIGN KEY(assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS marketing_assignments (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('social_media','offline')),
  user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(title_id) REFERENCES titles(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ad_deals_title ON ad_deals(title_id);
CREATE INDEX IF NOT EXISTS idx_marketing_assignments_title ON marketing_assignments(title_id);

CREATE TABLE IF NOT EXISTS marketing_budgets (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('digital','offline')),
  budget_amount REAL NOT NULL DEFAULT 0,
  spent_before_publish REAL NOT NULL DEFAULT 0,
  spent_after_publish REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(title_id) REFERENCES titles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_budgets_title_channel ON marketing_budgets(title_id, channel);

CREATE TABLE IF NOT EXISTS digital_platforms (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  budget_amount REAL NOT NULL DEFAULT 0,
  spent_before_publish REAL NOT NULL DEFAULT 0,
  spent_after_publish REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(title_id) REFERENCES titles(id)
);
CREATE INDEX IF NOT EXISTS idx_digital_platforms_title ON digital_platforms(title_id);
