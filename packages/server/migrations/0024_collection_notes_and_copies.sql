-- Notes an admin leaves on a collection for the seeding agents to read, and saved copies as the
-- collections' popularity: Save a copy makes a private collection for the account that carries
-- the source's id (forked_from), and the source's fork_count counts the accounts holding a copy.
CREATE TABLE IF NOT EXISTS k_collection_notes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES k_collections(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_collection_notes_collection_idx ON k_collection_notes(collection_id, created_at);
ALTER TABLE k_collections ADD COLUMN forked_from TEXT;
ALTER TABLE k_collections ADD COLUMN fork_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_collections_popular_idx ON k_collections(visibility, fork_count DESC, updated_at DESC);
