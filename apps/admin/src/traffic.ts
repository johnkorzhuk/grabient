// Real site traffic, from Cloudflare's zone analytics.
//
// Why not GA4 or PostHog. GA4 is configured through Cloudflare Zaraz and has no
// credentials in this repo; reading it would mean a Google service account and
// the GA4 Data API. PostHog is over its ingestion quota. Cloudflare already
// counts every request that reaches the zone, needs only a scoped read token,
// and is the same edge that serves the site — so it is both the cheapest and the
// least disputable source.
//
// What the numbers are, precisely, because it matters for how they are read:
//   uniques   — distinct client IPs seen that day. NOT distinct people, and not
//               comparable across days by adding them up: the same visitor on
//               three days counts three times. Only ever shown as a daily
//               series or an average of daily values, never summed.
//   pageViews — requests Cloudflare classifies as page loads rather than assets.
//               Includes bots and crawlers; there is no bot filter on this
//               dataset, which is the main caveat on every ratio derived below.

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/**
 * Zone analytics retains ~200 days. Ask for 180 so the per-month conversion
 * series has half a year of complete months to work with — at 90 it had three
 * bars, which is not a trend.
 */
const WINDOW_DAYS = 180;

export interface TrafficDay {
  date: string;
  uniques: number;
  pageViews: number;
  /** Pageviews whose user agent is a recognized web browser. */
  browserPageViews: number;
  /** Named crawlers plus everything that did not identify as a browser. */
  automatedPageViews: number;
  /** Every request that day, assets included — the load number. */
  requests: number;
  /**
   * Per-family pageviews for everything that is NOT a browser — named crawlers
   * (GoogleBot, BingBot, AppleBot…) plus the "Unknown" bucket. Verified live:
   * browserMap names the search crawlers explicitly, but the AI crawlers
   * (meta-webindexer, GPTBot, ClaudeBot) present no browser family and land in
   * Unknown — tracking those needs the adaptive dataset's verifiedBotCategory,
   * which only sees 24h at a time. This map is what makes "is Googlebot
   * crawling us more" answerable over months from one cached query.
   */
  botFamilies: Record<string, number>;
}

export interface Traffic {
  daily: TrafficDay[];
  /** Keyed "YYYY-MM". */
  monthly: Map<
    string,
    { pageViews: number; browserPageViews: number; avgDailyUniques: number; days: number }
  >;
}

const QUERY = `query($zoneTag: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      httpRequests1dGroups(limit: 400, filter: {date_geq: $since, date_leq: $until}, orderBy: [date_ASC]) {
        dimensions { date }
        sum { pageViews requests browserMap { pageViews uaBrowserFamily } }
        uniq { uniques }
      }
    }
  }
}`;

/**
 * Splitting real people from automated clients.
 *
 * Cloudflare's actual bot score needs the Bot Management add-on, which this zone
 * does not have — querying `botScoreSrcName` returns a permission error. What IS
 * available on every plan is `browserMap`, a per-day pageview breakdown by
 * user-agent family, and that turns out to be enough: it names crawlers
 * explicitly (GoogleBot, BingBot, AppleBot…) and buckets everything that did not
 * present as a browser under "Unknown".
 *
 * "Unknown" is the interesting one and it is not a rounding error — it is about
 * half of all pageviews, and it is spiky in exactly the way automated traffic is
 * (it went from ~9k to ~159k pageviews a day in August while distinct IPs
 * *fell*, i.e. far more requests from far fewer clients).
 *
 * So: anything that identifies as a real browser counts as a person, everything
 * else counts as automated. This is a heuristic, not a bot score. It will
 * misfile a privacy-tool user with a stripped user agent as automated, and it
 * will not catch a scraper that spoofs a Chrome user agent. It is a floor on
 * automated traffic, not an exact figure — hence the deliberately hedged
 * "recognized browsers" / "bots & unidentified" labels in the UI rather than
 * "humans" / "bots".
 */
const BOT_PATTERN = /bot|crawl|spider|slurp|curl|wget|headless|fetch|python|java|http/i;

function isBrowser(family: string): boolean {
  if (!family || family === "Unknown") return false;
  return !BOT_PATTERN.test(family);
}

// The dashboard is a handful of loads a day by one person, but a refresh
// shouldn't re-bill a GraphQL round trip. Memoized per isolate; short enough
// that the numbers are never meaningfully stale.
let cache: { at: number; value: Traffic } | null = null;
const TTL_MS = 5 * 60 * 1000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns null when traffic is not configured or the API call fails. The
 * dashboard degrades to its D1-only sections rather than erroring — the
 * database half is the part that must always render.
 */
export async function loadTraffic(env: Env, now: Date): Promise<Traffic | null> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const zoneTag = env.CF_ZONE_ID?.trim();
  if (!token || !zoneTag) return null;

  if (cache && now.getTime() - cache.at < TTL_MS) return cache.value;

  const until = new Date(now);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

  let payload: any;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { zoneTag, since: isoDay(since), until: isoDay(until) },
      }),
    });
    if (!res.ok) {
      console.error(`Cloudflare analytics HTTP ${res.status}`);
      return null;
    }
    payload = await res.json();
  } catch (err) {
    console.error("Cloudflare analytics fetch failed", err);
    return null;
  }

  // GraphQL reports failures in a 200 body, so the status check above is not
  // enough on its own.
  if (payload?.errors?.length) {
    console.error("Cloudflare analytics GraphQL error", JSON.stringify(payload.errors));
    return null;
  }

  const groups = payload?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
  if (!Array.isArray(groups)) {
    console.error("Cloudflare analytics returned an unexpected shape");
    return null;
  }

  const daily: TrafficDay[] = groups.map((row: any) => {
    const pageViews = row.sum?.pageViews ?? 0;
    const families: { pageViews: number; uaBrowserFamily: string }[] = row.sum?.browserMap ?? [];
    const browserPageViews = families
      .filter((f) => isBrowser(f.uaBrowserFamily))
      .reduce((sum, f) => sum + f.pageViews, 0);
    const botFamilies: Record<string, number> = {};
    for (const f of families) {
      if (!isBrowser(f.uaBrowserFamily)) {
        botFamilies[f.uaBrowserFamily || "Unknown"] =
          (botFamilies[f.uaBrowserFamily || "Unknown"] ?? 0) + f.pageViews;
      }
    }
    return {
      date: row.dimensions.date,
      uniques: row.uniq?.uniques ?? 0,
      pageViews,
      browserPageViews,
      // Derived by subtraction rather than by summing the bot families, so a
      // family the pattern fails to recognize lands in "automated" instead of
      // vanishing from both totals.
      automatedPageViews: Math.max(0, pageViews - browserPageViews),
      requests: row.sum?.requests ?? 0,
      botFamilies,
    };
  });

  const monthly = new Map<
    string,
    { pageViews: number; browserPageViews: number; avgDailyUniques: number; days: number }
  >();
  for (const day of daily) {
    const key = day.date.slice(0, 7);
    const entry = monthly.get(key) ?? {
      pageViews: 0,
      browserPageViews: 0,
      avgDailyUniques: 0,
      days: 0,
    };
    entry.pageViews += day.pageViews;
    entry.browserPageViews += day.browserPageViews;
    // Accumulate the sum here and divide once the month is complete — summing
    // daily uniques and calling it a monthly total would be wrong.
    entry.avgDailyUniques += day.uniques;
    entry.days += 1;
    monthly.set(key, entry);
  }
  for (const entry of monthly.values()) {
    entry.avgDailyUniques = entry.days > 0 ? Math.round(entry.avgDailyUniques / entry.days) : 0;
  }

  const value: Traffic = { daily, monthly };
  cache = { at: now.getTime(), value };
  return value;
}

/** Mean of the last `days` daily unique counts. */
export function recentDailyUniques(traffic: Traffic, days: number): number {
  return meanOfLast(traffic, days, (d) => d.uniques);
}

/** Mean daily pageviews from recognized browsers over the last `days`. */
export function recentBrowserPageViews(traffic: Traffic, days: number): number {
  return meanOfLast(traffic, days, (d) => d.browserPageViews);
}

/** Share of pageviews over the last `days` that did not come from a browser. */
export function automatedShare(traffic: Traffic, days: number): number {
  const slice = traffic.daily.slice(-days);
  const total = slice.reduce((sum, d) => sum + d.pageViews, 0);
  if (total === 0) return 0;
  const automated = slice.reduce((sum, d) => sum + d.automatedPageViews, 0);
  return (automated / total) * 100;
}

function meanOfLast(traffic: Traffic, days: number, pick: (d: TrafficDay) => number): number {
  const slice = traffic.daily.slice(-days);
  if (slice.length === 0) return 0;
  return Math.round(slice.reduce((sum, d) => sum + pick(d), 0) / slice.length);
}

// ---------------------------------------------------------------------------
// Acquisition breakdowns.
//
// A deliberate note on what is NOT here: `refererHost` is not available on this
// zone's plan (the API rejects the field outright), so there is no channel or
// campaign attribution in this file and there cannot be. Cloudflare can tell you
// WHERE visitors are and WHAT they looked at, never HOW they arrived. Closing
// that gap needs first-party capture in apps/web — see the marketing section in
// README.md. Do not add a "traffic sources" section here backed by a guess.
// ---------------------------------------------------------------------------

export interface Breakdown {
  label: string;
  count: number;
}

export interface Acquisition {
  countries: Breakdown[];
  devices: Breakdown[];
  pages: Breakdown[];
  /**
   * ALL requests in the window, from a dedicated no-dimension aggregate — the
   * previous implementation summed the top-12 countries and used that as the
   * denominator, which overstated every share and let device shares exceed 100%.
   */
  total: number;
  /** 1 means unsampled; Cloudflare has already extrapolated counts, never re-multiply. */
  sampleInterval: number;
  days: number;
}

/**
 * One day, and not by choice: this plan caps the adaptive-groups dataset at a
 * 1-day time range ("cannot request a time range wider than 1d"). So every
 * breakdown below is a 24-hour snapshot, which is short enough that a single
 * crawler run can reorder the country list. Say so wherever it is displayed.
 */
const ACQ_DAYS = 1;

const ACQ_QUERY = `query { viewer { zones(filter: {zoneTag: "ZONE"}) {
  total: httpRequestsAdaptiveGroups(limit: 1, filter: FILTER) {
    count avg { sampleInterval }
  }
  countries: httpRequestsAdaptiveGroups(limit: 12, filter: FILTER, orderBy: [count_DESC]) {
    count dimensions { clientCountryName }
  }
  devices: httpRequestsAdaptiveGroups(limit: 5, filter: FILTER, orderBy: [count_DESC]) {
    count dimensions { clientDeviceType }
  }
  pages: httpRequestsAdaptiveGroups(limit: 60, filter: FILTER, orderBy: [count_DESC]) {
    count dimensions { clientRequestPath }
  }
} } }`;

/**
 * Paths that are machinery rather than content. The raw top-paths list is
 * otherwise entirely internal endpoints — every page load fires a session
 * check, a like-info lookup, a geo lookup and several analytics beacons, so
 * they outrank every real page by an order of magnitude and the list tells you
 * nothing about what people actually read.
 */
const NON_CONTENT =
  /^\/(api|e|cdn-cgi|metrics|_|favicon|robots|sitemap|fonts|assets)|\.(js|css|png|svg|ico|woff2?|xml|txt|json|webmanifest)$/i;

let acqCache: { at: number; value: Acquisition } | null = null;

export async function loadAcquisition(env: Env, now: Date): Promise<Acquisition | null> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const zoneTag = env.CF_ZONE_ID?.trim();
  if (!token || !zoneTag) return null;
  if (acqCache && now.getTime() - acqCache.at < TTL_MS) return acqCache.value;

  const until = new Date(now);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - ACQ_DAYS);

  // Filters are inlined rather than passed as variables: the three sub-queries
  // reuse one filter object and the adaptive-groups filter type is per-field-set,
  // so a shared $f variable does not typecheck server-side.
  const filter = `{datetime_geq: "${since.toISOString()}", datetime_leq: "${until.toISOString()}", clientRequestHTTPHost: "grabient.com"}`;
  const query = ACQ_QUERY.replace(/ZONE/g, zoneTag).replace(/FILTER/g, filter);

  let payload: any;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      console.error(`Cloudflare acquisition HTTP ${res.status}`);
      return null;
    }
    payload = await res.json();
  } catch (err) {
    console.error("Cloudflare acquisition fetch failed", err);
    return null;
  }
  if (payload?.errors?.length) {
    console.error(
      "Cloudflare acquisition GraphQL error",
      JSON.stringify(payload.errors).slice(0, 300),
    );
    return null;
  }

  const zone = payload?.data?.viewer?.zones?.[0];
  if (!zone) return null;

  const map = (rows: any[], key: string): Breakdown[] =>
    (rows ?? []).map((r) => ({ label: String(r.dimensions[key] ?? "—"), count: r.count }));

  const countries = map(zone.countries, "clientCountryName");
  const value: Acquisition = {
    countries,
    devices: map(zone.devices, "clientDeviceType"),
    pages: map(zone.pages, "clientRequestPath")
      .filter((p) => !NON_CONTENT.test(p.label))
      .slice(0, 12),
    // The dedicated no-dimension aggregate is the true denominator. Falling
    // back to the top-12 sum keeps the page rendering if the aggregate is ever
    // refused, at the cost of the old overstatement.
    total: zone.total?.[0]?.count ?? countries.reduce((sum, c) => sum + c.count, 0),
    sampleInterval: zone.total?.[0]?.avg?.sampleInterval ?? 1,
    days: ACQ_DAYS,
  };
  acqCache = { at: now.getTime(), value };
  return value;
}

// ---------------------------------------------------------------------------
// Traffic sources, from Cloudflare Web Analytics (RUM).
//
// This is the answer to the question the rest of this file could not answer.
// The zone request dataset has no refererHost on this plan, but the RUM dataset
// does — and it lives at the ACCOUNT level (`viewer.accounts`), not the zone
// level, which is why an earlier zone-scoped query reported it as an unknown
// field. It needs the Web Analytics site to be enabled; RUM was switched on for
// grabient.com on 2026-08-15, so nothing exists before that date.
//
// A second, unplanned benefit: RUM is a browser beacon, so crawlers that do not
// execute JavaScript never appear. These counts are already bot-free, without
// the user-agent heuristic the pageview split has to rely on.
// ---------------------------------------------------------------------------

export interface ReferrerRow {
  label: string;
  count: number;
  /** True for the bucket that is not a real acquisition source. */
  direct: boolean;
}

/** Hosts that are our own round trips, not somewhere a visitor came from. */
const SELF_REFERRERS = /^(www\.)?grabient\.com$|^accounts\.google\.com$|cloudflareaccess\.com$/i;

const RUM_DAYS = 7;

let refCache: { at: number; value: ReferrerRow[] } | null = null;

export async function loadReferrers(env: Env, now: Date): Promise<ReferrerRow[] | null> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const accountTag = env.CF_ACCOUNT_ID?.trim();
  if (!token || !accountTag) return null;
  if (refCache && now.getTime() - refCache.at < TTL_MS) return refCache.value;

  const until = new Date(now);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - RUM_DAYS);

  const query = `query($accountTag: String!, $since: Time!, $until: Time!) {
    viewer { accounts(filter: {accountTag: $accountTag}) {
      rumPageloadEventsAdaptiveGroups(limit: 40, filter: {datetime_geq: $since, datetime_leq: $until}, orderBy: [count_DESC]) {
        count dimensions { refererHost }
      }
    } }
  }`;

  let payload: any;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { accountTag, since: since.toISOString(), until: until.toISOString() },
      }),
    });
    if (!res.ok) {
      console.error(`Cloudflare RUM HTTP ${res.status}`);
      return null;
    }
    payload = await res.json();
  } catch (err) {
    console.error("Cloudflare RUM fetch failed", err);
    return null;
  }
  if (payload?.errors?.length) {
    console.error("Cloudflare RUM GraphQL error", JSON.stringify(payload.errors).slice(0, 300));
    return null;
  }

  const groups = payload?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if (!Array.isArray(groups)) return null;

  // Fold every self-referral into the direct bucket rather than dropping it:
  // an OAuth return trip or an internal link is a real pageview, it just is not
  // an acquisition source, and silently discarding it would make the source
  // percentages add up to less than the traffic.
  let direct = 0;
  const external: ReferrerRow[] = [];
  for (const row of groups) {
    const host = String(row.dimensions?.refererHost ?? "").trim();
    if (!host || SELF_REFERRERS.test(host)) direct += row.count;
    else external.push({ label: host, count: row.count, direct: false });
  }
  external.sort((a, b) => b.count - a.count);

  const value: ReferrerRow[] = [
    { label: "Direct / no referrer", count: direct, direct: true },
    ...external.slice(0, 11),
  ].filter((row) => row.count > 0);

  refCache = { at: now.getTime(), value };
  return value;
}

// ---------------------------------------------------------------------------
// The world map's data: 7 days of per-country requests from the DAILY rollup
// — unsampled, ~a year of retention, and a stable ranking, where the 24-hour
// adaptive snapshot gets reordered by a single crawler run. 220 countries in
// one query.
// ---------------------------------------------------------------------------

export interface CountryRow {
  code: string;
  requests: number;
  bytes: number;
  threats: number;
}

export interface WorldDistribution {
  rows: CountryRow[];
  totals: { requests: number; bytes: number; threats: number };
  days: number;
}

let worldCache: { at: number; days: number; value: WorldDistribution } | null = null;

/**
 * Per-country totals over the window. `countryMap` carries requests, bytes and
 * threats in the same rollup, so all three views on the globe cost ONE query —
 * and it is the daily rollup rather than the adaptive dataset because that one
 * caps at 24 hours, where a single crawler run reorders the whole ranking.
 */
export async function loadWorld(
  env: Env,
  now: Date,
  days = 7,
): Promise<WorldDistribution | null> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const zoneTag = env.CF_ZONE_ID?.trim();
  if (!token || !zoneTag) return null;
  if (worldCache && worldCache.days === days && now.getTime() - worldCache.at < TTL_MS) {
    return worldCache.value;
  }

  const until = new Date(now);
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  const query = `query($zoneTag: String!, $since: Date!, $until: Date!) {
    viewer { zones(filter: {zoneTag: $zoneTag}) {
      httpRequests1dGroups(limit: 400, filter: {date_geq: $since, date_leq: $until}) {
        sum { countryMap { clientCountryName requests bytes threats } }
      }
    } }
  }`;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { zoneTag, since: isoDay(since), until: isoDay(until) },
      }),
    });
    const payload: any = await res.json();
    if (payload?.errors?.length) {
      console.error("world query errors", JSON.stringify(payload.errors).slice(0, 200));
      return null;
    }
    const byCountry = new Map<string, CountryRow>();
    for (const day of payload?.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []) {
      for (const entry of day.sum?.countryMap ?? []) {
        const code = String(entry.clientCountryName ?? "").trim();
        if (code.length !== 2) continue;
        const row = byCountry.get(code) ?? { code, requests: 0, bytes: 0, threats: 0 };
        row.requests += entry.requests ?? 0;
        row.bytes += entry.bytes ?? 0;
        row.threats += entry.threats ?? 0;
        byCountry.set(code, row);
      }
    }
    const rows = [...byCountry.values()].sort((a, b) => b.requests - a.requests);
    const value: WorldDistribution = {
      rows,
      totals: {
        requests: rows.reduce((sum, row) => sum + row.requests, 0),
        bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
        threats: rows.reduce((sum, row) => sum + row.threats, 0),
      },
      days,
    };
    worldCache = { at: now.getTime(), days, value };
    return value;
  } catch (err) {
    console.error("world query threw", err);
    return null;
  }
}

/**
 * What this zone's analytics token can actually query.
 *
 * Cloudflare gates GraphQL datasets and fields by plan, but the schema exposes
 * everything globally — entitlement is checked at query time, so "does this
 * field exist" and "may I read it" are different questions and only the second
 * one matters. `settings` answers the second one authoritatively for OUR token:
 * `availableFields` is the list this requester may select, and the limits say
 * how far back and how wide a query may go.
 *
 * Worth having as a tool rather than a comment because the answers are
 * genuinely surprising here. Bot scores need Enterprise plus Bot Management, so
 * `botScore` is unavailable and the bot split falls back to a user-agent
 * heuristic that under-counts spoofers. `clientRefererHost` is paid-plan only.
 * An agent that can ask instead of guess will not build on a field it cannot
 * read.
 */
export async function loadCapabilities(env: Env): Promise<unknown | null> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const zoneTag = env.CF_ZONE_ID?.trim();
  if (!token || !zoneTag) return null;

  const query = `query Capabilities($zoneTag: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        settings {
          httpRequestsAdaptiveGroups { enabled availableFields notOlderThan maxDuration maxNumberOfFields maxPageSize }
          httpRequests1dGroups { enabled availableFields notOlderThan maxDuration }
          httpRequests1hGroups { enabled availableFields notOlderThan maxDuration }
          firewallEventsAdaptiveGroups { enabled availableFields notOlderThan maxDuration }
        }
      }
    }
  }`;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { zoneTag } }),
    });
    // GraphQL answers 200 even when it refuses, so the errors array is the real
    // status — a bare res.ok check reports success on a permission failure.
    const payload: any = await res.json();
    if (payload.errors?.length) {
      console.error("Capabilities query errors", JSON.stringify(payload.errors).slice(0, 300));
      return { errors: payload.errors };
    }
    return payload.data?.viewer?.zones?.[0]?.settings ?? null;
  } catch (err) {
    console.error("Capabilities query threw", err);
    return null;
  }
}

/**
 * Run an arbitrary read-only GraphQL query against Cloudflare's analytics API.
 *
 * Why a passthrough rather than one narrow tool per question. The schema has no
 * mutations, the token is read-only, and the caller is already through Access —
 * so the usual objection to passthrough does not apply. What DOES apply is
 * misinterpretation: this zone's headline number is ~59,818 "browser pageviews"
 * a day against roughly 4-6K actual people, and an agent that queries a bot
 * metric and reports it as an audience is worse than one that could not query
 * at all. So every response carries caveats derived from the datasets the query
 * names — the interpretation a narrow tool would otherwise supply.
 */
const DATASET_CAVEATS: Array<{ match: RegExp; caveat: string }> = [
    {
        match: /httpRequests(1d|1h|1m)Groups/,
        caveat:
            "Rollup dataset: UNSAMPLED and exact, but it counts every request reaching the edge. Roughly half this zone's traffic is automation and the browser/bot split is a user-agent heuristic that under-counts spoofers. Not a headcount — GA4 is the bot-filtered source for people.",
    },
    {
        match: /httpRequestsAdaptiveGroups|httpRequestsOverviewAdaptiveGroups/,
        caveat:
            "Adaptive dataset: SAMPLED (check sampleInterval; counts are already extrapolated, never re-multiply), 7-day retention, 24-HOUR maximum query window on this plan. Bot scores need Enterprise Bot Management and are unavailable; verifiedBotCategory IS available (confirmed in this zone's availableFields) and is the trustworthy bot signal here.",
    },
    {
        match: /firewallEvents/,
        caveat:
            "firewallEventsAdaptiveGroups reported itself DISABLED for this token — expect an empty or refused result.",
    },
    {
        match: /rum[A-Za-z]*Events/,
        caveat:
            "RUM comes from the browser beacon: bot-free by construction, but only counts visitors who ran JavaScript. Web Vitals values are in MICROSECONDS and negative means not-applicable, not zero. RUM is ACCOUNT-scoped — an empty result most likely means the token lacks Account Analytics Read.",
    },
    {
        match: /workersInvocations|d1Analytics|kvOperations|r2Operations/,
        caveat:
            "Account-scoped dataset. A null or error result means the analytics token is Zone-scoped and needs Account Analytics Read — a token permission change, not a code change.",
    },
];

export async function runCloudflareGraphQL(
    env: Env,
    query: string,
    variables: Record<string, unknown> = {},
): Promise<unknown | null> {
    const token = env.CF_ANALYTICS_TOKEN?.trim();
    if (!token) return null;
    // The analytics schema exposes no mutations; refusing the keyword makes the
    // read-only contract explicit rather than incidental.
    if (/\bmutation\b/i.test(query)) {
        return {
            data: null,
            errors: [{ message: "Mutations are not permitted by this tool." }],
            // The tool description promises every response carries caveats;
            // the refusal path used to be the one that did not.
            caveats: ["Refused before reaching Cloudflare. The analytics schema exposes no mutations anyway."],
            zoneTag: env.CF_ZONE_ID ?? null,
        };
    }

    const caveats = DATASET_CAVEATS.filter(({ match }) => match.test(query)).map(
        ({ caveat }) => caveat,
    );

    // The zone and account tags are secrets the caller cannot know, so supply
    // them for any query that declares them. Caller-supplied values still win,
    // which keeps the tool usable for a different zone if one is ever added.
    const merged = {
        zoneTag: env.CF_ZONE_ID ?? "",
        accountTag: env.CF_ACCOUNT_ID ?? "",
        ...variables,
    };

    try {
        const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: merged }),
        });
        // GraphQL answers 200 even when it refuses; the errors array is the status.
        const payload: any = await res.json();
        return {
            data: payload.data ?? null,
            errors: payload.errors ?? null,
            caveats: caveats.length
                ? caveats
                : ["No dataset-specific caveat matched. Check what the numbers include before reporting them."],
            // Echoed so the agent can see which zone answered without ever
            // needing to hold the id itself.
            zoneTag: env.CF_ZONE_ID ?? null,
            accountTag: env.CF_ACCOUNT_ID ?? null,
        };
    } catch (err) {
        console.error("Cloudflare GraphQL passthrough threw", err);
        return null;
    }
}

/**
 * Read-only Cloudflare REST, for everything the GraphQL analytics API cannot
 * answer.
 *
 * `runCloudflareGraphQL` covers metrics; it cannot tell you when a Worker was
 * deployed, what a zone setting is, or which D1 databases exist. Those live on
 * the REST API, and without them an agent cannot answer "did this change when
 * we shipped?" — the question deploy markers exist to serve.
 *
 * Two boundaries, both here rather than in the caller. Method is GET, always:
 * this token can write, and the read-only contract is enforced by never
 * offering another verb. Path must match a prefix below, so a caller cannot
 * reach billing, membership or token management even though the credential
 * technically could.
 */
const REST_BASE = "https://api.cloudflare.com/client/v4";

const REST_ALLOWED = [
  /^\/accounts\/[^/]+\/workers\/scripts(\/|$)/,
  /^\/accounts\/[^/]+\/workers\/deployments(\/|$)/,
  /^\/accounts\/[^/]+\/workers\/services(\/|$)/,
  /^\/accounts\/[^/]+\/d1\/database(\/|$)/,
  /^\/accounts\/[^/]+\/vectorize(\/|$)/,
  /^\/accounts\/[^/]+\/storage\/kv\/namespaces(\/|$)/,
  /^\/zones(\/[^/]+)?$/,
  /^\/zones\/[^/]+\/settings(\/|$)/,
  /^\/zones\/[^/]+\/dns_records(\/|$)/,
  /^\/zones\/[^/]+\/rulesets(\/|$)/,
];

export async function runCloudflareRest(
  env: Env,
  path: string,
): Promise<Record<string, unknown>> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  if (!token)
    return { configured: false, unavailableReason: "CF_ANALYTICS_TOKEN is not set." };

  // Substitute the ids rather than making the caller know them, matching how
  // runCloudflareGraphQL injects zoneTag/accountTag.
  const resolved = path
    .replace(/\{account\}/g, env.CF_ACCOUNT_ID ?? "")
    .replace(/\{zone\}/g, env.CF_ZONE_ID ?? "");
  const [pathname] = resolved.split("?");
  if (!pathname.startsWith("/"))
    return { ok: false, refused: "Path must start with '/'." };
  if (!REST_ALLOWED.some((re) => re.test(pathname)))
    return {
      ok: false,
      refused: `${pathname} is not in the read-only path allow-list.`,
      allowed: REST_ALLOWED.map(String),
    };

  try {
    const res = await fetch(`${REST_BASE}${resolved}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json();
    if (!res.ok || body?.success === false)
      return {
        ok: false,
        status: res.status,
        errors: body?.errors ?? null,
        hint:
          res.status === 403
            ? "CF_ANALYTICS_TOKEN lacks the permission for this path. Its scope is analytics-oriented; widening it is a dashboard change."
            : undefined,
      };
    return { ok: true, path: resolved, result: body?.result, result_info: body?.result_info };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}
