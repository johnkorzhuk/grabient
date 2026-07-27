-- Cross-alias like identity, materialized. paletteCoeffKey() bakes globals
-- into a globals-free key; storing it lets like totals come from an indexed
-- COUNT(DISTINCT user_id) GROUP BY coeff_key instead of a full-table scan
-- aggregated in JS on every request.
--
-- Deploy order matters: apply this migration, run
-- apps/web/scripts/backfill-like-coeff-keys.mjs (fills coeff_key for existing
-- rows; safe to re-run), THEN deploy worker code that reads coeff_key.
ALTER TABLE `likes` ADD `coeff_key` text;--> statement-breakpoint
CREATE INDEX `likes_coeff_key_idx` ON `likes` (`coeff_key`);
