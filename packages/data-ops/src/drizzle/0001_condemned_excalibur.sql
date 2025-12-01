CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` text NOT NULL,
	`coeffs` text NOT NULL,
	`style` text NOT NULL,
	`steps` integer NOT NULL,
	`angle` integer NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_seed_idx` ON `collections` (`seed`);--> statement-breakpoint
CREATE INDEX `collections_likes_idx` ON `collections` (`likes`);--> statement-breakpoint
CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` text NOT NULL,
	`user_id` text NOT NULL,
	`steps` integer NOT NULL,
	`style` text NOT NULL,
	`angle` integer NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `likes_seed_idx` ON `likes` (`seed`);--> statement-breakpoint
CREATE INDEX `likes_user_id_idx` ON `likes` (`user_id`);--> statement-breakpoint
CREATE INDEX `likes_user_id_seed_idx` ON `likes` (`user_id`,`seed`);--> statement-breakpoint
CREATE INDEX `likes_is_public_idx` ON `likes` (`is_public`);