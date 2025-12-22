-- Drop search_feedback table (moving to analytics-only tracking)
DROP INDEX IF EXISTS search_feedback_user_query_idx;
DROP INDEX IF EXISTS search_feedback_seed_idx;
DROP TABLE IF EXISTS search_feedback;
