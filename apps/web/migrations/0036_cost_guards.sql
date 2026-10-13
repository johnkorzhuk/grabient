-- Cost guards.
--
-- 1. A collection's likes_sum is read only for public collections (the Popular and Hot orders), so the triggers touch
-- public collections only and a private collection's sum is zero. Each collection a trigger updates writes three rows
-- (the row and the two indexes that hold likes_sum), and an account can hold a palette in any number of private
-- collections, so one like could otherwise write thousands of rows. updateCollection counts the sum again when a
-- collection is made public.
DROP TRIGGER IF EXISTS k_palettes_likes_sum;
DROP TRIGGER IF EXISTS k_palettes_delete_likes_sum;
DROP TRIGGER IF EXISTS k_collection_items_insert_likes_sum;
DROP TRIGGER IF EXISTS k_collection_items_delete_likes_sum;
CREATE TRIGGER IF NOT EXISTS k_palettes_likes_sum AFTER UPDATE OF likes_count ON k_palettes WHEN NEW.likes_count <> OLD.likes_count BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + (NEW.likes_count - OLD.likes_count) WHERE visibility = 'public' AND id IN (SELECT collection_id FROM k_collection_items WHERE seed = NEW.seed);
END;
CREATE TRIGGER IF NOT EXISTS k_palettes_delete_likes_sum AFTER DELETE ON k_palettes WHEN OLD.likes_count <> 0 BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - OLD.likes_count WHERE visibility = 'public' AND id IN (SELECT collection_id FROM k_collection_items WHERE seed = OLD.seed);
END;
CREATE TRIGGER IF NOT EXISTS k_collection_items_insert_likes_sum AFTER INSERT ON k_collection_items BEGIN
  UPDATE k_collections SET likes_sum = likes_sum + COALESCE((SELECT likes_count FROM k_palettes WHERE seed = NEW.seed), 0) WHERE id = NEW.collection_id AND visibility = 'public';
END;
CREATE TRIGGER IF NOT EXISTS k_collection_items_delete_likes_sum AFTER DELETE ON k_collection_items BEGIN
  UPDATE k_collections SET likes_sum = likes_sum - COALESCE((SELECT likes_count FROM k_palettes WHERE seed = OLD.seed), 0) WHERE id = OLD.collection_id AND visibility = 'public';
END;
UPDATE k_collections SET likes_sum = 0 WHERE visibility = 'private' AND likes_sum <> 0;

-- 2. The sign-in library's lookups. The existing auth tables have no index but the primary key and the session token,
-- so each lookup would read the whole table: a sign-in link or Google's callback by identifier, the expiry clean-up, a
-- Google sign-in's account, an account's sessions.
CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON auth_verification(identifier);
CREATE INDEX IF NOT EXISTS auth_verification_expires_at_idx ON auth_verification(expires_at);
CREATE INDEX IF NOT EXISTS auth_account_user_id_idx ON auth_account(user_id);
CREATE INDEX IF NOT EXISTS auth_account_provider_account_idx ON auth_account(provider_id, account_id);
CREATE INDEX IF NOT EXISTS auth_session_user_id_idx ON auth_session(user_id);

-- 3. The features an admin can turn off for the whole site (Settings; packages/data-ops/src/flags.ts). A row exists only
-- for a flag that was changed: no row means on.
CREATE TABLE IF NOT EXISTS k_flags (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
