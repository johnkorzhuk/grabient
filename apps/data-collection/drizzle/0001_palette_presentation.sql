-- Presentation suggestion (grabient.com URL params) per palette. Nullable:
-- sampler-created rows are born without one; the caption pass backfills.
ALTER TABLE `palettes` ADD COLUMN `style` text;
ALTER TABLE `palettes` ADD COLUMN `steps` integer;
ALTER TABLE `palettes` ADD COLUMN `angle` integer;
