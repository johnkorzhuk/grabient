-- The quick tip an admin chose to end each issue of the newsletter with (apps/web/src/server/newsletter/lead.ts), one of
-- the ones the issue offers, by its id. An issue with no row ends with its first tip. The issue is its number in the
-- repository.
CREATE TABLE IF NOT EXISTS k_newsletter_tips (
  issue INTEGER PRIMARY KEY,
  tip TEXT NOT NULL,
  chosen_by TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  chosen_at INTEGER NOT NULL
);
