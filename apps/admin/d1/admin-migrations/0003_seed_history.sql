-- grabient-admin 0003: the known history, seeded so the charts are legible on
-- day one. Idempotent via the dedupe key; re-applying inserts nothing.
--
-- Every row here is a fact this repo's docs already record. The band events
-- matter most: a chart whose left edge or bot-wave bulge is unexplained gets
-- misread, and the misreading becomes a decision.

INSERT INTO event (id, kind, occurred_at, occurred_on, ends_on, label, detail,
                   source, created_by, external_id, dedupe_key, campaign_id,
                   goal_slug, meta_json, chart_visible, supersedes_id,
                   created_at, updated_at, deleted_at)
VALUES
  ('evt_seed_botwave', 'incident', 1782864000000, '2026-06-30', '2026-07-23',
   'GA4 bot-inflation wave',
   'A bot wave inflated GA4 sessions and pageviews across this window. Stored values are what GA4 reported — deliberately not filtered. Treat any comparison spanning this band as unreliable.',
   'seed', 'seed', NULL, 'seed:incident:2026-06-30:ga4-bot-inflation-wave', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_ai_channel', 'external', 1778976000000, '2026-05-13', NULL,
   'GA4 "AI Assistant" channel created by Google',
   'Traffic from ChatGPT/Gemini/Claude referrers is classified into a new channel from this date, NOT retroactively — earlier AI traffic sits in Referral. A rise in ai_assistant sessions at this date is reclassification, not growth.',
   'seed', 'seed', NULL, 'seed:external:2026-05-13:ga4-ai-assistant-channel-created', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_cache_opt', 'deploy', 1785168000000, '2026-07-27', NULL,
   'Web cache optimization shipped',
   'Edge-cache work on grabient-production (list HTML caching, D1 batching).',
   'seed', 'seed', NULL, 'seed:deploy:2026-07-27:web-cache-optimization-shipped', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_gsc_verified', 'decision', 1786752000000, '2026-08-14', NULL,
   'Search Console property verified',
   'sc-domain:grabient.com verified; GSC data begins. The site is a decade old — this left edge is the PROPERTY''s age, not the site''s.',
   'seed', 'seed', NULL, 'seed:decision:2026-08-14:search-console-property-verified', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_attribution', 'deploy', 1786838400000, '2026-08-15', NULL,
   'First-touch attribution + Web Analytics shipped',
   'gb_attr cookie capture and Cloudflare RUM enabled. Nothing before this date has referrer attribution; it cannot be backfilled.',
   'seed', 'seed', NULL, 'seed:deploy:2026-08-15:first-touch-attribution-web-analytics', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_seo_ship', 'deploy', 1787011200000, '2026-08-17', NULL,
   'SEO ship: palette naming, internal links, query gate',
   'The three indexation fixes shipped together: distinct names/titles per palette, ten hub links per page, /palettes/{query} indexability gate, robots.txt cleanup, split sitemaps. Whether index.indexed rises after this marker is the headline question this dashboard exists to answer.',
   'seed', 'seed', NULL, 'seed:deploy:2026-08-17:seo-ship-naming-links-gate', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_oauth', 'decision', 1787011200000, '2026-08-17', NULL,
   'Access Managed OAuth enabled for the MCP',
   'MCP clients authenticate via Cloudflare Access OAuth; agents gain first-class access to this dashboard.',
   'seed', 'seed', NULL, 'seed:decision:2026-08-17:access-managed-oauth-enabled', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL),

  ('evt_seed_bing', 'decision', 1787011200000, '2026-08-17', NULL,
   'Bing Webmaster Tools registered',
   'Site registered; reports (incl. AI Performance, dashboard-only) populate ~48h later. bing.* metrics begin when the API key is configured.',
   'seed', 'seed', NULL, 'seed:decision:2026-08-17:bing-webmaster-tools-registered', NULL, NULL, NULL, 1, NULL,
   1787011200000, 1787011200000, NULL);
