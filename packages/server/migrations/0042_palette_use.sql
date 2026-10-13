-- How public palettes are used, for the seeding agents (apps/web/src/server/palette-use.ts, GET /api/agent/use): what
-- people open, copy and download, where, at what place on the page and in what view, and how they change a palette in
-- the editor before they take it. Counted for every reader, with no address, account or cookie, and only for palettes
-- the site shows publicly. Each address counts the same use once a day. Days older than 90 are deleted by the schedule.

-- One row per day and use. `seed` is '' for a collection page's own view (`action` view). `surface` is the kind of page.
-- `collection` is the public collection the palette was shown under (its page, its group on the home or the collections
-- list, or the one the editor was opened from); `words` are the search it answered, when the vocabulary knows them.
-- `position` is the palette's place in what showed it, from 0, or -1; `view` is the style, steps and angle it was taken
-- in ("linearGradient:7:90"), or '' for a view or an open.
CREATE TABLE IF NOT EXISTS k_palette_use (
  day INTEGER NOT NULL,
  seed TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view','open','copy','download')),
  format TEXT NOT NULL DEFAULT '',
  surface TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT '',
  words TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT -1,
  view TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL,
  PRIMARY KEY (day, seed, action, format, surface, collection, words, position, view)
);
CREATE INDEX IF NOT EXISTS k_palette_use_collection_idx ON k_palette_use(collection, day);

-- A palette the editor opened, changed and then copied or downloaded: the change in its numbers (the edited palette's
-- minus the opened one's, as GET /api/agent/actions describes a palette). The edited palette itself is not kept.
CREATE TABLE IF NOT EXISTS k_palette_edits (
  day INTEGER NOT NULL,
  seed TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT '',
  anchors INTEGER NOT NULL,
  mean_l REAL NOT NULL,
  range_l REAL NOT NULL,
  mean_c REAL NOT NULL,
  max_c REAL NOT NULL,
  hue_span REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS k_palette_edits_seed_idx ON k_palette_edits(seed, day);
CREATE INDEX IF NOT EXISTS k_palette_edits_day_idx ON k_palette_edits(day);

-- A counted search a reader went on to use: a palette opened, copied or downloaded from its results, once per address,
-- page and words a day. `used` over `count` is how well the site answers the search.
ALTER TABLE k_search_counts ADD COLUMN used INTEGER NOT NULL DEFAULT 0;
