-- Cached full-page screenshots used as the heatmap background (per site, path and viewport).
CREATE TABLE IF NOT EXISTS heatmap_previews (
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  viewport TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/png',
  body BYTEA NOT NULL,
  captured_at BIGINT NOT NULL,
  PRIMARY KEY (site_id, path, viewport)
);
