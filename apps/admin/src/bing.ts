// Bing Webmaster Tools — the second index's view of the corpus.
//
// The JSON API is GET https://ssl.bing.com/webmaster/api.svc/json/{Method}
// with the key as ?apikey=. THE KEY HAS NO SCOPING — it is per-user and
// grants writes too, so the read-only contract lives HERE as a hardcoded
// method allow-list, exactly as runCloudflareGraphQL refuses mutations.
// Responses come wrapped in {"d": ...} with .NET /Date(ms±zzzz)/ timestamps.
//
// What Bing offers that Google does not: GetCrawlStats returns a daily
// aggregate `InIndex` count — a "pages indexed" series Google only exposes as
// 2,000 per-URL inspections a day. The AI Performance report has NO API
// (verified 2026-08-17); it must be read by a human in the Bing UI.

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const SITE = "https://grabient.com/";

/**
 * The read-only contract. Anything not listed here cannot be called.
 *
 * These are the 36 read methods on Microsoft's own IWebmasterApi interface
 * (the other 26 mutate and are deliberately absent — see
 * infra-research/bing-api-surface.md). The list is by METHOD NAME, not HTTP
 * verb, because the verb does not separate the two: GetChildrenUrlInfo is a
 * read that POSTs and SubmitUrl is a write that POSTs.
 */
const READ_METHODS = new Set([
  // Group A + B — take siteUrl (some also take page/url/link params)
  "GetActivePagePreviewBlocks",
  "GetBlockedUrls",
  "GetChildrenUrlInfo",
  "GetChildrenUrlTrafficInfo",
  "GetConnectedPages",
  "GetContentSubmissionQuota",
  "GetCountryRegionSettings",
  "GetCrawlIssues",
  "GetCrawlSettings",
  "GetCrawlStats",
  "GetDeepLink",
  "GetDeepLinkAlgoUrls",
  "GetDeepLinkBlocks",
  "GetFeedDetails",
  "GetFeeds",
  "GetFetchedUrlDetails",
  "GetFetchedUrls",
  "GetLinkCounts",
  "GetPageQueryStats",
  "GetPageStats",
  "GetQueryPageDetailStats",
  "GetQueryPageStats",
  "GetQueryParameters",
  "GetQueryStats",
  "GetQueryTrafficStats",
  "GetRankAndTrafficStats",
  "GetSiteMoves",
  "GetSiteRoles",
  "GetUrlInfo",
  "GetUrlLinks",
  "GetUrlSubmissionQuota",
  "GetUrlTrafficInfo",
  // Group C — no siteUrl at all
  "GetKeyword",
  "GetKeywordStats",
  "GetRelatedKeywords",
  "GetUserSites",
]);

export { READ_METHODS };

/**
 * Keyword research and the account listing are user-scoped, not site-scoped.
 * Sending siteUrl to these is not merely redundant — it is not part of their
 * signature.
 */
const NO_SITE_URL = new Set([
  "GetKeyword",
  "GetKeywordStats",
  "GetRelatedKeywords",
  "GetUserSites",
]);

/**
 * GetUserSites returns this account's site-ownership secrets. Those verify
 * control of a domain to Bing, so they must never reach a model's context or a
 * log line — the method stays callable because knowing which sites exist is
 * legitimately useful, but the proof-of-ownership is stripped.
 */
const REDACT_FIELDS = new Set(["AuthenticationCode", "DnsVerificationCode"]);

/** Strip ownership secrets wherever they appear, at any depth. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = REDACT_FIELDS.has(k) ? "[redacted: site-ownership secret]" : redact(v);
    return out;
  }
  return value;
}

/** ".NET JSON date" -> ISO day. "/Date(1316156400000-0700)/" */
export function dotNetDay(raw: unknown): string | null {
  const match = /\/Date\((\d+)/.exec(String(raw ?? ""));
  return match ? new Date(Number(match[1])).toISOString().slice(0, 10) : null;
}

export async function bingFetch(
  env: Env,
  method: string,
  params: Record<string, string | number> = {},
): Promise<
  | { ok: true; d: any }
  | { ok: false; configured: boolean; status?: number; message: string }
> {
  const key = env.BING_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      configured: false,
      message:
        "BING_API_KEY is not set. Generate one in Bing Webmaster Tools settings and `wrangler secret put BING_API_KEY`. Note the key is per-user and grants WRITES — this client's method allow-list is the read-only boundary.",
    };
  }
  if (!READ_METHODS.has(method)) {
    return { ok: false, configured: true, message: `Method ${method} is not in the read-only allow-list.` };
  }
  try {
    // Several methods take more than siteUrl — GetUrlLinks needs the page being
    // asked about, the paging methods need `page`. Extra params are appended
    // rather than baked in so one client covers the whole read surface; the
    // allow-list above, not the parameter shape, is what keeps this read-only.
    const query = new URLSearchParams({ apikey: key });
    if (!NO_SITE_URL.has(method)) query.set("siteUrl", SITE);
    for (const [k, v] of Object.entries(params)) {
      if (k === "apikey" || k === "siteUrl") continue; // never let a caller retarget the key or the site
      query.set(k, String(v));
    }
    const url = `${API_BASE}/${method}?${query}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: res.status,
        message: (await res.text()).slice(0, 300),
      };
    }
    const payload: any = await res.json();
    return { ok: true, d: redact(payload?.d) };
  } catch (err) {
    return { ok: false, configured: true, message: String(err).slice(0, 300) };
  }
}

export async function bingReport(env: Env, report: string): Promise<Record<string, unknown>> {
  const method =
    report === "traffic"
      ? "GetRankAndTrafficStats"
      : report === "queries"
        ? "GetQueryStats"
        : report === "pages"
          ? "GetPageStats"
          : report === "crawl"
            ? "GetCrawlStats"
            : "GetUrlSubmissionQuota";
  const res = await bingFetch(env, method);
  if (!res.ok) {
    return { configured: res.configured, report, rows: [], unavailableReason: res.message };
  }
  const rows = Array.isArray(res.d) ? res.d : [res.d];
  const mapped = rows.map((row: any) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row ?? {})) {
      if (k === "__type") continue;
      out[k === "Date" ? "day" : k] = k === "Date" ? dotNetDay(v) : v;
    }
    return out;
  });
  return {
    configured: true,
    site: SITE,
    report,
    bucket: report === "queries" || report === "pages" ? "weekly" : "daily",
    rowCount: mapped.length,
    rows: mapped,
  };
}

import type { MetricPoint } from "./db";

/** Daily bing.* metrics for the snapshot; empty when unconfigured. */
export async function collectBing(env: Env, _now: Date): Promise<MetricPoint[]> {
  if (!env.BING_API_KEY?.trim()) return [];
  const points: MetricPoint[] = [];
  const crawl = await bingFetch(env, "GetCrawlStats");
  if (crawl.ok && Array.isArray(crawl.d)) {
    for (const row of crawl.d) {
      const day = dotNetDay(row?.Date);
      if (!day) continue;
      points.push(
        { key: "bing.crawled", day, value: Number(row.CrawledPages ?? 0) },
        { key: "bing.indexed", day, value: Number(row.InIndex ?? 0) },
      );
    }
  }
  const traffic = await bingFetch(env, "GetRankAndTrafficStats");
  if (traffic.ok && Array.isArray(traffic.d)) {
    for (const row of traffic.d) {
      const day = dotNetDay(row?.Date);
      if (!day) continue;
      points.push(
        { key: "bing.clicks", day, value: Number(row.Clicks ?? 0) },
        { key: "bing.impressions", day, value: Number(row.Impressions ?? 0) },
      );
    }
  }
  return points;
}
