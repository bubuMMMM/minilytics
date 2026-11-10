-- Public personal page (one per owner account). Only published rows are readable anonymously.
CREATE TABLE IF NOT EXISTS profile_pages (
  user_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  socials TEXT NOT NULL DEFAULT '[]',
  theme TEXT NOT NULL DEFAULT 'auto',
  accent TEXT NOT NULL DEFAULT '2563eb',
  layout TEXT NOT NULL DEFAULT 'stacked',
  published INTEGER NOT NULL DEFAULT 0,
  widgets TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_pages_slug ON profile_pages (slug);
