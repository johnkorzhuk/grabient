-- Remove duplicate palettes, keeping only the oldest one for each seed
DELETE FROM `palettes`
WHERE id NOT IN (
  SELECT MIN(id)
  FROM `palettes`
  GROUP BY seed
);--> statement-breakpoint

-- Create a unique index on the seed column
CREATE UNIQUE INDEX `palettes_seed_unique` ON `palettes` (`seed`);
