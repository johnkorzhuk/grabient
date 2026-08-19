// One collector per source. Each takes (env, now, trailingDays|null) and
// returns MetricPoint[] — fetch and map only, no writes; the caller decides
// where they land. null trailing means "everything the source will give",
// which is what the backfill wants.
//
// Collectors REUSE the query paths the dashboard already exercises
// (querySearchConsole, queryGa4, loadTraffic) rather than duplicating API
// strings — the numbers in the archive and the numbers on the live cards must
// come from the same code or they will drift apart and someone will file the
// difference as a bug.

import type { MetricPoint } from "./db";
import { queryGa4 } from "./ga4";
import { isoDay } from "./range";
import { slugify } from "./metrics";
import { querySearchConsole } from "./search-console";
import { loadTraffic } from "./traffic";

/** How far back each daily run re-fetches, so late upstream revisions heal. */
export const TRAILING_DAYS = { gsc: 7, ga4: 3, cf: 3, d1: 2 } as const;
/** Days within which a value is still provisional (source may revise). */
export const FINALITY_DAYS = { gsc: 3, ga4: 2, cf: 1, d1: 0 } as const;

const dayMs = 86_400_000;

function provisionalAfter(now: Date, finalityDays: number): string {
  // Days STRICTLY AFTER this are provisional.
  return isoDay(new Date(now.getTime() - (finalityDays + 1) * dayMs));
}

/** GA4 returns date dimension values as "20260816"; the archive speaks ISO. */
function ga4Day(raw: string): string | null {
  return /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}` : null;
}

export async function collectGsc(
  env: Env,
  now: Date,
  trailingDays: number | null,
): Promise<MetricPoint[]> {
  const days = trailingDays ?? 400; // the property is young; extra days return nothing
  const result = await querySearchConsole(env, now, {
    dimensions: ["date"],
    days,
    dataState: "all",
    limit: 1000,
  });
  if (!result || result.refused) return [];
  const cutoff = provisionalAfter(now, FINALITY_DAYS.gsc);
  const points: MetricPoint[] = [];
  for (const row of result.rows) {
    const day = row.key;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const provisional = day > cutoff;
    points.push(
      { key: "gsc.clicks", day, value: row.clicks, provisional },
      { key: "gsc.impressions", day, value: row.impressions, provisional },
      { key: "gsc.ctr", day, value: row.ctr, provisional },
      ...(row.position !== undefined
        ? [{ key: "gsc.position", day, value: row.position, provisional }]
        : []),
    );
  }
  return points;
}

export async function collectGa4(
  env: Env,
  now: Date,
  trailingDays: number | null,
): Promise<MetricPoint[]> {
  const days = trailingDays ?? 430; // GA4 has no lookback wall; pre-property days return no rows
  const cutoff = provisionalAfter(now, FINALITY_DAYS.ga4);
  const points: MetricPoint[] = [];

  const totals = await queryGa4(env, now, {
    dimensions: ["date"],
    metrics: ["sessions", "screenPageViews", "activeUsers", "newUsers", "engagedSessions"],
    days,
    limit: 1000,
  });
  for (const row of totals?.rows ?? []) {
    const day = ga4Day(String(row.date ?? ""));
    if (!day) continue;
    const provisional = day > cutoff;
    points.push(
      { key: "ga4.sessions", day, value: Number(row.sessions ?? 0), provisional },
      { key: "ga4.pageviews", day, value: Number(row.screenPageViews ?? 0), provisional },
      { key: "ga4.users", day, value: Number(row.activeUsers ?? 0), provisional },
      { key: "ga4.new_users", day, value: Number(row.newUsers ?? 0), provisional },
      { key: "ga4.engaged_sessions", day, value: Number(row.engagedSessions ?? 0), provisional },
    );
  }

  // Channels are date x channel, so the row count is days x ~10 and the API
  // caps a response at 1,000 rows. A 430-day backfill therefore returned about
  // 100 days in GA4's own order and reported success — silently truncating the
  // exact series two of the five goals are measured on. Page through it.
  const channelRows: Array<Record<string, string | number>> = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await queryGa4(env, now, {
      dimensions: ["date", "sessionDefaultChannelGroup"],
      metrics: ["sessions", "screenPageViews"],
      days,
      limit: 1000,
      offset,
    });
    const rows = page?.rows ?? [];
    channelRows.push(...rows);
    if (page?.meta.otherRow) {
      console.error(
        "GA4 folded low-frequency channels into (other); per-channel history for this window is lossy.",
      );
    }
    // Stop on a short page, or once every matching row has been collected.
    if (rows.length < 1000 || channelRows.length >= (page?.rowCount ?? 0)) break;
    if (offset > 20_000) break; // hard stop; nothing legitimate reaches this
  }
  for (const row of channelRows) {
    const day = ga4Day(String(row.date ?? ""));
    if (!day) continue;
    const channel = slugify(String(row.sessionDefaultChannelGroup ?? "unassigned"));
    const provisional = day > cutoff;
    points.push(
      {
        key: `ga4.sessions.${channel}`,
        day,
        value: Number(row.sessions ?? 0),
        provisional,
        meta: { label: row.sessionDefaultChannelGroup },
      },
      {
        key: `ga4.pageviews.${channel}`,
        day,
        value: Number(row.screenPageViews ?? 0),
        provisional,
      },
    );
  }
  return points;
}

/** browserMap families that are named crawlers we track as first-class keys. */
const NAMED_CRAWLERS: Record<string, string> = {
  GoogleBot: "cf.bot.googlebot",
  BingBot: "cf.bot.bingbot",
  AppleBot: "cf.bot.applebot",
  YandexBot: "cf.bot.yandexbot",
};

export async function collectCloudflare(
  env: Env,
  now: Date,
  trailingDays: number | null,
): Promise<MetricPoint[]> {
  const traffic = await loadTraffic(env, now);
  if (!traffic) return [];
  const cutoff = provisionalAfter(now, FINALITY_DAYS.cf);
  const slice = trailingDays === null ? traffic.daily : traffic.daily.slice(-trailingDays);
  const points: MetricPoint[] = [];
  for (const day of slice) {
    const provisional = day.date > cutoff;
    points.push(
      // meta carries the FULL family map: a crawler we did not name a key for
      // stays recoverable a year later, after Cloudflare ages the data out.
      { key: "cf.pageviews", day: day.date, value: day.pageViews, provisional, meta: { families: day.botFamilies } },
      { key: "cf.browser_pageviews", day: day.date, value: day.browserPageViews, provisional },
      { key: "cf.automated_pageviews", day: day.date, value: day.automatedPageViews, provisional },
      { key: "cf.uniques", day: day.date, value: day.uniques, provisional },
      { key: "cf.requests", day: day.date, value: day.requests, provisional },
    );
    for (const [family, key] of Object.entries(NAMED_CRAWLERS)) {
      const views = day.botFamilies[family];
      if (views !== undefined) points.push({ key, day: day.date, value: views, provisional });
    }
  }
  return points;
}

/**
 * Product counts from the PRODUCTION database (read-only binding). Cumulative
 * series are recomputed exactly from created_at, so this collector always
 * derives full history and slices — the queries are tiny (thousands of rows
 * grouped to hundreds).
 */
export async function collectD1(
  env: Env,
  now: Date,
  trailingDays: number | null,
): Promise<MetricPoint[]> {
  const dayExpr = (col: string) => `date(${col} / 1000, 'unixepoch')`;
  const [signups, likes, palettes, firstLikes] = await env.DB.batch<any>([
    env.DB.prepare(`SELECT ${dayExpr("created_at")} AS day, COUNT(*) AS n FROM auth_user GROUP BY day ORDER BY day`),
    env.DB.prepare(`SELECT ${dayExpr("created_at")} AS day, COUNT(*) AS n FROM likes GROUP BY day ORDER BY day`),
    env.DB.prepare(`SELECT ${dayExpr("created_at")} AS day, COUNT(*) AS n FROM palettes GROUP BY day ORDER BY day`),
    env.DB.prepare(
      `SELECT ${dayExpr("first_like")} AS day, COUNT(*) AS n
         FROM (SELECT user_id, MIN(created_at) AS first_like FROM likes GROUP BY user_id)
        GROUP BY day ORDER BY day`,
    ),
  ]);

  const today = isoDay(now);
  const points: MetricPoint[] = [];
  // One rule for every point, whichever branch produced it: today is still
  // being written, everything older is settled. The previous version had this
  // backwards — a carry-forward on a quiet day was marked provisional and,
  // because a quiet day has no activity row, was never re-upserted, so the
  // dashed "still settling" tail became a dashed history; meanwhile an active
  // day's cumulative total was written FINAL by the nightly snapshot, hours
  // before the day it described had actually ended.
  const emit = (rows: Array<{ day: string; n: number }>, dailyKey: string | null, cumulativeKey: string | null) => {
    const byDay = new Map(rows.filter((r) => r.day && r.day <= today).map((r) => [r.day, r.n]));
    const first = rows.find((r) => r.day && r.day <= today)?.day;
    if (!first) return;

    // A CUMULATIVE series gets a point every single day, not just days with
    // activity. A quiet Sunday does not mean the account count stopped
    // existing — but an absent row is indistinguishable from a failed
    // collection, so leaving the hole made the charts and metrics_history
    // report a gap on a day nothing was wrong with. Daily counts, by
    // contrast, are genuinely zero on a quiet day and are written as zero.
    let total = 0;
    for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${today}T00:00:00Z`); t += dayMs) {
      const day = new Date(t).toISOString().slice(0, 10);
      const n = byDay.get(day) ?? 0;
      total += n;
      const provisional = day >= today;
      if (dailyKey) points.push({ key: dailyKey, day, value: n, provisional });
      if (cumulativeKey) points.push({ key: cumulativeKey, day, value: total, provisional });
    }
  };
  emit(signups.results ?? [], "d1.signups", "d1.users");
  emit(likes.results ?? [], "d1.likes_new", "d1.likes");
  emit(palettes.results ?? [], null, "d1.palettes");
  emit(firstLikes.results ?? [], null, "d1.activated");

  if (trailingDays === null) return points;
  const cutoff = isoDay(new Date(now.getTime() - trailingDays * dayMs));
  return points.filter((p) => p.day >= cutoff);
}

/**
 * Verified-bot categories from the adaptive dataset: trustworthy, but capped
 * at a 24-hour window with ~7-day retention — one day per call, no backfill
 * beyond that. Collected for YESTERDAY (a complete UTC day).
 */
export async function collectVerifiedBots(
  env: Env,
  now: Date,
  daysBack = 1,
): Promise<MetricPoint[]> {
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const zoneTag = env.CF_ZONE_ID?.trim();
  if (!token || !zoneTag) return [];
  const points: MetricPoint[] = [];
  for (let back = daysBack; back >= 1; back--) {
    const dayStart = new Date(now.getTime() - back * dayMs);
    const day = isoDay(dayStart);
    const query = `query($zoneTag: String!, $since: Time!, $until: Time!) {
      viewer { zones(filter: {zoneTag: $zoneTag}) {
        httpRequestsAdaptiveGroups(limit: 25, filter: {datetime_geq: $since, datetime_lt: $until}, orderBy: [count_DESC]) {
          count dimensions { verifiedBotCategory }
        }
      } }
    }`;
    try {
      const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: {
            zoneTag,
            since: `${day}T00:00:00Z`,
            until: `${isoDay(new Date(dayStart.getTime() + dayMs))}T00:00:00Z`,
          },
        }),
      });
      const payload: any = await res.json();
      if (payload?.errors?.length) {
        console.error("verifiedBot query errors", JSON.stringify(payload.errors).slice(0, 200));
        continue;
      }
      const groups = payload?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
      for (const g of groups) {
        const category = String(g.dimensions?.verifiedBotCategory ?? "").trim();
        if (!category) continue; // unverified traffic has an empty category
        points.push({ key: `cf.verified_bot.${slugify(category)}`, day, value: g.count ?? 0, meta: { label: category } });
      }
    } catch (err) {
      console.error("verifiedBot fetch failed", err);
    }
  }
  return points;
}
