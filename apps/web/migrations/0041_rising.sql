-- The rising score (apps/web/src/server/hot.ts), the Rising order of the lists and of a collection's page: the likes of the
-- last weeks, each weighed by how much it grew what it landed on, and fading. Written by the schedule and moved by a like
-- (and a saved copy) the moment it lands. Anything with no score is ordered behind, the newest first. Additive.
ALTER TABLE k_palettes ADD COLUMN rising REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_palettes_rising_idx ON k_palettes(rising DESC, created_at DESC, seed);
ALTER TABLE k_collections ADD COLUMN rising REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_collections_rising_idx ON k_collections(visibility, rising DESC, updated_at DESC);
