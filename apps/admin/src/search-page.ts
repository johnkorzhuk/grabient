// /search — the page the "3.5% CTR, average position 8.6" line could not be.
//
// Those two numbers were window totals printed in a caveat, which answers
// "what is it" and never "is it moving". Both are persisted daily
// (gsc.ctr, gsc.position), so they get real series here, and every ranked row
// links to its own history.
//
// Per-QUERY history is NOT persisted — storing every query x day would be a
// large table for a young property, and Search Console already answers it
// directly: one call with dimensions:["date"] and a query filter. So the
// drill-down is live rather than stored, which also means it reaches back the
// full 16 months the API retains rather than only to the day this dashboard
// started collecting.

import { chartCard, dataTable, esc, fmt, legend, statTile } from "./html";
import { metricTrendChart, rankedBarChart, seriesColor, type ChartMarkers } from "./charts";
import { readSeries, type SeriesPoint } from "./db";
import type { SearchRow } from "./search-console";

const dayMs = 86_400_000;

const pct = (n: number) => `${n.toFixed(1)}%`;
const pos = (n: number) => n.toFixed(1);

/** Rows -> one point per calendar day, null where a day was never collected. */
function densify(series: SeriesPoint[], since: string, until: string) {
  const byDay = new Map(series.map((p) => [p.day, p]));
  const out: Array<{ date: Date; value: number | null; provisional?: boolean }> = [];
  for (let t = Date.parse(`${since}T00:00:00Z`); t <= Date.parse(`${until}T00:00:00Z`); t += dayMs) {
    const point = byDay.get(new Date(t).toISOString().slice(0, 10));
    out.push({
      date: new Date(t),
      value: point ? point.value : null,
      ...(point?.provisional ? { provisional: true } : {}),
    });
  }
  return out;
}

const CANONICAL = "https://grabient.com";

const decode = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/**
 * A stored page URL as a reader should see it.
 *
 * The property is DOMAIN-level, so it aggregates four host variants —
 * http/https x apex/www — and the pre-canonical www addresses still draw
 * impressions. Canonical rows collapse to a bare path; anything else KEEPS its
 * host, because otherwise https://grabient.com/ and http://www.grabient.com/
 * both render as "/" and read as one row duplicated rather than two URLs.
 */
export const pageLabel = (key: string) =>
  decode(key.startsWith(`${CANONICAL}/`) ? key.slice(CANONICAL.length) : key.replace(/^https?:\/\//, ""));

/**
 * The exact string Search Console stored for a page row.
 *
 * `equals` matches literally, so the filter has to reproduce Google's form
 * character for character: absolute, and already percent-encoded. Ranked-chart
 * links now carry that form verbatim, so it passes straight through. A bare
 * path only reaches here from a hand-typed or pre-existing link, and gets the
 * canonical host and encoding bolted on — encodeURI is the right call there
 * and the WRONG one for a value that is already encoded (it would turn %2B
 * into %252B and match nothing), which is why the two cases stay apart instead
 * of being normalised into one.
 */
export function pageFilterValue(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${CANONICAL}${encodeURI(value).replace(/,/g, "%2C")}`;
}

export interface SearchTrendInput {
  db: D1Database;
  since: string;
  until: string;
  markers: ChartMarkers;
  eventsHtml: string;
}

/**
 * The four site-wide series, read from the persisted store.
 *
 * CTR and position are the two this page exists for. Position is drawn on its
 * own card rather than beside the others because it is the one metric here
 * where DOWN is good, and sharing an axis with clicks would invite reading a
 * falling line as a loss.
 */
export async function searchTrendCards(input: SearchTrendInput): Promise<string> {
  const { db, since, until, markers, eventsHtml } = input;
  const [clicks, impressions, ctr, position] = await Promise.all([
    readSeries(db, "gsc.clicks", since, until),
    readSeries(db, "gsc.impressions", since, until),
    readSeries(db, "gsc.ctr", since, until),
    readSeries(db, "gsc.position", since, until),
  ]);

  if (clicks.length === 0 && impressions.length === 0) {
    return `<p class="mt-4 rounded-lg border border-edge bg-page p-4 text-sm text-ink-secondary">No Search Console history stored for this range yet. The property was verified on 14 Aug 2026 and the nightly snapshot has been collecting since — the series starts there, and nothing earlier can be reconstructed.</p>`;
  }

  const table = (rows: SeriesPoint[], format: (n: number) => string, label: string) =>
    dataTable(
      ["Date", label],
      [...rows].reverse().map((p) => [p.day, format(p.value)]),
      true,
    );

  const volume = chartCard({
    title: "Clicks and impressions",
    note: "Daily totals from Search Console — the true site figures, not a sum of the query rows.",
    caveat:
      "Google withholds anonymized rare queries from dimensioned rows while still counting them here, which is why these are higher than adding up the queries below. Days inside the trailing revision window are still settling.",
    legend: legend([
      { color: seriesColor(0), label: "Clicks" },
      { color: seriesColor(1), label: "Impressions" },
    ]),
    svg:
      metricTrendChart(
        [
          { label: "Clicks", points: densify(clicks, since, until), color: seriesColor(0) },
          { label: "Impressions", points: densify(impressions, since, until), color: seriesColor(1) },
        ],
        { ariaLabel: "Search clicks and impressions per day", idPrefix: "sv", formatValue: (n) => fmt(Math.round(n)), markers, smooth: true },
      ) + eventsHtml,
    table: table(clicks, (n) => fmt(Math.round(n)), "Clicks"),
  });

  const ctrCard = chartCard({
    title: "Click-through rate",
    note: "Share of impressions that became a click, per day.",
    caveat:
      "A rising CTR at a falling position usually means the titles are working; a falling CTR at a steady position is the thing to chase. Over a window this is recomputed as total clicks / total impressions — never the average of the daily rates, which would weight a quiet Sunday the same as a busy Tuesday.",
    svg:
      metricTrendChart(
        [{ label: "CTR", points: densify(ctr, since, until), color: seriesColor(2) }],
        { ariaLabel: "Click-through rate per day", idPrefix: "sc", formatValue: pct, markers, smooth: true },
      ) + eventsHtml,
    table: table(ctr, pct, "CTR"),
  });

  const positionCard = chartCard({
    title: "Average position",
    note: "Impressions-weighted mean result position, per day.",
    caveat:
      "LOWER IS BETTER and the axis is NOT inverted, so a line going UP means ranking got worse. Weighted by impressions, because a plain mean would let a keyword with three impressions at rank 1 outrank the whole site. This moves with which queries you happen to surface for, so read it beside impressions rather than alone.",
    svg:
      metricTrendChart(
        [{ label: "Position", points: densify(position, since, until), color: seriesColor(3) }],
        { ariaLabel: "Average search position per day", idPrefix: "sp", formatValue: pos, markers, smooth: true, zeroBase: false },
      ) + eventsHtml,
    table: table(position, pos, "Position"),
  });

  return `<div class="mt-4 grid items-start gap-4 lg:grid-cols-2">${volume}${ctrCard}${positionCard}</div>`;
}

/** The ranked cards, with every row linking to its own history. */
export function searchRankedCards(
  queries: SearchRow[],
  pages: SearchRow[],
  days: number,
  href: (kind: "query" | "page", value: string) => string,
): string {

  const queryCard = chartCard({
    title: "Top search queries",
    note: `What people searched to find the site, last ${days} days. Click a row for its own history.`,
    caveat:
      "Ranked by clicks. Summing these will not reach the site total above — Google withholds anonymized rare queries from every dimensioned report.",
    svg: rankedBarChart(
      queries.map((row) => ({ label: row.key, count: row.clicks })),
      "Clicks by search query",
      "gscq",
      (n) => `${fmt(n)} clicks`,
      (label) => label,
      undefined,
      (_label, index) => {
        const row = queries[index];
        return row ? href("query", row.key) : null;
      },
    ),
    table: dataTable(
      ["Query", "Clicks", "Impressions", "CTR", "Position"],
      queries.map((row) => [
        row.key,
        fmt(row.clicks),
        fmt(row.impressions),
        pct(row.ctr),
        row.position === undefined ? "—" : pos(row.position),
      ]),
      true,
    ),
  });

  const pageCard = chartCard({
    title: "Top landing pages from search",
    note: `Which pages organic search actually lands on, last ${days} days. Click a row for its own history.`,
    caveat:
      "Shown decoded, but the drill-down filters on the exact URL Search Console stored — percent-encoding, scheme and host included — because an `equals` filter matches that string literally and nothing else. Rows keeping a visible host are the pre-canonical www addresses, still drawing impressions.",
    svg: rankedBarChart(
      pages.map((row) => ({ label: pageLabel(row.key), count: row.clicks })),
      "Clicks by landing page",
      "gscp",
      (n) => `${fmt(n)} clicks`,
      (label) => label,
      undefined,
      (_label, index) => {
        const row = pages[index];
        return row ? href("page", row.key) : null;
      },
    ),
    table: dataTable(
      ["Page", "Clicks", "Impressions", "CTR", "Position"],
      pages.map((row) => [
        pageLabel(row.key),
        fmt(row.clicks),
        fmt(row.impressions),
        pct(row.ctr),
        row.position === undefined ? "—" : pos(row.position),
      ]),
      true,
    ),
  });

  return `<div class="mt-4 grid items-start gap-4 lg:grid-cols-2">${queryCard}${pageCard}</div>`;
}

/**
 * One query's or one page's daily series, fetched live.
 *
 * `rows` are date-dimensioned rows for a single filtered entity. The four
 * charts are the same four as the site view, so a reader comparing "this query"
 * against "the site" is comparing like with like.
 */
export function searchDetailCards(
  subject: { kind: "query" | "page"; value: string },
  rows: SearchRow[],
  since: string,
  until: string,
  markers: ChartMarkers,
  eventsHtml: string,
): string {
  if (rows.length === 0) {
    return `<p class="mt-4 rounded-lg border border-edge bg-page p-4 text-sm text-ink-secondary">Search Console returned no rows for this ${esc(subject.kind)} in the window. That can mean it genuinely had no impressions, or that the filter does not match Google's stored form — page paths in particular are stored percent-encoded.</p>`;
  }

  const toPoints = (pick: (row: SearchRow) => number | undefined) => {
    const byDay = new Map(rows.map((r) => [r.key, r]));
    const out: Array<{ date: Date; value: number | null }> = [];
    for (let t = Date.parse(`${since}T00:00:00Z`); t <= Date.parse(`${until}T00:00:00Z`); t += dayMs) {
      const row = byDay.get(new Date(t).toISOString().slice(0, 10));
      const value = row ? pick(row) : undefined;
      out.push({ date: new Date(t), value: value === undefined ? null : value });
    }
    return out;
  };

  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
      weighted: acc.weighted + (row.position ?? 0) * row.impressions,
    }),
    { clicks: 0, impressions: 0, weighted: 0 },
  );

  const tiles = [
    statTile({ label: "Clicks", value: fmt(totals.clicks), hero: true, sub: `<span class="text-ink-muted">over ${rows.length} day${rows.length === 1 ? "" : "s"} with data</span>` }),
    statTile({ label: "Impressions", value: fmt(totals.impressions) }),
    statTile({
      label: "CTR",
      value: totals.impressions > 0 ? pct((totals.clicks / totals.impressions) * 100) : "—",
      sub: `<span class="text-ink-muted">clicks / impressions over the whole window, not a mean of daily rates</span>`,
    }),
    statTile({
      label: "Average position",
      value: totals.impressions > 0 ? pos(totals.weighted / totals.impressions) : "—",
      sub: `<span class="text-ink-muted">impressions-weighted · lower is better</span>`,
    }),
  ].join("");

  const card = (title: string, note: string, caveat: string, id: string, points: Array<{ date: Date; value: number | null }>, color: string, format: (n: number) => string, zeroBase = true) =>
    chartCard({
      title,
      note,
      caveat,
      svg: metricTrendChart([{ label: title, points, color }], { ariaLabel: `${title} for this ${subject.kind}`, idPrefix: id, formatValue: format, markers, smooth: rows.length >= 21, zeroBase }) + eventsHtml,
      table: dataTable(["Date", title], [...rows].reverse().map((r) => [r.key, format(
        title === "Clicks" ? r.clicks : title === "Impressions" ? r.impressions : title === "CTR" ? r.ctr : (r.position ?? 0),
      )]), true),
    });

  return `<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${tiles}</div>
<div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
${card("Clicks", "Clicks per day for this " + subject.kind + ".", "A day with no row is a day with no impressions at all, and shows as a gap rather than a zero.", "dq", toPoints((r) => r.clicks), seriesColor(0), (n) => fmt(Math.round(n)))}
${card("Impressions", "Impressions per day.", "How often it appeared at all — the ceiling that CTR is a share of.", "di", toPoints((r) => r.impressions), seriesColor(1), (n) => fmt(Math.round(n)))}
${card("CTR", "Click-through rate per day.", "Daily rates are noisy on small numbers: one click against six impressions is 16.7% and means very little. Read the tiles above for the window figure.", "dc", toPoints((r) => r.ctr), seriesColor(2), pct)}
${card("Position", "Average position per day.", "LOWER IS BETTER and the axis is not inverted, so up means worse. Absent for Discover and Google News, which report no position.", "dp", toPoints((r) => r.position), seriesColor(3), pos, false)}
</div>`;
}
