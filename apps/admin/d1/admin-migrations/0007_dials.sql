-- The /dials page payload: dial definitions + fit evidence + scored vibe
-- palettes, pushed by the flywheel (POST /dials/payload). Same single-row
-- read-model shape as contrib_snapshot, and the page bakes a generated
-- fallback module so this table is additive, never required.
CREATE TABLE IF NOT EXISTS dials_payload (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  json       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
