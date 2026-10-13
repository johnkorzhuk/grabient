-- What the admins' connected apps keep (apps/web/src/server/contributors.ts).
--
-- k_reviews is the contributors' working record of what they judged: a palette on its own (how it looks), in a
-- collection or for a search (whether it fits). `subject` is '' for the palette itself, 'collection:<slug>' or
-- 'search:<words>'. One row per palette and subject, written again in place by whoever judged last. Nothing public
-- reads it.
CREATE TABLE IF NOT EXISTS k_reviews (
  seed TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL CHECK (verdict IN ('good','bad','unsure')),
  note TEXT NOT NULL DEFAULT '',
  run TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seed, subject)
);
CREATE INDEX IF NOT EXISTS k_reviews_subject_idx ON k_reviews(subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS k_reviews_time_idx ON k_reviews(updated_at DESC);

-- k_contributions is the record of every change an admin's app made: who, through which app, with which tool, to what.
CREATE TABLE IF NOT EXISTS k_contributions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  tool TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_contributions_time_idx ON k_contributions(created_at DESC, id);
