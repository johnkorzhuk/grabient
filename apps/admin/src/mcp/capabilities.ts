// capabilities: what can and cannot be asked, per vendor — the tool to call
// BEFORE concluding something is fine, because an empty result and an
// unaskable question look identical and only one of them is good news.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { seriesExtent } from "../db";
import { METRIC, PREFIX_RULES } from "../metrics";
import { loadCapabilities } from "../traffic";
import { json } from "./helpers";

/** Search Console features with NO API at any price — say "cannot be checked
 *  programmatically", never "none found". */
const GSC_NO_API = [
  { feature: "Manual actions / penalties", instead: "A human must open Search Console > Security & Manual Actions." },
  { feature: "Security issues", instead: "Same — UI only." },
  { feature: "The Links report", instead: "UI export only (100k rows). The referrers tool (GA4) proves which links send traffic; Bing's backlinks API is the only programmatic source." },
  { feature: "Crawl stats report", instead: "Approximate with the crawlers tool (Cloudflare-side view of Googlebot)." },
  { feature: "Aggregate page-indexing counts", instead: "The indexation tool's sweep IS the coverage report — built per-URL because no aggregate API exists." },
  { feature: "AI Overviews / AI Mode performance", instead: "UI-only report (impressions only, subset rollout, since 2026-06). The searchanalytics type enum has no AI value; that data is folded into 'web' totals. Disjoint from GA4's AI Assistant channel — never sum them." },
];

export function registerCapabilities(server: McpServer, env: Env) {
  server.registerTool(
    "capabilities",
    {
      description:
        "Ask this before concluding something is fine. It answers: which " +
        "credentials are configured at all; which Search Console features have " +
        "NO API at any price (manual actions, security issues, links, crawl " +
        "stats, aggregate indexing, the AI-results report) so you say 'cannot " +
        "be checked programmatically' instead of 'none found'; which Cloudflare " +
        "datasets and FIELDS this token may actually read with retention and " +
        "window limits (the schema exposes every field globally and enforces " +
        "entitlement at query time, so documented and readable are different " +
        "facts — bot scores are documented and unreadable here); and the full " +
        "persisted-metric catalog with each key's aggregation semantics, caveat " +
        "and real first/last day of data.",
      inputSchema: z.object({
        topic: z.enum(["all", "search-console", "cloudflare", "metrics", "bing"]).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      const which = topic ?? "all";
      const out: Record<string, unknown> = {
        configured: {
          searchConsole: Boolean(env.GSC_SERVICE_ACCOUNT),
          ga4: Boolean(env.GA4_PROPERTY_ID && env.GSC_SERVICE_ACCOUNT),
          cloudflareAnalytics: Boolean(env.CF_ANALYTICS_TOKEN && env.CF_ZONE_ID),
          bing: Boolean(env.BING_API_KEY),
          metricStore: Boolean(env.ADMIN_DB),
          deployMarkers: Boolean(env.CF_DEPLOY_TOKEN),
        },
      };
      if (which === "all" || which === "search-console") {
        out.searchConsole = {
          retentionMonths: 16,
          dataFrom: "2026-08-14 (the property is young; the site is a decade old)",
          urlInspectionQuota: "2,000/day + 600/min per property, shared with humans using the UI",
          quotaErrors: "429 rateLimitExceeded for QPS, 403 'load quota exceeded' for load — branch on the reason, not the status",
          noApiFor: GSC_NO_API,
        };
      }
      if (which === "all" || which === "cloudflare") {
        out.cloudflare = (await loadCapabilities(env)) ?? "not configured";
      }
      if (which === "all" || which === "metrics") {
        const keys = Object.keys(METRIC);
        const extents = env.ADMIN_DB ? await seriesExtent(env.ADMIN_DB, keys) : new Map();
        out.metrics = {
          catalog: Object.entries(METRIC).map(([key, def]) => ({
            key,
            label: def.label,
            agg: def.agg,
            unit: def.unit,
            ...(def.better === "down" ? { lowerIsBetter: true } : {}),
            caveat: def.caveat,
            ...(extents.get(key) ? { data: extents.get(key) } : { data: "none yet" }),
          })),
          prefixFamilies: PREFIX_RULES.map((r) => ({
            prefix: `${r.prefix}*`,
            agg: r.def.agg,
            caveat: r.def.caveat,
          })),
          note: "Prefix families (ga4.sessions.*, cf.bot.*, cf.verified_bot.*) hold one key per upstream-defined member — Google and Cloudflare add members without notice, which is why they are matched by prefix, never enumerated.",
        };
      }
      if (which === "all" || which === "bing") {
        out.bing = {
          configured: Boolean(env.BING_API_KEY),
          methodsExposed: ["traffic (daily)", "queries (weekly buckets)", "pages (weekly)", "crawl (daily, incl. InIndex — the aggregate indexed count Google refuses to expose)", "quota"],
          aiPerformance: "DASHBOARD-ONLY — verified 2026-08-17 that no API exists. If asked about AI citations from Bing, say a human must read the Bing UI; do not report silence as zero.",
          keyCaveat: "The API key is per-user and grants WRITES with no scoping; the read-only boundary is this server's hardcoded method allow-list.",
        };
      }
      return json(out);
    },
  );
}
