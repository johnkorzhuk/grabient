-- Semantic themes on palettes; query-dictated presentation overrides,
-- judge-emitted ambiguity, and golden eval-set membership on pairs.
ALTER TABLE `palettes` ADD COLUMN `themes` text;
ALTER TABLE `pairs` ADD COLUMN `style_override` text;
ALTER TABLE `pairs` ADD COLUMN `steps_override` integer;
ALTER TABLE `pairs` ADD COLUMN `angle_override` integer;
ALTER TABLE `pairs` ADD COLUMN `ambiguity` text;
ALTER TABLE `pairs` ADD COLUMN `golden` integer NOT NULL DEFAULT 0;
