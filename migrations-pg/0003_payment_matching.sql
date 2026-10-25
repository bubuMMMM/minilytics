CREATE TABLE IF NOT EXISTS payment_claims (
  site_id TEXT NOT NULL, payment_id TEXT NOT NULL, visitor_id TEXT NOT NULL, ts BIGINT NOT NULL,
  PRIMARY KEY (site_id, payment_id)
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS matched_by TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id TEXT;
