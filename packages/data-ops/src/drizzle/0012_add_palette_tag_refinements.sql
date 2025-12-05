-- Smart model refinement results (Opus 4.5)
CREATE TABLE IF NOT EXISTS palette_tag_refinements (
    id TEXT PRIMARY KEY,
    seed TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT,
    source_prompt_version TEXT,
    input_summary TEXT,
    refined_tags TEXT,
    analysis TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS palette_tag_refinements_seed_idx ON palette_tag_refinements(seed);
CREATE INDEX IF NOT EXISTS palette_tag_refinements_prompt_version_idx ON palette_tag_refinements(prompt_version);
CREATE INDEX IF NOT EXISTS palette_tag_refinements_source_prompt_version_idx ON palette_tag_refinements(source_prompt_version);
