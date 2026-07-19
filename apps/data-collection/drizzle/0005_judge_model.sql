-- Which model scored the pair (tiered judging: sonnet takes the
-- triage-unanimous-good easy tier, opus keeps the rest). Null = pre-tiering
-- rows, all opus.
ALTER TABLE pairs ADD COLUMN judge_model text;
