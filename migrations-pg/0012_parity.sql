-- DataFast parity: currency conversion, site settings, notifications/alerts, API tokens, GitHub commits, Reddit mentions.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS orig_amount BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS orig_currency TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_ref TEXT;
CREATE INDEX IF NOT EXISTS payments_checkout_ref ON payments (site_id, checkout_ref);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS settings TEXT;

CREATE TABLE IF NOT EXISTS fx_rates (
  day TEXT NOT NULL, base TEXT NOT NULL, rates TEXT NOT NULL, fetched_at BIGINT NOT NULL, PRIMARY KEY (day, base)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT,
  ts BIGINT NOT NULL, read_at BIGINT, dedupe TEXT, emailed_at BIGINT
);
CREATE INDEX IF NOT EXISTS notifications_site_ts ON notifications (site_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON notifications (site_id, dedupe);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  sites TEXT NOT NULL, prefix TEXT NOT NULL, created_at BIGINT NOT NULL, last_used_at BIGINT, revoked_at BIGINT
);

CREATE TABLE IF NOT EXISTS github_commits (
  site_id TEXT NOT NULL, sha TEXT NOT NULL, ts BIGINT NOT NULL, message TEXT NOT NULL, author TEXT, url TEXT,
  PRIMARY KEY (site_id, sha)
);
CREATE INDEX IF NOT EXISTS github_commits_site_ts ON github_commits (site_id, ts);

CREATE TABLE IF NOT EXISTS reddit_mentions (
  site_id TEXT NOT NULL, id TEXT NOT NULL, ts BIGINT NOT NULL, title TEXT NOT NULL, subreddit TEXT, author TEXT,
  url TEXT, permalink TEXT, score INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'post',
  PRIMARY KEY (site_id, id)
);
CREATE INDEX IF NOT EXISTS reddit_mentions_site_ts ON reddit_mentions (site_id, ts);
