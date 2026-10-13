-- Searches in words the search doesn't hold as one phrase or a public collection's title (apps/web/src/server/search-counts.ts):
-- what readers and their apps look for that the site can't name yet, for the admins' tools, which show words only once
-- three searches made them. Only letters, spaces, hyphens and apostrophes, in six words at most, so no number, address,
-- link or code is kept. A row is a day, the page (palettes, collections, home, or mcp for a connected app) and the words,
-- with how many addresses or accounts searched them that day. No address, account or cookie is written. Days older than
-- 90 are deleted by the schedule.
CREATE TABLE IF NOT EXISTS k_search_unread (
  day INTEGER NOT NULL,
  page TEXT NOT NULL,
  words TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, page, words)
);
