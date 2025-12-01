-- Drop the is_public index first
DROP INDEX IF EXISTS `likes_is_public_idx`;--> statement-breakpoint
-- Drop the is_public column from likes
ALTER TABLE `likes` DROP COLUMN `is_public`;
