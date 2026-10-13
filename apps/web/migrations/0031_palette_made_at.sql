-- A palette's time is when it was made: the first time the site held it, in the gallery or in any collection. An agent
-- makes most palettes inside a collection, and a like brings them into the gallery later. A palette joining the gallery
-- takes the first time a collection held it (GALLERY_CREATED_AT in apps/web/src/server/collections.ts); this moves the
-- palettes already in the gallery back to theirs. A collection item with no time of its own reads as its collection's.
UPDATE k_palettes SET created_at = (
  SELECT MIN(COALESCE(i.created_at, c.created_at)) FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = k_palettes.seed
) WHERE created_at > (
  SELECT MIN(COALESCE(i.created_at, c.created_at)) FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = k_palettes.seed
);
