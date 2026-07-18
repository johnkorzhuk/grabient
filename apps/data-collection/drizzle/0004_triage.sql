-- Free-tier consensus triage: panel votes stored per pair, plus a counters
-- table for the self-enforced daily Workers AI budget (fail-closed - when the
-- cap is hit triage stops and the Opus judge sees everything, as before).
ALTER TABLE `pairs` ADD COLUMN `triage_votes` text;
ALTER TABLE `pairs` ADD COLUMN `triaged_at` integer;
CREATE TABLE `counters` (
  `key` text PRIMARY KEY NOT NULL,
  `value` integer NOT NULL DEFAULT 0
);
