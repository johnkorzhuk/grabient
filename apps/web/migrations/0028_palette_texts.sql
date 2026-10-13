-- The words the seeding agents write for a palette, kept by seed and changed in place: a title,
-- which the palette's page takes as its own and search reads as words, and `embed`, an optional
-- description for the page. `tags` and `embedded_at` are unused.
CREATE TABLE IF NOT EXISTS k_palette_texts (
  seed TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  embed TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  embedded_at INTEGER
);
CREATE INDEX IF NOT EXISTS k_palette_texts_pending_idx ON k_palette_texts(embedded_at, updated_at);
