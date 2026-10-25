CREATE TABLE IF NOT EXISTS login_failures (ip TEXT NOT NULL, ts BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS login_failures_ip ON login_failures (ip, ts);
