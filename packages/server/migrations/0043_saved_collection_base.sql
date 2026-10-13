-- A saved collection keeps the collection it was saved from as it stood then: its words and its palettes, each with its
-- view, as JSON (collections.ts baseText). Update reads it to tell what changed in the source from what the account changed
-- in its copy, and Update and Reset write the source as it stands now. Copies saved before this column read it from the
-- times the source's palettes joined it (collections.ts copyPair).
ALTER TABLE k_collections ADD COLUMN forked_base TEXT;
