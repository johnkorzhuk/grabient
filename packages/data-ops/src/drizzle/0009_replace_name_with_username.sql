-- Drop the name column and add username column
ALTER TABLE `auth_user` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `auth_user` ADD COLUMN `username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_username_unique` ON `auth_user` (`username`);
