-- The likes of a collection's palettes, summed: the Popular and Hot orders read it after the copies saved. Kept as a
-- column so both orders read through an index, and exact through triggers on every write that moves it (a like counted
-- or taken back, a palette joining or leaving the collection, a palette deleted from the gallery). 0036 narrows the
-- triggers to public collections.
ALTER TABLE k_collections ADD COLUMN likes_sum INTEGER NOT NULL DEFAULT 0;
UPDATE k_collections SET likes_sum = (SELECT COALESCE(SUM(p.likes_count), 0) FROM k_collection_items i JOIN k_palettes p ON p.seed = i.seed WHERE i.collection_id = k_collections.id);

CREATE TRIGGER IF NOT EXISTS k_palettes_likes_sum AFTER UPDATE OF likes_count ON k_palettes WHEN NEW.likes_count <> OLD.likes_count BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + (NEW.likes_count - OLD.likes_count) WHERE id IN (SELECT collection_id FROM k_collection_items WHERE seed = NEW.seed);
END;
CREATE TRIGGER IF NOT EXISTS k_palettes_delete_likes_sum AFTER DELETE ON k_palettes WHEN OLD.likes_count <> 0 BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - OLD.likes_count WHERE id IN (SELECT collection_id FROM k_collection_items WHERE seed = OLD.seed);
END;
CREATE TRIGGER IF NOT EXISTS k_collection_items_insert_likes_sum AFTER INSERT ON k_collection_items BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + COALESCE((SELECT likes_count FROM k_palettes WHERE seed = NEW.seed), 0) WHERE id = NEW.collection_id;
END;
CREATE TRIGGER IF NOT EXISTS k_collection_items_delete_likes_sum AFTER DELETE ON k_collection_items BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - COALESCE((SELECT likes_count FROM k_palettes WHERE seed = OLD.seed), 0) WHERE id = OLD.collection_id;
END;

CREATE INDEX IF NOT EXISTS k_collections_popular_sum_idx ON k_collections(visibility, fork_count DESC, likes_sum DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS k_collections_hot_sum_idx ON k_collections(visibility, hot DESC, fork_count DESC, likes_sum DESC, updated_at DESC);
