-- A vote on whether a palette fits the collection it is in: one per account per palette per
-- collection, up or down, changed in place and taken back by deletion. An admin's down slates the
-- palette for removal by the next seeding run; everyone else's votes count together once there
-- are enough of them.
CREATE TABLE IF NOT EXISTS k_collection_votes (
  collection_id TEXT NOT NULL REFERENCES k_collections(id) ON DELETE CASCADE,
  seed TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, seed, user_id)
);
CREATE INDEX IF NOT EXISTS k_collection_votes_palette_idx ON k_collection_votes(collection_id, seed);
