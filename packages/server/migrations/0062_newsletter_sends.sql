-- The newsletter's sends (apps/web/src/server/newsletter/sends.ts). An admin prepares a send of one issue to one group
-- of readers, which writes its letters and its outbox and sends nothing; arms it with the count it prepared and a time
-- to start; and the minute job sends it from then on, at most fifty emails a minute. `origin` is the site its letters
-- link to. `left_out` and `checks` are the prepared summary as JSON. `lease_until` is how long one run of the job holds
-- the send, so two runs never send it at once. Additive.
CREATE TABLE IF NOT EXISTS k_newsletter_sends (
  id TEXT PRIMARY KEY,
  issue INTEGER NOT NULL,
  origin TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('admins', 'likers', 'everyone')),
  state TEXT NOT NULL CHECK (state IN ('prepared', 'armed', 'sending', 'paused', 'done', 'cancelled')),
  recipients INTEGER NOT NULL DEFAULT 0,
  left_out TEXT NOT NULL DEFAULT '{}',
  checks TEXT NOT NULL DEFAULT '{}',
  starts_at INTEGER,
  reason TEXT,
  lease_until INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  armed_by TEXT,
  armed_at INTEGER,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS k_newsletter_sends_state_idx ON k_newsletter_sends(state, created_at);
-- A send's email in each language its readers read, drawn once as it was prepared: every reader gets these words, with
-- only the unsubscribe token in its place.
CREATE TABLE IF NOT EXISTS k_newsletter_letters (
  send_id TEXT NOT NULL REFERENCES k_newsletter_sends(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (send_id, locale)
);
-- Each account an issue is addressed to, once per issue whichever send holds it: the key is what keeps a reader from
-- getting an issue twice. `sending` is a row a run has taken; `unknown` is one Resend may or may not have taken, which
-- is never sent again by itself. Rows go with the account.
CREATE TABLE IF NOT EXISTS k_newsletter_outbox (
  issue INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  send_id TEXT NOT NULL REFERENCES k_newsletter_sends(id),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'sending', 'sent', 'skipped', 'failed', 'unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_tried_at INTEGER,
  tried_at INTEGER,
  sent_at INTEGER,
  resend_id TEXT,
  error TEXT,
  PRIMARY KEY (issue, user_id)
);
CREATE INDEX IF NOT EXISTS k_newsletter_outbox_send_idx ON k_newsletter_outbox(send_id, state, user_id);
CREATE INDEX IF NOT EXISTS k_newsletter_outbox_sent_idx ON k_newsletter_outbox(sent_at) WHERE sent_at IS NOT NULL;
