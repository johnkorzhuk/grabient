-- A palette's own words in a collection: a title and a description the collection gives it, which its cards show
-- under the pointer and its page shows the collection's owner. The same palette can read differently in two
-- collections, so the words belong to the membership, never to the palette. Additive.
ALTER TABLE k_collection_items ADD COLUMN title TEXT;
ALTER TABLE k_collection_items ADD COLUMN description TEXT;

-- The sync's item trigger (migration 0046) names the columns it watches. It comes back with the words among them, or a
-- palette renamed by an app would never reach the account's other devices.
DROP TRIGGER IF EXISTS k_sync_item_changed;
CREATE TRIGGER IF NOT EXISTS k_sync_item_changed
  AFTER UPDATE OF collection_id, seed, position, style, steps, angle, title, description ON k_collection_items BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT owner_id, 'collection', id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    FROM k_collections WHERE id IN (OLD.collection_id, NEW.collection_id) AND owner_kind = 'user';
END;
