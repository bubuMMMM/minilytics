-- Sites whose aggregate statistics may be shown on the public home page.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0;
