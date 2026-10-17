-- How many palettes each account has saved, kept by triggers on its likes, as each palette's own count is (0022). Saved
-- and the account's apps count an account's likes by reading this one row, never every like, so no list of them needs
-- to stop at a number (apps/web/src/server/gallery/likes.ts). Additive.
CREATE TABLE IF NOT EXISTS k_account_likes (
  user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  likes INTEGER NOT NULL DEFAULT 0
);

-- The triggers come before the count is taken, so a like made while this runs is counted either way: the count below
-- writes over whatever a trigger began.
CREATE TRIGGER IF NOT EXISTS k_account_likes_added AFTER INSERT ON k_likes BEGIN
  INSERT INTO k_account_likes (user_id, likes) VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET likes = likes + 1;
END;
CREATE TRIGGER IF NOT EXISTS k_account_likes_removed AFTER DELETE ON k_likes BEGIN
  UPDATE k_account_likes SET likes = MAX(likes - 1, 0) WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER IF NOT EXISTS k_account_likes_moved AFTER UPDATE OF user_id ON k_likes
  WHEN NEW.user_id IS NOT OLD.user_id BEGIN
  UPDATE k_account_likes SET likes = MAX(likes - 1, 0) WHERE user_id = OLD.user_id;
  INSERT INTO k_account_likes (user_id, likes) VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET likes = likes + 1;
END;

INSERT INTO k_account_likes (user_id, likes)
  SELECT user_id, COUNT(*) FROM k_likes WHERE true GROUP BY user_id
  ON CONFLICT (user_id) DO UPDATE SET likes = excluded.likes;
