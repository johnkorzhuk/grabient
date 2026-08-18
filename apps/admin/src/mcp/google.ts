// Google-sourced tools: search_console, ga4, referrers.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { queryGa4 } from "../ga4";
import { querySearchConsole } from "../search-console";
import { json, notConfigured, refused, toolError } from "./helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerGoogle(server: McpServer, env: Env) {
  server.registerTool(
    "search_console",
    {
      description:
        "Query Google Search Console for grabient.com: what people searched, which " +
        "pages they landed on, clicks, impressions, CTR and average position — over " +
        "an EXPLICIT date range, with filters and true site totals. Combine up to 5 " +
        "dimensions; `searchAppearance` must be alone; `date` cannot combine with " +
        "`hour` (hourly is the only view of TODAY and serves ~10 days). Filters are " +
        "ANDed (no OR exists — use includingRegex, which is RE2, e.g. /palettes/.*) " +
        "and GSC stores URLs PERCENT-ENCODED, so /palettes/aqua,-magenta is " +
        "/palettes/aqua%2C-magenta. `siteTotals` comes from a separate no-dimension " +
        "call and is the only true total: Google withholds anonymized queries from " +
        "rows while counting them in totals, so summing rows under-reports (~20% " +
        "here) — and a query-filtered call drops them from totals too, so never " +
        "compute share-of-total from one. Check responseAggregationType before " +
        "comparing two calls (aggregation moves impressions up to 3x). Days on or " +
        "after firstIncompleteDate are still filling — a decline at the right edge " +
        "is usually that. compare:true adds the equal-length prior window plus " +
        "per-key movers, where a NEGATIVE position delta is an IMPROVEMENT. " +
        "Retention is 16 months, but THIS property has data only since 2026-08-14 " +
        "(the property is young, not the site).",
      inputSchema: z.object({
        dimensions: z
          .array(z.enum(["query", "page", "device", "country", "date", "searchAppearance", "hour"]))
          .max(5)
          .optional(),
        start: isoDate.optional(),
        end: z.string().optional(),
        days: z.number().int().min(1).max(480).optional(),
        compare: z.boolean().optional(),
        filters: z
          .array(
            z.object({
              dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
              operator: z.enum([
                "equals",
                "notEquals",
                "contains",
                "notContains",
                "includingRegex",
                "excludingRegex",
              ]),
              expression: z.string().max(500),
            }),
          )
          .max(8)
          .optional(),
        aggregationType: z.enum(["auto", "byPage", "byProperty"]).optional(),
        type: z.enum(["web", "image", "video", "news", "googleNews", "discover"]).optional(),
        dataState: z.enum(["final", "all"]).optional(),
        limit: z.number().int().min(1).max(25000).optional(),
        startRow: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const result = await querySearchConsole(env, new Date(), {
        ...args,
        compare: args.compare ?? false,
      });
      if (!result) {
        return notConfigured("Search Console", "GSC_SERVICE_ACCOUNT, and the account added in Search Console users");
      }
      if (result.refused) {
        return refused("Search Console", result.refused.status, result.refused.message);
      }
      // Movers: per-key deltas when a comparison window exists and the rows
      // are keyed (not a plain date series).
      let movers: unknown;
      if (result.previous && args.dimensions?.length && !args.dimensions.includes("date")) {
        const prev = new Map(result.previous.rows.map((r) => [r.key, r]));
        const seen = new Set<string>();
        const rows = result.rows.map((r) => {
          seen.add(r.key);
          const p = prev.get(r.key);
          return {
            key: r.key,
            clicksDelta: r.clicks - (p?.clicks ?? 0),
            impressionsDelta: r.impressions - (p?.impressions ?? 0),
            ...(r.position !== undefined && p?.position !== undefined
              ? { positionDelta: Math.round((r.position - p.position) * 10) / 10 }
              : {}),
            status: p ? "both" : "new",
          };
        });
        const lost = result.previous.rows
          .filter((p) => !seen.has(p.key))
          .map((p) => ({ key: p.key, clicksDelta: -p.clicks, impressionsDelta: -p.impressions, status: "lost" }));
        movers = [...rows, ...lost]
          .sort((a, b) => Math.abs(b.clicksDelta) - Math.abs(a.clicksDelta))
          .slice(0, 25);
      }
      return json(movers ? { ...result, movers } : result);
    },
  );

  server.registerTool(
    "ga4",
    {
      description:
        "Run a Google Analytics 4 report. GA4 is the only BOT-FILTERED view of the " +
        "site — Cloudflare's numbers include automation and have been dominated by " +
        "it. Use sessionDefaultChannelGroup / sessionSource / sessionSourceMedium " +
        "for where a VISIT came from; firstUser* for where the PERSON was originally " +
        "acquired — different answers, and reporting one as the other is the " +
        "commonest GA4 error. The AI channel value is exactly \"AI Assistant\" " +
        "(singular — Google's own docs also print the plural, which matches zero " +
        "rows), exists only since 2026-05-13 and is NOT retroactive: earlier AI " +
        "traffic sits in Referral, so a rise at that date is reclassification, not " +
        "growth. ALWAYS pass orderBy for a top-N: without it rows come back in " +
        "GA4's own order over ~15,700 paths and \"top pages\" is 25 arbitrary " +
        "pages. engagementRate/bounceRate are 0-1, not percentages. Read `meta` " +
        "before reporting: thresholded means rows were WITHHELD (absent is not " +
        "zero), otherRow means low-frequency values rolled into \"(other)\", " +
        "rowCount says how many matched vs how many you got. Dates are " +
        "property-local (America/Los_Angeles) — up to 8h off the UTC day other " +
        "sources use. compare:true adds the prior equal-length window. Invalid " +
        "field names return Google's own error naming the field.",
      inputSchema: z.object({
        dimensions: z.array(z.string()).max(9).optional(),
        metrics: z.array(z.string()).max(10).optional(),
        start: isoDate.optional(),
        end: z.string().optional(),
        days: z.number().int().min(1).max(365).optional(),
        compare: z.boolean().optional(),
        orderBy: z
          .array(z.object({ field: z.string(), desc: z.boolean().optional() }))
          .max(4)
          .optional(),
        filter: z.record(z.string(), z.unknown()).optional(),
        metricFilter: z.record(z.string(), z.unknown()).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const result = await queryGa4(env, new Date(), args);
        if (!result) {
          return notConfigured("GA4", "GA4_PROPERTY_ID, and the service account granted Viewer on the property");
        }
        return json(result);
      } catch (error) {
        return refused("GA4", 400, (error as Error).message);
      }
    },
  );

  server.registerTool(
    "referrers",
    {
      description:
        "Which external sites send real visitors, from GA4 — the referring page URL " +
        "aggregated to domains, paired with the landing pages it points at. This is " +
        "a backlink report that PROVES the link sends traffic, which no free " +
        "backlink tool offers; Search Console has never had a links API. Use this " +
        "INSTEAD of Cloudflare RUM referrers: RUM reports no referrer for 91% of " +
        "pageloads and sees about a third of GA4's traffic — believing it once " +
        "produced a confidently backwards conclusion about channel mix here (it " +
        "said the cssgradient.io embed beat search 2.8x; GA4 says search beats the " +
        "embed 23x). Self-referrals and (not set) are excluded and COUNTED in " +
        "`excluded` rather than dropped. Counts sessions, not links: a domain " +
        "absent here may still link to us and simply send nobody.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).optional(),
        start: isoDate.optional(),
        end: z.string().optional(),
        groupBy: z.enum(["domain", "page"]).optional(),
        minSessions: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ days, start, end, groupBy, minSessions, limit }) => {
      try {
        const result = await queryGa4(env, new Date(), {
          dimensions: ["pageReferrer", "landingPagePlusQueryString"],
          metrics: ["sessions"],
          days: days ?? 28,
          start,
          end,
          orderBy: [{ field: "sessions" }],
          limit: 1000,
        });
        if (!result) return notConfigured("GA4", "GA4_PROPERTY_ID");
        let selfReferrals = 0;
        let notSet = 0;
        const pages: Array<{ referrer: string; landingPage: string; sessions: number }> = [];
        for (const row of result.rows) {
          const referrer = String(row.pageReferrer ?? "");
          const sessions = Number(row.sessions ?? 0);
          if (!referrer || referrer === "(not set)") {
            notSet += sessions;
            continue;
          }
          if (/^https?:\/\/(www\.)?grabient\.com/i.test(referrer)) {
            selfReferrals += sessions;
            continue;
          }
          pages.push({
            referrer,
            landingPage: String(row.landingPagePlusQueryString ?? ""),
            sessions,
          });
        }
        const min = minSessions ?? 2;
        const cap = limit ?? 30;
        if ((groupBy ?? "domain") === "page") {
          return json({
            window: { start: result.start, end: result.end },
            source: "GA4 pageReferrer",
            rows: pages.filter((p) => p.sessions >= min).slice(0, cap),
            excluded: { selfReferrals, notSet },
            totalReferralSessions: pages.reduce((t, p) => t + p.sessions, 0),
          });
        }
        const byDomain = new Map<string, { sessions: number; pages: typeof pages }>();
        for (const p of pages) {
          let domain: string;
          try {
            domain = new URL(p.referrer).hostname.replace(/^www\./, "");
          } catch {
            domain = p.referrer.slice(0, 60);
          }
          const entry = byDomain.get(domain) ?? { sessions: 0, pages: [] };
          entry.sessions += p.sessions;
          entry.pages.push(p);
          byDomain.set(domain, entry);
        }
        const rows = [...byDomain.entries()]
          .map(([domain, entry]) => ({
            domain,
            sessions: entry.sessions,
            pages: entry.pages.sort((a, b) => b.sessions - a.sessions).slice(0, 5),
          }))
          .filter((r) => r.sessions >= min)
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, cap);
        return json({
          window: { start: result.start, end: result.end },
          source: "GA4 pageReferrer",
          referringDomains: rows.length,
          rows,
          excluded: { selfReferrals, notSet },
          totalReferralSessions: pages.reduce((t, p) => t + p.sessions, 0),
        });
      } catch (error) {
        return toolError(
          `GA4 rejected the referrer pairing: ${(error as Error).message}\nThe event-scoped pageReferrer + session-scoped landing page pairing can be refused — this is the report being rejected, NOT "no site sends us traffic".`,
        );
      }
    },
  );
}
