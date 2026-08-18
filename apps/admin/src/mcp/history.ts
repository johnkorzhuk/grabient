// The persisted-history tools: metrics_history and brief.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildLiveBrief, generateDigest } from "../briefs";
import { readSeries, seriesExtent } from "../db";
import { loadMarkers } from "../events";
import { listGoals } from "../goals";
import { beforeAfter } from "../lift";
import { METRIC, metricDef } from "../metrics";
import { change, isoDay, resolveWindow, rollingMean } from "../range";
import { getReport, listReports, toMeta } from "../reports";
import { json, notConfigured, toolError } from "./helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerHistory(server: McpServer, env: Env, actor: string) {
  server.registerTool(
    "metrics_history",
    {
      description:
        "The persisted daily history — the only tool that can answer 'is this " +
        "better than it was', because every live tool returns a window ending " +
        "now. Metric keys are hierarchical (gsc.clicks, ga4.sessions.organic_" +
        "search, ga4.sessions.ai_assistant, cf.bot.googlebot, index.indexed, " +
        "d1.signups, bing.indexed — call capabilities topic:'metrics' for the " +
        "full catalog with per-key caveats). Values are snapshots re-written " +
        "over a trailing window so upstream revisions self-heal; points flagged " +
        "provisional may still move. `available` gives each metric's REAL first " +
        "day — a flat left edge is usually the series starting, not zero; a " +
        "missing day is a failed collection, not zero, and is omitted rather " +
        "than interpolated. Sources keep their OWN calendar day (GSC/GA4 are " +
        "LA-local, Cloudflare UTC): fine for trends, wrong for same-day causal " +
        "claims. Events come back inline with before/after neighbourhoods — " +
        "they describe the neighbourhood of an event, NEVER an effect estimate; " +
        "withinNoise:true means read the movement as flat. change uses the " +
        "sqrt(n) noise floor everywhere.",
      inputSchema: z.object({
        metrics: z.array(z.string()).min(1).max(12),
        start: isoDate.optional(),
        end: z.string().optional(),
        days: z.number().int().min(1).max(1095).optional(),
        compare: z.boolean().optional(),
        smooth: z.boolean().optional(),
        withEvents: z.boolean().optional(),
        withGoals: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ metrics, start, end, days, compare, smooth, withEvents, withGoals }) => {
      const db = env.ADMIN_DB;
      if (!db) return notConfigured("The metric store", "ADMIN_DB binding + migrations");
      const now = new Date();
      const window = resolveWindow(now, { start, end, days }, { days: 90, lagDays: 0, maxDays: 1095 });

      const series = [];
      for (const key of metrics) {
        const def = metricDef(key);
        const points = await readSeries(db, key, window.since, window.until);
        const values = points.map((p) => p.value);
        const smoothed = smooth === false || points.length < 21 ? null : rollingMean(values);
        let comparison: unknown;
        if (compare && def && (def.agg === "sum" || def.agg === "avg")) {
          const prev = await readSeries(db, key, window.prevSince, window.prevUntil);
          const agg = (list: number[]) =>
            def.agg === "avg" ? (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0) : list.reduce((a, b) => a + b, 0);
          comparison = change(Math.round(agg(values)), Math.round(agg(prev.map((p) => p.value))));
        }
        const expected =
          Math.round((Date.parse(window.until) - Date.parse(window.since)) / 86_400_000) + 1;
        series.push({
          metric: key,
          label: def?.label ?? key,
          agg: def?.agg,
          caveat: def?.caveat,
          points: points.map((p) => ({
            day: p.day,
            value: p.value,
            ...(p.provisional ? { provisional: true } : {}),
            ...(smoothed
              ? { mean7: smoothed[points.indexOf(p)] === null ? null : Math.round(smoothed[points.indexOf(p)]! * 10) / 10 }
              : {}),
          })),
          coverage: { expectedDays: expected, presentDays: points.length },
          ...(comparison ? { change: comparison } : {}),
        });
      }

      const extents = await seriesExtent(db, metrics);
      const result: Record<string, unknown> = {
        start: window.since,
        end: window.until,
        series,
        available: Object.fromEntries(extents),
      };
      if (withEvents !== false) {
        const markers = await loadMarkers(db, window.since, window.until);
        const primary = series[0];
        const primarySeries = new Map(
          (primary?.points ?? []).map((p: any) => [p.day as string, p.value as number]),
        );
        result.events = markers.map((m) => ({
          id: m.id,
          on: m.starts_on,
          ends_on: m.ends_on,
          kind: m.kind,
          label: m.label,
          detail: m.detail,
          ...(m.ends_on === null && primary
            ? { neighbourhood: { metric: primary.metric, ...beforeAfter(primarySeries, m.starts_on) } }
            : {}),
        }));
      }
      if (withGoals) {
        result.goals = (await listGoals(db, now)).map((g) => ({
          slug: g.slug,
          title: g.title,
          metric: g.metric_key,
          baseline: g.baseline_value,
          target: g.target_value,
          current: g.current,
          progressPct: g.progress_pct,
          onTrack: g.on_track,
        }));
      }
      return json(result);
    },
  );

  server.registerTool(
    "brief",
    {
      description:
        "The whole dashboard as one machine-readable digest — totals, search, " +
        "GA4, traffic with the bot split, acquisition, attribution and the " +
        "product funnel, plus definitions, caveats and unavailable. START HERE " +
        "and read the caveats: they say which numbers include bots, and reading " +
        "them prevents the commonest misreading of this data. action:'latest' " +
        "returns the newest SAVED digest (cheap; a snapshot of when it was " +
        "generated, not a live read). action:'generate' refetches every source " +
        "(~7 API calls); period:'day' returns without saving by default, longer " +
        "periods save into the archive at admin.grabient.com/reports and return " +
        "the link. action:'list'/'get' browse the archive. Every digest covers " +
        "ONE period with explicit bounds, so two digests are comparable; a " +
        "digest and a live query are not.",
      inputSchema: z.object({
        action: z.enum(["latest", "generate", "list", "get"]).optional(),
        period: z.enum(["day", "week", "month", "quarter"]).optional(),
        save: z.boolean().optional(),
        slug: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ action, period, save, slug, limit }) => {
      const now = new Date();
      switch (action ?? "latest") {
        case "generate": {
          const type = period ?? "day";
          const shouldSave = save ?? type !== "day";
          if (shouldSave) {
            if (!env.ADMIN_DB) return notConfigured("The report store", "ADMIN_DB binding + migrations");
            const result = await generateDigest(env, now, type, actor, "agent");
            if (!result.ok) return toolError(result.error);
            return json({
              ...result,
              note: `Digest saved. View it at ${result.url} — give the owner that link.`,
            });
          }
          const brief = await buildLiveBrief(env, now);
          return json(brief);
        }
        case "list": {
          const { items, nextCursor } = await listReports(env.ADMIN_DB, {
            kind: "digest",
            limit: limit ?? 20,
          });
          return json({ digests: items, nextCursor });
        }
        case "get": {
          if (!slug) return toolError("action:'get' needs a slug (from action:'list').");
          const report = await getReport(env.ADMIN_DB, slug);
          if (!report) return toolError(`No digest with slug '${slug}'.`);
          return json({
            ...toMeta(report.row),
            markdown: report.body,
            payload: report.row.payload_json ? JSON.parse(report.row.payload_json) : null,
          });
        }
        case "latest": {
          const { items } = await listReports(env.ADMIN_DB, { kind: "digest", limit: 1 });
          const latest = items[0];
          if (!latest) {
            return json({
              note: "No saved digests yet — the cron writes weekly/monthly ones; action:'generate' makes one now.",
              liveBrief: await buildLiveBrief(env, now),
            });
          }
          const report = await getReport(env.ADMIN_DB, latest.slug);
          return json({
            ...latest,
            payload: report?.row.payload_json ? JSON.parse(report.row.payload_json) : null,
          });
        }
      }
    },
  );
}

/** The metric catalog, exposed for capabilities. */
export function metricCatalog(): Array<{ key: string; label: string; agg: string; caveat: string; since?: string }> {
  return Object.entries(METRIC).map(([key, def]) => ({
    key,
    label: def.label,
    agg: def.agg,
    caveat: def.caveat,
    ...(def.since ? { since: def.since } : {}),
  }));
}

export { isoDay };
