// Cloudflare-sourced tools: traffic, crawlers, cloudflare_graphql.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { change, rollingMean, splitPeriods, sum } from "../range";
import { loadAcquisition, loadTraffic, runCloudflareGraphQL } from "../traffic";
import { json, notConfigured } from "./helpers";

export function registerCloudflare(server: McpServer, env: Env) {
  server.registerTool(
    "traffic",
    {
      description:
        "Cloudflare zone analytics. view:'daily' is the trend: pageviews split " +
        "into browser-classified and automated plus distinct IPs, up to ~360 days, " +
        "with compare (period-over-period with a sqrt(n) noise floor — " +
        "withinNoise:true means read it as flat) and smooth (trailing 7-day mean; " +
        "read that line, the raw series is a weekday sawtooth). This counts every " +
        "request reaching the edge: honest for load and cost, NOT a headcount — " +
        "the browser split is a user-agent heuristic (Bot Management is not on " +
        "this plan), a FLOOR on automation that misses browser-spoofing scrapers. " +
        "Use ga4 for people. Distinct IPs are never valid to sum across days. The " +
        "countries/devices/paths views come from a different dataset with a HARD " +
        "24-HOUR window (~7-day retention): a snapshot one crawler run can " +
        "reorder, NOT bot-filtered, and sampled — sampleInterval 1 means " +
        "unsampled; counts are already extrapolated, never re-multiply.",
      inputSchema: z.object({
        view: z.enum(["daily", "countries", "devices", "paths"]).optional(),
        days: z.number().int().min(1).max(365).optional(),
        compare: z.boolean().optional(),
        smooth: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ view, days, compare, smooth }) => {
      const now = new Date();
      if ((view ?? "daily") !== "daily") {
        const acquisition = await loadAcquisition(env, now);
        if (!acquisition) return notConfigured("Cloudflare zone analytics", "CF_ANALYTICS_TOKEN + CF_ZONE_ID");
        const rows =
          view === "countries" ? acquisition.countries : view === "devices" ? acquisition.devices : acquisition.pages;
        return json({
          view,
          windowHours: 24,
          requestsConsidered: acquisition.total,
          sampleInterval: acquisition.sampleInterval,
          rows: rows.map((r) => ({
            ...r,
            sharePct: acquisition.total > 0 ? Math.round((r.count / acquisition.total) * 1000) / 10 : null,
          })),
        });
      }
      const traffic = await loadTraffic(env, now);
      if (!traffic) return notConfigured("Cloudflare zone analytics", "CF_ANALYTICS_TOKEN + CF_ZONE_ID");
      const requested = days ?? 28;
      const windows = splitPeriods(traffic.daily, requested);
      const smoothed = smooth === false ? null : rollingMean(windows.current.map((d) => d.browserPageViews));
      const series = windows.current.map((d, i) => ({
        date: d.date,
        browserPageViews: d.browserPageViews,
        automatedPageViews: d.automatedPageViews,
        distinctIps: d.uniques,
        requests: d.requests,
        ...(smoothed ? { browserMean7: smoothed[i] === null ? null : Math.round(smoothed[i]!) } : {}),
      }));
      const totals = {
        browserPageViews: sum(windows.current.map((d) => d.browserPageViews)),
        automatedPageViews: sum(windows.current.map((d) => d.automatedPageViews)),
        requests: sum(windows.current.map((d) => d.requests)),
      };
      const result: Record<string, unknown> = {
        requestedDays: requested,
        returnedDays: series.length,
        ...(series.length < requested
          ? { note: `Only ${series.length} days of history exist in the cache window — the shortfall is coverage, not zero traffic.` }
          : {}),
        totals,
        series,
      };
      if (compare && windows.previous.length) {
        result.previous = {
          browserPageViews: sum(windows.previous.map((d) => d.browserPageViews)),
          automatedPageViews: sum(windows.previous.map((d) => d.automatedPageViews)),
        };
        result.change = change(
          totals.browserPageViews,
          sum(windows.previous.map((d) => d.browserPageViews)),
        );
      }
      return json(result);
    },
  );

  server.registerTool(
    "crawlers",
    {
      description:
        "Search-engine and AI crawler activity. view:'trend' reads the daily " +
        "rollup's browserMap — UNSAMPLED, ~a year of retention, and it names the " +
        "search crawlers explicitly (GoogleBot, BingBot, AppleBot, YandexBot): the " +
        "only way to ask 'is Googlebot crawling us more since the Aug 17 fixes'. " +
        "It does NOT see AI crawlers — meta-webindexer, GPTBot and ClaudeBot " +
        "present no browser family and sit inside the Unknown bucket. For those " +
        "use view:'verified': Cloudflare's verifiedBotCategory from the adaptive " +
        "dataset, trustworthy but ONE 24-hour day at a time (~7-day retention, " +
        "sampled, already extrapolated) — the persisted cf.verified_bot.* series " +
        "in metrics_history is the trend that accumulates from it. Calibration, " +
        "measured 2026-08-17: Googlebot ~1,152 req/day vs meta-webindexer " +
        "~140,447 — being out-crawled 163:1 by Meta is this zone's NORMAL, not an " +
        "incident. More crawling is not the goal; more crawling of palette pages " +
        "rather than /cdn-cgi/* and /api/* is.",
      inputSchema: z.object({
        view: z.enum(["trend", "verified"]).optional(),
        days: z.number().int().min(1).max(365).optional(),
        families: z.array(z.string()).max(20).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ view, days, families }) => {
      const now = new Date();
      if ((view ?? "trend") === "verified") {
        const { collectVerifiedBots } = await import("../collect");
        const points = await collectVerifiedBots(env, now, 1);
        if (points.length === 0) {
          return json({
            view: "verified",
            note: "No verified-bot rows for yesterday — either the token is missing Account/zone analytics read, or genuinely no verified bots hit (unlikely). The persisted series is cf.verified_bot.* in metrics_history.",
            rows: [],
          });
        }
        return json({
          view: "verified",
          day: points[0]!.day,
          rows: points.map((p) => ({ category: (p.meta as any)?.label ?? p.key, requests: p.value })),
          caveats: ["24-hour window, sampled (already extrapolated), ~7-day retention — a snapshot, not a trend."],
        });
      }
      const traffic = await loadTraffic(env, now);
      if (!traffic) return notConfigured("Cloudflare zone analytics", "CF_ANALYTICS_TOKEN + CF_ZONE_ID");
      const slice = traffic.daily.slice(-(days ?? 28));
      const allFamilies = new Set<string>();
      for (const day of slice) for (const f of Object.keys(day.botFamilies)) allFamilies.add(f);
      const chosen = families?.length ? families : [...allFamilies].filter((f) => f !== "Unknown");
      const series = slice.map((d) => ({
        date: d.date,
        ...(Object.fromEntries(chosen.map((f) => [f, d.botFamilies[f] ?? 0])) as Record<string, number>),
        unknown: d.botFamilies["Unknown"] ?? 0,
      }));
      return json({
        days: series.length,
        familiesAvailable: [...allFamilies].sort(),
        series,
        note: "Pageviews by crawler family (unsampled daily rollup). 'unknown' is everything with no browser family — the AI crawlers live there.",
      });
    },
  );

  server.registerTool(
    "cloudflare_graphql",
    {
      description:
        "Run any read-only query against Cloudflare's GraphQL Analytics API — the " +
        "full dataset surface for the questions the narrow tools do not cover " +
        "(prefer crawlers/traffic/capabilities where they exist). Zone datasets " +
        "under viewer.zones(filter:{zoneTag:$zoneTag}); account datasets (RUM, " +
        "Workers, D1) under viewer.accounts(filter:{accountTag:$accountTag}). " +
        "DECLARE $zoneTag/$accountTag as String! and they are filled in — you do " +
        "not need the ids. Adaptive datasets cap at a 24-HOUR window on this plan " +
        "(the error is 'cannot request a time range wider than 1d') with ~7-day " +
        "retention; the daily rollup (httpRequests1dGroups) reaches ~a year. " +
        "1d-rollup filters use date_geq 'YYYY-MM-DD'; adaptive filters use " +
        "datetime_geq ISO-Z — mixing them fails. Budget is 300 queries per 5 " +
        "minutes. Every response carries `caveats` — read them before reporting a " +
        "figure, because raw counts on this zone are dominated by automation. " +
        "Mutations are refused.",
      inputSchema: z.object({
        query: z.string().min(20).max(8000),
        variables: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, variables }) => {
      const result = await runCloudflareGraphQL(env, query, variables ?? {});
      return result ? json(result) : notConfigured("Cloudflare GraphQL", "CF_ANALYTICS_TOKEN");
    },
  );
}
