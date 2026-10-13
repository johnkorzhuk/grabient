-- Additive keyframe storage. Original auth, palettes, likes and their migrations remain intact.
CREATE TABLE IF NOT EXISTS k_palettes (
  seed TEXT PRIMARY KEY,
  style TEXT NOT NULL,
  steps INTEGER NOT NULL,
  angle INTEGER NOT NULL,
  classes TEXT NOT NULL DEFAULT '[]',
  legacy_likes_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_palettes_created_at_idx ON k_palettes(created_at, seed);
CREATE INDEX IF NOT EXISTS k_palettes_popular_idx ON k_palettes(likes_count DESC, seed);

CREATE TABLE IF NOT EXISTS k_likes (
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  palette_id TEXT NOT NULL,
  steps INTEGER NOT NULL CHECK (steps BETWEEN 2 AND 100),
  style TEXT NOT NULL CHECK (style IN ('linearGradient','linearSwatches','radialGradient','radialSwatches','angularGradient','angularSwatches')),
  angle INTEGER NOT NULL CHECK (angle BETWEEN 0 AND 360),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, palette_id)
);
CREATE INDEX IF NOT EXISTS k_likes_palette_idx ON k_likes(palette_id);
CREATE INDEX IF NOT EXISTS k_likes_user_created_idx ON k_likes(user_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS k_likes_insert_count AFTER INSERT ON k_likes BEGIN
  UPDATE k_palettes SET likes_count = likes_count + 1 WHERE seed = NEW.palette_id;
END;
CREATE TRIGGER IF NOT EXISTS k_likes_delete_count AFTER DELETE ON k_likes BEGIN
  UPDATE k_palettes SET likes_count = MAX(legacy_likes_count, likes_count - 1) WHERE seed = OLD.palette_id;
END;

-- Populated offline from the verified legacy corpus mapping, never fitted inside a request.
-- coeff_key includes legacy global/tared aliases while legacy_seed preserves source identity.
CREATE TABLE IF NOT EXISTS k_legacy_map (
  legacy_seed TEXT PRIMARY KEY,
  coeff_key TEXT,
  kseed TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS k_legacy_map_coeff_idx ON k_legacy_map(coeff_key);
CREATE INDEX IF NOT EXISTS k_legacy_map_kseed_idx ON k_legacy_map(kseed);
