-- The palette an admin chose to lead each issue of the newsletter (apps/web/src/server/newsletter/lead.ts), one of the
-- ones the issue offers. An issue with no row leads with its first pick. The issue is its number in the repository.
CREATE TABLE IF NOT EXISTS k_newsletter_leads (
  issue INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  chosen_by TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  chosen_at INTEGER NOT NULL
);
