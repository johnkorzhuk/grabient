-- grabient-admin 0001: the persistence layer's core tables.
--
-- Conventions (repo-wide): timestamps are integer MILLISECONDS; calendar days
-- are 'YYYY-MM-DD' text in the SOURCE's own timezone (GSC/GA4 America/Los_
-- Angeles, Cloudflare UTC) — they sort lexicographically and compare with
-- BETWEEN, and they must never be joined across sources as "the same day".
-- Events, campaigns and the brief/report store land in 0002 (their design
-- carries the events-system semantics and is versioned separately on purpose).

-- One row per (metric, day). The whole trend system is this table.
--
-- Narrow rather than one wide column per metric, for one decisive reason:
-- adding a metric must not require a migration. Bing, new GA4 channel groups
-- (Google invents them without notice) and new indexation buckets all arrive
-- as new metric_key VALUES, not as DDL. How a key rolls up over a window
-- (sum / avg / ratio / weighted) is behaviour, not data — it lives in the
-- METRIC catalog in src/metrics.ts.
CREATE TABLE metric_daily (
  metric_key  TEXT    NOT NULL,           -- 'gsc.clicks', 'ga4.sessions.organic_search'
  day         TEXT    NOT NULL,           -- 'YYYY-MM-DD' in the source's own calendar
  value       REAL    NOT NULL,
  -- Optional JSON. Earns its keep on cf.pageviews, where it holds the FULL
  -- browserMap family array: a crawler family we did not think to name a key
  -- for is then recoverable a year later, after Cloudflare has aged the raw
  -- data out.
  meta        TEXT,
  -- 1 while the upstream source may still revise this day; the snapshot job
  -- re-upserts a trailing window and flips it to 0 past the source's finality
  -- horizon. Charts render provisional points as a dashed tail, not a cliff.
  provisional INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (metric_key, day)
);
-- The PK ordering makes "one metric over a range" a contiguous scan; this is
-- the transpose, "everything recorded on day D", for the brief builder.
CREATE INDEX metric_daily_day_idx ON metric_daily (day);

-- One row per indexation sweep run. An audit trail, deliberately NOT the
-- headline series: the chart reads index.* out of metric_daily, which is
-- keyed (metric, day) and therefore idempotent when a sweep is re-run.
CREATE TABLE index_sweep (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  -- 'partial' is load-bearing: a sweep that dies at URL 600 has burned 600 of
  -- the day's 2,000 GSC quota and must NOT publish an index.indexed value, or
  -- the headline chart shows a crash that only happened to the job.
  status      TEXT    NOT NULL DEFAULT 'running'
              CHECK (status IN ('running','complete','partial','failed')),
  mode        TEXT    NOT NULL DEFAULT 'full'
              CHECK (mode IN ('full','rotation')),
  trigger     TEXT    NOT NULL DEFAULT 'cron',   -- 'cron' | 'mcp' | 'ops'
  corpus_size INTEGER NOT NULL DEFAULT 0,        -- URLs found in the sitemaps this run
  inspected   INTEGER NOT NULL DEFAULT 0,
  api_errors  INTEGER NOT NULL DEFAULT 0,
  indexed     INTEGER NOT NULL DEFAULT 0,
  not_indexed INTEGER NOT NULL DEFAULT 0,
  buckets     TEXT,                              -- JSON {bucket: count}
  note        TEXT
);
CREATE INDEX index_sweep_day_idx ON index_sweep (day, id);

-- Per-URL verdict for one sweep. ~920 rows per sweep, ~24 MB/year at daily
-- cadence against a 10 GB cap — keep everything.
CREATE TABLE index_url_status (
  sweep_id         INTEGER NOT NULL REFERENCES index_sweep(id) ON DELETE CASCADE,
  url              TEXT    NOT NULL,
  -- Normalized bucket, derived at write time; rollups read THIS. Derived from
  -- the stable verdict enum first — coverage_state is a PROSE string from
  -- Google whose wording is not contractual, so it is stored raw beside it
  -- and re-bucketing next year is an UPDATE, not a 2,000-quota re-sweep.
  bucket           TEXT    NOT NULL,
  verdict          TEXT,
  coverage_state   TEXT,
  robots_state     TEXT,
  indexing_state   TEXT,
  page_fetch_state TEXT,
  last_crawl_at    INTEGER,
  google_canonical TEXT,
  user_canonical   TEXT,
  crawled_as       TEXT,
  referring_urls   INTEGER,
  error            TEXT,
  PRIMARY KEY (sweep_id, url)
);
CREATE INDEX index_url_status_url_idx    ON index_url_status (url, sweep_id);
CREATE INDEX index_url_status_bucket_idx ON index_url_status (sweep_id, bucket);

-- Long-term objectives as data. aggregate + window_days are what make
-- "current value" a QUERY instead of a judgement call: gsc.clicks has no
-- meaningful single-day current value (it is "sum over the trailing 28
-- days"); index.indexed is "the last value".
CREATE TABLE goal (
  slug           TEXT PRIMARY KEY,
  title          TEXT    NOT NULL,
  metric_key     TEXT    NOT NULL,
  direction      TEXT    NOT NULL CHECK (direction IN ('up','down')),
  aggregate      TEXT    NOT NULL DEFAULT 'last'
                 CHECK (aggregate IN ('last','sum','avg')),
  window_days    INTEGER NOT NULL DEFAULT 28,
  baseline_value REAL    NOT NULL,
  baseline_day   TEXT    NOT NULL,
  target_value   REAL    NOT NULL,
  target_day     TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','met','missed','abandoned')),
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX goal_status_idx ON goal (status, target_day);

-- Manual check-ins for goals whose metric has no automated series (or for
-- recording a human judgement beside the computed value).
CREATE TABLE goal_checkin (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_slug TEXT    NOT NULL REFERENCES goal(slug) ON DELETE CASCADE,
  at        INTEGER NOT NULL,
  value     REAL,
  note      TEXT
);
CREATE INDEX goal_checkin_idx ON goal_checkin (goal_slug, at DESC);

-- Cron observability. Workers Logs are ephemeral and the Cron Triggers event
-- table is not queryable from the Worker; these eight columns buy an /ops
-- view that says "last successful snapshot: 14 hours ago" — the failure mode
-- this whole design is most exposed to is a cron that silently stopped.
CREATE TABLE job_run (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job          TEXT    NOT NULL,   -- 'snapshot' | 'sweep' | 'brief.weekly' | 'backfill'
  cron         TEXT,               -- controller.cron, NULL for manual runs
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  ok           INTEGER,            -- NULL running | 1 ok | 0 failed
  rows_written INTEGER NOT NULL DEFAULT 0,
  detail       TEXT                -- JSON: per-source outcome, revision counts, first error
);
CREATE INDEX job_run_job_idx ON job_run (job, started_at DESC);
