-- Step 1: Create new palettes table with seed as id
CREATE TABLE `palettes_new` (
  `id` text PRIMARY KEY NOT NULL,
  `style` text NOT NULL,
  `steps` integer NOT NULL,
  `angle` integer NOT NULL,
  `created_at` integer NOT NULL
);--> statement-breakpoint

-- Step 2: Copy data from old table (seed becomes id)
INSERT INTO `palettes_new` (`id`, `style`, `steps`, `angle`, `created_at`)
SELECT `seed`, `style`, `steps`, `angle`, `created_at`
FROM `palettes`;--> statement-breakpoint

-- Step 3: Drop old table
DROP TABLE `palettes`;--> statement-breakpoint

-- Step 4: Rename new table to palettes
ALTER TABLE `palettes_new` RENAME TO `palettes`;--> statement-breakpoint

-- Step 5: Create index on id (which is now the seed)
CREATE INDEX `palettes_id_idx` ON `palettes` (`id`);--> statement-breakpoint

-- Step 6: Create new likes table - composite primary key (user_id, palette_id)
CREATE TABLE `likes_new` (
  `user_id` text NOT NULL,
  `palette_id` text NOT NULL,
  `steps` integer NOT NULL,
  `style` text NOT NULL,
  `angle` integer NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `palette_id`)
);--> statement-breakpoint

-- Step 7: Copy data from old likes table (seed becomes palette_id)
INSERT INTO `likes_new` (`user_id`, `palette_id`, `steps`, `style`, `angle`, `created_at`)
SELECT `user_id`, `seed`, `steps`, `style`, `angle`, `created_at`
FROM `likes`;--> statement-breakpoint

-- Step 8: Drop old likes table
DROP TABLE `likes`;--> statement-breakpoint

-- Step 9: Rename new likes table
ALTER TABLE `likes_new` RENAME TO `likes`;--> statement-breakpoint

-- Step 10: Recreate indexes on likes table
CREATE INDEX `likes_palette_id_idx` ON `likes` (`palette_id`);--> statement-breakpoint
CREATE INDEX `likes_user_id_idx` ON `likes` (`user_id`);
