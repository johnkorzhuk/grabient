-- First-touch attribution, captured once per account at creation.
--
-- Why on auth_user rather than in an analytics tool: this is the join key for
-- every question worth asking during a marketing push. "Which campaign produced
-- these signups" is answerable from GA4; "which campaign produced signups that
-- went on to LIKE something" is only answerable if attribution lives next to the
-- account, in the same database as likes. Activation-by-campaign is the number
-- that separates a channel that sends buyers from one that sends bounces.
--
-- All columns are nullable and only ever written once, in the better-auth
-- user-create hook (packages/data-ops/src/auth/setup.ts). Existing rows stay
-- NULL — there is no way to backfill attribution that was never collected, and
-- guessing it from created_at would be worse than leaving it empty.
--
-- ALTER TABLE ... ADD COLUMN on SQLite rewrites no rows and takes no lock worth
-- worrying about, so this is safe to apply to production while it serves.

ALTER TABLE `auth_user` ADD `attribution_source` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `attribution_medium` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `attribution_campaign` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `attribution_referrer` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `attribution_landing` text;--> statement-breakpoint
ALTER TABLE `auth_user` ADD `attribution_at` integer;--> statement-breakpoint
-- Signups-by-campaign is a GROUP BY over a low-cardinality column on a table
-- that is only a few thousand rows today, but the dashboard runs it on every
-- load and the table only grows.
CREATE INDEX IF NOT EXISTS `auth_user_attribution_source_idx` ON `auth_user` (`attribution_source`);
