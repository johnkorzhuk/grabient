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

/** The read-only contract. Anything not listed here cannot be called. */
const READ_METHODS = new Set([
  "GetRankAndTrafficStats",
  "GetQueryStats",
  "GetPageStats",
  "GetCrawlStats",
  "GetUrlSubmissionQuota",
]);

/** ".NET JSON date" -> ISO day. "/Date(1316156400000-0700)/" */
export function dotNetDay(raw: unknown): string | null {
  const match = /\/Date\((\d+)/.exec(String(raw ?? ""));
  return match ? new Date(Number(match[1])).toISOString().slice(0, 10) : null;
}

export async function bingFetch(
  env: Env,
  method: string,
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
    const url = `${API_BASE}/${method}?apikey=${encodeURIComponent(key)}&siteUrl=${encodeURIComponent(SITE)}`;
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
    return { ok: true, d: payload?.d };
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
