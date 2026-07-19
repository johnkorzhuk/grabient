import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, isNotNull, like, sql, type SQL } from "drizzle-orm";
import {
  counters,
  palettes,
  pairs,
  queries,
  runs,
  HUMAN_LABELS,
  PAIR_STATUSES,
  QUERY_CATEGORIES,
  QUERY_SOURCES,
  VERDICTS,
} from "@/db/schema";
import { previewCss } from "@/lib/features";

/** Attach the true-render CSS to a card row; empty string falls back to the
 * client-side hexStops approximation for malformed historical coeffs. */
function withPreviewCss<
  T extends {
    coeffs: number[];
    style: string | null;
    steps: number | null;
    angle: number | null;
  },
>(row: T): Omit<T, "coeffs"> & { previewCss: string } {
  const { coeffs, ...rest } = row;
  let css = "";
  try {
    css = previewCss(coeffs, row.style, row.steps, row.angle);
  } catch {
    // fall through to the client-side approximation
  }
  return { ...rest, previewCss: css };
}

const HOUR_BUCKET = (col: unknown) =>
  sql<string>`strftime('%Y-%m-%dT%H:00', ${col} / 1000, 'unixepoch')`;

/**
 * Authed JSON for the dashboard: recent runs, recent pairs joined with their
 * query text + palette stops, and a score histogram. Everything else the page
 * needs already exists (/api/stats, /api/coverage).
 */
/** Training-readiness gates (mirrors TRAINING.md §6). */
export const READINESS_TARGETS = {
  sftPairs: 10000,
  sftQueries: 8000,
  golden: 300,
  dpo: 1500,
  headTermPct: 8,
  nonEnglishPct: 5,
  colorTheoryPct: 5,
} as const;

export const dashboardApiRoutes = new Hono<{ Bindings: Env }>()
  .get("/health", async (c) => {
    const db = drizzle(c.env.DB);
    const today = `triage-calls-${new Date().toISOString().slice(0, 10)}`;
    const [
      sft,
      dpo,
      goldenQ,
      queryStats,
      sourceCounts,
      judgeModelCounts,
      triageStats,
      triageBudget,
      humanRequests,
    ] = await Promise.all([
      db
        .select({
          pairs: sql<number>`count(*)`,
          queries: sql<number>`count(distinct ${pairs.queryId})`,
        })
        .from(pairs)
        .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
        .where(
          and(
            eq(pairs.status, "scored"),
            eq(pairs.verdict, "ok"),
            sql`${pairs.score} >= 7`,
            sql`${palettes.status} != 'rejected'`,
            sql`(${pairs.humanLabel} is null or ${pairs.humanLabel} != 'bad-match')`,
          ),
        ),
      db
        .select({ n: sql<number>`count(*)` })
        .from(
          db
            .select({ queryId: pairs.queryId })
            .from(pairs)
            .where(eq(pairs.status, "scored"))
            .groupBy(pairs.queryId)
            .having(
              sql`count(*) >= 2 and max(${pairs.score}) - min(${pairs.score}) >= 3`,
            )
            .as("dpoq"),
        ),
      db
        .select({ n: sql<number>`count(distinct ${pairs.queryId})` })
        .from(pairs)
        .where(eq(pairs.golden, true)),
      db
        .select({
          total: sql<number>`count(*)`,
          headTerms: sql<number>`sum(case when length(${queries.text}) - length(replace(${queries.text}, ' ', '')) + 1 <= 2 then 1 else 0 end)`,
          nonEnglish: sql<number>`sum(case when ${queries.text} glob '*[^ -~]*' then 1 else 0 end)`,
          emoji: sql<number>`sum(case when ${queries.styleHint} = 'emoji' then 1 else 0 end)`,
          transitions: sql<number>`sum(case when ${queries.text} like '% into %' or ${queries.text} like '%fading%' or ${queries.text} like '%drifting%' or ${queries.text} like '%melting%' then 1 else 0 end)`,
          colorTheory: sql<number>`sum(case when ${queries.category} = 'color-theory' then 1 else 0 end)`,
        })
        .from(queries),
      db
        .select({ source: queries.source, n: sql<number>`count(*)` })
        .from(queries)
        .groupBy(queries.source),
      db
        .select({
          model: sql<string>`coalesce(${pairs.judgeModel}, 'opus')`,
          n: sql<number>`count(*)`,
        })
        .from(pairs)
        .where(eq(pairs.status, "scored"))
        .groupBy(sql`coalesce(${pairs.judgeModel}, 'opus')`),
      db
        .select({
          triaged: sql<number>`count(*)`,
          rejected: sql<number>`sum(case when ${pairs.status} = 'rejected' and ${pairs.judgeNotes} like 'triage:%' then 1 else 0 end)`,
        })
        .from(pairs)
        .where(isNotNull(pairs.triagedAt)),
      db.select({ value: counters.value }).from(counters).where(eq(counters.key, today)),
      db
        .select({
          text: queries.text,
          createdAt: queries.createdAt,
          pairCount: sql<number>`count(${pairs.paletteSeed})`,
          scored: sql<number>`sum(case when ${pairs.status} = 'scored' then 1 else 0 end)`,
          best: sql<number | null>`max(${pairs.score})`,
        })
        .from(queries)
        .leftJoin(pairs, eq(pairs.queryId, queries.id))
        .where(eq(queries.source, "human"))
        .groupBy(queries.id)
        .orderBy(desc(queries.createdAt))
        .limit(10),
    ]);
    const qs = queryStats[0]!;
    const src = Object.fromEntries(sourceCounts.map((r) => [r.source, r.n]));
    return c.json({
      readiness: {
        sftPairs: sft[0]?.pairs ?? 0,
        sftQueries: sft[0]?.queries ?? 0,
        golden: goldenQ[0]?.n ?? 0,
        dpo: dpo[0]?.n ?? 0,
        headTermPct: qs.total ? (100 * (qs.headTerms ?? 0)) / qs.total : 0,
        nonEnglishPct: qs.total ? (100 * (qs.nonEnglish ?? 0)) / qs.total : 0,
        colorTheoryPct: qs.total ? (100 * (qs.colorTheory ?? 0)) / qs.total : 0,
        targets: READINESS_TARGETS,
      },
      corpus: {
        totalQueries: qs.total,
        emoji: qs.emoji ?? 0,
        transitionPct: qs.total ? (100 * (qs.transitions ?? 0)) / qs.total : 0,
        sources: src,
        judgedBy: Object.fromEntries(judgeModelCounts.map((r) => [r.model, r.n])),
      },
      triage: {
        callsToday: triageBudget[0]?.value ?? 0,
        cap: 1200,
        triaged: triageStats[0]?.triaged ?? 0,
        rejected: triageStats[0]?.rejected ?? 0,
      },
      humanRequests,
    });
  })
  .get("/explore", async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query();
    const limit = Math.min(48, Math.max(1, Number(q.limit ?? 24)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    const conditions: SQL[] = [];
    if (q.q) conditions.push(like(queries.text, `%${q.q}%`));
    if (q.category && (QUERY_CATEGORIES as readonly string[]).includes(q.category))
      conditions.push(eq(queries.category, q.category as (typeof QUERY_CATEGORIES)[number]));
    if (q.status && (PAIR_STATUSES as readonly string[]).includes(q.status))
      conditions.push(eq(pairs.status, q.status as (typeof PAIR_STATUSES)[number]));
    if (q.verdict && (VERDICTS as readonly string[]).includes(q.verdict))
      conditions.push(eq(pairs.verdict, q.verdict as (typeof VERDICTS)[number]));
    if (q.source && (QUERY_SOURCES as readonly string[]).includes(q.source))
      conditions.push(eq(queries.source, q.source as (typeof QUERY_SOURCES)[number]));
    if (q.golden === "1") conditions.push(eq(pairs.golden, true));
    if (q.human === "any") conditions.push(isNotNull(pairs.humanLabel));
    else if (q.human && (HUMAN_LABELS as readonly string[]).includes(q.human))
      conditions.push(eq(pairs.humanLabel, q.human as (typeof HUMAN_LABELS)[number]));
    if (q.minScore !== undefined && q.minScore !== "")
      conditions.push(sql`${pairs.score} >= ${Number(q.minScore)}`);
    if (q.theme)
      conditions.push(like(palettes.themes, `%"${q.theme.toLowerCase()}"%`));
    const where = conditions.length ? and(...conditions) : undefined;

    const grouped_ = q.group === "palette";
    const order =
      q.sort === "score-desc"
        ? [desc(grouped_ ? sql`avg(${pairs.score})` : pairs.score)]
        : q.sort === "score-asc"
          ? [asc(grouped_ ? sql`avg(${pairs.score})` : pairs.score)]
          : [desc(grouped_ ? sql`max(${pairs.createdAt})` : pairs.createdAt)];

    // group=palette collapses the pair-centric view: one card per palette
    // with all of its queries aggregated (a palette legitimately has several
    // queries — that is training signal, not duplication).
    const grouped = q.group === "palette";
    const base = grouped
      ? db
          .select({
            queryId: sql<string | null>`null`,
            queryText: sql<string>`group_concat(${queries.text}, ' • ')`,
            category: sql<string>`cast(count(*) as text) || ' queries'`,
            seed: palettes.seed,
            hexStops: palettes.hexStops,
            coeffs: palettes.coeffs,
            themes: palettes.themes,
            score: sql<number | null>`round(avg(${pairs.score}), 1)`,
            verdict: sql<string | null>`null`,
            status: sql<string>`''`,
            source: sql<string>`''`,
            golden: sql<number>`max(${pairs.golden})`,
            humanLabel: sql<string | null>`null`,
            triageVotes: sql<string | null>`null`,
            humanCount: sql<number>`sum(case when ${pairs.humanLabel} is not null then 1 else 0 end)`,
            paletteStatus: palettes.status,
            style: palettes.style,
            steps: palettes.steps,
            angle: palettes.angle,
            createdAt: sql<number>`max(${pairs.createdAt})`,
          })
          .from(pairs)
          .innerJoin(queries, eq(pairs.queryId, queries.id))
          .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
          .groupBy(palettes.seed)
      : db
          .select({
            queryId: sql<string | null>`${queries.id}`,
            queryText: queries.text,
            category: queries.category,
            seed: palettes.seed,
            hexStops: palettes.hexStops,
            coeffs: palettes.coeffs,
            themes: palettes.themes,
            score: pairs.score,
            verdict: pairs.verdict,
            status: pairs.status,
            source: queries.source,
            golden: pairs.golden,
            humanLabel: pairs.humanLabel,
            humanCount: sql<number>`0`,
            paletteStatus: palettes.status,
            triageVotes: pairs.triageVotes,
            style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
            steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
            angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
            createdAt: pairs.createdAt,
          })
          .from(pairs)
          .innerJoin(queries, eq(pairs.queryId, queries.id))
          .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed));

    const countQuery = db
      .select({
        count: grouped
          ? sql<number>`count(distinct ${pairs.paletteSeed})`
          : sql<number>`count(*)`,
      })
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed));

    const [rows, total] = await Promise.all([
      (where ? base.where(where) : base)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      where ? countQuery.where(where) : countQuery,
    ]);
    return c.json({
      total: total[0]?.count ?? 0,
      limit,
      offset,
      rows: rows.map(withPreviewCss),
    });
  })
  .get("/recent", async (c) => {
    const db = drizzle(c.env.DB);
    const [
      recentRuns,
      recentPairs,
      histogram,
      paletteGrowth,
      pairGrowth,
      scoredGrowth,
      goldenCount,
      themedCount,
      humanCounts,
    ] = await Promise.all([
      db.select().from(runs).orderBy(desc(runs.startedAt)).limit(20),
      db
        .select({
          queryText: queries.text,
          category: queries.category,
          seed: palettes.seed,
          hexStops: palettes.hexStops,
          coeffs: palettes.coeffs,
          paletteStatus: palettes.status,
          style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
          steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
          angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
          score: pairs.score,
          verdict: pairs.verdict,
          status: pairs.status,
          source: pairs.source,
          createdAt: pairs.createdAt,
          judgedAt: pairs.judgedAt,
        })
        .from(pairs)
        .innerJoin(queries, eq(pairs.queryId, queries.id))
        .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
        .orderBy(desc(pairs.createdAt))
        .limit(48),
      db
        .select({
          bin: sql<number>`cast(round(${pairs.score}) as integer)`,
          count: sql<number>`count(*)`,
        })
        .from(pairs)
        .where(eq(pairs.status, "scored"))
        .groupBy(sql`cast(round(${pairs.score}) as integer)`),
      db
        .select({ bucket: HOUR_BUCKET(palettes.createdAt), count: sql<number>`count(*)` })
        .from(palettes)
        .groupBy(HOUR_BUCKET(palettes.createdAt)),
      db
        .select({ bucket: HOUR_BUCKET(pairs.createdAt), count: sql<number>`count(*)` })
        .from(pairs)
        .groupBy(HOUR_BUCKET(pairs.createdAt)),
      db
        .select({ bucket: HOUR_BUCKET(pairs.judgedAt), count: sql<number>`count(*)` })
        .from(pairs)
        .where(isNotNull(pairs.judgedAt))
        .groupBy(HOUR_BUCKET(pairs.judgedAt)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(pairs)
        .where(eq(pairs.golden, true)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(palettes)
        .where(isNotNull(palettes.themes)),
      db
        .select({ label: pairs.humanLabel, count: sql<number>`count(*)` })
        .from(pairs)
        .where(isNotNull(pairs.humanLabel))
        .groupBy(pairs.humanLabel),
    ]);
    return c.json({
      runs: recentRuns,
      pairs: recentPairs.map(withPreviewCss),
      histogram,
      growth: {
        palettes: paletteGrowth,
        pairs: pairGrowth,
        scored: scoredGrowth,
      },
      goldenCount: goldenCount[0]?.count ?? 0,
      themedCount: themedCount[0]?.count ?? 0,
      humanCounts: Object.fromEntries(
        humanCounts.map((r) => [r.label, r.count]),
      ),
    });
  });

/** Static shell; holds no data and no secrets, so it is served without auth.
 *  The page asks for the HARNESS_API_KEY once and keeps it in localStorage. */
export const dashboardPage = new Hono<{ Bindings: Env }>().get("/", (c) =>
  c.html(DASHBOARD_HTML),
);

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>grabient data-collection</title>
<style>
  :root {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19;
    --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --border: rgba(255,255,255,0.10);
    --series: #3987e5;
    --good: #0ca30c; --warn: #fab219; --crit: #d03b3b;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--page); color: var(--ink);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 20px; max-width: 1180px; margin: 0 auto;
  }
  h1 { font-size: 16px; font-weight: 600; }
  h2 { font-size: 12px; font-weight: 600; color: var(--muted);
       text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  header .meta { color: var(--muted); font-size: 12px; }
  header button {
    margin-left: auto; background: none; border: 1px solid var(--border);
    color: var(--ink-2); border-radius: 6px; padding: 4px 12px; cursor: pointer; font: inherit; font-size: 12px;
  }
  header button:hover { border-color: var(--muted); }
  section { margin-bottom: 26px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .tile .label { color: var(--muted); font-size: 12px; }
  .tile .value { font-size: 26px; font-weight: 650; margin-top: 2px; }
  .tile .sub { color: var(--ink-2); font-size: 12px; margin-top: 2px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }

  .hist { display: flex; align-items: flex-end; gap: 2px; height: 120px; border-bottom: 1px solid var(--grid); }
  .hist .bar { flex: 1; background: var(--series); border-radius: 4px 4px 0 0; min-height: 2px; position: relative; }
  .hist .bar .top { position: absolute; top: -18px; left: 0; right: 0; text-align: center;
       font-size: 11px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .hist-x { display: flex; gap: 2px; margin-top: 4px; }
  .hist-x span { flex: 1; text-align: center; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

  .hbar { display: grid; grid-template-columns: 110px 1fr 34px; align-items: center; gap: 8px; margin-bottom: 6px; }
  .hbar .name { color: var(--ink-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbar .track { height: 14px; }
  .hbar .fill { height: 100%; background: var(--series); border-radius: 0 4px 4px 0; min-width: 2px; }
  .hbar .n { color: var(--muted); font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; }
  .gaps { display: flex; flex-wrap: wrap; gap: 6px; }
  .gap-chip { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px;
       font-size: 12px; color: var(--ink-2); }
  .gap-chip b { color: var(--ink); font-weight: 600; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase;
       letter-spacing: 0.05em; font-weight: 600; padding: 4px 10px 6px 0; border-bottom: 1px solid var(--grid); }
  td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--grid);
       color: var(--ink-2); font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .card a.swatch { display: block; height: 64px; }
  .card .body { padding: 8px 10px 10px; }
  .card .q { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis;
       display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 2.9em; }
  .card .row { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: var(--muted); }
  .score { margin-left: auto; font-weight: 650; font-size: 13px; font-variant-numeric: tabular-nums; }
  .empty { color: var(--muted); font-size: 13px; }
  .legend { display: flex; gap: 14px; margin-top: 8px; font-size: 12px; color: var(--ink-2); flex-wrap: wrap; }
  .legend .chip .dot { width: 8px; height: 8px; border-radius: 50%; }
  #growth svg { width: 100%; height: auto; display: block; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center; }
  .filters input, .filters select {
    background: var(--surface); border: 1px solid var(--border); border-radius: 7px;
    color: var(--ink); font: inherit; font-size: 12px; padding: 5px 8px; }
  .filters input[type="text"] { min-width: 180px; }
  .filters input[type="number"] { width: 74px; }
  .filters label { font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; gap: 5px; }
  .filters button { background: var(--series); border: none; border-radius: 7px; color: #fff;
    font: inherit; font-size: 12px; font-weight: 600; padding: 5px 14px; cursor: pointer; }
  .pager { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--muted); }
  .pager button { background: none; border: 1px solid var(--border); border-radius: 6px;
    color: var(--ink-2); padding: 3px 12px; cursor: pointer; font: inherit; font-size: 12px; }
  .pager button:disabled { opacity: 0.4; cursor: default; }
  .badge-golden { color: var(--warn); font-size: 11px; }
  .badge-human { color: #b07cd8; font-size: 11px; }
  .badge-rejected { color: var(--crit); font-size: 11px; }
  .card .actions { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
  .card .actions button {
    background: none; border: 1px solid var(--border); border-radius: 6px;
    color: var(--ink-2); font-size: 12px; padding: 2px 8px; cursor: pointer; }
  .card .actions button:hover { border-color: var(--muted); }
  .card .actions button:disabled { opacity: 0.4; cursor: default; }
  .card .actions .act-on { border-color: var(--warn); color: var(--warn); }
  #rq-panel textarea {
    width: 100%; min-height: 64px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 7px; color: var(--ink);
    font: inherit; font-size: 13px; padding: 8px; resize: vertical; }
  #rq-result { font-size: 12px; color: var(--muted); min-height: 1.2em; margin-top: 6px; }
  .gate { display: grid; grid-template-columns: 150px 1fr 110px; align-items: center;
    gap: 10px; margin-bottom: 8px; }
  .gate .name { color: var(--ink-2); font-size: 12px; }
  .gate .track { height: 10px; background: var(--grid); border-radius: 5px; overflow: hidden; }
  .gate .fill { height: 100%; background: var(--series); border-radius: 5px; min-width: 2px; }
  .gate .fill.met { background: var(--good); }
  .gate .n { color: var(--muted); font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; }
  .hrow { display: flex; justify-content: space-between; font-size: 12px;
    color: var(--ink-2); padding: 3px 0; border-bottom: 1px solid var(--grid); }
  .hrow:last-child { border-bottom: none; }
  .hrow .v { color: var(--ink); font-variant-numeric: tabular-nums; }
  .hrow .v.warn { color: var(--warn); }
  .badge-triage { color: #6aa5c9; font-size: 11px; }
  #rq-list { margin-top: 10px; }
  #rq-list .hrow .q { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
  #gate { display: none; margin: 60px auto; max-width: 380px; text-align: center; }
  #gate input { width: 100%; margin: 10px 0; padding: 8px 10px; background: var(--surface);
       border: 1px solid var(--border); border-radius: 8px; color: var(--ink); font: inherit; }
  #gate button { width: 100%; padding: 8px; background: var(--series); border: none;
       border-radius: 8px; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  #err { color: var(--crit); font-size: 12px; min-height: 1.2em; }
</style>
</head>
<body>
<div id="gate">
  <h1>grabient data-collection</h1>
  <p class="empty" style="margin-top:8px">Paste the HARNESS_API_KEY to view the dashboard. It is stored only in this browser.</p>
  <input id="key-input" type="password" placeholder="HARNESS_API_KEY" autocomplete="off">
  <div id="err"></div>
  <button id="key-save">View dashboard</button>
</div>
<div id="app" style="display:none">
  <header>
    <h1>grabient data-collection</h1>
    <span class="meta" id="updated"></span>
    <button id="logout" type="button">forget key</button>
  </header>
  <section><div class="tiles" id="tiles"></div></section>
  <div class="cols">
    <section class="panel">
      <h2>Training readiness</h2>
      <div id="gates"></div>
    </section>
    <section class="panel">
      <h2>Pipeline health</h2>
      <div id="health"></div>
    </section>
  </div>
  <section class="panel">
    <h2>Dataset growth (cumulative)</h2>
    <div id="growth"></div>
  </section>
  <div class="cols">
    <section class="panel">
      <h2>Judge scores (scored pairs)</h2>
      <div id="hist"></div>
    </section>
    <section class="panel">
      <h2>Coverage gaps (generator targets)</h2>
      <div class="gaps" id="gaps"></div>
      <h2 style="margin-top:16px">Query categories</h2>
      <div id="cats"></div>
      <h2 style="margin-top:16px">Harmony coverage (palette tags)</h2>
      <div id="harmony"></div>
    </section>
  </div>
  <div class="cols">
    <section class="panel"><h2>Brightness bands</h2><div id="bright"></div></section>
    <section class="panel"><h2>Contrast bands</h2><div id="contrast"></div></section>
  </div>
  <section class="panel">
    <h2>Recent runs</h2>
    <div style="overflow-x:auto"><table id="runs"></table></div>
  </section>
  <section class="panel" id="rq-panel">
    <h2>Request queries</h2>
    <textarea id="rq-text" placeholder="one query per line (max 20) — the generation loop will author palettes for these next, and the judge scores them with priority"></textarea>
    <div class="filters" style="margin-top:8px; margin-bottom:0">
      <select id="rq-category">
        <option value="">category: let it default</option>
        <option>scene</option><option>mood</option><option>aesthetic</option>
        <option>color-explicit</option><option>object</option><option>nature</option>
        <option>abstract</option><option>season-weather-time</option>
        <option>color-theory</option>
      </select>
      <button id="rq-submit" type="button">Submit queries</button>
    </div>
    <div id="rq-result"></div>
    <div id="rq-list"></div>
  </section>
  <section>
    <h2>Explore pairs</h2>
    <div class="filters">
      <input type="text" id="f-q" placeholder="search query text…">
      <select id="f-category">
        <option value="">any category</option>
        <option>scene</option><option>mood</option><option>aesthetic</option>
        <option>color-explicit</option><option>object</option><option>nature</option>
        <option>abstract</option><option>season-weather-time</option>
        <option>color-theory</option>
      </select>
      <select id="f-status">
        <option value="">any status</option>
        <option>pending</option><option>scored</option><option>rejected</option>
      </select>
      <select id="f-verdict">
        <option value="">any verdict</option>
        <option>ok</option><option>bad-match</option><option>bad-palette</option>
      </select>
      <select id="f-source">
        <option value="">any source</option>
        <option>forward</option><option>caption</option><option>human</option>
      </select>
      <select id="f-humanlabel">
        <option value="">any human label</option>
        <option value="any">human-labeled</option>
        <option>golden</option><option>not-golden</option>
        <option>good</option><option>bad-match</option>
      </select>
      <input type="number" id="f-minscore" placeholder="min ★" min="0" max="10">
      <input type="text" id="f-theme" placeholder="theme…" style="min-width:100px">
      <label><input type="checkbox" id="f-golden"> golden</label>
      <label><input type="checkbox" id="f-group"> one card per palette</label>
      <select id="f-sort">
        <option value="new">newest</option>
        <option value="score-desc">score ↓</option>
        <option value="score-asc">score ↑</option>
      </select>
      <button id="f-apply" type="button">Apply</button>
    </div>
    <div class="cards" id="cards"></div>
    <div class="pager">
      <button id="pg-prev" type="button">‹ prev</button>
      <span id="pg-info"></span>
      <button id="pg-next" type="button">next ›</button>
    </div>
  </section>
</div>
<script>
(function () {
  var LS = "dc_api_key";
  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var errEl = document.getElementById("err");

  function key() { return localStorage.getItem(LS) || ""; }
  function showGate(msg) {
    gate.style.display = "block"; app.style.display = "none";
    errEl.textContent = msg || "";
  }
  document.getElementById("key-save").addEventListener("click", function () {
    var v = document.getElementById("key-input").value.trim();
    if (!v) return;
    localStorage.setItem(LS, v);
    boot();
  });
  document.getElementById("key-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("key-save").click();
  });
  document.getElementById("logout").addEventListener("click", function () {
    localStorage.removeItem(LS); showGate("");
  });

  function api(path) {
    return fetch("/api" + path, { headers: { Authorization: "Bearer " + key() } })
      .then(function (r) {
        if (r.status === 401) throw new Error("unauthorized");
        if (!r.ok) throw new Error("request failed: " + r.status);
        return r.json();
      });
  }
  function apiPost(path, body) {
    return fetch("/api" + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (r.status === 401) throw new Error("unauthorized");
      if (!r.ok) throw new Error("request failed: " + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function fmtAgo(ts) {
    if (!ts) return "";
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return Math.round(s) + "s ago";
    if (s < 5400) return Math.round(s / 60) + "m ago";
    if (s < 129600) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  }
  function sum(obj) {
    var t = 0; for (var k in obj) t += obj[k]; return t;
  }
  function statusChip(status) {
    var color = status === "done" ? "var(--good)" : status === "failed" ? "var(--crit)" : "var(--warn)";
    return '<span class="chip"><span class="dot" style="background:' + color + '"></span>' + esc(status) + "</span>";
  }
  function hbars(el, entries, max) {
    var html = "";
    entries.forEach(function (e) {
      var w = max > 0 ? Math.max(1, (e[1] / max) * 100) : 1;
      html += '<div class="hbar"><span class="name" title="' + esc(e[0]) + '">' + esc(e[0]) +
        '</span><div class="track"><div class="fill" style="width:' + w + '%"></div></div>' +
        '<span class="n">' + e[1] + "</span></div>";
    });
    el.innerHTML = html || '<p class="empty">no data yet</p>';
  }

  function actionButton(i, act, label, title, on) {
    return '<button data-i="' + i + '" data-act="' + act + '" title="' + title +
      '"' + (on ? ' class="act-on"' : "") + ">" + label + "</button>";
  }

  function cardActionsHTML(pa, i) {
    var buttons = "";
    if (pa.queryId) {
      buttons += actionButton(i, pa.golden ? "not-golden" : "golden", "★",
        pa.golden ? "remove gold label" : "gold-label for the eval set", !!pa.golden);
      buttons += actionButton(i, "good", "👍", "good match (3x training weight)",
        pa.humanLabel === "good");
      buttons += actionButton(i, "bad-match", "👎", "bad match (exclude from training)",
        pa.humanLabel === "bad-match");
      if (pa.humanLabel) buttons += actionButton(i, "clear", "✕", "clear human label", false);
    }
    if (pa.paletteStatus === "rejected") {
      buttons += actionButton(i, "palette-restore", "↩", "restore this palette", false);
    } else {
      buttons += actionButton(i, "palette-reject", "🗑", "reject this palette entirely", false);
    }
    return '<div class="actions">' + buttons + "</div>";
  }

  function cardHTML(pa, i) {
    var stops = (pa.hexStops || []).join(", ");
    var cssAngle = pa.angle == null ? 90 : pa.angle;
    var grad = pa.previewCss ||
      (pa.style && pa.style.indexOf("radial") === 0
        ? "radial-gradient(circle, " + stops + ")"
        : pa.style && pa.style.indexOf("angular") === 0
          ? "conic-gradient(from " + cssAngle + "deg, " + stops + ")"
          : "linear-gradient(" + cssAngle + "deg, " + stops + ")");
    var params = [];
    if (pa.style) params.push("style=" + pa.style);
    if (pa.angle != null) params.push("angle=" + pa.angle);
    if (pa.steps != null) params.push("steps=" + pa.steps);
    var href = "https://grabient.com/" + encodeURIComponent(pa.seed) +
      (params.length ? "?" + params.join("&") : "");
    var pres = pa.style
      ? pa.style + (pa.angle != null ? " · " + pa.angle + "°" : "") + (pa.steps != null ? " · " + pa.steps : "")
      : "no presentation";
    var themes = pa.themes && pa.themes.length ? pa.themes.join(", ") : "";
    var scoreColor = pa.score == null ? "var(--muted)" : pa.score >= 7 ? "var(--good)" : pa.score < 4 ? "var(--crit)" : "var(--ink-2)";
    var scoreText = pa.score == null ? "unscored" : pa.score;
    var badges = "";
    if (pa.golden) badges += '<span class="badge-golden">★ golden</span>';
    if (pa.triageVotes && pa.triageVotes.length) {
      badges += '<span class="badge-triage" title="free-model panel votes">🤖 ' +
        pa.triageVotes.map(function (v) { return esc(String(v.vote).charAt(0)); }).join("/") +
        "</span>";
    }
    if (pa.humanLabel) badges += '<span class="badge-human">✋ ' + esc(pa.humanLabel) + "</span>";
    if (!pa.humanLabel && pa.humanCount) badges += '<span class="badge-human">✋ ' + pa.humanCount + "</span>";
    if (pa.paletteStatus === "rejected") badges += '<span class="badge-rejected">rejected</span>';
    return '<div class="card"><a class="swatch" style="background:' + grad +
      '" href="' + href + '" target="_blank" rel="noopener" title="open on grabient.com"></a>' +
      '<div class="body"><div class="q" title="' + esc(pa.queryText) + '">' + esc(pa.queryText) + "</div>" +
      '<div class="row"><span title="' + esc(pres) + '">' + esc(pres) + "</span>" + badges + "</div>" +
      (themes ? '<div class="row"><span title="' + esc(themes) + '">' + esc(themes) + "</span></div>" : "") +
      '<div class="row"><span>' + esc(pa.category) + "</span><span>" + esc(pa.verdict || pa.status) + "</span>" +
      '<span class="score" style="color:' + scoreColor + '">' + esc(scoreText) + "</span></div>" +
      cardActionsHTML(pa, i) + "</div></div>";
  }

  function gateRow(name, value, target, isPct) {
    var pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
    var shown = isPct ? value.toFixed(1) + "%" : Math.round(value).toLocaleString();
    var goal = isPct ? target + "%" : target.toLocaleString();
    return '<div class="gate"><span class="name">' + name + '</span>' +
      '<div class="track"><div class="fill' + (pct >= 100 ? " met" : "") +
      '" style="width:' + Math.max(1, pct).toFixed(1) + '%"></div></div>' +
      '<span class="n">' + shown + " / " + goal + "</span></div>";
  }

  function renderHealth(h) {
    var r = h.readiness, t = r.targets;
    document.getElementById("gates").innerHTML =
      gateRow("SFT pairs", r.sftPairs, t.sftPairs, false) +
      gateRow("Distinct queries", r.sftQueries, t.sftQueries, false) +
      gateRow("Golden eval", r.golden, t.golden, false) +
      gateRow("DPO pairs", r.dpo, t.dpo, false) +
      gateRow("Head terms", r.headTermPct, t.headTermPct, true) +
      gateRow("Non-English", r.nonEnglishPct, t.nonEnglishPct, true) +
      gateRow("Color theory", r.colorTheoryPct || 0, t.colorTheoryPct || 5, true);

    var c = h.corpus, tr = h.triage;
    var ratio = (c.sources.caption || 0) && (c.sources.forward || 0)
      ? ((c.sources.caption || 0) / Math.max(1, c.sources.forward || 0)).toFixed(1) + ":1"
      : "—";
    function hrow(name, value, warn) {
      return '<div class="hrow"><span>' + name + '</span><span class="v' +
        (warn ? " warn" : "") + '">' + value + "</span></div>";
    }
    document.getElementById("health").innerHTML =
      hrow("Triage budget today", tr.callsToday + " / " + tr.cap + " calls",
        tr.callsToday >= tr.cap) +
      hrow("Triage screened / auto-rejected", tr.triaged + " / " + tr.rejected, false) +
      hrow("Transition-phrase queries", c.transitionPct.toFixed(1) + "% (target <15%)",
        c.transitionPct > 20) +
      hrow("Caption : forward ratio", ratio + " (target ~3:1)", false) +
      hrow("Emoji queries", c.emoji, false) +
      hrow("Scored by opus : sonnet (easy tier)",
        ((c.judgedBy || {}).opus || 0) + " : " + ((c.judgedBy || {}).sonnet || 0), false) +
      hrow("Owner requests pending",
        (h.humanRequests || []).filter(function (q) { return q.scored === 0; }).length,
        false);

    var reqs = h.humanRequests || [];
    document.getElementById("rq-list").innerHTML = reqs.length
      ? reqs.map(function (q) {
          var state = q.pairCount === 0 ? "queued" :
            q.scored === 0 ? q.pairCount + " palettes, judging…" :
            q.scored + " scored, best " + (q.best == null ? "—" : q.best);
          return '<div class="hrow"><span class="q" title="' + esc(q.text) + '">' +
            esc(q.text) + '</span><span class="v">' + esc(state) + "</span></div>";
        }).join("")
      : "";
  }

  var GROWTH_SERIES = [
    ["palettes", "#3987e5"],
    ["pairs", "#008300"],
    ["scored", "#d55181"],
  ];
  function renderGrowth(growth) {
    var el = document.getElementById("growth");
    growth = growth || {};
    var buckets = {};
    GROWTH_SERIES.forEach(function (s) {
      (growth[s[0]] || []).forEach(function (r) { buckets[r.bucket] = true; });
    });
    var keys = Object.keys(buckets).sort();
    if (keys.length < 2) {
      el.innerHTML = '<p class="empty">not enough history yet — check back after a few iterations</p>';
      return;
    }
    var W = 640, H = 150, PAD = 6;
    var seriesPts = [], maxV = 1;
    GROWTH_SERIES.forEach(function (s) {
      var byBucket = {};
      (growth[s[0]] || []).forEach(function (r) { byBucket[r.bucket] = r.count; });
      var acc = 0;
      var pts = keys.map(function (k) { acc += byBucket[k] || 0; return acc; });
      maxV = Math.max(maxV, acc);
      seriesPts.push(pts);
    });
    var lines = "";
    GROWTH_SERIES.forEach(function (s, si) {
      var pts = seriesPts[si].map(function (v, i) {
        var x = PAD + (i / (keys.length - 1)) * (W - 2 * PAD);
        var y = H - PAD - (v / maxV) * (H - 2 * PAD);
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      lines += '<polyline points="' + pts + '" fill="none" stroke="' + s[1] + '" stroke-width="2"/>';
    });
    var legend = GROWTH_SERIES.map(function (s, si) {
      return '<span class="chip"><span class="dot" style="background:' + s[1] + '"></span>' +
        s[0] + " (" + seriesPts[si][seriesPts[si].length - 1] + ")</span>";
    }).join("");
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="cumulative dataset growth">' +
      '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '" stroke="#2c2c2a"/>' +
      lines + "</svg>" +
      '<div class="legend">' + legend +
      '<span style="margin-left:auto">' + esc(keys[0].replace("T", " ")) + " → " + esc(keys[keys.length - 1].replace("T", " ")) + "</span></div>";
  }

  function render(stats, coverage, recent) {
    var p = stats.palettes || {}, pr = stats.pairs || {};
    var lastRun = stats.lastRun;
    var totalPalettes = sum(p);
    var tiles = [
      ["Palettes", totalPalettes, (p.approved || 0) + " approved · " + (p.draft || 0) + " draft · " + (p.rejected || 0) + " rejected"],
      ["Pairs", sum(pr), (pr.scored || 0) + " scored · " + (pr.pending || 0) + " pending · " + (pr.rejected || 0) + " rejected"],
      ["Queries", stats.queries, null],
      ["Avg score", stats.avgScore == null ? "—" : Number(stats.avgScore).toFixed(2), "scored pairs only"],
      ["Golden", recent.goldenCount || 0, "curated eval pairs"],
      ["Human labels", sum(recent.humanCounts || {}),
        ((recent.humanCounts || {}).golden || 0) + " gold · " +
        ((recent.humanCounts || {}).good || 0) + " good · " +
        ((recent.humanCounts || {})["bad-match"] || 0) + " bad"],
      ["Themed", recent.themedCount || 0,
        totalPalettes ? Math.round(((recent.themedCount || 0) / totalPalettes) * 100) + "% of palettes" : null],
      ["Last run", lastRun ? lastRun.mode : "—",
        lastRun ? lastRun.status + " · " + fmtAgo(lastRun.startedAt) : null],
    ];
    document.getElementById("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="label">' + esc(t[0]) + '</div><div class="value">' + esc(t[1]) +
        "</div>" + (t[2] ? '<div class="sub">' + esc(t[2]) + "</div>" : "") + "</div>";
    }).join("");

    var bins = {};
    (recent.histogram || []).forEach(function (h) { bins[h.bin] = h.count; });
    var maxBin = 0, i;
    for (i = 0; i <= 10; i++) maxBin = Math.max(maxBin, bins[i] || 0);
    if (maxBin === 0) {
      document.getElementById("hist").innerHTML = '<p class="empty">nothing scored yet — the judge runs when pending pairs build up</p>';
    } else {
      var bars = "", axis = "";
      for (i = 0; i <= 10; i++) {
        var n = bins[i] || 0;
        var h = Math.round((n / maxBin) * 100);
        bars += '<div class="bar" style="height:' + Math.max(2, h) + '%" title="score ' + i + ": " + n + ' pairs">' +
          (n === maxBin ? '<span class="top">' + n + "</span>" : "") + "</div>";
        axis += "<span>" + i + "</span>";
      }
      document.getElementById("hist").innerHTML =
        '<div class="hist" style="margin-top:18px">' + bars + '</div><div class="hist-x">' + axis + "</div>";
    }

    var gapsEl = document.getElementById("gaps");
    gapsEl.innerHTML = (coverage.gaps || []).map(function (g) {
      return '<span class="gap-chip">' + esc(g.kind) + " · <b>" + esc(g.value) + "</b> · " + g.count + "</span>";
    }).join("") || '<p class="empty">no data yet</p>';

    var cats = Object.entries(coverage.queryCategoryCounts || {});
    hbars(document.getElementById("cats"), cats, Math.max.apply(null, [1].concat(cats.map(function (c) { return c[1]; }))));
    var HARMONIES = ["monochromatic", "analogous", "complementary", "split-complementary", "triadic", "tetradic"];
    var harm = HARMONIES.map(function (name) { return [name, (coverage.tagHistogram || {})[name] || 0]; });
    hbars(document.getElementById("harmony"), harm, Math.max.apply(null, [1].concat(harm.map(function (c) { return c[1]; }))));
    var br = Object.entries(coverage.brightnessBands || {});
    hbars(document.getElementById("bright"), br, Math.max.apply(null, [1].concat(br.map(function (c) { return c[1]; }))));
    var co = Object.entries(coverage.contrastBands || {});
    hbars(document.getElementById("contrast"), co, Math.max.apply(null, [1].concat(co.map(function (c) { return c[1]; }))));

    var runsRows = (recent.runs || []).map(function (r) {
      var dur = r.finishedAt ? Math.round((r.finishedAt - r.startedAt) / 1000) + "s" : "…";
      var st = r.stats ? Object.entries(r.stats).map(function (e) { return e[0] + ":" + e[1]; }).join(" ") : "";
      return "<tr><td>" + esc(r.mode) + "</td><td>" + statusChip(r.status) + "</td><td>" +
        fmtAgo(r.startedAt) + "</td><td>" + dur + "</td><td>" + esc(st) + "</td></tr>";
    }).join("");
    document.getElementById("runs").innerHTML =
      "<thead><tr><th>mode</th><th>status</th><th>started</th><th>took</th><th>stats</th></tr></thead><tbody>" +
      (runsRows || '<tr><td colspan="5" class="empty">no runs yet</td></tr>') + "</tbody>";

    renderGrowth(recent.growth);
    document.getElementById("updated").textContent = "updated " + new Date().toLocaleTimeString();
  }

  var exploreOffset = 0;
  var EXPLORE_LIMIT = 24;
  function exploreParams() {
    var params = [];
    function add(k, v) { if (v) params.push(k + "=" + encodeURIComponent(v)); }
    add("q", document.getElementById("f-q").value.trim());
    add("category", document.getElementById("f-category").value);
    add("status", document.getElementById("f-status").value);
    add("verdict", document.getElementById("f-verdict").value);
    add("source", document.getElementById("f-source").value);
    add("minScore", document.getElementById("f-minscore").value);
    add("theme", document.getElementById("f-theme").value.trim());
    add("human", document.getElementById("f-humanlabel").value);
    if (document.getElementById("f-golden").checked) add("golden", "1");
    if (document.getElementById("f-group").checked) add("group", "palette");
    add("sort", document.getElementById("f-sort").value);
    params.push("limit=" + EXPLORE_LIMIT, "offset=" + exploreOffset);
    return params.join("&");
  }
  var exploreRows = [];
  function renderCards() {
    document.getElementById("cards").innerHTML =
      exploreRows.map(cardHTML).join("") || '<p class="empty">nothing matches these filters</p>';
  }
  function loadExplore() {
    return api("/explore?" + exploreParams()).then(function (res) {
      exploreRows = res.rows || [];
      renderCards();
      var from = res.total === 0 ? 0 : res.offset + 1;
      var to = Math.min(res.offset + res.limit, res.total);
      document.getElementById("pg-info").textContent = from + "–" + to + " of " + res.total;
      document.getElementById("pg-prev").disabled = res.offset <= 0;
      document.getElementById("pg-next").disabled = to >= res.total;
    }).catch(function () {});
  }

  document.getElementById("cards").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    var row = exploreRows[Number(btn.getAttribute("data-i"))];
    var act = btn.getAttribute("data-act");
    if (!row) return;
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    if (act === "palette-reject" || act === "palette-restore") {
      apiPost("/feedback/palette", {
        seed: row.seed,
        action: act === "palette-reject" ? "reject" : "restore",
      }).then(function (res) {
        exploreRows.forEach(function (r) {
          if (r.seed === row.seed) r.paletteStatus = res.status;
        });
        renderCards();
      }).catch(function (err) {
        done();
        document.getElementById("updated").textContent = "action failed: " + err.message;
      });
    } else {
      apiPost("/feedback/pair", { queryId: row.queryId, seed: row.seed, action: act })
        .then(function (res) {
          row.humanLabel = res.humanLabel;
          row.golden = res.golden ? 1 : 0;
          renderCards();
        }).catch(function (err) {
          done();
          document.getElementById("updated").textContent = "action failed: " + err.message;
        });
    }
  });

  document.getElementById("rq-submit").addEventListener("click", function () {
    var lines = document.getElementById("rq-text").value
      .split("\\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
    if (lines.length === 0) return;
    var body = { texts: lines };
    var cat = document.getElementById("rq-category").value;
    if (cat) body.category = cat;
    var out = document.getElementById("rq-result");
    out.textContent = "submitting…";
    apiPost("/feedback/queries", body).then(function (res) {
      var inserted = res.results.filter(function (r) { return r.status === "inserted"; }).length;
      var dup = res.results.filter(function (r) { return r.status === "duplicate"; }).length;
      out.textContent = inserted + " queued for generation" +
        (dup ? " · " + dup + " already existed" : "") +
        " — palettes arrive within a few generation iterations (filter source=human to track)";
      if (inserted > 0) document.getElementById("rq-text").value = "";
    }).catch(function (err) {
      out.textContent = "failed: " + err.message;
    });
  });
  document.getElementById("f-apply").addEventListener("click", function () {
    exploreOffset = 0; loadExplore();
  });
  document.getElementById("f-q").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { exploreOffset = 0; loadExplore(); }
  });
  document.getElementById("pg-prev").addEventListener("click", function () {
    exploreOffset = Math.max(0, exploreOffset - EXPLORE_LIMIT); loadExplore();
  });
  document.getElementById("pg-next").addEventListener("click", function () {
    exploreOffset += EXPLORE_LIMIT; loadExplore();
  });

  var timer = null;
  function refresh(withExplore) {
    return Promise.all([api("/stats"), api("/coverage"), api("/recent"), api("/health")])
      .then(function (res) {
        gate.style.display = "none"; app.style.display = "block";
        render(res[0], res[1], res[2]);
        renderHealth(res[3]);
        // Explore reloads on boot only; auto-refresh leaves your page/filters alone.
        if (withExplore) loadExplore();
      })
      .catch(function (e) {
        if (e.message === "unauthorized") { localStorage.removeItem(LS); showGate("that key was rejected"); }
        else { document.getElementById("updated").textContent = "refresh failed: " + e.message; }
      });
  }
  function boot() {
    if (!key()) { showGate(""); return; }
    refresh(true);
    if (timer) clearInterval(timer);
    timer = setInterval(function () { refresh(false); }, 30000);
  }
  boot();
})();
</script>
</body>
</html>`;
