-- A like's time on the server's own clock, which no request sets: a palette's credit ranks its likes by it
-- (apps/web/src/server/gallery/credit.ts). created_at is the time a reader sees, which an undo sets back to the like it
-- restores, so a request could claim any time there and with it the first like of any palette. listed_at is stamped as
-- the row is written and kept through an account's merge; rows from before keep their created_at. Its index answers a
-- palette's first like without sorting its likes. Additive.
ALTER TABLE k_likes ADD COLUMN listed_at INTEGER;
UPDATE k_likes SET listed_at = created_at;
CREATE TRIGGER IF NOT EXISTS k_likes_listed AFTER INSERT ON k_likes WHEN NEW.listed_at IS NULL BEGIN
  UPDATE k_likes SET listed_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE user_id = NEW.user_id AND palette_id = NEW.palette_id;
END;
CREATE INDEX IF NOT EXISTS k_likes_palette_listed_idx ON k_likes(palette_id, listed_at, user_id);

-- The username an admin took off palettes: its account cannot show that name again, though another name it takes is
-- checked as any is (apps/web/src/server/account/credit.ts).
ALTER TABLE auth_user ADD COLUMN credit_refused TEXT;
