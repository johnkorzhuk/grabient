-- Add the name column back (required by Better Auth)
ALTER TABLE `auth_user` ADD COLUMN `name` text NOT NULL DEFAULT '';
