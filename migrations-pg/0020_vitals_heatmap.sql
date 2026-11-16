-- Partial indexes for Core Web Vitals (`vital`) and click-heatmap (`heat`) events.
-- Metrics and coordinates live in events.props; no new table.
CREATE INDEX IF NOT EXISTS events_site_vital_ts ON events (site_id, ts) WHERE type = 'vital';
CREATE INDEX IF NOT EXISTS events_site_heat_ts ON events (site_id, ts) WHERE type = 'heat';
