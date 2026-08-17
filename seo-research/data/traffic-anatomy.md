# Traffic anatomy — what the 69k/day actually is

Written 2026-08-16 from `brief-2026-08-16.json` (Cloudflare zone analytics via the
admin worker, pulled through `wrangler dev --remote`). This note exists because
every prior severity judgment was scored against an unknown denominator.

## The eras (browser-classified pageviews/day)

| Era | Browser PV/day | Character |
|---|---|---|
| ≤ 2026-03-25 | ~4,300–8,000 | **The real baseline.** Steady, weekday-shaped. |
| 2026-03-26 → 04-15 | 20K → 83K ramp | First flood. Ends in a one-day cliff (81K → 3.5K on 04-16). |
| 04-16 → 04-29 | ~2,200–4,800 | Back to baseline exactly. |
| 04-30 → 05-31 | 2.6K–248K, erratic | Second flood. 05-28: 248,861 PV across 215,416 distinct IPs. |
| 06 onward | 2K–150K swinging | Sustained floods; separately, *automated*-classified PV explodes after 07-15 (spikes to 220K/day). |

## Why the floods are not people

- **Device mix ~99% desktop** (435,131 desktop vs 9,150 mobile in the 24h window).
  The brief's own caveat calls this "implausible for a consumer design tool and
  itself evidence that automated traffic dominates."
- **Geography**: after US, the top countries are CO, SG, BR, ID, VE, BD, VN —
  residential-proxy geography, not a design-tool audience.
- **Zero conversion coupling**: signups were 255/mo before the floods and
  161–196/mo during them. A real 100K-visitor day mints signups; these mint none.
  Signups-per-100k-browser-views fell 69.8 → 6.4 exactly as the floods began —
  the numerator never moved.
- **05-28**: 215K distinct IPs in one day at ~1.15 pages/IP. That is a
  distributed scrape (or an embedded fetch loop), not virality — nothing else
  moved that week.
- The UA-heuristic bot split explicitly **undercounts scrapers that spoof a
  browser UA** (no Bot Management on this plan).

## Corrected denominators

- **Real human traffic: ~4–6K pageviews/day** (~150K/month), the pre-flood
  baseline. GSC-measured Google web clicks: ~100/day since data began (08-13).
- **Funnel, recomputed against reality**: 174 signups/month ÷ ~150K real monthly
  pageviews ≈ **116 signups per 100k real views** — not the catastrophic 6.4 the
  raw division suggests, and roughly 1 signup per ~860 human pageviews.
  Traffic quality was the problem with the metric, not conversion collapse.
- Therefore: **acquiring more *real* traffic is a sound growth lever**, and SEO
  (~100 clicks/day today, position 8.2 on tool-intent head terms) has obvious
  headroom. The passoff's "is traffic even the constraint?" is answered: real
  traffic is the constraint; fake traffic was masking it.

## The cssgradient.io embed (verified 2026-08-16)

- `cssgradient.io/gradient-backgrounds/` iframes `https://www.grabient.com/` as
  the **default active** tool in its background-tools sidenav, and the sidenav
  carries a plain `<a href="https://www.grabient.com/">` with **no nofollow** —
  a followed backlink from a topically-perfect, high-authority domain.
- `www.grabient.com` 301s cleanly to `https://grabient.com/`, so the equity
  flows to the canonical host.
- Wayback: the page already referenced grabient on 2025-12-19 and 2026-03-03 —
  the embed **predates the 03-26 flood by months**, so the floods are NOT the
  embed. Bot attribution for the floods stands; embed traffic is a separate,
  steadier component inside the browser-classified counts.
- Grabient's side: `frame-ancestors 'self' cssgradient.io *.cssgradient.io`
  added 2026-07-26 (commit a539102) — all OTHER embedders have been blocked
  since then. The embed-notice pill (commit 84d6d23, same day) links out via
  `location.href` with **no UTM**, so embed-driven signups currently attribute
  as "direct" — invisible to the first-touch attribution shipped 08-15.
- The CSP applies to every route including /login and /settings; when widening
  the allowlist, auth routes should stay unframeable.

## Loose ends this raises

1. **What ARE the floods fetching?** Top 24h content paths are only `/` (5.6K)
   and `/newest` (1.9K) after the brief filters out API endpoints and assets —
   so the flood volume lives substantially in filtered paths (API/PNG/assets)
   or is sampled differently. The PNG endpoints being hotlinked/scraped is a
   live hypothesis. RUM referrer data (enabled 08-15) will start answering this
   within days; `traffic_sources` was still null on 08-16.
2. **Cost exposure**: floods hit Worker CPU (resvg renders), KV, Vectorize
   (`/palettes/{anything}` does a Vectorize query on cache miss), and D1. Worth
   a Cloudflare AI-Crawl-Control / rate-limit review independent of SEO.
3. **GSC API vs UI**: the API (28d window ending T-3) still returns zero rows
   while the UI (updated intraday) shows 196 clicks/5.27K impressions starting
   08-13. Not a bug — the API window barely misses the first populated days.
   Re-pull ~08-19 and the dashboard's search section will light up.

## GSC ground truth (from the UI screenshot, 2026-08-16)

196 clicks / 5,270 impressions / CTR 3.7% / avg position 8.2, essentially all
since 08-13 (~100 clicks/day). Top queries by clicks: gradient maker 32/400,
gradient generator 27/376, grabient 20/26, gradient 13/514, gradient creator
6/61, gradient color generator 4/30, css gradient 2/215, gradient background
generator 2/56, gradient tool 2/26, gradient picker 2/23. Tool-intent queries
dominate; color queries are not in the click top-10.
