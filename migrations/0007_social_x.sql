-- Social: posts on X that link to / mention a site (fetched with the X API recent search), and per-site sync state.
CREATE TABLE IF NOT EXISTS x_posts (
  site_id TEXT NOT NULL, id TEXT NOT NULL, author_id TEXT, username TEXT, name TEXT, avatar TEXT,
  text TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, reposts INTEGER NOT NULL DEFAULT 0, replies INTEGER NOT NULL DEFAULT 0,
  quotes INTEGER NOT NULL DEFAULT 0, bookmarks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  urls TEXT NOT NULL DEFAULT '[]', fetched_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, id)
);
CREATE INDEX IF NOT EXISTS x_posts_site_created ON x_posts (site_id, created_at);
CREATE TABLE IF NOT EXISTS x_sync (
  site_id TEXT PRIMARY KEY, synced_at INTEGER NOT NULL, ok INTEGER NOT NULL DEFAULT 0, error TEXT, found INTEGER NOT NULL DEFAULT 0
);
