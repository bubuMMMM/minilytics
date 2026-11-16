-- Shareable milestone cards (visitor totals, monthly records, best day, revenue).
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  threshold TEXT NOT NULL,
  value BIGINT NOT NULL,
  reached_at BIGINT NOT NULL,
  currency TEXT,
  share_token TEXT NOT NULL UNIQUE,
  notified_at BIGINT,
  created_at BIGINT NOT NULL,
  UNIQUE (site_id, kind, threshold)
);
CREATE INDEX IF NOT EXISTS milestones_site_reached ON milestones (site_id, reached_at DESC);
