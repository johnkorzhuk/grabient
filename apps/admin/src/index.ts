import { Hono } from "hono";
import { verifyAccess } from "./access";
import {
  activationChart,
  activeUsersChart,
  conversionChart,
  cumulativeUsersChart,
  dailyVisitorsChart,
  newSignupsChart,
  rankedBarChart,
  MIN_COHORT,
} from "./charts";
import {
  brand,
  chartCard,
  dataTable,
  delta,
  errorPage,
  esc,
  fmt,
  changeBadge,
  layout,
  legend,
  nav,
  rangeSelector,
  statTile,
} from "./html";
import { change, parseRange, RANGES, rollingMean, splitPeriods, sum, type RangeOption } from "./range";
import { buildBrief } from "./brief";
import { loadSearchConsole, type SearchConsole } from "./search-console";
import { loadGa4, type Ga4 } from "./ga4";
import { analyticsMcpHandler } from "./mcp";
import { runBackfill } from "./backfill";
import { listCampaigns } from "./campaigns";
import { loadMarkers } from "./events";
import { listGoals } from "./goals";
import {
  campaignCard,
  emptyState,
  goalCard,
  markerEventsList,
  toChartMarkers,
  trendCard,
} from "./insight-pages";
import { renderMarkdown } from "./markdown";
import { isoDay } from "./range";
import { getReport, listReports, toMeta } from "./reports";
import { opsPage, reportPage, reportsArchivePage } from "./report-pages";
import { scheduled } from "./scheduled";
import { listSweeps } from "./sweep";

/** Shared page shell for the new pages — header row + body, sealed by callers. */
function layoutPage(current: string, title: string, generated: string, email: string, body: string): string {
  return layout(
    title,
    `<main class="mx-auto max-w-6xl px-6 py-8 sm:py-10">
  ${header(current, generated, email)}
  ${body}
</main>`,
  );
}
import {
  cumulative,
  loadAttribution,
  loadMetrics,
  monthDate,
  type AttributionRow,
  type Metrics,
} from "./queries";
import {
  automatedShare,
  loadAcquisition,
  loadReferrers,
  loadTraffic,
  recentBrowserPageViews,
  recentDailyUniques,
  type Acquisition,
  type ReferrerRow,
  type Traffic,
} from "./traffic";

const app = new Hono<{ Bindings: Env; Variables: { email: string } }>();

/**
 * Every response is private and uncacheable. Unlike grabient.com — where list
 * HTML is deliberately edge-cached — nothing here may be stored by the edge, an
 * intermediary, or the browser's back/forward cache: it is production user data
 * behind an identity check, and a cached copy would outlive the session that was
 * allowed to see it.
 */
function seal(res: Response): Response {
  res.headers.set("Cache-Control", "no-store, private");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

app.use("*", async (c, next) => {
  const result = await verifyAccess(c.req.raw, c.env);
  if (!result.ok) {
    // The reason is logged, never rendered — an unauthenticated caller learns
    // only that they are not allowed in.
    console.error(`Access denied (${result.status}): ${result.reason}`);
    const [heading, detail] =
      result.status === 503
        ? ["Not configured", "This dashboard is not accepting requests yet."]
        : ["Not authorized", "You do not have access to this dashboard."];
    return seal(
      c.html(errorPage(result.status, heading, detail), result.status),
    );
  }
  c.set("email", result.email);
  await next();
});

app.get("/", async (c) => {
  const now = new Date();
  const range = parseRange(c.req.query("range"));
  // Independent sources, so fetch them together. Traffic resolves to null when
  // it is not configured or the API is unhappy; the page drops those sections
  // rather than failing.
  const [metrics, traffic] = await Promise.all([
    loadMetrics(c.env.DB, now),
    loadTraffic(c.env, now),
  ]);
  return seal(c.html(dashboard(metrics, traffic, range, c.get("email"))));
});

app.get("/acquisition", async (c) => {
  const now = new Date();
  const [traffic, acquisition, attribution, search, ga4] = await Promise.all([
    loadTraffic(c.env, now),
    loadAcquisition(c.env, now),
    loadAttribution(c.env.DB),
    loadSearchConsole(c.env, now),
    // GA4 replaces the RUM referrer card: RUM reports no referrer for 91% of
    // pageloads and sees a third of the traffic — it produced a confidently
    // backwards channel conclusion once. GA4's pageReferrer is the honest one.
    loadGa4(c.env, now),
  ]);
  return seal(
    c.html(
      acquisitionPage(traffic, acquisition, attribution, search, ga4, now, c.get("email")),
    ),
  );
});

// The MCP server. Mounted AFTER the Access middleware above, so a tool only
// ever runs for a caller Access already authorized — people via SSO, headless
// clients via a service token. Same policy as the dashboard, one place to
// grant or revoke. The verified identity rides along so write tools can stamp
// created_by with something real.
app.all("/mcp", (c) =>
  analyticsMcpHandler(c.env, new URL(c.req.url).hostname, c.get("email")).fetch(c.req.raw),
);

// The agent-facing endpoint. Same numbers as the pages, plus the definitions,
// caveats and explicit list of unanswerable questions — see brief.ts.
app.get("/brief.json", async (c) => {
  const now = new Date();
  const [metrics, traffic, acquisition, search] = await Promise.all([
    loadMetrics(c.env.DB, now),
    loadTraffic(c.env, now),
    loadAcquisition(c.env, now),
    loadSearchConsole(c.env, now),
  ]);
  const [attribution, referrers, ga4] = await Promise.all([
    loadAttribution(c.env.DB),
    loadReferrers(c.env, now),
    loadGa4(c.env, now),
  ]);
  return seal(
    c.json(buildBrief(metrics, traffic, acquisition, search, attribution, referrers, ga4)),
  );
});

app.get("/brief", async (c) => {
  const now = new Date();
  const [metrics, traffic, acquisition, search] = await Promise.all([
    loadMetrics(c.env.DB, now),
    loadTraffic(c.env, now),
    loadAcquisition(c.env, now),
    loadSearchConsole(c.env, now),
  ]);
  // ga4 included — omitting it made this page's own `unavailable` list claim
  // GA4 was not connected while /brief.json said it was. Same builder, one
  // truth.
  const [attribution, referrers, ga4] = await Promise.all([
    loadAttribution(c.env.DB),
    loadReferrers(c.env, now),
    loadGa4(c.env, now),
  ]);
  return seal(
    c.html(
      briefPage(
        buildBrief(metrics, traffic, acquisition, search, attribution, referrers, ga4),
        now,
        c.get("email"),
      ),
    ),
  );
});

// The history-backed pages: everything below reads the persisted metric
// store, so these answer "is it better than it was" over months — the
// question the live pages structurally cannot.
app.get("/trends", async (c) => {
  const now = new Date();
  const db = c.env.ADMIN_DB;
  if (!db) {
    return seal(
      c.html(errorPage(503, "Not collecting yet", "ADMIN_DB is not bound; the metric store does not exist.")),
    );
  }
  const range = parseRange(c.req.query("range"));
  const until = isoDay(now);
  const since = isoDay(new Date(now.getTime() - (range.days - 1) * 86_400_000));
  const markerRows = await loadMarkers(db, since, until);
  const markers = toChartMarkers(markerRows);
  const eventsHtml = markerEventsList(markerRows);
  const compact = (n: number) => fmt(Math.round(n));

  const cards = (
    await Promise.all([
      trendCard(db, { title: "Search clicks", note: "Daily clicks from Google search results.", idPrefix: "t-gc", unitFormat: compact, metrics: [{ key: "gsc.clicks", label: "Clicks" }] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Search impressions", note: "How often grabient.com appeared in results.", idPrefix: "t-gi", unitFormat: compact, metrics: [{ key: "gsc.impressions", label: "Impressions" }] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Average position", note: "Impressions-weighted mean result position. LOWER is better.", idPrefix: "t-gp", unitFormat: (n) => n.toFixed(1), metrics: [{ key: "gsc.position", label: "Position" }], zeroBase: false }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Sessions by channel", note: "GA4 bot-filtered sessions for the four channels that matter.", idPrefix: "t-ch", unitFormat: compact, metrics: [
        { key: "ga4.sessions.organic_search", label: "Organic search" },
        { key: "ga4.sessions.direct", label: "Direct" },
        { key: "ga4.sessions.referral", label: "Referral" },
        { key: "ga4.sessions.ai_assistant", label: "AI assistant" },
      ] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "AI-assistant sessions", note: "Visits referred by ChatGPT, Gemini, Claude and friends — on its own scale, because next to search it disappears.", idPrefix: "t-ai", unitFormat: compact, metrics: [{ key: "ga4.sessions.ai_assistant", label: "AI assistant" }] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Search-engine crawlers", note: "Daily pageviews by named crawler family, from the unsampled rollup.", caveat: "AI crawlers (meta-webindexer, GPTBot, ClaudeBot) present no browser family and are NOT here — they sit in the automated bucket; the verified-bot series accumulates them going forward.", idPrefix: "t-cr", unitFormat: compact, metrics: [
        { key: "cf.bot.googlebot", label: "Googlebot" },
        { key: "cf.bot.bingbot", label: "Bingbot" },
        { key: "cf.bot.applebot", label: "Applebot" },
      ] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Edge pageviews: browsers vs automation", note: "Every pageview reaching the edge, split by the user-agent heuristic.", idPrefix: "t-cf", unitFormat: compact, metrics: [
        { key: "cf.browser_pageviews", label: "Browsers" },
        { key: "cf.automated_pageviews", label: "Bots & unidentified" },
      ] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Signups and likes", note: "Daily new accounts and likes, from the production database.", idPrefix: "t-d1", unitFormat: compact, metrics: [
        { key: "d1.signups", label: "Signups" },
        { key: "d1.likes_new", label: "Likes" },
      ] }, since, until, markers, eventsHtml),
      trendCard(db, { title: "Bing: crawled and indexed", note: "Bing's own daily crawl volume and aggregate in-index count — the number Google refuses to expose.", idPrefix: "t-bg", unitFormat: compact, metrics: [
        { key: "bing.crawled", label: "Crawled" },
        { key: "bing.indexed", label: "In index" },
      ] }, since, until, markers, eventsHtml),
    ])
  ).filter((card): card is string => card !== null);

  const body =
    cards.length === 0
      ? emptyState(
          "No history collected yet. Run the backfill from /ops (one click, ~30 seconds) and this page fills with months of GSC, GA4, Cloudflare and product history.",
        )
      : `<div class="mt-4 grid items-start gap-4 lg:grid-cols-2">${cards.join("\n")}</div>`;

  return seal(
    c.html(
      layoutPage("/trends", "Trends — Grabient admin", stamp(now), c.get("email"), `
  <div class="mt-5">${rangeSelector("/trends", range.key, RANGES)}</div>
  ${body}`),
    ),
  );
});

app.get("/indexation", async (c) => {
  const now = new Date();
  const db = c.env.ADMIN_DB;
  if (!db) {
    return seal(c.html(errorPage(503, "Not collecting yet", "ADMIN_DB is not bound.")));
  }
  const sweeps = await listSweeps(db, 30);
  const latest = sweeps.find((s: any) => s.status === "complete") ?? sweeps[0];
  const markerRows = await loadMarkers(db, "2026-08-01", isoDay(now));
  const markers = toChartMarkers(markerRows);
  const eventsHtml = markerEventsList(markerRows);

  const tiles = latest
    ? [
        statTile({ label: "Sitemap URLs", value: fmt(Number(latest.corpus_size ?? 0)) }),
        statTile({
          label: "Indexed by Google",
          value: fmt(Number(latest.indexed ?? 0)),
          hero: true,
          sub: `<span class="text-ink-muted">the headline number — 0 of 920 when the fixes shipped 17 Aug 2026</span>`,
        }),
        statTile({
          label: "Coverage",
          value:
            Number(latest.inspected ?? 0) > 0
              ? `${((Number(latest.indexed ?? 0) / Number(latest.inspected)) * 100).toFixed(1)}%`
              : "—",
          sub: `<span class="text-ink-muted">of ${fmt(Number(latest.inspected ?? 0))} inspected</span>`,
        }),
        statTile({
          label: "Inspection errors",
          value: fmt(Number(latest.api_errors ?? 0)),
          sub: `<span class="text-ink-muted">non-zero means counts are understated by up to this much</span>`,
        }),
      ].join("\n")
    : "";

  const bucketTable = latest?.buckets
    ? dataTable(
        ["Bucket", "URLs"],
        Object.entries(latest.buckets as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .map(([bucket, count]) => [bucket.replace(/_/g, " "), fmt(count)]),
      )
    : "";

  let notIndexedSample: any[] = [];
  if (latest) {
    try {
      const res = await db
        .prepare(
          `SELECT url, bucket, coverage_state, page_fetch_state FROM index_url_status
            WHERE sweep_id = ?1 AND bucket <> 'indexed' ORDER BY bucket LIMIT 25`,
        )
        .bind(latest.id)
        .all();
      notIndexedSample = res.results ?? [];
    } catch {
      /* migration pending */
    }
  }

  const trend = await trendCard(
    db,
    {
      title: "Pages indexed over time",
      note: "Written by each complete nightly sweep of the whole corpus through Google's URL Inspection API.",
      caveat:
        "No history exists before the first sweep — the API answers only 'now', which is why this series is persisted. A partial sweep (job died, quota, >5% API errors) publishes nothing rather than printing a crash as a de-indexation.",
      idPrefix: "ix",
      unitFormat: (n) => fmt(Math.round(n)),
      metrics: [
        { key: "index.indexed", label: "Indexed" },
        { key: "index.crawled_not_indexed", label: "Crawled, not indexed" },
      ],
    },
    "2026-08-17",
    isoDay(now),
    markers,
    eventsHtml,
  );

  return seal(
    c.html(
      layoutPage("/indexation", "Indexation — Grabient admin", stamp(now), c.get("email"), `
  ${latest ? `<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${tiles}</div>` : emptyState("No sweeps yet. The nightly cron runs at 05:40 UTC; the MCP indexation tool can run a bounded sweep now.")}
  <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
    ${trend ?? ""}
    ${
      latest
        ? `<section class="rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">Latest sweep, by bucket</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Sweep #${esc(String(latest.id))} · ${esc(String(latest.day))} · ${esc(String(latest.status))} · ${fmt(Number(latest.inspected ?? 0))} URLs inspected.</p>
  <div class="mt-4">${bucketTable}</div>
  ${
    notIndexedSample.length
      ? `<details class="mt-4 border-t border-edge pt-3"><summary class="cursor-pointer text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-ink">Sample of not-indexed URLs</summary>
  <div class="mt-3 max-h-64 overflow-auto">${dataTable(
    ["URL", "Bucket", "Coverage state"],
    notIndexedSample.map((r) => [String(r.url).replace("https://grabient.com", ""), String(r.bucket).replace(/_/g, " "), String(r.coverage_state ?? "—")]),
  )}</div></details>`
      : ""
  }
</section>`
        : ""
    }
  </div>`),
    ),
  );
});

app.get("/goals", async (c) => {
  const now = new Date();
  const goals = await listGoals(c.env.ADMIN_DB, now, true);
  const body =
    goals.length === 0
      ? emptyState("No goals yet. The agent sets them through the MCP goals tool, with a baseline, a target and a due date.")
      : `<div class="mt-6 grid items-start gap-4 lg:grid-cols-2">${goals.map(goalCard).join("\n")}</div>`;
  return seal(
    c.html(layoutPage("/goals", "Goals — Grabient admin", stamp(now), c.get("email"), body)),
  );
});

app.get("/campaigns", async (c) => {
  const now = new Date();
  const campaigns = c.env.ADMIN_DB ? await listCampaigns(c.env.ADMIN_DB) : [];
  const body =
    campaigns.length === 0
      ? emptyState(
          "No campaigns yet. When you buy an ad or place a link, have the agent create one (campaigns tool) with the utm tag, the window, the budget and — before it runs — the hypothesis. The report joins GA4, signup attribution and the metric history against it.",
        )
      : `<div class="mt-6 grid items-start gap-4 lg:grid-cols-2">${campaigns.map(campaignCard).join("\n")}</div>`;
  return seal(
    c.html(layoutPage("/campaigns", "Campaigns — Grabient admin", stamp(now), c.get("email"), body)),
  );
});

// The report archive. Raw-markdown route registers FIRST — Hono's :slug
// would otherwise swallow the .md suffix.
app.get("/reports/:file{[a-z0-9][a-z0-9-]*\\.md}", async (c) => {
  const slug = c.req.param("file").slice(0, -3);
  const report = await getReport(c.env.ADMIN_DB, slug);
  if (!report) return seal(c.html(errorPage(404, "Not found", "No such report."), 404));
  // nosniff (from seal) plus the explicit type is what stops a browser from
  // ever treating agent-authored text as HTML.
  return seal(
    new Response(report.body, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    }),
  );
});

app.get("/reports/:slug{[a-z0-9][a-z0-9-]*}", async (c) => {
  const report = await getReport(c.env.ADMIN_DB, c.req.param("slug"));
  if (!report) return seal(c.html(errorPage(404, "Not found", "No such report."), 404));
  const { html: body, headings } = renderMarkdown(report.body);
  return seal(
    c.html(
      reportPage(toMeta(report.row), body, headings, {
        stamp: stamp(new Date()),
        email: c.get("email"),
      }),
    ),
  );
});

app.get("/reports", async (c) => {
  const kind = c.req.query("kind");
  const { items, nextCursor } = await listReports(c.env.ADMIN_DB, {
    kind: kind === "report" || kind === "digest" ? kind : undefined,
    cursor: c.req.query("before"),
    limit: 25,
  });
  return seal(
    c.html(
      reportsArchivePage(items, {
        kind,
        nextCursor,
        stamp: stamp(new Date()),
        email: c.get("email"),
      }),
    ),
  );
});

app.get("/ops", async (c) => {
  let jobs: any[] = [];
  try {
    const res = await c.env.ADMIN_DB?.prepare(
      `SELECT job, started_at, finished_at, ok, rows_written, detail
         FROM job_run ORDER BY id DESC LIMIT 25`,
    ).all();
    jobs = res?.results ?? [];
  } catch (err) {
    console.error("job_run read failed (migration pending?)", err);
  }
  return seal(c.html(opsPage(jobs, { stamp: stamp(new Date()), email: c.get("email") })));
});

// POST only: a GET backfill would be prefetchable by a browser or link
// scanner. Already behind Access like everything else. Not exposed via MCP —
// an agent retrying a backfill in a loop is a quota risk; a human is not.
app.post("/ops/backfill", async (c) => {
  const source = c.req.query("source") as any;
  const days = c.req.query("days") ? Number(c.req.query("days")) : undefined;
  const dry = c.req.query("dry") === "1";
  const report = await runBackfill(c.env, new Date(), { source, days, dry });
  return seal(c.json(report));
});

app.notFound((c) => seal(c.html(errorPage(404, "Not found", "No such page."), 404)));

app.onError((err, c) => {
  console.error("Unhandled error", err);
  return seal(
    c.html(errorPage(500, "Something broke", "The error has been logged."), 500),
  );
});

const monthName = (month: string) =>
  monthDate(month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const shortMonth = (month: string) =>
  monthDate(month).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });



/**
 * "SG" -> "Singapore". Cloudflare returns ISO country codes; the axis has room
 * for the code, the tooltip has room for the name. Intl has the full table, so
 * no country list needs maintaining here.
 */
const countryName = (code: string): string => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Wordmark, section nav and provenance line — identical on every page. */
function header(current: string, generated: string, email: string): string {
  return `<header>
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      ${brand()}
      <p class="text-xs text-ink-muted">${esc(generated)} UTC · ${esc(email)}</p>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      ${nav(current)}
      <a href="/brief.json" class="text-xs text-ink-muted underline hover:text-ink">brief.json</a>
    </div>
    <div class="dashed-rule mt-4"></div>
  </header>`;
}

function stamp(now: Date): string {
  return now.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

/** Countries, devices, top content — and where visitors actually come from. */
function acquisitionPage(
  traffic: Traffic | null,
  acquisition: Acquisition | null,
  attribution: AttributionRow[],
  search: SearchConsole | null,
  ga4: Ga4 | null,
  now: Date,
  email: string,
): string {
  const share = (n: number, total: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "—");

  const attributionCard = `<section class="rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">Signups by first-touch source</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Where accounts came from, and how many of each group went on to like something.</p>
  <p class="mt-1.5 text-xs leading-snug text-ink-muted">Activation is the column that matters: the loudest channel and the channel that sends people who stay are routinely not the same one. Accounts created before attribution shipped are excluded rather than counted as direct.</p>
  ${
    attribution.length === 0
      ? `<p class="mt-4 rounded-lg border border-edge bg-page p-4 text-sm text-ink-secondary">No attributed signups yet. Attribution starts accumulating from the moment the capture ships to grabient.com — every account before that has no recorded source, and there is no way to backfill it.</p>`
      : dataTable(
          ["Source", "Signups", "Activated", "Rate"],
          attribution.map((row) => [
            row.source,
            fmt(row.users),
            fmt(row.activated),
            row.users > 0 ? `${((row.activated / row.users) * 100).toFixed(1)}%` : "—",
          ]),
        )
  }
</section>`;

  // Referring domains, from GA4's pageReferrer — a backlink report that
  // proves the link sends traffic. Aggregated to domains here; each domain's
  // top referring pages ride into the table.
  const domains = new Map<string, { sessions: number; pages: Map<string, number> }>();
  for (const row of ga4?.referrers ?? []) {
    let domain: string;
    try {
      domain = new URL(row.referrer).hostname.replace(/^www\./, "");
    } catch {
      domain = row.referrer.slice(0, 60);
    }
    const entry = domains.get(domain) ?? { sessions: 0, pages: new Map() };
    entry.sessions += row.sessions;
    entry.pages.set(row.referrer, (entry.pages.get(row.referrer) ?? 0) + row.sessions);
    domains.set(domain, entry);
  }
  const domainRows = [...domains.entries()]
    .map(([label, entry]) => ({ label, count: entry.sessions, pages: entry.pages }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 14);
  const referrerCard =
    domainRows.length === 0
      ? ""
      : chartCard({
          title: "Referring domains",
          note: `External sites whose links sent sessions in the last ${ga4?.days ?? 28} days, from GA4.`,
          caveat:
            "Bot-filtered by construction (GA4 is a browser beacon) and proves the link WORKS — a domain absent here may still link to us and simply send nobody. Search Console's Links report has no API; this is the live half of the backlink story, and the referring page itself is in the table.",
          svg: rankedBarChart(
            domainRows.map(({ label, count }) => ({ label, count })),
            "Sessions by referring domain",
            "refd",
            (n) => `${fmt(n)} sessions`,
          ),
          table: dataTable(
            ["Referring page", "Sessions"],
            (ga4?.referrers ?? [])
              .slice(0, 25)
              .map((row) => [row.referrer.replace(/^https?:\/\//, "").slice(0, 80), fmt(row.sessions)]),
          ),
        });

  const pct = (n: number) => `${n.toFixed(1)}%`;
  const searchCards = !search
    ? ""
    : search.queries.length === 0 && search.pages.length === 0
      ? `<section class="rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">Search Console</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Connected to <code class="text-xs">${esc(search.property)}</code>, no data yet.</p>
  <p class="mt-1.5 text-xs leading-snug text-ink-muted">Google takes a day or two to populate a newly verified property, and this window ends three days ago because Search Console itself lags. Authentication and property discovery are working — this card becomes two charts as soon as rows exist.</p>
</section>`
      : `${chartCard({
        title: "Top search queries",
        note: `What people searched to find the site, last ${search.days} days.`,
        caveat: `${fmt(search.totals.clicks)} clicks from ${fmt(search.totals.impressions)} impressions (${pct(search.totals.ctr)} CTR, average position ${search.totals.position.toFixed(1)}). Search Console lags about two days, so the window ends before today.`,
        svg: rankedBarChart(
          search.queries.map((row) => ({ label: row.key, count: row.clicks })),
          "Clicks by search query",
          "gscq",
          (n) => `${fmt(n)} clicks`,
        ),
        table: dataTable(
          ["Query", "Clicks", "Impressions", "CTR", "Position"],
          search.queries.map((row) => [
            row.key,
            fmt(row.clicks),
            fmt(row.impressions),
            pct(row.ctr),
            row.position.toFixed(1),
          ]),
        ),
      })}
${chartCard({
  title: "Top landing pages from search",
  note: `Which pages organic search actually lands on, last ${search.days} days.`,
  caveat:
    "This is the closest thing to a channel report available: it is the only source that names how people arrived, since Cloudflare cannot report referrers on this plan.",
  svg: rankedBarChart(
    search.pages.map((row) => ({ label: row.key.replace(/^https?:\/\/[^/]+/, "") || "/", count: row.clicks })),
    "Clicks by landing page",
    "gscp",
    (n) => `${fmt(n)} clicks`,
    (path) => {
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    },
  ),
  table: dataTable(
    ["Page", "Clicks", "Impressions", "CTR", "Position"],
    search.pages.map((row) => [
      row.key.replace(/^https?:\/\/[^/]+/, "") || "/",
      fmt(row.clicks),
      fmt(row.impressions),
      pct(row.ctr),
      row.position.toFixed(1),
    ]),
  ),
})}`;

  const body = !acquisition
    ? `<div class="mt-6 grid gap-4">${attributionCard}${referrerCard}${searchCards}<p class="text-sm text-ink-secondary">Traffic is not configured, so there is nothing else to break down. Set CF_ANALYTICS_TOKEN and CF_ZONE_ID.</p></div>`
    : `<div class="mt-6 grid items-start gap-4 lg:grid-cols-2">
${attributionCard}
${referrerCard}
${searchCards}
${chartCard({
  title: "Where visitors are",
  note: "Requests by country over the last 24 hours.",
  caveat:
    "A 24-hour window — this plan caps the underlying dataset at one day — and not bot-filtered, since that dataset has no browser-family field. One crawler run can reorder this list, so weigh it against the bot share on the overview.",
  svg: rankedBarChart(
    acquisition.countries,
    "Requests by country",
    "geo",
    (n) => `${fmt(n)} requests · ${share(n, acquisition.total)} of traffic`,
    countryName,
  ),
  table: dataTable(
    ["Country", "Requests", "Share"],
    acquisition.countries.map((row) => [
      `${countryName(row.label)} (${row.label})`,
      fmt(row.count),
      share(row.count, acquisition.total),
    ]),
  ),
})}
${chartCard({
  title: "Device mix",
  note: "Requests by device type over the last 24 hours.",
  caveat:
    "A ~99% desktop split is not credible for a consumer design tool — real audiences run far more mobile. Read this as further evidence that automated clients dominate the raw counts, not as a statement about your audience.",
  svg: rankedBarChart(
    acquisition.devices,
    "Requests by device type",
    "dev",
    (n) => `${fmt(n)} requests · ${share(n, acquisition.total)} of traffic`,
  ),
  table: dataTable(
    ["Device", "Requests", "Share"],
    acquisition.devices.map((row) => [row.label, fmt(row.count), share(row.count, acquisition.total)]),
  ),
})}
${chartCard({
  title: "Top content",
  note: "Most-requested pages over the last 24 hours.",
  caveat:
    "API endpoints, analytics beacons and static assets are filtered out — unfiltered, every page load fires a session check, a like lookup and several beacons, and those outrank every real page by an order of magnitude.",
  svg: rankedBarChart(
    acquisition.pages,
    "Requests by page path",
    "path",
    (n) => `${fmt(n)} requests`,
    // Paths arrive percent-encoded from the edge; the axis shows them raw but the
    // tooltip has room to decode "charcoal-%26-chocolate" into something readable.
    (path) => {
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    },
  ),
  table: dataTable(
    ["Path", "Requests"],
    acquisition.pages.map((row) => [row.label, fmt(row.count)]),
  ),
})}
<section class="rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">What this page cannot tell you</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">The remaining limits, so a number here is never read as more than it is.</p>
  <ul class="mt-4 space-y-3 text-sm text-ink-secondary">
    <li><span class="font-bold text-ink">No search-engine breakdown by keyword here.</span> Referring hosts are above, but a search engine reports itself as one host; which query brought someone is only in the Search Console cards, and only for Google.</li>
    <li><span class="font-bold text-ink">No per-visitor journey.</span> Traffic sources above are aggregate counts, and first-touch tags are recorded on <em>accounts</em>. You can see that a site sent 40 visits and that 3 accounts came from a campaign, but not which individual visit became which signup.</li>
    <li><span class="font-bold text-ink">Nothing before 15 Aug 2026.</span> Attribution shipped that day. Every account older than it has null attribution and cannot be backfilled, so channel shares must be taken over attributed accounts only.</li>
  </ul>
  <p class="mt-4 text-xs text-ink-muted">Joining an individual ad click to the signup it produced is the one gap left, and it needs Workers Analytics Engine — written up in apps/admin/README.md. Everything else on this list is a property of the data, not a missing integration.</p>
</section>
</div>`;

  return layout(
    "Acquisition — Grabient admin",
    `<main class="mx-auto max-w-6xl px-6 py-8 sm:py-10">
  ${header("/acquisition", stamp(now), email)}
  ${body}
</main>`,
  );
}

/** The human-readable face of brief.json. */
function briefPage(brief: ReturnType<typeof buildBrief>, now: Date, email: string): string {
  const list = (items: readonly string[]) =>
    items.map((item) => `<li class="leading-snug">${esc(item)}</li>`).join("");

  return layout(
    "Agent brief — Grabient admin",
    `<main class="mx-auto max-w-4xl px-6 py-8 sm:py-10">
  ${header("/brief", stamp(now), email)}

  <section class="mt-6 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">Summary</h2>
    <p class="mt-2 text-sm leading-relaxed text-ink-secondary">${esc(brief.summary)}</p>
    <p class="mt-4 text-xs text-ink-muted">
      The same content is served as JSON at <a href="/brief.json" class="underline hover:text-ink">/brief.json</a>,
      which is the form to hand an agent — it carries the definitions, caveats and gaps below as structured fields.
    </p>
  </section>

  <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
    <section class="rounded-xl border border-edge bg-surface p-5">
      <h2 class="text-base font-bold tracking-tight">Definitions</h2>
      <dl class="mt-3 space-y-3 text-sm">
        ${Object.entries(brief.definitions)
          .map(
            ([term, meaning]) =>
              `<div><dt class="font-bold text-ink">${esc(term)}</dt><dd class="mt-0.5 leading-snug text-ink-secondary">${esc(meaning)}</dd></div>`,
          )
          .join("")}
      </dl>
    </section>

    <div class="grid gap-4">
      <section class="rounded-xl border border-edge bg-surface p-5">
        <h2 class="text-base font-bold tracking-tight">Caveats</h2>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-secondary">${list(brief.caveats)}</ul>
      </section>
      <section class="rounded-xl border border-edge bg-surface p-5">
        <h2 class="text-base font-bold tracking-tight">Cannot be answered</h2>
        <p class="mt-1.5 text-sm leading-snug text-ink-secondary">
          Questions this data does not support. An agent that reads this will say so instead of inventing an answer.
        </p>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-secondary">${list(brief.unavailable)}</ul>
      </section>
    </div>
  </div>
</main>`,
  );
}

function dashboard(
  metrics: Metrics,
  traffic: Traffic | null,
  range: RangeOption,
  email: string,
): string {
  const { totals, signups, likers, cohorts, currentMonth } = metrics;

  const lastSignups = signups.at(-1);
  const prevSignups = signups.at(-2);
  const lastLikers = likers.at(-1);
  const prevLikers = likers.at(-2);

  const activationRate = totals.users > 0 ? (totals.activated / totals.users) * 100 : 0;
  // Straight-line projection from the days elapsed so far. Crude, but it is the
  // only way to compare a part-month against the full months beside it.
  const pace =
    currentMonth.dayOfMonth > 0
      ? Math.round((currentMonth.count / currentMonth.dayOfMonth) * currentMonth.daysInMonth)
      : 0;

  // Signups per 100k pageviews, for months where both sources cover the WHOLE
  // month. The traffic window starts mid-month, and a month whose pageviews are
  // half-counted while its signups are fully counted reports roughly double the
  // true rate — the first partial month otherwise lands as a fake cliff at the
  // left edge of the chart.
  const conversion = traffic
    ? signups
        .filter((row) => {
          const month = traffic.monthly.get(row.month);
          if (!month || month.pageViews <= 0) return false;
          const [year, mon] = row.month.split("-").map(Number);
          const daysInMonth = new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
          return month.days === daysInMonth;
        })
        .map((row) => ({
          month: row.month,
          // Denominator is browser pageviews, not total. Half of all pageviews
          // are automated, and that share is not stable month to month — a
          // crawler surge would otherwise show up as a collapse in signup
          // conversion when nothing about real visitors had changed.
          per100k:
            Math.round(
              (row.count / Math.max(1, traffic.monthly.get(row.month)!.browserPageViews)) *
                100000 *
                10,
            ) / 10,
        }))
    : [];
  const firstConv = conversion[0];
  const lastConv = conversion.at(-1);

  // Slice rather than refetch: traffic.ts already holds 180 days, so every range
  // and its comparison window come from one API call.
  const windows = splitPeriods(traffic?.daily ?? [], range.days);
  const browserPerDay = {
    current: windows.current.length
      ? sum(windows.current.map((d) => d.browserPageViews)) / windows.current.length
      : 0,
    previous: windows.previous.length
      ? sum(windows.previous.map((d) => d.browserPageViews)) / windows.previous.length
      : 0,
  };
  const browserChange = change(
    Math.round(browserPerDay.current),
    Math.round(browserPerDay.previous),
  );

  const tiles = [
    statTile({
      label: `Browser views / day · ${range.label}`,
      value: traffic ? fmt(Math.round(browserPerDay.current)) : "—",
      hero: true,
      sub: traffic
        ? changeBadge(browserChange, range.comparisonLabel)
        : `<span class="text-ink-muted">Traffic not configured</span>`,
    }),
    statTile({
      label: "Bots & unidentified",
      value: traffic ? `${automatedShare(traffic, range.days).toFixed(0)}%` : "—",
      sub: traffic
        ? `<span class="text-ink-muted">of pageviews over ${range.days} days came from clients that did not identify as a browser</span>`
        : undefined,
    }),
    statTile({
      label: "Total users",
      value: fmt(totals.users),
      sub: `<span class="text-ink-muted">${fmt(currentMonth.count)} so far in ${esc(
        monthDate(currentMonth.month).toLocaleDateString("en-US", {
          month: "long",
          timeZone: "UTC",
        }),
      )} · on pace for ~${fmt(pace)}</span>`,
    }),
    statTile({
      label: `New signups · ${lastSignups ? shortMonth(lastSignups.month) : "—"}`,
      value: lastSignups ? fmt(lastSignups.count) : "—",
      sub:
        lastSignups && prevSignups
          ? delta(lastSignups.count, prevSignups.count, `vs ${shortMonth(prevSignups.month)}`)
          : undefined,
    }),
    statTile({
      label: "Signups / 100k browser views",
      value: lastConv ? `${lastConv.per100k}` : "—",
      sub:
        lastConv && firstConv
          ? delta(lastConv.per100k, firstConv.per100k, `vs ${shortMonth(firstConv.month)}`)
          : `<span class="text-ink-muted">Needs traffic data</span>`,
    }),
    statTile({
      label: "Activation rate",
      value: `${activationRate.toFixed(1)}%`,
      sub: `<span class="text-ink-muted">${fmt(totals.activated)} of ${fmt(
        totals.users,
      )} accounts have ever liked a palette</span>`,
    }),
  ].join("\n");

  const cumulativePoints = cumulative(metrics);

  const trafficCharts = traffic
    ? [
        chartCard({
          title: "Real traffic vs automated",
          note: "Daily pageviews, split by whether the client identified as a web browser. Read the bold line.",
          caveat:
            "The bold line is a trailing 7-day mean, which removes exactly one week of day-of-week seasonality — weekends are a different business from weekdays, and on the raw series every Saturday reads as a crisis. Bot detection is a user-agent heuristic, not Cloudflare's bot score (Bot Management is not on this plan), so it is a floor on automated traffic rather than an exact figure.",
          legend: legend([
            { color: "var(--series-1)", label: "Browser views · 7-day average" },
            { color: "var(--series-1)", label: "Browser views · that day", faint: true },
            { color: "var(--series-2)", label: "Bots & unidentified" },
          ]),
          svg: dailyVisitorsChart(windows.current),
          table: dataTable(
            ["Date", "Browsers", "Bots & unidentified", "Distinct IPs"],
            [...windows.current]
              .reverse()
              .map((d) => [
                d.date,
                fmt(d.browserPageViews),
                fmt(d.automatedPageViews),
                fmt(d.uniques),
              ]),
          ),
        }),
        chartCard({
          title: "Signups per 100k pageviews",
          note: "The visitor-to-account funnel — how many people who land actually sign up.",
          caveat:
            "Normalised because traffic and signups moved in opposite directions; raw signup counts hide that. Bots sit in the denominator, so a traffic surge of crawlers would depress this without anything changing for real visitors.",
          svg: conversionChart(conversion),
          table: dataTable(
            ["Month", "Browser views", "Signups", "Per 100k"],
            conversion.map((row) => [
              monthName(row.month),
              fmt(traffic.monthly.get(row.month)?.browserPageViews ?? 0),
              fmt(signups.find((s) => s.month === row.month)?.count ?? 0),
              `${row.per100k}`,
            ]),
          ),
        }),
      ]
    : [];

  const charts = [
    ...trafficCharts,
    chartCard({
      title: "Total users",
      note: "Every registered account, accumulated over time.",
      svg: cumulativeUsersChart(cumulativePoints),
      table: dataTable(
        ["Month", "New", "Total"],
        signups.map((row, i) => [
          monthName(row.month),
          fmt(row.count),
          fmt(cumulativePoints[i]?.total ?? 0),
        ]),
      ),
    }),
    chartCard({
      title: "New signups per month",
      note: "How fast new accounts arrive — the rate behind the curve above.",
      caveat: `${monthName(currentMonth.month)} is still in progress and is excluded; it sits in the tile above instead.`,
      svg: newSignupsChart(signups),
      table: dataTable(
        ["Month", "New signups"],
        signups.map((row) => [monthName(row.month), fmt(row.count)]),
      ),
    }),
    chartCard({
      title: "Accounts liking each month",
      note: "Signed-in accounts that liked at least one palette that month.",
      caveat:
        "This is not site activity — it is a few dozen accounts out of tens of thousands of daily visitors, since liking requires an account. Likes are the signal rather than sessions because auth_session keeps only a rolling window and a returning user inside their 7-day session never creates a new row.",
      svg: activeUsersChart(likers),
      table: dataTable(
        ["Month", "Accounts", "Likes"],
        likers.map((row) => [monthName(row.month), fmt(row.likers), fmt(row.likes)]),
      ),
    }),
    chartCard({
      title: "Activation by signup cohort",
      note: "Of everyone who signed up in a given month, the share who have ever liked a palette since.",
      caveat: `Cohorts smaller than ${MIN_COHORT} users are omitted from the chart — the launch month had a single user, and a 100% bar flattens every real cohort. The newest cohorts are still maturing.`,
      svg: activationChart(cohorts),
      table: dataTable(
        ["Cohort", "Users", "Activated", "Rate"],
        cohorts.map((row) => [
          monthName(row.month),
          fmt(row.users),
          fmt(row.activated),
          row.users > 0 ? `${((row.activated / row.users) * 100).toFixed(1)}%` : "—",
        ]),
      ),
    }),
  ].join("\n");

  const generated = metrics.generatedAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return layout(
    "Grabient admin",
    `<main class="mx-auto max-w-6xl px-6 py-8 sm:py-10">
  ${header("/", generated, email)}

  <div class="mt-5">${rangeSelector("/", range.key, RANGES)}</div>

  <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
${tiles}
  </div>

  <div class="mt-4 grid gap-4 lg:grid-cols-2">
${charts}
  </div>

  <footer class="mt-10">
    <div class="dashed-rule"></div>
    <p class="mt-4 text-xs text-ink-muted">
      ${fmt(totals.palettes)} palettes · ${fmt(totals.likes)} likes. Read-only view of the
      production database.
    </p>
  </footer>
</main>`,
  );
}

// A Hono app object exposes only fetch; the cron needs the scheduled handler
// on the default export or it silently never runs.
export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
