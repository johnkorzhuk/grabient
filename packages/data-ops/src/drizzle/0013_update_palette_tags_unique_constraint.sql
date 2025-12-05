-- Add prompt_version column if not exists (may already exist from 0012)
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we'll handle this gracefully

-- Drop the old unique index and create new one including prompt_version
DROP INDEX IF EXISTS palette_tags_seed_provider_run_idx;
CREATE UNIQUE INDEX palette_tags_seed_provider_run_prompt_idx ON palette_tags(seed, provider, run_number, prompt_version);

-- Add index on prompt_version for filtering
CREATE INDEX IF NOT EXISTS palette_tags_prompt_version_idx ON palette_tags(prompt_version);
