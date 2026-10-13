-- Grabient's own words in the site's other languages: a collection's title and description, and the tags Grabient's
-- collections carry. An admin's app writes them through the admin tools (translations_save); pages and answers in
-- another language read them in place of the English (apps/web/src/server/translations.ts). A reader's own words are
-- never translated.
CREATE TABLE IF NOT EXISTS k_translations (
  kind TEXT NOT NULL CHECK (kind IN ('collection', 'tag')),
  locale TEXT NOT NULL,
  -- a collection's id, or a tag as Grabient's collections write it
  key TEXT NOT NULL,
  -- the collection's title, or the tag's word
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- the fingerprint of the English a collection's translation was made from: English changed since reads as English
  source TEXT NOT NULL DEFAULT '',
  -- why a word or reference was adapted for this language, where it was, for an admin to read back
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, locale, key)
);

-- a deleted collection takes its translations with it
CREATE TRIGGER IF NOT EXISTS k_translations_collection_deleted AFTER DELETE ON k_collections
BEGIN
  DELETE FROM k_translations WHERE kind = 'collection' AND key = OLD.id;
END;
