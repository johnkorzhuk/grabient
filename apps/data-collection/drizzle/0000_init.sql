-- Initial schema for the training-data collection database (grabient-dc).
-- Keep in sync with src/db/schema.ts.
CREATE TABLE `palettes` (
	`seed` text PRIMARY KEY NOT NULL,
	`coeffs` text NOT NULL,
	`similarity_key` text NOT NULL,
	`hex_stops` text NOT NULL,
	`tags` text NOT NULL,
	`brightness` real NOT NULL,
	`contrast` real NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reject_reason` text,
	`caption_locked_at` integer,
	`run_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `palettes_status_idx` ON `palettes` (`status`);
--> statement-breakpoint
CREATE INDEX `palettes_similarity_key_idx` ON `palettes` (`similarity_key`);
--> statement-breakpoint
CREATE INDEX `palettes_source_idx` ON `palettes` (`source`);
--> statement-breakpoint
CREATE TABLE `queries` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`category` text NOT NULL,
	`style_hint` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`run_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queries_normalized_text_idx` ON `queries` (`normalized_text`);
--> statement-breakpoint
CREATE INDEX `queries_category_idx` ON `queries` (`category`);
--> statement-breakpoint
CREATE TABLE `pairs` (
	`query_id` text NOT NULL,
	`palette_seed` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`score` real,
	`verdict` text,
	`judge_notes` text,
	`locked_at` integer,
	`locked_by` text,
	`run_id` text,
	`created_at` integer NOT NULL,
	`judged_at` integer,
	PRIMARY KEY(`query_id`, `palette_seed`)
);
--> statement-breakpoint
CREATE INDEX `pairs_palette_seed_idx` ON `pairs` (`palette_seed`);
--> statement-breakpoint
CREATE INDEX `pairs_status_idx` ON `pairs` (`status`);
--> statement-breakpoint
CREATE INDEX `pairs_status_locked_idx` ON `pairs` (`status`,`locked_at`);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`target` text,
	`stats` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	`filters` text,
	`created_at` integer NOT NULL
);
