-- The newsletter's list (apps/web/src/server/newsletter.ts). An account gets the newsletter until it says otherwise.
-- `subscribed` is the account's own choice, 1 or 0, and NULL while it has made none; an account with no row has made
-- none either. A row is written the first time the account chooses or an issue is addressed to it. `token` is the last
-- part of the address that ends the newsletter for the account without signing in (/unsubscribe/<token>): 32 random
-- bytes as hex, written by the Worker, good for as long as the account is. Both tables go with the account.
CREATE TABLE IF NOT EXISTS k_newsletter (
  user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  subscribed INTEGER CHECK (subscribed IN (0, 1)),
  updated_at INTEGER NOT NULL
);
-- Each change of that choice: what it became, where it was made (Settings, the unsubscribe page, or a mail app's own
-- unsubscribe button) and when. It shows that an account's wish was followed, and from when.
CREATE TABLE IF NOT EXISTS k_newsletter_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  subscribed INTEGER NOT NULL CHECK (subscribed IN (0, 1)),
  source TEXT NOT NULL CHECK (source IN ('settings', 'page', 'mail-app')),
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS k_newsletter_events_user_idx ON k_newsletter_events(user_id, id);
