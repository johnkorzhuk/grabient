-- The searches people make, for the Popular tags under the search field (apps/web/src/server/search-counts.ts). A search
-- is counted when a reader presses Enter in a search field, and only in words the search already knows: a phrase of its
-- vocabulary (a translation counts as the English phrase it means) or words in the title of a public collection. A row
-- is a day, the page it was made on (palettes, collections or home) and the words, with how many addresses searched
-- them that day. No address, account or cookie is written. Days older than 90 are deleted by the schedule.
CREATE TABLE IF NOT EXISTS k_search_counts (
  day INTEGER NOT NULL,
  page TEXT NOT NULL,
  words TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, page, words)
);

-- What the schedule made of the counts, every third day: the tags in the order they stand. `palettes` holds searches
-- (value = the phrase), `collections` holds collections (value = the slug, words = the searches that led to it).
CREATE TABLE IF NOT EXISTS k_popular_searches (
  kind TEXT NOT NULL,
  position INTEGER NOT NULL,
  value TEXT NOT NULL,
  words TEXT NOT NULL,
  score REAL NOT NULL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (kind, position)
);
