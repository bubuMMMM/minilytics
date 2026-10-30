-- Approximate visit location (city centroid from the hosting provider's IP geolocation, rounded to 0.01°).
-- Used only to place city points on the Carte page; never exposed publicly.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS sessions_site_country_started ON sessions (site_id, country, started_at);
