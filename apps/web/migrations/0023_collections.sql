-- Additive collections storage. A collection is an ordered list of palettes with their view
-- settings, owned by an account (owner_kind = 'user', owner_id = auth_user.id) or by a seeding
-- agent (owner_kind = 'agent', owner_id = the agent name). Original tables remain intact.
--
-- No FTS5 virtual table: D1 cannot export a database that contains one, and backups rely on that
-- export. Search matches words in the bounded search_text column.
CREATE TABLE IF NOT EXISTS k_collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('user','agent')),
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  item_count INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_collections_owner_idx ON k_collections(owner_kind, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS k_collections_public_idx ON k_collections(visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS k_collection_items (
  collection_id TEXT NOT NULL REFERENCES k_collections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  seed TEXT NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('linearGradient','linearSwatches','radialGradient','radialSwatches','angularGradient','angularSwatches')),
  steps INTEGER NOT NULL CHECK (steps BETWEEN 3 AND 100),
  angle INTEGER NOT NULL CHECK (angle BETWEEN 0 AND 360),
  PRIMARY KEY (collection_id, seed)
);
CREATE INDEX IF NOT EXISTS k_collection_items_order_idx ON k_collection_items(collection_id, position);
CREATE INDEX IF NOT EXISTS k_collection_items_seed_idx ON k_collection_items(seed);
