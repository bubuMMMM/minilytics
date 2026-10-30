-- Performance indexes, measured on 200k sessions / 1M events (see SECURITY.md). Safe to re-run.
-- Realtime / "online now" / sources in the last 30 min filter sessions by last_seen_at.
CREATE INDEX IF NOT EXISTS sessions_site_last_seen ON sessions (site_id, last_seen_at);
-- Visitor profile timeline (events of one visitor).
CREATE INDEX IF NOT EXISTS events_visitor ON events (site_id, visitor_id, ts);
-- "Spent" per visitor in the Users tab (one sub-query per listed visitor).
CREATE INDEX IF NOT EXISTS payments_visitor ON payments (site_id, visitor_id);
