-- Precision tracking: richer device context, engaged sessions, and block (sponsor / content) impressions.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS browser_version TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS os_version TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_model TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS connection TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS engaged_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS interactions INTEGER NOT NULL DEFAULT 0;
-- 'sponsor' or 'content' for block_view / block_click events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS kind TEXT;
CREATE INDEX IF NOT EXISTS events_blocks ON events (site_id, kind, ts);
