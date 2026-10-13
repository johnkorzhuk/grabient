-- What an admin did to the palettes and the collections, one row per action, kept for the
-- seeding agents: a palette removed from a collection, deleted from the gallery, edited or drawn
-- with another view, a collection deleted or made public or private, a fit vote, a note. Each row
-- keeps the state before and after, the reasons the admin picked and their comment, so a run can
-- learn what the admin takes out and why. The collection is named by its id, slug and title at
-- the time and never by a foreign key: the row outlives the collection it is about.
CREATE TABLE IF NOT EXISTS k_admin_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  seed TEXT,
  collection_id TEXT,
  slug TEXT,
  title TEXT,
  before TEXT,
  after TEXT,
  reasons TEXT NOT NULL DEFAULT '[]',
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_admin_actions_time_idx ON k_admin_actions(created_at DESC, id);
CREATE INDEX IF NOT EXISTS k_admin_actions_seed_idx ON k_admin_actions(seed, created_at);
CREATE INDEX IF NOT EXISTS k_admin_actions_collection_idx ON k_admin_actions(collection_id, created_at);
