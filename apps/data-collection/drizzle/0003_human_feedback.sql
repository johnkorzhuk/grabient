-- Human feedback on pairs: label ('golden'|'not-golden'|'good'|'bad-match')
-- plus timestamp. Palette-level human rejection reuses
-- palettes.status='rejected' with reject_reason='human'.
ALTER TABLE `pairs` ADD COLUMN `human_label` text;
ALTER TABLE `pairs` ADD COLUMN `human_at` integer;
CREATE INDEX `pairs_human_label_idx` ON `pairs` (`human_label`);
