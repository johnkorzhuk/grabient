-- Each palette in a collection keeps the time it was added. Rows added before this column have no
-- time and read as the collection's.
ALTER TABLE k_collection_items ADD COLUMN created_at INTEGER;
