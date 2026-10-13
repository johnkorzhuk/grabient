-- A note keeps the seeds the collection held when it was written, so the page and the agents can
-- tell a note about an earlier set from one about the palettes now.
ALTER TABLE k_collection_notes ADD COLUMN items_then TEXT;
