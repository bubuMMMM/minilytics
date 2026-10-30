-- Richer audience dimensions and video analytics.
ALTER TABLE sessions ADD COLUMN language TEXT;
ALTER TABLE sessions ADD COLUMN screen TEXT;
ALTER TABLE sessions ADD COLUMN is_new INTEGER;
ALTER TABLE events ADD COLUMN video_id TEXT;
ALTER TABLE events ADD COLUMN value INTEGER;
ALTER TABLE events ADD COLUMN label TEXT;
CREATE INDEX IF NOT EXISTS events_video ON events (site_id, video_id, ts);
CREATE INDEX IF NOT EXISTS events_site_type_time ON events (site_id, type, ts);
CREATE TABLE IF NOT EXISTS videos (
  site_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT, channel TEXT, duration INTEGER,
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  PRIMARY KEY (site_id, id)
);
