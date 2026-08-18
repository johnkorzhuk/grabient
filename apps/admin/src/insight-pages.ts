// The history-backed pages: /trends, /indexation, /goals, /campaigns.
//
// Everything here reads the persisted metric store plus the marker view, so
// these pages answer "is it better than it was" — the question the live pages
// structurally cannot. Charts get event markers (dashed rules) and campaign
// bands from the same rows the MCP returns, so a human reading a chart and an
// agent reading metrics_history are looking at the same annotated series.

import type { ChartMarkers } from "./charts";
import { eventsDisclosure, metricTrendChart, seriesColor } from "./charts";
import { readSeries, type SeriesPoint } from "./db";
import type { MarkerRow } from "./events";
import { chartCard, dataTable, esc, fmt, legend, statTile } from "./html";
import { metricDef } from "./metrics";
import type { GoalWithProgress } from "./goals";
import type { CampaignRow } from "./campaigns";

const dayMs = 86_400_000;

/** Marker rows -> chart marker shapes. endExclusive: a band for Aug 20-27
 *  inclusive must span to Aug 28 00:00 or the last day falls outside its own
 *  shading. */
export function toChartMarkers(markers: MarkerRow[]): ChartMarkers {
  return {
    rules: markers
      .filter((m) => m.ends_on === null)
      .map((m) => ({ at: new Date(`${m.starts_on}T00:00:00Z`), label: m.label, kind: m.kind })),
    bands: markers
      .filter((m) => m.ends_on !== null)
      .map((m) => ({
        start: new Date(`${m.starts_on}T00:00:00Z`),
        endExclusive: new Date(Date.parse(`${m.ends_on}T00:00:00Z`) + dayMs),
        label: m.label,
      })),
  };
}

export function markerEventsList(markers: MarkerRow[]): string {
  return eventsDisclosure(
    markers.map((m) => ({
      on: m.starts_on,
      endsOn: m.ends_on,
      kind: m.kind,
      label: m.label,
      detail: m.detail,
    })),
  );
}

/**
 * Rows -> one point per CALENDAR day, with `null` where collection failed.
 *
 * The charts and the trailing mean both have careful gap handling that was
 * unreachable: metric_daily.value is NOT NULL and a failed collection leaves
 * no row at all, so the series arrived dense-but-short and the line was drawn
 * straight across the hole. A reader saw no outage, and the 7-day mean at the
 * far side averaged seven ROWS spanning eight days.
 */
const toPoints = (series: SeriesPoint[], since: string, until: string) => {
  const byDay = new Map(series.map((p) => [p.day, p]));
  const out: Array<{ date: Date; value: number | null; provisional?: boolean }> = [];
  const end = Date.parse(`${until}T00:00:00Z`);
  for (let t = Date.parse(`${since}T00:00:00Z`); t <= end; t += dayMs) {
    const day = new Date(t).toISOString().slice(0, 10);
    const point = byDay.get(day);
    out.push({
      date: new Date(t),
      value: point ? point.value : null,
      ...(point?.provisional ? { provisional: true } : {}),
    });
  }
  return out;
};

export interface TrendChartSpec {
  title: string;
  note: string;
  caveat?: string;
  idPrefix: string;
  unitFormat: (n: number) => string;
  metrics: Array<{ key: string; label: string }>;
  zeroBase?: boolean;
}

/** One chart card from persisted series + markers, with the table twin. */
export async function trendCard(
  db: D1Database,
  spec: TrendChartSpec,
  since: string,
  until: string,
  markers: ChartMarkers,
  eventsHtml: string,
): Promise<string | null> {
  const series: Array<{
    label: string;
    points: ReturnType<typeof toPoints>;
    color: string;
    raw: SeriesPoint[];
    key: string;
  }> = [];
  for (let i = 0; i < spec.metrics.length; i++) {
    const m = spec.metrics[i]!;
    const points = await readSeries(db, m.key, since, until);
    if (points.length) {
      series.push({ label: m.label, points: toPoints(points, since, until), color: seriesColor(i), raw: points, key: m.key });
    }
  }
  if (series.length === 0) return null;

  const svg = metricTrendChart(
    series.map(({ label, points, color }) => ({ label, points, color })),
    {
      ariaLabel: spec.title,
      idPrefix: spec.idPrefix,
      formatValue: spec.unitFormat,
      markers,
      zeroBase: spec.zeroBase ?? true,
      smooth: true,
    },
  );

  const days = [...new Set(series.flatMap((s) => s.raw.map((p) => p.day)))].sort().reverse();
  // Up to 120 dated rows per chart — sortable so "which day was worst" is a
  // click rather than a scroll. Indexed by day first: the previous find()
  // inside a map was quadratic over the window.
  const byDay = series.map((s) => new Map(s.raw.map((p) => [p.day, p.value])));
  const shown = days.slice(0, 120);
  const table = dataTable(
    // Say so when rows were dropped: at range=180d a third of them used to
    // vanish with no indication.
    ["Date", ...series.map((s) => s.label)].map((h, i) =>
      i === 0 && shown.length < days.length ? `Date (newest ${shown.length} of ${days.length})` : h,
    ),
    shown
      .map((day) => [
        day,
        ...byDay.map((index) => {
          const value = index.get(day);
          return value === undefined ? "—" : spec.unitFormat(value);
        }),
      ]),
    true,
  );

  const chartLegend =
    series.length > 1
      ? legend(series.map((s) => ({ color: s.color, label: s.label })))
      : undefined;

  return chartCard({
    title: spec.title,
    note: spec.note,
    // Dedupe first, THEN cap: slicing before the Set meant a three-series card
    // showed series[0]'s caveat and dropped the others without saying so.
    caveat: [
      spec.caveat,
      ...[
        ...new Set(
          series.map((s) => metricDef(s.key)?.caveat).filter((c): c is string => Boolean(c)),
        ),
      ].slice(0, 2),
    ]
      .filter(Boolean)
      .join(" "),
    legend: chartLegend,
    svg: svg + eventsHtml,
    table,
  });
}

// ---------------------------------------------------------------------------
// Goals + campaigns cards (no chart dependency — bars are plain divs).
// ---------------------------------------------------------------------------

export function goalCard(goal: GoalWithProgress): string {
  const pct = goal.progress_pct;
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const badge =
    goal.status !== "active"
      ? `<span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-muted uppercase">${esc(goal.status)}</span>`
      : goal.incomplete_window
        ? `<span class="text-xs text-ink-muted">window still filling</span>`
        : goal.on_track === null
        ? `<span class="text-xs text-ink-muted">not measurable yet</span>`
        : goal.on_track
          ? `<span class="text-xs font-bold text-good">on track</span>`
          : `<span class="text-xs font-bold text-critical">behind</span>`;
  const value = (n: number | null) =>
    n === null ? "—" : Math.abs(n) >= 1000 ? fmt(Math.round(n)) : String(Math.round(n * 10) / 10);

  return `<section class="rounded-xl border border-edge bg-surface p-5">
  <div class="flex items-start justify-between gap-3">
    <h2 class="text-base font-bold tracking-tight">${esc(goal.title)}</h2>
    ${badge}
  </div>
  <p class="mt-1 text-xs text-ink-muted"><code class="text-[11px]">${esc(goal.metric_key)}</code> · ${esc(goal.aggregate)}${goal.aggregate !== "last" ? ` over ${goal.window_days}d` : ""} · ${goal.direction === "down" ? "lower is better" : "higher is better"}</p>
  <div class="mt-4 flex items-baseline gap-2">
    <span class="text-4xl leading-none font-bold tracking-tight">${value(goal.current)}</span>
    <span class="text-sm text-ink-muted">of ${value(goal.target_value)} · from ${value(goal.baseline_value)}</span>
  </div>
  <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full" style="background:var(--grid)">
    <div class="h-full rounded-full" style="width:${clamped}%;background:var(--series-1)"></div>
  </div>
  <p class="mt-2 text-xs text-ink-muted">
    ${goal.incomplete_window ? esc(goal.incomplete_window) : pct === null ? "No data for this metric yet — the series starts when collection does." : `${pct}% of the way from baseline (${esc(goal.baseline_day)}) to target (${esc(goal.target_day)})${goal.as_of ? `, as of ${esc(goal.as_of)}` : ""}.`}
  </p>
  ${goal.notes ? `<p class="mt-2 text-xs leading-snug text-ink-secondary">${esc(goal.notes)}</p>` : ""}
</section>`;
}

export function campaignCard(campaign: CampaignRow): string {
  const money = (cents: number | null) =>
    cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
  return `<section class="rounded-xl border border-edge bg-surface p-5">
  <div class="flex items-start justify-between gap-3">
    <h2 class="text-base font-bold tracking-tight">${esc(campaign.id)}</h2>
    <span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-muted uppercase">${esc(campaign.status)}</span>
  </div>
  <p class="mt-1 text-xs text-ink-muted">${esc(campaign.platform)} · ${esc(campaign.starts_on)} → ${esc(campaign.ends_on)} · tag <code class="text-[11px]">${esc(campaign.utm_campaign)}</code> · budget ${money(campaign.budget_cents)}${campaign.spend_cents !== null ? ` · spent ${money(campaign.spend_cents)}` : ""}</p>
  ${campaign.hypothesis ? `<p class="mt-3 text-sm leading-snug text-ink-secondary"><span class="font-bold text-ink">Hypothesis:</span> ${esc(campaign.hypothesis)}</p>` : ""}
  ${campaign.outcome ? `<p class="mt-2 text-sm leading-snug text-ink-secondary"><span class="font-bold text-ink">Outcome:</span> ${esc(campaign.outcome)}</p>` : ""}
  <p class="mt-3 text-xs text-ink-muted">Ask the agent for <code class="text-[11px]">campaign_report ${esc(campaign.id)}</code> — lift vs matched weekdays, tagged sessions and signups, and the minimum detectable effect.</p>
</section>`;
}

export function emptyState(message: string): string {
  return `<p class="mt-4 rounded-lg border border-edge bg-page p-4 text-sm text-ink-secondary">${esc(message)}</p>`;
}

export { statTile };
