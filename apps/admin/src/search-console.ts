// Google Search Console — organic search performance.
//
// This is the channel that matters for grabient.com. The top content is
// /palettes/purple, /palettes/blue, /palettes/rose; people arrive by searching
// for colours, not by clicking campaigns. Cloudflare can count those arrivals
// but cannot say what was searched for, and its refererHost dimension is not
// available on this plan — so GSC is the only source of queries, impressions,
// clicks and position.
//
// Auth is the two-legged OAuth flow for service accounts: sign a JWT assertion
// with the account's RSA key, POST it to Google's token endpoint, get a bearer
// token back. No user interaction, no refresh token to keep alive. `jose` is
// already a dependency (access.ts verifies Access assertions with it), so this
// adds nothing to the bundle.

import {
  SCOPE_SEARCH_CONSOLE,
  accessToken,
  parseServiceAccount,
} from "./google-auth";

const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3/sites";

export interface SearchRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsole {
  queries: SearchRow[];
  pages: SearchRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  days: number;
  property: string;
}

/**
 * Which property to query, discovered rather than configured.
 *
 * Search Console addresses a Domain property as `sc-domain:grabient.com` and a
 * URL-prefix property as `https://grabient.com/`. Guessing wrong does not error
 * in any obvious way — it authenticates fine and returns an empty result set,
 * which looks identical to "no search traffic". Rather than make a human know
 * which kind their property is, ask the API what this service account can see
 * and take the match. GSC_PROPERTY still overrides, for the case of several
 * properties covering the same host.
 */
async function discoverProperty(token: string): Promise<string | null> {
  try {
    const res = await fetch(API_BASE, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`GSC site list failed (${res.status})`, (await res.text()).slice(0, 200));
      return null;
    }
    const payload: any = await res.json();
    const entries: any[] = payload?.siteEntry ?? [];
    if (entries.length === 0) {
      console.error(
        "GSC returned no properties — the service account is authenticated but has not been added as a user in Search Console (Settings -> Users and permissions).",
      );
      return null;
    }
    const urls = entries
      .filter((entry) => entry.permissionLevel && entry.permissionLevel !== "siteUnverifiedUser")
      .map((entry) => String(entry.siteUrl));
    // Prefer the domain property: it covers www and bare host together, so it
    // is the superset whenever both are present.
    const domain = urls.find((url) => url.startsWith("sc-domain:") && url.includes("grabient"));
    const prefix = urls.find((url) => url.includes("grabient"));
    const chosen = domain ?? prefix ?? urls[0] ?? null;
    if (chosen) console.log(`GSC property discovered: ${chosen}`);
    return chosen;
  } catch (err) {
    console.error("GSC site list threw", err);
    return null;
  }
}

/**
 * GSC data lags a day or two, so the window ends before today.
 *
 * Was 3, which was too conservative and actively misleading for a young
 * property: with data starting 2026-08-13, a window ending at T-3 excluded
 * every populated day and the dashboard reported "no data" while the API had
 * 196 clicks. The cliff this guards against only matters for a daily series;
 * these are 28-day aggregates, where a partial final day is noise.
 */
const LAG_DAYS = 1;
const WINDOW_DAYS = 28;
const TTL_MS = 30 * 60 * 1000;

let cache: { at: number; value: SearchConsole } | null = null;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The site's real totals for the window.
 *
 * A dimensionless query returns one row: the whole property. This matters more
 * than it sounds — summing the top-15 query rows (what this used to do)
 * under-reported clicks by 56% and impressions by 78% against the true figures,
 * because the corpus has 825 query rows and because Google withholds
 * anonymized queries from dimensioned results entirely while still counting
 * them in the totals. The "no measured Google traffic" conclusion in
 * SEO-PASSOFF.md came from exactly this arithmetic.
 */
async function queryTotals(
  property: string,
  token: string,
  since: string,
  until: string,
): Promise<SearchConsole["totals"] | null> {
  const res = await fetch(
    `${API_BASE}/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: since,
        endDate: until,
        type: "web",
        dataState: "all",
      }),
    },
  );
  if (!res.ok) {
    console.error(`GSC totals query failed (${res.status})`, (await res.text()).slice(0, 200));
    return null;
  }
  const payload: any = await res.json();
  const row = payload.rows?.[0];
  if (!row) return null;
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  };
}

async function queryDimension(
  property: string,
  token: string,
  dimension: "query" | "page",
  since: string,
  until: string,
): Promise<SearchRow[]> {
  const res = await fetch(
    `${API_BASE}/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: since,
        endDate: until,
        dimensions: [dimension],
        rowLimit: 15,
        type: "web",
        // `final` (the default) lags ~2 days. On this property that meant the
        // dashboard showed one populated day where three existed. `all`
        // includes fresh, still-settling data — the right trade for a digest
        // whose job is "what is happening", not "what is archivable".
        dataState: "all",
      }),
    },
  );
  if (!res.ok) {
    console.error(`GSC ${dimension} query failed (${res.status})`, (await res.text()).slice(0, 200));
    return [];
  }
  const payload: any = await res.json();
  return (payload.rows ?? []).map((row: any) => ({
    key: row.keys?.[0] ?? "—",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  }));
}

/**
 * Returns null when unconfigured or when Google refuses — same contract as
 * traffic.ts, so the dashboard drops the section rather than failing.
 *
 * The most common cause of an authenticated-but-empty response is the property
 * string: a Domain property is addressed as `sc-domain:grabient.com`, a URL
 * prefix property as `https://grabient.com/`, and the wrong one returns 403 or
 * an empty row set rather than anything that looks like a mistake. Hence
 * GSC_PROPERTY being explicit rather than guessed.
 */
export async function loadSearchConsole(env: Env, now: Date): Promise<SearchConsole | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.value;

  const token = await accessToken(account, SCOPE_SEARCH_CONSOLE, now);
  if (!token) return null;

  // Explicit config wins; otherwise ask the API which property this account can
  // actually read, so there is one less value to get wrong.
  const property = env.GSC_PROPERTY?.trim() || (await discoverProperty(token));
  if (!property) return null;

  const until = new Date(now);
  until.setUTCDate(until.getUTCDate() - LAG_DAYS);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

  try {
    const [queries, pages, siteTotals] = await Promise.all([
      queryDimension(property, token, "query", isoDay(since), isoDay(until)),
      queryDimension(property, token, "page", isoDay(since), isoDay(until)),
      queryTotals(property, token, isoDay(since), isoDay(until)),
    ]);
    // Deliberately NOT returning null on an empty result. Null is the
    // "not configured" signal, and a property verified an hour ago legitimately
    // returns zero rows — collapsing the two would make the brief tell an agent
    // that Search Console is not connected when it is, just young. Callers
    // distinguish on `queries.length`.

    // Prefer the property's own totals. The row-sum fallback below is only for
    // the case where that request failed, and it is documented as a floor
    // rather than a total: position there is impression-weighted, since a plain
    // mean would let a keyword with three impressions at position 1 outrank the
    // whole site.
    const clicks = queries.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = queries.reduce((sum, row) => sum + row.impressions, 0);
    const weighted = queries.reduce((sum, row) => sum + row.position * row.impressions, 0);

    const value: SearchConsole = {
      queries,
      pages,
      totals: siteTotals ?? {
        clicks,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        position: impressions > 0 ? weighted / impressions : 0,
      },
      days: WINDOW_DAYS,
      property,
    };
    cache = { at: now.getTime(), value };
    return value;
  } catch (err) {
    console.error("GSC fetch failed", err);
    return null;
  }
}

/**
 * Arbitrary Search Console queries, for the MCP tools.
 *
 * `loadSearchConsole` above is shaped for the dashboard: a fixed 28-day window,
 * two dimensions, 15 rows. An agent asking "which pages lost position on mobile
 * last week" needs to choose its own dimensions, range and row count, so this
 * exposes the API's own shape instead. Same auth, same property discovery, no
 * cache — a one-off question does not benefit from a 30-minute TTL and would
 * pollute it for the dashboard.
 */
export async function querySearchConsole(
  env: Env,
  now: Date,
  options: {
    dimensions?: Array<
      "query" | "page" | "device" | "country" | "date" | "searchAppearance" | "hour"
    >;
    days?: number;
    limit?: number;
    startRow?: number;
    type?: "web" | "image" | "video" | "news" | "discover";
    /**
     * `final` is settled but ~2 days behind; `all` includes fresh partial data.
     * `hourlyAll` is REQUIRED when grouping by hour and is the only way to see
     * today at all — the API serves up to 10 days of hourly rows even though
     * the UI shows 24 hours.
     */
    dataState?: "final" | "all" | "hourlyAll";
  } = {},
): Promise<{ property: string; since: string; until: string; rows: SearchRow[] } | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const token = await accessToken(account, SCOPE_SEARCH_CONSOLE, now);
  if (!token) return null;
  const property = env.GSC_PROPERTY?.trim() || (await discoverProperty(token));
  if (!property) return null;

  const until = new Date(now);
  until.setUTCDate(until.getUTCDate() - LAG_DAYS);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - Math.max(1, Math.min(480, options.days ?? WINDOW_DAYS)));

  const dimensions = options.dimensions?.length ? options.dimensions : ["query"];
  const res = await fetch(
    `${API_BASE}/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: isoDay(since),
        endDate: isoDay(until),
        dimensions,
        rowLimit: Math.max(1, Math.min(25000, options.limit ?? 25)),
        // Paging past 25,000 rows is how you reach the 50,000/day ceiling; the
        // default of 0 keeps the common case unchanged.
        startRow: Math.max(0, options.startRow ?? 0),
        type: options.type ?? "web",
        dataState: options.dataState ?? "all",
      }),
    },
  );
  if (!res.ok) {
    console.error(`GSC query failed (${res.status})`, (await res.text()).slice(0, 200));
    return null;
  }
  const payload: any = await res.json();
  return {
    property,
    since: isoDay(since),
    until: isoDay(until),
    rows: (payload.rows ?? []).map((row: any) => ({
      key: (row.keys ?? []).join(" | ") || "—",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: (row.ctr ?? 0) * 100,
      position: row.position ?? 0,
    })),
  };
}

/**
 * Indexing status for one URL.
 *
 * The single most decision-relevant question this API answers: a page that
 * ranks badly and a page Google has never stored look identical in the
 * performance report (both contribute nothing) but need opposite fixes. This is
 * what distinguishes them. Requires `siteFullUser` permission — a restricted
 * user gets 403 — and the quota is 2,000 URLs per day.
 */
export async function inspectUrl(
  env: Env,
  now: Date,
  url: string,
): Promise<Record<string, unknown> | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const token = await accessToken(account, SCOPE_SEARCH_CONSOLE, now);
  if (!token) return null;
  const property = env.GSC_PROPERTY?.trim() || (await discoverProperty(token));
  if (!property) return null;

  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  });
  const payload: any = await res.json();
  if (!res.ok) {
    console.error(`GSC inspect failed (${res.status})`, JSON.stringify(payload).slice(0, 300));
    return null;
  }
  const index = payload?.inspectionResult?.indexStatusResult ?? {};
  return {
    url,
    property,
    verdict: index.verdict ?? null,
    coverageState: index.coverageState ?? null,
    robotsTxtState: index.robotsTxtState ?? null,
    indexingState: index.indexingState ?? null,
    lastCrawlTime: index.lastCrawlTime ?? null,
    crawledAs: index.crawledAs ?? null,
    googleCanonical: index.googleCanonical ?? null,
    userCanonical: index.userCanonical ?? null,
    sitemaps: index.sitemap ?? [],
    referringUrls: index.referringUrls ?? [],
    mobileUsability: payload?.inspectionResult?.mobileUsabilityResult?.verdict ?? null,
    richResults: payload?.inspectionResult?.richResultsResult?.verdict ?? null,
  };
}

/** Submitted sitemaps and what Google made of them. Read-only by design. */
export async function listSitemaps(
  env: Env,
  now: Date,
): Promise<{ property: string; sitemaps: unknown[] } | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const token = await accessToken(account, SCOPE_SEARCH_CONSOLE, now);
  if (!token) return null;
  const property = env.GSC_PROPERTY?.trim() || (await discoverProperty(token));
  if (!property) return null;

  const res = await fetch(`${API_BASE}/${encodeURIComponent(property)}/sitemaps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`GSC sitemaps failed (${res.status})`, (await res.text()).slice(0, 200));
    return null;
  }
  const payload: any = await res.json();
  return { property, sitemaps: payload.sitemap ?? [] };
}
