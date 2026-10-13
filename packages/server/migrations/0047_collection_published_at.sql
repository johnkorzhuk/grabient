-- When a collection last became public: its arrival on the public lists. The Rising and hot orders (apps/web/src/server/hot.ts)
-- count a collection's newness from it, so a collection kept private for a while is new the day it is made public. A public
-- collection takes the time an admin last made it public (the record of migration 0029), else the time it was made. Additive.
ALTER TABLE k_collections ADD COLUMN published_at INTEGER;
UPDATE k_collections SET published_at = COALESCE((SELECT MAX(a.created_at) FROM k_admin_actions a WHERE a.collection_id = k_collections.id
  AND a.action = 'collection.visibility' AND json_extract(a.after, '$.visibility') = 'public'), created_at)
  WHERE visibility = 'public';
