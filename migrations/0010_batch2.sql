-- Batch 2: AI bot hits (server-side), Plausible import, team members, invites and revocable sessions.
CREATE TABLE IF NOT EXISTS bot_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, ts INTEGER NOT NULL, bot TEXT NOT NULL, operator TEXT NOT NULL,
  category TEXT NOT NULL, path TEXT, status INTEGER, source TEXT NOT NULL, country TEXT
);
CREATE INDEX IF NOT EXISTS bot_hits_site_ts ON bot_hits (site_id, ts);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, provider TEXT NOT NULL, filename TEXT, date_from TEXT, date_to TEXT,
  rows INTEGER NOT NULL DEFAULT 0, pageviews INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS imports_site ON imports (site_id, created_at);
CREATE TABLE IF NOT EXISTS imported_stats (
  site_id TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', import_id TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0, visits INTEGER NOT NULL DEFAULT 0, pageviews INTEGER NOT NULL DEFAULT 0,
  bounces INTEGER NOT NULL DEFAULT 0, duration INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, kind, day, label)
);
CREATE INDEX IF NOT EXISTS imported_stats_import ON imported_stats (import_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL,
  sites TEXT NOT NULL, created_at INTEGER NOT NULL, last_login_at INTEGER, disabled_at INTEGER
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL, sites TEXT NOT NULL, note TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, used_by TEXT, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL, ip TEXT, ua TEXT, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id, expires_at);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
