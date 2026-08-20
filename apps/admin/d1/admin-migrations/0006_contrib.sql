-- The contributor-program snapshot: one row, overwritten by the flywheel's
-- push (POST /contribute/snapshot). /contribute renders the baked baseline
-- until this exists, so the migration is additive and the page never depends
-- on it. Deliberately a single JSON row rather than normalized tables: the
-- jobs system (knobs-and-dials design) will bring its own schema in a
-- dedicated database; this table is only the dashboard's read model.
CREATE TABLE IF NOT EXISTS contrib_snapshot (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  json       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
