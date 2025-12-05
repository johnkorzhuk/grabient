CREATE TABLE palette_tags (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  run_number INTEGER NOT NULL DEFAULT 1,
  tags TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX palette_tags_seed_provider_run_idx ON palette_tags(seed, provider, run_number);
CREATE INDEX palette_tags_seed_idx ON palette_tags(seed);
CREATE INDEX palette_tags_run_idx ON palette_tags(run_number);
