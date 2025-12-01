-- Drop the likes index first
DROP INDEX IF EXISTS `collections_likes_idx`;--> statement-breakpoint
-- Drop the likes column from collections
ALTER TABLE `collections` DROP COLUMN `likes`;--> statement-breakpoint
-- Rename collections table to palettes
ALTER TABLE `collections` RENAME TO `palettes`;
