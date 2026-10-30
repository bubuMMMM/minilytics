-- Shareable dashboards (several links per site) and the per-site widget token (frontend agent, 30 Oct 2026).
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  password_hash TEXT,
  expires_at BIGINT,
  views TEXT NOT NULL,
  hide TEXT NOT NULL,
  noindex INTEGER NOT NULL DEFAULT 1,
  view_count BIGINT NOT NULL DEFAULT 0,
  last_viewed_at BIGINT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  fail_window BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS share_links_site ON share_links (site_id, created_at);
CREATE TABLE IF NOT EXISTS widget_tokens (
  site_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
