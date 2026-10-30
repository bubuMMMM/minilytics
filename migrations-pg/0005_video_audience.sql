-- Richer audience dimensions and video analytics.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS screen TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_new INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS value BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS label TEXT;
CREATE INDEX IF NOT EXISTS events_video ON events (site_id, video_id, ts);
CREATE INDEX IF NOT EXISTS events_site_type_time ON events (site_id, type, ts);
CREATE TABLE IF NOT EXISTS videos (
  site_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT, channel TEXT, duration INTEGER,
  first_seen BIGINT NOT NULL, last_seen BIGINT NOT NULL,
  PRIMARY KEY (site_id, id)
);
