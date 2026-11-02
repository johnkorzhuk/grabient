-- A save keeps the palette's whole look as it played: a like, and a palette in a collection, may keep more than its
-- view (style, steps, angle), such as an effect and its settings, written as the palette's address writes them after its
-- seed (apps/web/src/features/editor/look.ts's keptLook: `style=glass&angle=30&speed=2`). A look is a query, so a
-- style or a setting the address learns needs no column of its own. The server reads what is sent and writes it again
-- in that form, and keeps one only where it says more than the view does: a save drawn as a gradient keeps none. The
-- look is no part of an item's key: a collection holds a palette in a view once, whatever look it keeps. Additive.
ALTER TABLE k_likes ADD COLUMN look TEXT;
ALTER TABLE k_collection_items ADD COLUMN look TEXT;

-- The sync's triggers (migrations 0048 and 0059) name the columns they watch. They come back with the look among them,
-- or a look a write changes would never reach the account's other devices.
DROP TRIGGER IF EXISTS k_sync_like_changed;
CREATE TRIGGER IF NOT EXISTS k_sync_like_changed
  AFTER UPDATE OF user_id, palette_id, style, steps, angle, created_at, title, look ON k_likes BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (OLD.user_id, 'like', OLD.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT NEW.user_id, 'like', NEW.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE NEW.user_id IS NOT OLD.user_id OR NEW.palette_id IS NOT OLD.palette_id;
END;
DROP TRIGGER IF EXISTS k_sync_item_changed;
CREATE TRIGGER IF NOT EXISTS k_sync_item_changed
  AFTER UPDATE OF collection_id, seed, position, style, steps, angle, title, description, look ON k_collection_items BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT owner_id, 'collection', id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    FROM k_collections WHERE id IN (OLD.collection_id, NEW.collection_id) AND owner_kind = 'user';
END;
