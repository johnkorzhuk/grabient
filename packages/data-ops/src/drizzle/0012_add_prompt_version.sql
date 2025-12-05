ALTER TABLE palette_tags ADD COLUMN prompt_version TEXT;
CREATE INDEX palette_tags_prompt_version_idx ON palette_tags(prompt_version);
