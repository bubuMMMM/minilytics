-- Precision tracking: richer device context, engaged sessions, and block (sponsor / content) impressions.
ALTER TABLE sessions ADD COLUMN browser_version TEXT;
ALTER TABLE sessions ADD COLUMN os_version TEXT;
ALTER TABLE sessions ADD COLUMN device_model TEXT;
ALTER TABLE sessions ADD COLUMN timezone TEXT;
ALTER TABLE sessions ADD COLUMN connection TEXT;
ALTER TABLE sessions ADD COLUMN engaged_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN interactions INTEGER NOT NULL DEFAULT 0;
-- 'sponsor' or 'content' for block_view / block_click events.
ALTER TABLE events ADD COLUMN kind TEXT;
CREATE INDEX IF NOT EXISTS events_blocks ON events (site_id, kind, ts);
