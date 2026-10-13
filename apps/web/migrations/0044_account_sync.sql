-- The browser keeps a copy of an account's own things, its likes and its collections, to show and change them offline
-- (apps/web/src/server/account-sync.ts). Every change to them leaves a row here, written by the triggers below so that no
-- write path (a page, a connected app, an admin's tool) can miss one. A browser asks for the rows after the last one it
-- read and reads again only the likes and collections they name. Rows go after 30 days; a browser that last read before
-- the rows it needs were pruned (`pruned` in k_sync_meta) is sent everything again.
CREATE TABLE IF NOT EXISTS k_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('like','collection')),
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_sync_log_account_idx ON k_sync_log(account_id, id);
CREATE INDEX IF NOT EXISTS k_sync_log_at_idx ON k_sync_log(at);
CREATE TABLE IF NOT EXISTS k_sync_meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- A like is its account's: one row per change, under the account that holds it (the admins' pool reads every admin's).
CREATE TRIGGER IF NOT EXISTS k_sync_like_added AFTER INSERT ON k_likes BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (NEW.user_id, 'like', NEW.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS k_sync_like_removed AFTER DELETE ON k_likes BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (OLD.user_id, 'like', OLD.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS k_sync_like_changed AFTER UPDATE OF user_id, palette_id, style, steps, angle, created_at ON k_likes BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (OLD.user_id, 'like', OLD.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT NEW.user_id, 'like', NEW.palette_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE NEW.user_id IS NOT OLD.user_id OR NEW.palette_id IS NOT OLD.palette_id;
END;

-- A collection is its owner's when an account owns it; an agent's collections are nobody's copy. The scores the schedule
-- and every like rewrite (hot, rising, likes_sum, fork_count) are left out, so they write no rows.
CREATE TRIGGER IF NOT EXISTS k_sync_collection_added AFTER INSERT ON k_collections WHEN NEW.owner_kind = 'user' BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (NEW.owner_id, 'collection', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS k_sync_collection_removed AFTER DELETE ON k_collections WHEN OLD.owner_kind = 'user' BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) VALUES (OLD.owner_id, 'collection', OLD.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS k_sync_collection_changed
  AFTER UPDATE OF slug, owner_kind, owner_id, title, description, tags, visibility, item_count, updated_at, forked_from ON k_collections
  WHEN OLD.owner_kind = 'user' OR NEW.owner_kind = 'user' BEGIN
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT OLD.owner_id, 'collection', OLD.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE OLD.owner_kind = 'user';
  INSERT INTO k_sync_log (account_id, kind, key, at) SELECT NEW.owner_id, 'collection', NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE NEW.owner_kind = 'user' AND (OLD.owner_kind IS NOT 'user' OR NEW.owner_id IS NOT OLD.owner_id);
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

-- The last change each browser's copy sent that the server has applied, so a change sent again after a lost answer is
-- never applied twice. A browser keeps one id per account; rows a browser has not used for 180 days go.
CREATE TABLE IF NOT EXISTS k_sync_clients (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  last_mutation INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_sync_clients_account_idx ON k_sync_clients(account_id);
CREATE INDEX IF NOT EXISTS k_sync_clients_updated_idx ON k_sync_clients(updated_at);
