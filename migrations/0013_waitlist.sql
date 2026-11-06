-- Waitlist for /signup while self-serve accounts are closed (6 Nov 2026). Also created on first use by src/worker/waitlist.ts.
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  website TEXT,
  source TEXT,
  created_at BIGINT NOT NULL
);
