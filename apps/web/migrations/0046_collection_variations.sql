-- A collection holds a palette in one or more views: the same palette drawn another way (style, steps, angle) is another
-- item, and the same view twice is still one. The table is rebuilt with that key, every row kept, since SQLite cannot
-- change a primary key in place. Its indexes and the triggers on it come back as 0023, 0036 and 0044 made them, except
-- that a public collection's likes_sum counts each palette once, however many views of it the collection holds: the
-- first view in adds the palette's likes and the last one out takes them away. The two triggers on k_palettes that read
-- the table go first and come back after, since a rename checks every trigger against the tables it names.
DROP TRIGGER IF EXISTS k_palettes_likes_sum;
DROP TRIGGER IF EXISTS k_palettes_delete_likes_sum;
CREATE TABLE k_collection_items_next (
  collection_id TEXT NOT NULL REFERENCES k_collections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  seed TEXT NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('linearGradient','linearSwatches','radialGradient','radialSwatches','angularGradient','angularSwatches')),
  steps INTEGER NOT NULL CHECK (steps BETWEEN 3 AND 100),
  angle INTEGER NOT NULL CHECK (angle BETWEEN 0 AND 360),
  created_at INTEGER,
  PRIMARY KEY (collection_id, seed, style, steps, angle)
);
INSERT INTO k_collection_items_next (collection_id, position, seed, style, steps, angle, created_at)
  SELECT collection_id, position, seed, style, steps, angle, created_at FROM k_collection_items;
DROP TABLE k_collection_items;
ALTER TABLE k_collection_items_next RENAME TO k_collection_items;
CREATE INDEX IF NOT EXISTS k_collection_items_order_idx ON k_collection_items(collection_id, position);
CREATE INDEX IF NOT EXISTS k_collection_items_seed_idx ON k_collection_items(seed);

CREATE TRIGGER IF NOT EXISTS k_palettes_likes_sum AFTER UPDATE OF likes_count ON k_palettes WHEN NEW.likes_count <> OLD.likes_count BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + (NEW.likes_count - OLD.likes_count) WHERE visibility = 'public' AND id IN (SELECT collection_id FROM k_collection_items WHERE seed = NEW.seed);
END;
CREATE TRIGGER IF NOT EXISTS k_palettes_delete_likes_sum AFTER DELETE ON k_palettes WHEN OLD.likes_count <> 0 BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - OLD.likes_count WHERE visibility = 'public' AND id IN (SELECT collection_id FROM k_collection_items WHERE seed = OLD.seed);
END;

CREATE TRIGGER IF NOT EXISTS k_collection_items_insert_likes_sum AFTER INSERT ON k_collection_items
  WHEN NOT EXISTS (SELECT 1 FROM k_collection_items WHERE collection_id = NEW.collection_id AND seed = NEW.seed
    AND (style <> NEW.style OR steps <> NEW.steps OR angle <> NEW.angle)) BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + COALESCE((SELECT likes_count FROM k_palettes WHERE seed = NEW.seed), 0) WHERE id = NEW.collection_id AND visibility = 'public';
END;
CREATE TRIGGER IF NOT EXISTS k_collection_items_delete_likes_sum AFTER DELETE ON k_collection_items
  WHEN NOT EXISTS (SELECT 1 FROM k_collection_items WHERE collection_id = OLD.collection_id AND seed = OLD.seed) BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - COALESCE((SELECT likes_count FROM k_palettes WHERE seed = OLD.seed), 0) WHERE id = OLD.collection_id AND visibility = 'public';
END;

-- A palette joining, leaving or redrawn in an account's collection names the collection, whatever else the write did.
CREATE TRIGGER IF NOT EXISTS k_sync_item_added AFTER INSERT ON k_collection_items BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT owner_id, 'collection', id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    FROM k_collections WHERE id = NEW.collection_id AND owner_kind = 'user';
END;
CREATE TRIGGER IF NOT EXISTS k_sync_item_removed AFTER DELETE ON k_collection_items BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT owner_id, 'collection', id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    FROM k_collections WHERE id = OLD.collection_id AND owner_kind = 'user';
END;
CREATE TRIGGER IF NOT EXISTS k_sync_item_changed AFTER UPDATE OF collection_id, seed, position, style, steps, angle ON k_collection_items BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT owner_id, 'collection', id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    FROM k_collections WHERE id IN (OLD.collection_id, NEW.collection_id) AND owner_kind = 'user';
END;
