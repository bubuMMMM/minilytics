-- Phone home-screen widget boards: one revocable read-only token per board (independent of site embed tokens).
CREATE TABLE IF NOT EXISTS widget_boards (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'auto',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS widget_boards_token ON widget_boards (token);
CREATE INDEX IF NOT EXISTS widget_boards_site ON widget_boards (site_id);
