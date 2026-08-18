-- grabient-admin 0002: events and campaigns.
--
-- Two tables and one view, not one table: a campaign is not an annotation. It
-- carries a join key that must be indexed and case-normalised (utm_campaign),
-- money, a five-state lifecycle, and a hypothesis written BEFORE beside an
-- outcome written AFTER — two columns precisely so the conclusion cannot
-- quietly overwrite the prediction. Events follow Grafana's model: a nullable
-- end date IS the point/range encoding (Grafana removed its isRegion boolean
-- once timeEnd existed, because a second flag could disagree).

CREATE TABLE event (
  id            TEXT PRIMARY KEY,                  -- 'evt_' || randomUUID
  kind          TEXT    NOT NULL
                CHECK (kind IN ('deploy','decision','campaign','external','incident')),

  occurred_at   INTEGER NOT NULL,                  -- ms UTC; intra-day ordering for deploys
  occurred_on   TEXT    NOT NULL                   -- UTC day; the chart/join key
                CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  -- NULL = point event. Non-NULL = range, INCLUSIVE of this day ("ran Aug
  -- 20-27" means eight days to a human; renderers add the exclusive day).
  ends_on       TEXT
                CHECK (ends_on IS NULL OR
                       (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                        AND ends_on >= occurred_on)),

  -- 80 chars because it renders as a chart label; anything longer is detail.
  label         TEXT    NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  detail        TEXT    CHECK (detail IS NULL OR length(detail) <= 1000),

  -- Derived server-side, never caller-supplied — a caller must not be able to
  -- forge provenance. 'seed' rows come from migrations.
  source        TEXT    NOT NULL
                CHECK (source IN ('manual','agent','cron-deploys','seed')),
  created_by    TEXT    NOT NULL,                  -- Access identity or 'seed'

  external_id   TEXT,                              -- e.g. a Cloudflare deployment id
  dedupe_key    TEXT    NOT NULL,

  campaign_id   TEXT REFERENCES campaign(id),
  goal_slug     TEXT,                              -- soft ref into goal
  meta_json     TEXT    CHECK (meta_json IS NULL OR json_valid(meta_json)),

  -- Kept queryable but dropped from charts — the pressure valve for a week of
  -- noisy deploys (PostHog's hidden_in_user_interface, same conclusion).
  chart_visible INTEGER NOT NULL DEFAULT 1 CHECK (chart_visible IN (0,1)),

  -- Edit history without an audit table: changing a date or label is
  -- soft-delete + insert pointing at the old row. The chain IS the history.
  supersedes_id TEXT REFERENCES event(id),

  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                            -- soft delete only, never hard-delete
);

-- PARTIAL on deleted_at IS NULL so soft-deleting frees the dedupe key and the
-- same thing can be re-logged; a plain UNIQUE would make deletion permanent in
-- the one way that matters.
CREATE UNIQUE INDEX event_dedupe_idx   ON event(dedupe_key)        WHERE deleted_at IS NULL;
CREATE        INDEX event_on_idx       ON event(occurred_on)       WHERE deleted_at IS NULL;
CREATE        INDEX event_kind_on_idx  ON event(kind, occurred_on) WHERE deleted_at IS NULL;
CREATE        INDEX event_campaign_idx ON event(campaign_id)
              WHERE campaign_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE campaign (
  -- A slug, not an integer: an agent has to name this campaign in a later
  -- tool call, and 'x-ads-aug-2026' survives a conversation where '47' does not.
  id            TEXT PRIMARY KEY
                CHECK (id NOT GLOB '*[^a-z0-9-]*' AND length(id) BETWEEN 2 AND 48),

  -- The join key to GA4 sessionManualCampaignName/firstUserManualCampaignName
  -- and to auth_user.attribution_campaign. Lowercase and charset-restricted at
  -- the SCHEMA level: apps/web stores utm_campaign verbatim off the URL, so a
  -- capital letter here is a silent zero-row join.
  utm_campaign  TEXT NOT NULL
                CHECK (utm_campaign = lower(utm_campaign)
                       AND utm_campaign NOT GLOB '*[^a-z0-9_-]*'
                       AND length(utm_campaign) BETWEEN 2 AND 64),

  platform      TEXT NOT NULL,                     -- free text: the next platform must not need a migration
  landing_url   TEXT,

  starts_on     TEXT NOT NULL
                CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on       TEXT NOT NULL                      -- inclusive; a plan has an end date too
                CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                       AND ends_on >= starts_on),

  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','running','ended','evaluated','cancelled')),

  budget_cents  INTEGER CHECK (budget_cents IS NULL OR budget_cents >= 0),  -- the plan
  spend_cents   INTEGER CHECK (spend_cents  IS NULL OR spend_cents  >= 0),  -- the fact
  currency      TEXT NOT NULL DEFAULT 'USD',

  hypothesis    TEXT,                              -- written BEFORE it runs
  outcome       TEXT,                              -- written at close
  outcome_at    INTEGER,

  goal_slug     TEXT,
  notes         TEXT,

  created_by    TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,

  -- The rule that carries the design's intent: a campaign cannot be marked
  -- evaluated without writing down what happened — the only way a solo
  -- operator ever finds out they were wrong.
  CHECK (status <> 'evaluated'
         OR (outcome IS NOT NULL AND length(trim(outcome)) > 0))
);

CREATE UNIQUE INDEX campaign_utm_idx    ON campaign(utm_campaign)       WHERE deleted_at IS NULL;
CREATE        INDEX campaign_window_idx ON campaign(starts_on, ends_on) WHERE deleted_at IS NULL;

-- One relation for the chart layer. A campaign is NOT duplicated into event;
-- this UNION is the single source and there is nothing to keep in sync.
-- 'planned' and 'cancelled' are excluded: neither happened.
CREATE VIEW marker AS
  SELECT id, kind, occurred_on AS starts_on, ends_on, label, detail,
         source, created_by, chart_visible, campaign_id
    FROM event
   WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, 'campaign' AS kind, starts_on, ends_on,
         platform || ': ' || id AS label, hypothesis AS detail,
         'campaign' AS source, created_by, 1 AS chart_visible, id AS campaign_id
    FROM campaign
   WHERE deleted_at IS NULL AND status IN ('running','ended','evaluated');
