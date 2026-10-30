-- Approximate visit location (city centroid, rounded to 0.01°) for the Carte page.
ALTER TABLE sessions ADD COLUMN lat REAL;
ALTER TABLE sessions ADD COLUMN lon REAL;
CREATE INDEX IF NOT EXISTS sessions_site_country_started ON sessions (site_id, country, started_at);
