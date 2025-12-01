-- Add similarity_key column to palettes table for duplicate detection
-- This column stores a precision-1 version of the seed for grouping similar palettes

-- Step 1: Create new palettes table with similarity_key
CREATE TABLE `palettes_new` (
  `id` text PRIMARY KEY NOT NULL,
  `similarity_key` text NOT NULL,
  `style` text NOT NULL,
  `steps` integer NOT NULL,
  `angle` integer NOT NULL,
  `created_at` integer NOT NULL
);--> statement-breakpoint

-- Step 2: Copy data from old table
-- For existing palettes, we'll set similarity_key to empty string initially
-- It will be populated via a separate data migration script
INSERT INTO `palettes_new` (`id`, `similarity_key`, `style`, `steps`, `angle`, `created_at`)
SELECT `id`, '', `style`, `steps`, `angle`, `created_at`
FROM `palettes`;--> statement-breakpoint

-- Step 3: Drop old table
DROP TABLE `palettes`;--> statement-breakpoint

-- Step 4: Rename new table to palettes
ALTER TABLE `palettes_new` RENAME TO `palettes`;--> statement-breakpoint

-- Step 5: Recreate indexes
CREATE INDEX `palettes_id_idx` ON `palettes` (`id`);--> statement-breakpoint
CREATE INDEX `palettes_similarity_key_idx` ON `palettes` (`similarity_key`);
