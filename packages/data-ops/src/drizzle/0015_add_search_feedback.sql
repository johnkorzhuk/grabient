CREATE TABLE search_feedback (
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  seed TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query, seed)
);

CREATE INDEX search_feedback_user_query_idx ON search_feedback(user_id, query);
CREATE INDEX search_feedback_seed_idx ON search_feedback(seed);
