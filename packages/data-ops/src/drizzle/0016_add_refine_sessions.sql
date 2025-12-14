-- Migration: Add refine_sessions table for tracking AI refinement sessions
CREATE TABLE `refine_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `query` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `generated_seeds` text DEFAULT '{}' NOT NULL,
  `feedback` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `refine_sessions_user_query_idx` ON `refine_sessions` (`user_id`, `query`);
