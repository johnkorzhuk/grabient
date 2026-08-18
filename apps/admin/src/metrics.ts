// The metric catalog: every key metric_daily may hold, with the semantics the
// stored row cannot carry itself.
//
// `agg` is load-bearing. Four kinds of key are actively WRONG if summed or
// plainly averaged, and there is no way to recover the right answer from the
// rows alone:
//   ratio         gsc.ctr — recompute sum(numerator)/sum(denominator)
//   weighted_avg  gsc.position — weight by impressions, or a 3-impression day
//                 at position 1 outranks the whole site
//   avg           per-day unique counts (ga4.users, cf.uniques) — the same
//                 person on three days is one person, never three
//   last          cumulative counts and sweep results
// rollup() below is the only summation path; a chart or tool that bypasses it
// is the bug.
//
// Keys are dot-separated with the source first, so `metric_key >= 'prefix'`
// range scans fetch whole families and an event's metric_scope can say 'gsc.'.
// Keys arriving with no entry and no prefix rule still store and chart
// (default sum) but carry an "uncatalogued" caveat — adding a metric never
// breaks, and never silently loses its caveat either.

export type Agg = "sum" | "avg" | "last" | "ratio" | "weighted_avg";

export interface MetricDef {
  source: "gsc" | "ga4" | "cf" | "d1" | "index" | "bing";
  agg: Agg;
  unit: "count" | "pct" | "position";
  label: string;
  caveat: string;
  /** First day data can exist — the chart's left edge is explained, not mysterious. */
  since?: string;
  /** For goals and deltas: which direction is good. Default "up". */
  better?: "up" | "down";
  /** ratio: recompute from these keys over the window. */
  numerator?: string;
  denominator?: string;
  /** weighted_avg: weight by this key. */
  weight?: string;
  /** Calendar the day column uses. GSC/GA4 are property-local (LA), CF is UTC. */
  calendar: "utc" | "america_los_angeles";
}

const GSC_CAVEAT =
  "Lags ~2 days and revises for ~3; the snapshot re-writes a trailing window so it self-heals, and days inside that window are provisional. Date-dimensioned rows ARE true site totals (anonymized queries included). No data before 2026-08-14 — the property is young, not the site.";
const GA4_CAVEAT =
  "The only bot-filtered source (Zaraz browser beacon; JS-less crawlers never appear). Re-processes up to 48h. A bot wave polluted 2026-06-30..07-23 — stored as reported, flagged by a band event, never filtered.";
const CF_CAVEAT =
  "Counts every request reaching the edge — NOT a headcount; roughly half this zone's traffic is automation and the browser split is a user-agent heuristic (a floor, not a bot score).";

export const METRIC: Record<string, MetricDef> = {
  "gsc.clicks": { source: "gsc", agg: "sum", unit: "count", label: "Search clicks", caveat: GSC_CAVEAT, since: "2026-08-14", calendar: "america_los_angeles" },
  "gsc.impressions": { source: "gsc", agg: "sum", unit: "count", label: "Search impressions", caveat: GSC_CAVEAT, since: "2026-08-14", calendar: "america_los_angeles" },
  "gsc.ctr": { source: "gsc", agg: "ratio", unit: "pct", label: "Search CTR", numerator: "gsc.clicks", denominator: "gsc.impressions", caveat: "Percent. Never average across days — recomputed as sum(clicks)/sum(impressions).", since: "2026-08-14", calendar: "america_los_angeles" },
  "gsc.position": { source: "gsc", agg: "weighted_avg", unit: "position", label: "Average position", weight: "gsc.impressions", better: "down", caveat: "Impressions-weighted; LOWER is better. A plain mean would let a 3-impression day at #1 outrank the site.", since: "2026-08-14", calendar: "america_los_angeles" },

  "ga4.sessions": { source: "ga4", agg: "sum", unit: "count", label: "Sessions", caveat: GA4_CAVEAT, calendar: "america_los_angeles" },
  "ga4.pageviews": { source: "ga4", agg: "sum", unit: "count", label: "Pageviews (GA4)", caveat: GA4_CAVEAT, calendar: "america_los_angeles" },
  "ga4.users": { source: "ga4", agg: "avg", unit: "count", label: "Active users / day", caveat: "Per-day unique count — NEVER summed across days; the window rollup is a daily mean.", calendar: "america_los_angeles" },
  "ga4.new_users": { source: "ga4", agg: "sum", unit: "count", label: "New users", caveat: "Summable: a user is new exactly once. " + GA4_CAVEAT, calendar: "america_los_angeles" },
  "ga4.engaged_sessions": { source: "ga4", agg: "sum", unit: "count", label: "Engaged sessions", caveat: "Store the count, derive the rate: engagement rate over a window is sum(engaged)/sum(sessions).", calendar: "america_los_angeles" },

  "cf.pageviews": { source: "cf", agg: "sum", unit: "count", label: "Edge pageviews", caveat: CF_CAVEAT + " meta holds the full browserMap family array, so an unnamed crawler is recoverable after Cloudflare ages the raw data out.", calendar: "utc" },
  "cf.browser_pageviews": { source: "cf", agg: "sum", unit: "count", label: "Browser pageviews", caveat: "User-agent heuristic — misfiles stripped-UA privacy users as automated, misses browser-spoofing scrapers. A floor on real traffic.", calendar: "utc" },
  "cf.automated_pageviews": { source: "cf", agg: "sum", unit: "count", label: "Bot & unidentified pageviews", caveat: "Derived by subtraction so unrecognized families land here rather than vanishing.", calendar: "utc" },
  "cf.uniques": { source: "cf", agg: "avg", unit: "count", label: "Distinct IPs / day", caveat: "Distinct client IPs, bots included. Not people, and never valid to sum across days.", calendar: "utc" },
  "cf.requests": { source: "cf", agg: "sum", unit: "count", label: "Edge requests", caveat: "Every request including assets — the load/cost number, not an audience number.", calendar: "utc" },

  "d1.palettes": { source: "d1", agg: "last", unit: "count", label: "Palettes", caveat: "Cumulative count; reconstructable exactly from created_at.", calendar: "utc" },
  "d1.users": { source: "d1", agg: "last", unit: "count", label: "Registered accounts", caveat: "Cumulative; hard-deleting an account rewrites history retroactively.", calendar: "utc" },
  "d1.likes": { source: "d1", agg: "last", unit: "count", label: "Likes", caveat: "Cumulative count of every like ever recorded. Un-liking deletes the row, so this can fall — it is a running total of what currently exists, not of what has ever happened.", calendar: "utc" },
  "d1.activated": { source: "d1", agg: "last", unit: "count", label: "Accounts that ever liked", caveat: "Cumulative distinct likers — the activation-rate numerator.", calendar: "utc" },
  "d1.signups": { source: "d1", agg: "sum", unit: "count", label: "Signups", caveat: "New accounts per day, from auth_user.created_at. Hard-deleting an account rewrites this history retroactively, so a past day can change without anything having happened that day.", calendar: "utc" },
  "d1.likes_new": { source: "d1", agg: "sum", unit: "count", label: "New likes", caveat: "Likes created per day. Liking requires an account, so this measures the few dozen signed-in users rather than site activity — never read it as engagement across all visitors.", calendar: "utc" },

  "index.corpus": { source: "index", agg: "last", unit: "count", label: "Sitemap URLs", caveat: "URLs in the LIVE sitemap index at sweep time — the denominator Google was actually given. No history before the first sweep, because the API only ever answers about now.", calendar: "utc" },
  "index.inspected": { source: "index", agg: "last", unit: "count", label: "URLs inspected", caveat: "URLs the sweep actually asked Google about. Lower than index.corpus when the daily quota forced rotation mode, so coverage ratios must divide by THIS, not by the corpus.", calendar: "utc" },
  "index.indexed": { source: "index", agg: "last", unit: "count", label: "Pages indexed (Google)", caveat: "THE headline series. Written only by a status='complete' sweep, so a job dying can never print a crash as a de-indexation.", calendar: "utc" },
  "index.not_indexed": { source: "index", agg: "last", unit: "count", label: "Pages not indexed", caveat: "Inspected minus indexed minus API errors. Google distinguishes several reasons for this and they need opposite fixes — see the crawled/discovered/duplicate buckets rather than acting on this total.", calendar: "utc" },
  "index.crawled_not_indexed": { source: "index", agg: "last", unit: "count", label: "Crawled, not indexed", caveat: "The bucket the 2026-08-17 fixes were aimed at.", calendar: "utc" },
  "index.discovered_not_indexed": { source: "index", agg: "last", unit: "count", label: "Discovered, not crawled", caveat: "Crawl-budget signal: Google knows the URL and has not fetched it.", calendar: "utc" },
  "index.duplicate_canonical": { source: "index", agg: "last", unit: "count", label: "Duplicate / wrong canonical", caveat: "Was the three-URLs-per-palette problem.", calendar: "utc" },
  "index.excluded_other": { source: "index", agg: "last", unit: "count", label: "Excluded (other)", caveat: "Catch-all so buckets sum to inspected; non-trivial values mean a new coverageState wording appeared.", calendar: "utc" },
  "index.errors": { source: "index", agg: "last", unit: "count", label: "Inspection errors", caveat: "Non-zero means every count above is understated by up to this much.", calendar: "utc" },
  "index.coverage_pct": { source: "index", agg: "ratio", unit: "pct", label: "Index coverage", numerator: "index.indexed", denominator: "index.inspected", caveat: "Recomputed from the two counts; never averaged.", calendar: "utc" },
  "index.freshness_pct": { source: "index", agg: "last", unit: "pct", label: "Index picture freshness", caveat: "Share of the published indexation picture that was re-checked within the last 7 days. index.* is a ROLLING per-URL view — a nightly sweep may only reach part of the ~920-URL corpus, so the rest carries its most recent known verdict. Below ~70% here, read coverage as 'roughly this, measured over the last week' rather than as today's number.", calendar: "utc" },
  "index.stale_crawl_7d": { source: "index", agg: "last", unit: "count", label: "Not crawled in 7d", caveat: "Crawl-frequency proxy over the corpus.", calendar: "utc" },

  "bing.clicks": { source: "bing", agg: "sum", unit: "count", label: "Bing clicks", caveat: "Daily, but BUNDLES Copilot/chat surfaces with web results — not an AI-citation measure. Updates lag up to 48h.", calendar: "utc" },
  "bing.impressions": { source: "bing", agg: "sum", unit: "count", label: "Bing impressions", caveat: "Same bundling caveat as bing.clicks.", calendar: "utc" },
  "bing.crawled": { source: "bing", agg: "sum", unit: "count", label: "Pages crawled by Bing", caveat: "From GetCrawlStats; docs promise ~6 months of history.", calendar: "utc" },
  "bing.indexed": { source: "bing", agg: "last", unit: "count", label: "Pages in Bing's index", caveat: "A daily AGGREGATE indexed count — the number Google refuses to expose at any price.", calendar: "utc" },
};

/**
 * Families matched by prefix rather than enumerated, because their members are
 * invented upstream without notice: Google adds channel groups, Cloudflare
 * adds bot categories.
 */
export const PREFIX_RULES: Array<{ prefix: string; def: Omit<MetricDef, "label"> & { label: (key: string) => string } }> = [
  {
    prefix: "ga4.sessions.",
    def: { source: "ga4", agg: "sum", unit: "count", calendar: "america_los_angeles", label: (k) => `Sessions · ${pretty(k.slice("ga4.sessions.".length))}`, caveat: "Per default-channel-group sessions. " + GA4_CAVEAT + " The ai_assistant channel exists only since 2026-05-13 and is NOT retroactive — earlier AI traffic sits in referral; read the discontinuity as reclassification, not growth." },
  },
  {
    prefix: "ga4.pageviews.",
    def: { source: "ga4", agg: "sum", unit: "count", calendar: "america_los_angeles", label: (k) => `Pageviews · ${pretty(k.slice("ga4.pageviews.".length))}`, caveat: "Per default-channel-group pageviews; same caveats as ga4.sessions.*." },
  },
  {
    prefix: "cf.bot.",
    def: { source: "cf", agg: "sum", unit: "count", calendar: "utc", label: (k) => `Crawler pageviews · ${pretty(k.slice("cf.bot.".length))}`, caveat: "From the daily browserMap, which names search crawlers (GoogleBot, BingBot, AppleBot...) but NOT AI crawlers — meta-webindexer, GPTBot and ClaudeBot present no browser family and sit in the Unknown bucket (see cf.automated_pageviews and cf.verified_bot.*)." },
  },
  {
    prefix: "cf.verified_bot.",
    def: { source: "cf", agg: "sum", unit: "count", calendar: "utc", label: (k) => `Verified bots · ${pretty(k.slice("cf.verified_bot.".length))}`, caveat: "Cloudflare's verified-bot categories from the adaptive dataset: trustworthy but collected one 24h window at a time with ~7-day retention, so the series starts at first collection and can never be backfilled. Sampled; counts are already extrapolated.", since: "2026-08-18" },
  },
];

const pretty = (slug: string) => slug.replace(/_/g, " ");

/**
 * Days behind "now" before a source's day is complete. A lift window is only
 * judged once every day in it is past this lag — otherwise `too-early`.
 */
export const LAG_BY_SOURCE: Record<MetricDef["source"], number> = {
  gsc: 2,
  ga4: 1,
  cf: 1,
  d1: 1,
  index: 0,
  bing: 2,
};

/**
 * Which noise model a metric supports. Only counting processes get the
 * sqrt(n) floor; rates, positions and sparse (sweep-written) series refuse a
 * verdict rather than printing a meaningless sigma.
 */
export function liftKind(key: string): "count" | "rate" | "position" | "sparse" {
  const def = metricDef(key);
  if (!def) return "sparse";
  switch (def.agg) {
    case "sum":
      return "count";
    case "ratio":
    case "avg":
      return "rate";
    case "weighted_avg":
      return "position";
    case "last":
      return "sparse";
  }
}

export function metricDef(key: string): (MetricDef & { catalogued: boolean }) | null {
  const exact = METRIC[key];
  if (exact) return { ...exact, catalogued: true };
  for (const rule of PREFIX_RULES) {
    if (key.startsWith(rule.prefix)) {
      return { ...rule.def, label: rule.def.label(key), catalogued: true };
    }
  }
  if (!/^[a-z0-9_.]+$/.test(key)) return null;
  return {
    source: key.split(".")[0] as MetricDef["source"],
    agg: "sum",
    unit: "count",
    label: key,
    caveat: "Uncatalogued metric: stored and charted, but no source semantics are recorded. Add it to METRIC in metrics.ts.",
    calendar: "utc",
    catalogued: false,
  };
}

/** Channel/category names to key slugs: "AI Assistant" -> "ai_assistant". */
export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

/**
 * The one summation path. Applies the key's aggregation over a window of
 * points; ratio and weighted_avg need their companion series passed in.
 */
export function rollup(
  key: string,
  points: ReadonlyArray<{ day: string; value: number }>,
  companions?: Map<string, ReadonlyArray<{ day: string; value: number }>>,
): number | null {
  if (points.length === 0 && !companions) return null;
  const def = metricDef(key);
  if (!def) return null;
  const sum = (list: ReadonlyArray<{ value: number }>) =>
    list.reduce((t, p) => t + p.value, 0);
  switch (def.agg) {
    case "sum":
      return points.length ? sum(points) : null;
    case "avg":
      return points.length ? sum(points) / points.length : null;
    case "last":
      return points.length ? points[points.length - 1]!.value : null;
    case "ratio": {
      const num = companions?.get(def.numerator!) ?? [];
      const den = companions?.get(def.denominator!) ?? [];
      const d = sum(den);
      return d > 0 ? (sum(num) / d) * 100 : null;
    }
    case "weighted_avg": {
      const weights = new Map(
        (companions?.get(def.weight!) ?? []).map((p) => [p.day, p.value]),
      );
      let acc = 0;
      let wTotal = 0;
      for (const p of points) {
        const w = weights.get(p.day) ?? 0;
        acc += p.value * w;
        wTotal += w;
      }
      return wTotal > 0 ? acc / wTotal : null;
    }
  }
}
