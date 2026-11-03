-- A palette a save published keeps the look it was published in: an account's heart on a palette the gallery did not
-- hold yet publishes it, and where that save played an effect, or kept a soft or a grain, a list drawing every palette as
-- saved (Popular, Rising, Newest, a search) plays that look, as Saved plays the like's (migration 0063). It is the
-- palette's address query after its seed, as a like's look is (apps/web/src/features/editor/look.ts keptLook), null
-- for a palette published as a gradient and for every palette the gallery holds by curation. Additive.
ALTER TABLE k_palettes ADD COLUMN look TEXT;

-- The palettes a save published since looks were kept: the like that published one was saved as the palette's row was
-- made, at the same time, and keeps the look it played.
UPDATE k_palettes SET look = (
  SELECT l.look FROM k_likes l
  WHERE l.palette_id = k_palettes.seed AND l.look IS NOT NULL AND l.created_at = k_palettes.created_at
  ORDER BY l.created_at LIMIT 1
) WHERE look IS NULL;
