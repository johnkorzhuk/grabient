-- A vote on whether a palette fits a search: one per account per palette per search, up or down, changed in place and
-- taken back by deletion. The search is its words as every list's address writes them (normalizeListQuery), so one
-- search has one row per palette and account however it was typed. Votes are the account's own: nobody else reads
-- them. There is no foreign key, so the auth handler's beforeDelete deletes them with the account.
CREATE TABLE IF NOT EXISTS k_search_votes (
  query TEXT NOT NULL,
  seed TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (query, seed, user_id)
);
CREATE INDEX IF NOT EXISTS k_search_votes_account_idx ON k_search_votes(user_id, query);
