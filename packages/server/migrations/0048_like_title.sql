-- A saved palette's own title: the name a connected app gave it when it saved it for the account (save_palette,
-- apps/web/src/server/account-tools.ts). It is that account's label for its own like, read back by the account's tools and
-- its copy in the browser and by nothing public. The site has no way to name a palette: it only puts a title back with
-- the like an unsave's undo restores. Additive.
ALTER TABLE k_likes ADD COLUMN title TEXT;

-- The sync's like trigger (migration 0044) names the columns it watches. It comes back with the title among them, or a
-- palette an app renamed would never reach the account's other devices.
DROP TRIGGER IF EXISTS k_sync_like_changed;
CREATE TRIGGER IF NOT EXISTS k_sync_like_changed AFTER UPDATE OF user_id, palette_id, style, steps, angle, created_at, title ON k_likes BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (OLD.user_id, 'like', OLD.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT NEW.user_id, 'like', NEW.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE NEW.user_id IS NOT OLD.user_id OR NEW.palette_id IS NOT OLD.palette_id;
END;
