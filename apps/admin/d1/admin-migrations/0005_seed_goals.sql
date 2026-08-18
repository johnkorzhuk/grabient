-- grabient-admin 0005: the initial goals, from baselines measured 2026-08-17
-- (the day the SEO fixes shipped). Progress is judged against these numbers,
-- not against zero — that is the whole point of recording them.
-- INSERT OR IGNORE: the owner edits goals through the MCP afterwards; a
-- re-applied migration must never clobber that.

INSERT OR IGNORE INTO goal (slug, title, metric_key, direction, aggregate, window_days,
                            baseline_value, baseline_day, target_value, target_day,
                            status, notes, created_at, updated_at)
VALUES
  ('index-coverage', 'Get the corpus indexed by Google', 'index.indexed', 'up', 'last', 1,
   0, '2026-08-17', 750, '2026-10-31', 'active',
   'THE headline goal. 920 URLs submitted, 0 indexed on 2026-08-17 when the naming/linking/gating fixes shipped. 750 of ~920 is the ambition; the daily sweep writes the series.',
   1787200000000, 1787200000000),

  ('organic-sessions-28d', 'Grow organic search sessions', 'ga4.sessions.organic_search', 'up', 'sum', 28,
   5438, '2026-08-17', 8000, '2026-11-15', 'active',
   'GA4 bot-filtered sessions, 28-day sum. Baseline is the measured 28d window ending 2026-08-17. Search is already the largest channel by pageviews — this is optimisation of the dominant channel, not a gamble.',
   1787200000000, 1787200000000),

  ('ai-sessions-28d', 'Grow AI-assistant referred sessions', 'ga4.sessions.ai_assistant', 'up', 'sum', 28,
   205, '2026-08-17', 500, '2026-11-15', 'active',
   'The AI Assistant channel (ChatGPT/Gemini/Claude referrers): 205 sessions per 28d at baseline — small next to search but measurable, and the channel the MCP/agent-access work feeds. Channel exists only since 2026-05-13.',
   1787200000000, 1787200000000),

  ('gsc-clicks-7d', 'Grow weekly search clicks', 'gsc.clicks', 'up', 'sum', 7,
   1080, '2026-08-17', 1600, '2026-10-15', 'active',
   '7-day sum (~154/day at baseline). A 7-day window rather than 28 because the GSC property only has data from 2026-08-14.',
   1787200000000, 1787200000000),

  ('avg-position-7d', 'Improve average search position', 'gsc.position', 'down', 'avg', 7,
   8.6, '2026-08-17', 6.5, '2026-11-15', 'active',
   'Plain 7-day mean of daily impression-weighted positions — statistically a proxy, not the true weighted figure; good enough to steer by. LOWER is better.',
   1787200000000, 1787200000000);
