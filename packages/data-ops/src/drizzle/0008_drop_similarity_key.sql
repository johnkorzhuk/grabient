-- Drop similarity_key column and index from palettes table

-- Step 1: Create new palettes table without similarity_key
CREATE TABLE `palettes_new` (
  `id` text PRIMARY KEY NOT NULL,
  `style` text NOT NULL,
  `steps` integer NOT NULL,
  `angle` integer NOT NULL,
  `created_at` integer NOT NULL
);--> statement-breakpoint

-- Step 2: Copy data from old table (excluding similarity_key)
INSERT INTO `palettes_new` (`id`, `style`, `steps`, `angle`, `created_at`)
SELECT `id`, `style`, `steps`, `angle`, `created_at`
FROM `palettes`;--> statement-breakpoint

-- Step 3: Drop old table
DROP TABLE `palettes`;--> statement-breakpoint

-- Step 4: Rename new table to palettes
ALTER TABLE `palettes_new` RENAME TO `palettes`;--> statement-breakpoint

-- Step 5: Recreate index
CREATE INDEX `palettes_id_idx` ON `palettes` (`id`);
