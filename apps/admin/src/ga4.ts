// Google Analytics 4 — the only bot-filtered view of real people on the site.
//
// Why this exists alongside traffic.ts. Cloudflare counts every request that
// reaches the zone, which is the honest number for load and cost but includes
// automation: through most of 2026 roughly half of grabient's "browser"
// pageviews came from clients spoofing a browser user agent, and on flood days
// the raw figure ran 10-50x the real one. GA4 runs in the page through Zaraz,
// so a crawler that never executes JavaScript never appears — which makes it
// the closest thing to a headcount this project has, and the only source that
// can attribute a visit to a channel.
//
// Read with the same service account as Search Console (Viewer on the
// property), so no new credential: only GA4_PROPERTY_ID, and even that has a
// sensible default.

import {
  SCOPE_ANALYTICS,
  accessToken,
  parseServiceAccount,
} from "./google-auth";
import { resolveWindow } from "./range";

const API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const WINDOW_DAYS = 28;
const TTL_MS = 30 * 60 * 1000;

export interface Ga4Row {
  key: string;
  sessions: number;
  users: number;
  /** Share of sessions that were engaged, as a percentage. */
  engagementPct: number;
  avgSessionSeconds: number;
}

export interface Ga4PageRow {
  path: string;
  views: number;
  users: number;
}

/**
 * A referring page and where it points — i.e. a backlink that is demonstrably
 * sending traffic, which is the one thing no free backlink tool can tell you.
 *
 * `sessionSource` (already reported above) collapses to a host, so
 * "dev.to" tells you nothing about which post. `pageReferrer` is the full
 * referring URL, so paired with the landing page it reads as a link graph.
 */
export interface Ga4ReferrerRow {
  referrer: string;
  landingPage: string;
  sessions: number;
}

export interface Ga4 {
  totals: { sessions: number; users: number; newUsers: number; pageViews: number };
  channels: Ga4Row[];
  sources: Array<{ key: string; sessions: number }>;
  pages: Ga4PageRow[];
  referrers: Ga4ReferrerRow[];
  days: number;
  property: string;
}

let cache: { at: number; days: number; value: Ga4 } | null = null;

interface ReportRequest {
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: number;
  orderBys?: unknown[];
}

async function runReport(
  property: string,
  token: string,
  body: ReportRequest,
  days = WINDOW_DAYS,
): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/${property}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }],
        ...body,
      }),
    });
    if (!res.ok) {
      // The most common failure by far is the Data API not being enabled on the
      // Cloud project, which returns a 403 naming the activation URL — worth
      // keeping in the log rather than collapsing to "GA4 unavailable".
      console.error(`GA4 report failed (${res.status})`, (await res.text()).slice(0, 300));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("GA4 report threw", err);
    return null;
  }
}

const num = (row: any, index: number): number =>
  Number(row?.metricValues?.[index]?.value ?? 0);
const dim = (row: any, index = 0): string => String(row?.dimensionValues?.[index]?.value ?? "—");

/**
 * Null when unconfigured or when Google refuses — same contract as traffic.ts
 * and search-console.ts, so the dashboard drops the section rather than failing.
 */
export async function loadGa4(
  env: Env,
  now: Date,
  /** Window length in days; the page's range selector drives it. */
  days = WINDOW_DAYS,
): Promise<Ga4 | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const propertyId = env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) return null;
  // Keyed by window — see the same note in search-console.ts.
  if (cache && cache.days === days && now.getTime() - cache.at < TTL_MS) return cache.value;

  const token = await accessToken(account, SCOPE_ANALYTICS, now);
  if (!token) return null;
  const property = `properties/${propertyId.replace(/^properties\//, "")}`;

  const [totalsRes, channelsRes, sourcesRes, pagesRes, referrersRes] = await Promise.all([
    runReport(property, token, {
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
      ],
    }, days),
    runReport(property, token, {
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
      limit: 12,
    }, days),
    runReport(property, token, {
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      limit: 12,
    }, days),
    runReport(property, token, {
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      limit: 12,
    }, days),
    // Live backlinks. GSC's Links report has no API and samples heavily; the
    // Common Crawl webgraph is domain-level and three months stale. This is the
    // only source that names the referring *page* and proves it sends traffic.
    //
    // NOT verified against the live property: `pageReferrer` is event-scoped
    // and `landingPagePlusQueryString` is session-scoped, and GA4 rejects some
    // cross-scope pairings via checkCompatibility. If this one is rejected,
    // runReport logs the 400 and returns null, so `referrers` is simply empty
    // and nothing else changes — check the Worker log after the first deploy,
    // and fall back to `sessionSource` + `landingPagePlusQueryString` if so.
    runReport(property, token, {
      dimensions: [{ name: "pageReferrer" }, { name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }],
      limit: 40,
    }, days),
  ]);

  if (!totalsRes) return null;

  const totalsRow = totalsRes.rows?.[0];
  const value: Ga4 = {
    totals: {
      sessions: num(totalsRow, 0),
      users: num(totalsRow, 1),
      newUsers: num(totalsRow, 2),
      pageViews: num(totalsRow, 3),
    },
    channels: (channelsRes?.rows ?? []).map((row: any) => ({
      key: dim(row),
      sessions: num(row, 0),
      users: num(row, 1),
      engagementPct: num(row, 2) * 100,
      avgSessionSeconds: num(row, 3),
    })),
    sources: (sourcesRes?.rows ?? []).map((row: any) => ({
      key: dim(row),
      sessions: num(row, 0),
    })),
    pages: (pagesRes?.rows ?? []).map((row: any) => ({
      path: dim(row),
      views: num(row, 0),
      users: num(row, 1),
    })),
    // Self-referrals and the empty referrer are round trips and direct traffic,
    // not inbound links, so they would drown the rows that matter.
    referrers: (referrersRes?.rows ?? [])
      .map((row: any) => ({
        referrer: String(row?.dimensionValues?.[0]?.value ?? ""),
        landingPage: String(row?.dimensionValues?.[1]?.value ?? ""),
        sessions: num(row, 0),
      }))
      .filter(
        (row: Ga4ReferrerRow) =>
          row.referrer &&
          row.referrer !== "(not set)" &&
          !/^https?:\/\/(www\.)?grabient\.com/i.test(row.referrer),
      )
      .slice(0, 20),
    days,
    property,
  };

  cache = { at: now.getTime(), days, value };
  return value;
}

export interface Ga4QueryOptions {
  dimensions?: string[];
  metrics?: string[];
  /** Explicit inclusive ISO dates win over `days`. `end` accepts "today"/"yesterday". */
  start?: string;
  end?: string;
  days?: number;
  /** Adds the equal-length window immediately before as `previous`. */
  compare?: boolean;
  /**
   * REQUIRED for any top-N reading: without it GA4 returns its own ordering
   * over (currently) ~15,700 distinct paths, and "top pages" is just "25
   * arbitrary pages". Field names are matched against `metrics` to decide
   * whether to sort as a metric or a dimension.
   */
  orderBy?: Array<{ field: string; desc?: boolean }>;
  /** Raw GA4 FilterExpression objects, passed through verbatim. */
  filter?: Record<string, unknown>;
  metricFilter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface Ga4Window {
  start: string;
  end: string;
  rows: Array<Record<string, string | number>>;
  /** GA4's own TOTAL aggregation row — true totals, not a sum of the page. */
  totals: Record<string, number> | null;
  /** Rows matching the query, of which `rows.length` were returned. */
  rowCount: number;
}

export interface Ga4QueryResult extends Ga4Window {
  property: string;
  previous: Ga4Window | null;
  meta: {
    timeZone: string | null;
    /** True when rows were WITHHELD for privacy thresholds — absent ≠ zero. */
    thresholded: boolean;
    /** True when low-frequency values were rolled into "(other)" — breakdown lossy, totals right. */
    otherRow: boolean;
    sampled: boolean;
    quota: { tokensRemainingDay: number | null; tokensRemainingHour: number | null };
  };
}

/**
 * Sessions per country — the globe's bot-filtered view.
 *
 * `countryId` is ISO-3166 alpha-2, which is exactly what the map's centroid
 * table is keyed on; the human-readable `country` dimension is not, and
 * matching on names would break on every localisation.
 */
export async function loadGa4Countries(
  env: Env,
  now: Date,
  days = WINDOW_DAYS,
): Promise<Array<{ code: string; sessions: number }> | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const propertyId = env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) return null;
  const token = await accessToken(account, SCOPE_ANALYTICS, now);
  if (!token) return null;
  const property = `properties/${propertyId.replace(/^properties\//, "")}`;
  const res = await runReport(
    property,
    token,
    {
      dimensions: [{ name: "countryId" }],
      metrics: [{ name: "sessions" }],
      limit: 250,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
    days,
  );
  if (!res) return null;
  return (res.rows ?? [])
    .map((row: any) => ({ code: dim(row).toUpperCase(), sessions: num(row, 0) }))
    .filter((row: { code: string }) => row.code.length === 2);
}

/**
 * Arbitrary GA4 reports, for the MCP tools. Same reasoning as
 * `querySearchConsole`: the dashboard wants one fixed shape, an agent wants the
 * API's. Dimension and metric names are passed through to Google, which
 * validates them and returns a descriptive error for a typo — better than
 * maintaining a partial allow-list here that goes stale.
 *
 * Dates are property-local (this property: America/Los_Angeles), echoed in
 * `meta.timeZone` — a GA4 "day" and a Cloudflare UTC "day" are up to 8 hours
 * apart, which matters for same-day joins, not for trends.
 */
export async function queryGa4(
  env: Env,
  now: Date,
  options: Ga4QueryOptions = {},
): Promise<Ga4QueryResult | null> {
  const account = parseServiceAccount(env.GSC_SERVICE_ACCOUNT);
  if (!account) return null;
  const propertyId = env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) return null;
  const token = await accessToken(account, SCOPE_ANALYTICS, now);
  if (!token) return null;

  const property = `properties/${propertyId.replace(/^properties\//, "")}`;
  const dimensions = (options.dimensions ?? []).map((name) => ({ name }));
  const metricNames = options.metrics?.length ? options.metrics : ["sessions"];
  const metrics = metricNames.map((name) => ({ name }));
  const window = resolveWindow(now, options, { days: WINDOW_DAYS, lagDays: 1, maxDays: 365 });

  const orderBys = (options.orderBy ?? []).map(({ field, desc }) =>
    metricNames.includes(field)
      ? { metric: { metricName: field }, desc: desc ?? true }
      : { dimension: { dimensionName: field } , desc: desc ?? true },
  );

  const runWindow = async (start: string, end: string): Promise<{ payload: any } > => {
    const res = await fetch(`${API_BASE}/${property}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions,
        metrics,
        ...(orderBys.length ? { orderBys } : {}),
        ...(options.filter ? { dimensionFilter: options.filter } : {}),
        ...(options.metricFilter ? { metricFilter: options.metricFilter } : {}),
        limit: Math.max(1, Math.min(1000, options.limit ?? 25)),
        offset: Math.max(0, options.offset ?? 0),
        metricAggregations: ["TOTAL"],
        returnPropertyQuota: true,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      console.error(`GA4 query failed (${res.status})`, detail);
      throw new Error(`GA4 rejected the report: ${detail}`);
    }
    return { payload: await res.json() };
  };

  const mapWindow = (payload: any, start: string, end: string): Ga4Window => {
    const dimHeaders: string[] = (payload.dimensionHeaders ?? []).map((h: any) => h.name);
    const metHeaders: string[] = (payload.metricHeaders ?? []).map((h: any) => h.name);
    const totalsRow = payload.totals?.[0];
    return {
      start,
      end,
      rows: (payload.rows ?? []).map((row: any) => {
        const out: Record<string, string | number> = {};
        dimHeaders.forEach((name, i) => {
          out[name] = row.dimensionValues?.[i]?.value ?? "";
        });
        metHeaders.forEach((name, i) => {
          out[name] = Number(row.metricValues?.[i]?.value ?? 0);
        });
        return out;
      }),
      totals: totalsRow
        ? Object.fromEntries(
            metHeaders.map((name, i) => [name, Number(totalsRow.metricValues?.[i]?.value ?? 0)]),
          )
        : null,
      rowCount: payload.rowCount ?? (payload.rows?.length ?? 0),
    };
  };

  const { payload } = await runWindow(window.since, window.until);
  const current = mapWindow(payload, window.since, window.until);

  let previous: Ga4Window | null = null;
  if (options.compare) {
    try {
      const prev = await runWindow(window.prevSince, window.prevUntil);
      previous = mapWindow(prev.payload, window.prevSince, window.prevUntil);
    } catch {
      // A refused comparison window degrades to "no comparison", not a failure
      // of the primary answer.
      previous = null;
    }
  }

  const quota = payload.propertyQuota ?? {};
  return {
    property,
    ...current,
    previous,
    meta: {
      timeZone: payload.metadata?.timeZone ?? null,
      thresholded: payload.metadata?.subjectToThresholding === true,
      otherRow: payload.metadata?.dataLossFromOtherRow === true,
      sampled: (payload.metadata?.samplingMetadatas ?? []).length > 0,
      quota: {
        tokensRemainingDay: quota.tokensPerDay?.remaining ?? null,
        tokensRemainingHour: quota.tokensPerHour?.remaining ?? null,
      },
    },
  };
}
