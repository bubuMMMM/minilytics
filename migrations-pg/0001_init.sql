CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD', api_key TEXT NOT NULL, dodo_webhook_secret TEXT, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS visitors (
  site_id TEXT NOT NULL, id TEXT NOT NULL, first_seen BIGINT NOT NULL, user_id TEXT, name TEXT, email TEXT,
  PRIMARY KEY (site_id, id)
);
CREATE TABLE IF NOT EXISTS sessions (
  site_id TEXT NOT NULL, id TEXT NOT NULL, visitor_id TEXT NOT NULL, started_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL,
  duration BIGINT NOT NULL DEFAULT 0, pageviews INTEGER NOT NULL DEFAULT 0, goals INTEGER NOT NULL DEFAULT 0,
  hostname TEXT, entry_page TEXT, exit_page TEXT, referrer TEXT, referrer_domain TEXT, source TEXT NOT NULL, channel TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT, ref TEXT,
  country TEXT, region TEXT, city TEXT, browser TEXT, os TEXT, device TEXT,
  PRIMARY KEY (site_id, id)
);
CREATE INDEX IF NOT EXISTS sessions_site_time ON sessions (site_id, started_at);
CREATE INDEX IF NOT EXISTS sessions_visitor ON sessions (site_id, visitor_id);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY, site_id TEXT NOT NULL, session_id TEXT NOT NULL, visitor_id TEXT NOT NULL, ts BIGINT NOT NULL,
  type TEXT NOT NULL, name TEXT, path TEXT, props TEXT
);
CREATE INDEX IF NOT EXISTS events_site_time ON events (site_id, ts);
CREATE INDEX IF NOT EXISTS events_session ON events (site_id, session_id);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, provider TEXT NOT NULL, ts BIGINT NOT NULL, amount BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'payment', currency TEXT NOT NULL, visitor_id TEXT, session_id TEXT, customer_id TEXT,
  email TEXT, name TEXT, renewal INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS payments_site_time ON payments (site_id, ts);
CREATE INDEX IF NOT EXISTS payments_customer ON payments (site_id, customer_id);
CREATE TABLE IF NOT EXISTS funnels (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL, steps TEXT NOT NULL, created_at BIGINT NOT NULL
);
