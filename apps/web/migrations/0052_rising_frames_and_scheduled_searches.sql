-- Rising in three frames, and the searches an admin's app schedules for the tags under the search field. Additive.

-- The searches scheduled to lead the Popular tags (apps/web/src/server/popular-searches.ts): each stands from its start
-- to its end, read by its dates, so nothing has to run for one to begin or end. `words` is a search the site answers
-- from its vocabulary. The same words scheduled twice for one start are kept once. `label` names a batch.
CREATE TABLE IF NOT EXISTS k_scheduled_searches (
  id TEXT PRIMARY KEY,
  words TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (words, starts_at)
);
CREATE INDEX IF NOT EXISTS k_scheduled_searches_ends_idx ON k_scheduled_searches(ends_at, starts_at);

-- The rising score in two more frames (apps/web/src/server/hot.ts): `rising` is the week's, where a like halves every two
-- days, `rising_3m` is the three months', where it halves every 45, and `rising_1y` the year's, every 180. Each is
-- kept as the logarithm of its sum with every like weighed up by its own time, so a score orders rightly against every
-- other without ever being written again as time passes: a like writes it once. 0 is no score, and every real score is
-- above it.
ALTER TABLE k_palettes ADD COLUMN rising_3m REAL NOT NULL DEFAULT 0;
ALTER TABLE k_palettes ADD COLUMN rising_1y REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_palettes_rising_3m_idx ON k_palettes(rising_3m DESC, created_at DESC, seed);
CREATE INDEX IF NOT EXISTS k_palettes_rising_1y_idx ON k_palettes(rising_1y DESC, created_at DESC, seed);
ALTER TABLE k_collections ADD COLUMN rising_3m REAL NOT NULL DEFAULT 0;
ALTER TABLE k_collections ADD COLUMN rising_1y REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_collections_rising_3m_idx ON k_collections(visibility, rising_3m DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS k_collections_rising_1y_idx ON k_collections(visibility, rising_1y DESC, updated_at DESC);

-- The scores as the pass writes them (risingScore in hot.ts), so the three lists are right from the first request.
-- A palette: its likes of the last 720 days, the newest counted against the likes it holds less itself, the next against
-- one fewer. 172800000, 3888000000 and 15552000000 are the three half-lives in milliseconds, 62208000000 the 720 days.
-- A database that holds no likes (the Previews' one, which is given staging's scores and no accounts) has nothing to
-- compute them from and keeps the order it was given.
UPDATE k_palettes SET rising = 0 WHERE rising <> 0 AND EXISTS (SELECT 1 FROM k_likes);
WITH clock AS (SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AS ms),
ranked AS (
  SELECT l.palette_id AS seed, l.created_at AS at, ROW_NUMBER() OVER (PARTITION BY l.palette_id ORDER BY l.created_at DESC) - 1 AS k
  FROM k_likes l, clock WHERE l.created_at >= clock.ms - 62208000000
),
summed AS (
  SELECT r.seed, clock.ms AS ms,
    SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 3888000000.0) / MAX(p.likes_count - r.k, 1)) AS quarter,
    SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 172800000.0) / MAX(p.likes_count - r.k, 1)) AS week,
    SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 15552000000.0) / MAX(p.likes_count - r.k, 1)) AS year
  FROM ranked r JOIN k_palettes p ON p.seed = r.seed, clock GROUP BY r.seed
)
UPDATE k_palettes SET
  rising_3m = 0.6931471805599453 * summed.ms / 3888000000.0 + ln(summed.quarter),
  rising = 0.6931471805599453 * summed.ms / 172800000.0 + ln(summed.week),
  rising_1y = 0.6931471805599453 * summed.ms / 15552000000.0 + ln(summed.year)
FROM summed WHERE summed.seed = k_palettes.seed;

-- A public collection: the likes its palettes gained while it held them and the copies saved of it, weighed against its
-- palettes' likes and its saves, and half a like for being made public.
UPDATE k_collections SET rising = 0 WHERE rising <> 0;
WITH clock AS (SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AS ms),
held AS (
  SELECT i.collection_id AS id, i.seed, MIN(COALESCE(i.created_at, c.created_at)) AS joined
  FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.visibility = 'public' GROUP BY i.collection_id, i.seed
),
gained AS (
  SELECT h.id, l.created_at AS at FROM held h JOIN k_likes l ON l.palette_id = h.seed, clock WHERE l.created_at >= h.joined AND l.created_at >= clock.ms - 62208000000
  UNION ALL
  SELECT f.forked_from, f.created_at FROM k_collections f, clock WHERE f.forked_from IS NOT NULL AND f.created_at >= clock.ms - 62208000000
),
ranked AS (SELECT id, at, ROW_NUMBER() OVER (PARTITION BY id ORDER BY at DESC) - 1 AS k FROM gained),
summed AS (
  SELECT c.id, clock.ms AS ms, CASE WHEN COALESCE(c.published_at, c.created_at) >= clock.ms - 62208000000 THEN clock.ms - COALESCE(c.published_at, c.created_at) END AS arrived,
    COALESCE(SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 3888000000.0) / MAX(c.likes_sum + c.fork_count - r.k, 1)), 0) AS quarter,
    COALESCE(SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 172800000.0) / MAX(c.likes_sum + c.fork_count - r.k, 1)), 0) AS week,
    COALESCE(SUM(exp(-0.6931471805599453 * (clock.ms - r.at) / 15552000000.0) / MAX(c.likes_sum + c.fork_count - r.k, 1)), 0) AS year
  FROM k_collections c LEFT JOIN ranked r ON r.id = c.id, clock WHERE c.visibility = 'public' GROUP BY c.id
),
scored AS (
  SELECT id, ms,
    quarter + COALESCE(0.5 * exp(-0.6931471805599453 * arrived / 3888000000.0), 0) AS quarter,
    week + COALESCE(0.5 * exp(-0.6931471805599453 * arrived / 172800000.0), 0) AS week,
    year + COALESCE(0.5 * exp(-0.6931471805599453 * arrived / 15552000000.0), 0) AS year
  FROM summed
)
UPDATE k_collections SET
  rising_3m = CASE WHEN scored.quarter > 0 THEN 0.6931471805599453 * scored.ms / 3888000000.0 + ln(scored.quarter) ELSE 0 END,
  rising = CASE WHEN scored.week > 0 THEN 0.6931471805599453 * scored.ms / 172800000.0 + ln(scored.week) ELSE 0 END,
  rising_1y = CASE WHEN scored.year > 0 THEN 0.6931471805599453 * scored.ms / 15552000000.0 + ln(scored.year) ELSE 0 END
FROM scored WHERE scored.id = k_collections.id;
