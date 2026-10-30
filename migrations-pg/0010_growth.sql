-- DataFast-style growth features: saved segments, chart notes, exclusions and payment-provider integrations.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS exclusions TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS integrations TEXT;
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL, filters TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS segments_site ON segments (site_id, created_at);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, ts BIGINT NOT NULL, text TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_site_ts ON notes (site_id, ts);
