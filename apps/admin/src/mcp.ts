// The private analytics MCP server.
//
// Every tool here reads production business data, so this is deliberately NOT
// the same server as the public palette MCP in apps/web. Different Worker,
// different hostname, different auth: that separation is the security boundary,
// and analytics tools must never be registered in the public server "just for
// testing".
//
// AUTH is inherited, not reimplemented. The route mounts behind the Access
// middleware in index.ts, which verifies the Cloudflare Access assertion and
// checks it against ADMIN_EMAILS (people) or ADMIN_SERVICE_TOKENS (headless
// clients). By the time a tool runs, the caller is already authorized, and the
// same policy governs the dashboard and the MCP.
//
// READ-ONLY and aggregate-only. Nothing here writes, and nothing returns a row
// that identifies a person: queries.ts touches auth_user, so tools expose
// counts and cohorts rather than users. That is enforced by what is registered
// below, not by convention elsewhere.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { buildBrief } from "./brief";
import { loadGa4, queryGa4 } from "./ga4";
import { loadAttribution, loadMetrics } from "./queries";
import {
  inspectUrl,
  listSitemaps,
  loadSearchConsole,
  querySearchConsole,
} from "./search-console";
import {
  loadAcquisition,
  loadCapabilities,
  loadReferrers,
  loadTraffic,
  runCloudflareGraphQL,
} from "./traffic";

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function unavailable(what: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${what} is not configured or Google refused the request. This is a configuration state, not an empty result — do not report it as "no data".`,
      },
    ],
    isError: true,
  };
}

export function createAnalyticsServer(env: Env) {
  const server = new McpServer({ name: "grabient-analytics", version: "1.0.0" });

  server.registerTool(
    "brief",
    {
      description:
        "The whole dashboard as one machine-readable digest: totals, signups by " +
        "month, activation cohorts, traffic series with the bot split, " +
        "acquisition, first-touch attribution, Search Console and GA4 — plus " +
        "`definitions`, `caveats` and `unavailable`. START HERE: the caveats " +
        "explain which numbers include bots and which do not, and reading them " +
        "prevents the most common misreading of this data.",
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      const [metrics, traffic, acquisition, search] = await Promise.all([
        loadMetrics(env.DB, now),
        loadTraffic(env, now),
        loadAcquisition(env, now),
        loadSearchConsole(env, now),
      ]);
      const [attribution, referrers, ga4] = await Promise.all([
        loadAttribution(env.DB),
        loadReferrers(env, now),
        loadGa4(env, now),
      ]);
      return json(
        buildBrief(metrics, traffic, acquisition, search, attribution, referrers, ga4),
      );
    },
  );

  server.registerTool(
    "search_console",
    {
      description:
        "Query Google Search Console for grabient.com: what people searched, " +
        "which pages they landed on, clicks, impressions, CTR and average " +
        "position. Combine dimensions to cross-tabulate (e.g. ['query','device']). " +
        "Use dimensions:['hour'] to see TODAY — the only view of data fresher " +
        "than yesterday; the API serves up to 10 days of hourly rows. " +
        "Page past 25,000 rows with startRow (50,000/day ceiling). Totals are " +
        "NOT the sum of these rows: Google withholds anonymized queries from " +
        "dimensioned results while still counting them in site totals, so " +
        "summing rows under-reports. Use the `brief` tool for true totals.",
      inputSchema: {
        dimensions: z
          .array(
            z.enum(["query", "page", "device", "country", "date", "searchAppearance", "hour"]),
          )
          .optional(),
        days: z.number().int().min(1).max(480).optional(),
        limit: z.number().int().min(1).max(25000).optional(),
        startRow: z.number().int().min(0).optional(),
        type: z.enum(["web", "image", "video", "news", "discover"]).optional(),
        dataState: z.enum(["final", "all"]).optional(),
      },
    },
    async ({ dimensions, days, limit, startRow, type, dataState }) => {
      // Hourly grouping needs the hourly_all wire value; querySearchConsole
      // infers it from the dimensions so the caller never has to know.
      const result = await querySearchConsole(env, new Date(), {
        dimensions,
        days,
        limit,
        startRow,
        type,
        dataState,
      });
      return result ? json(result) : unavailable("Search Console");
    },
  );

  server.registerTool(
    "ga4",
    {
      description:
        "Run a Google Analytics 4 report. GA4 is the only BOT-FILTERED view of " +
        "the site — Cloudflare's traffic numbers include automation and have " +
        "been dominated by it. Useful dimensions: sessionDefaultChannelGroup, " +
        "sessionSource, pagePath, country, deviceCategory, date. Useful metrics: " +
        "sessions, activeUsers, newUsers, screenPageViews, engagementRate, " +
        "averageSessionDuration. Names are passed to Google, which returns a " +
        "descriptive error for an invalid one.",
      inputSchema: {
        dimensions: z.array(z.string()).max(6).optional(),
        metrics: z.array(z.string()).max(8).optional(),
        days: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ dimensions, metrics, days, limit }) => {
      try {
        const result = await queryGa4(env, new Date(), { dimensions, metrics, days, limit });
        return result ? json(result) : unavailable("GA4");
      } catch (error) {
        return { content: [{ type: "text" as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.registerTool(
    "traffic",
    {
      description:
        "Cloudflare zone analytics: daily pageviews split into browser-classified " +
        "and automated, plus distinct IPs, for up to ~180 days. This counts every " +
        "request reaching the edge, so it is the honest number for load and cost " +
        "but NOT a headcount — the split is a user-agent heuristic that " +
        "undercounts scrapers spoofing a browser. Use the `ga4` tool for people.",
      inputSchema: { days: z.number().int().min(1).max(180).optional() },
    },
    async ({ days }) => {
      const traffic = await loadTraffic(env, new Date());
      if (!traffic) return unavailable("Cloudflare zone analytics");
      const daily = days ? traffic.daily.slice(-days) : traffic.daily;
      return json({ days: daily.length, daily });
    },
  );

  server.registerTool(
    "acquisition",
    {
      description:
        "Where visitors come from, from Cloudflare: country and device " +
        "breakdowns and the most-requested content paths (a 24-HOUR snapshot — " +
        "this plan caps that dataset at a 1-day range, so a single crawler run " +
        "can reorder it and it is not a trend), plus referring hosts from the " +
        "Web Analytics browser beacon over 7 days. The referrer data IS " +
        "bot-filtered (crawlers do not run JavaScript); the country/device " +
        "breakdowns are NOT.",
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      const [acquisition, referrers] = await Promise.all([
        loadAcquisition(env, now),
        loadReferrers(env, now),
      ]);
      if (!acquisition && !referrers) return unavailable("Cloudflare acquisition data");
      return json({ acquisition, referrers });
    },
  );

  server.registerTool(
    "cloudflare_capabilities",
    {
      description:
        "Ask Cloudflare which analytics datasets and FIELDS this zone's token may " +
        "actually read, plus the retention and max query window for each. Use this " +
        "before assuming a dimension exists: Cloudflare's schema exposes every " +
        "field globally and enforces entitlement at query time, so a field can be " +
        "documented and still be unreadable here. Notably unavailable on this " +
        "plan: bot scores (Enterprise + Bot Management only), which is why the " +
        "bot split elsewhere is a user-agent heuristic that under-counts spoofers.",
      inputSchema: {},
    },
    async () => {
      const capabilities = await loadCapabilities(env);
      return capabilities ? json(capabilities) : unavailable("Cloudflare analytics capabilities");
    },
  );

  server.registerTool(
    "cloudflare_graphql",
    {
      description:
        "Run any read-only query against Cloudflare's GraphQL Analytics API — " +
        "the full dataset surface, not just what the other tools summarize. Call " +
        "`cloudflare_capabilities` first to see which datasets and fields this " +
        "token may read. Zone datasets live under " +
        "viewer.zones(filter:{zoneTag:$zoneTag}); account datasets (RUM, Web " +
        "Vitals, Workers, D1, KV, R2) under " +
        "viewer.accounts(filter:{accountTag:$accountTag}) and may be refused if " +
        "the token is zone-scoped. DECLARE $zoneTag/$accountTag as String! " +
        "variables and they are filled in for you — you do not need the ids. " +
        "Every response carries `caveats` describing " +
        "what the numbers include — read them before reporting a figure, because " +
        "the raw traffic counts on this zone are dominated by automation. " +
        "Mutations are refused.",
      inputSchema: {
        query: z.string().min(20).max(8000),
        variables: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ query, variables }) => {
      const result = await runCloudflareGraphQL(env, query, variables ?? {});
      return result ? json(result) : unavailable("Cloudflare GraphQL");
    },
  );

  server.registerTool(
    "url_inspection",
    {
      description:
        "Ask Google whether a specific URL is indexed, when it was last crawled, " +
        "whether robots.txt allows it, and which sitemap it was found in. This is " +
        "the only way to tell 'ranks badly' apart from 'not in the index at all' " +
        "— the two need completely different fixes. Quota is 2,000 URLs/day.",
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const result = await inspectUrl(env, new Date(), url);
      return result ? json(result) : unavailable("URL Inspection");
    },
  );

  server.registerTool(
    "sitemaps",
    {
      description:
        "List the sitemaps submitted to Search Console, with when each was last " +
        "downloaded, how many URLs Google found in it, and any errors or " +
        "warnings. Read-only: submitting is deliberately not exposed.",
      inputSchema: {},
    },
    async () => {
      const result = await listSitemaps(env, new Date());
      return result ? json(result) : unavailable("Search Console sitemaps");
    },
  );

  server.registerTool(
    "funnel",
    {
      description:
        "Product metrics from D1: registered accounts, signups by month, " +
        "activation cohorts (share of a signup cohort that ever liked a palette), " +
        "and first-touch attribution by source. Aggregates only — no individual " +
        "accounts are exposed.",
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      const [metrics, attribution] = await Promise.all([
        loadMetrics(env.DB, now),
        loadAttribution(env.DB),
      ]);
      return json({
        totals: metrics.totals,
        signupsByMonth: metrics.signups,
        activationByCohort: metrics.cohorts,
        likersByMonth: metrics.likers,
        currentMonth: metrics.currentMonth,
        attributionByFirstTouchSource: attribution,
      });
    },
  );

  return server;
}

/**
 * `allowedHostnames` is mandatory for custom domains: the default allow-list is
 * localhost plus workers.dev, so omitting it passes a local smoke test and then
 * rejects every request on admin.grabient.com.
 */
export function analyticsMcpHandler(env: Env, hostname: string) {
  return createMcpHandler(() => createAnalyticsServer(env), {
    route: "/mcp",
    allowedHostnames: [hostname, "admin.grabient.com"],
  });
}
