// Chart definitions, rendered to SVG strings on the server.
//
// `renderChartSvg` needs no DOM, so the whole chart is built here in the worker
// and inlined into the HTML. Nothing about these charts reaches the browser as
// code — only the finished markup.
//
// Colors are passed through as `var(--…)` references rather than hex. The SVG is
// inlined into the document, so the custom properties in app.css cascade into
// it, and dark mode is a pure CSS swap with no second render. Palette values are
// the validated categorical slot 1 (blue) from the dataviz reference palette;
// each chart draws a single series, so no legend is needed — the title names it.
//
// Note the axis option shape: `ticks` and `tickLabels` live under `axis`, not at
// the top of the axis object. Setting `format` one level too high silently does
// nothing (the labels just render with d3's defaults), so keep them nested.
import { areaX, areaY, barX, barY, defineChart, lineY, rect, ruleX, text } from "@tanstack/charts";
import { createChartRuntime } from "@tanstack/charts/runtime";
import { renderChartSvg } from "@tanstack/charts/svg";
import { scaleBand, scaleLinear, scaleUtc } from "d3-scale";
import { monthDate, type CohortRow, type LikersRow, type MonthRow } from "./queries";
import type { Breakdown, TrafficDay } from "./traffic";
import { rollingMean } from "./range";
import { esc } from "./html";

// The disclosure that spells out the markers lives with the other markup
// helpers, next to the "Table view" disclosure it is shaped after. It is
// re-exported here because markers and their event list are one feature, and a
// caller that annotates a chart should not have to know they were built in two
// different files.
export { eventsDisclosure } from "./html";

// The SVG is emitted with a viewBox and scaled to its container by CSS, which
// scales the tick text along with the geometry. So the intrinsic size is chosen
// to match the real rendered width — a two-column card inside max-w-6xl, minus
// the gap and the card padding — and the labels land at their intended 11px
// instead of being shrunk to ~7px by a 760px chart squeezed into a 528px card.
const WIDTH = 520;
const HEIGHT = 210;

const SERIES = "var(--series-1)";
const SERIES_2 = "var(--series-2)";
const SERIES_3 = "var(--series-3)";
const SERIES_4 = "var(--series-4)";

/**
 * Categorical slots 1..4 from the dataviz reference palette, in its fixed order.
 * The order is the colorblind-safety mechanism, not a preference — see the
 * palette comment in app.css. Never cycle it.
 */
const SERIES_SLOTS = [SERIES, SERIES_2, SERIES_3, SERIES_4] as const;

/** Annotations and de-emphasis. Never a series hue — a marker is not a measurement. */
const ANNOTATION_INK = "var(--ink-muted)";

// Hairline, recessive chrome: the data is the loud part, the grid sits one shade
// off the surface and is never dashed.
const THEME = {
  foreground: "var(--ink)",
  muted: "var(--ink-muted)",
  grid: "var(--grid)",
  background: "var(--surface)",
  palette: SERIES_SLOTS,
} as const;

const MARGIN = { top: 12, right: 18, bottom: 26, left: 46 };

interface HoverOptions {
  /** Formats the x value into the tooltip's heading. */
  formatX: (value: any) => string;
  /** Formats a y value into the tooltip's readout. */
  formatY: (value: any) => string;
  /** markId -> label and swatch color. A single-series chart can omit this. */
  series?: Record<string, { n: string; c: string; k?: string }>;
}

function render(
  definition: unknown,
  ariaLabel: string,
  idPrefix: string,
  hover: HoverOptions,
  /**
   * Time-scaled charts only — see ChartMarkers for why the band-scale charts
   * cannot take these.
   */
  markers?: ChartMarkers,
): string {
  const runtime = createChartRuntime<any, any, any>();
  try {
    let scene = runtime.render(definition as any, { width: WIDTH, height: HEIGHT });

    // Two passes, and only when there is something to annotate. A band has to
    // span the plot floor to ceiling and a label has to sit at the top of it;
    // both of those are y-DOMAIN values, and the y domain is not known until the
    // data has been through the scale. So resolve once to read the domain, then
    // resolve again with the annotation marks layered in. Every marker date is
    // clamped into the resolved x domain first, so the second pass cannot widen
    // a scale and shift the data out from under the reader.
    let hits: MarkerHit[] = [];
    if (markers && (markers.rules.length > 0 || markers.bands.length > 0)) {
      const layer = markerLayer(markers, scene);
      if (layer) {
        const marks = (definition as { marks?: readonly unknown[] }).marks ?? [];
        scene = runtime.render(
          { ...(definition as any), marks: [...layer.under, ...marks, ...layer.over] },
          { width: WIDTH, height: HEIGHT },
        );
        hits = layer.hits(scene);
      }
    }

    const svg = topRoundedBars(
      renderChartSvg(scene, {
        ariaLabel,
        idPrefix,
        className: "chart-svg",
        // The wrapper below is the focus stop, not the SVG — it is the thing
        // that handles arrow keys.
        tabIndex: -1,
      }),
    );

    // The scene resolves every datum to a pixel position inside the plot rect,
    // which is exactly what a hover layer needs and saves re-deriving the scales
    // in the browser. Serialize the minimum: position, preformatted label and
    // value. Formatting here rather than client-side keeps the script tiny and
    // keeps number/date formatting identical to the axes.
    const seen = new Set<string>();
    const points = (scene as any).points
      .map((p: any) => {
        // Annotations resolve to points the same way data does — the band rect
        // and the label text both report one. They are not measurements and must
        // never appear in the value readout.
        if (String(p.markId).startsWith("marker-")) return null;
        // An area mark sits under its own line and resolves to the same points;
        // keeping both would print every value twice in the tooltip.
        if (String(p.markId).endsWith("-area")) return null;
        const meta = hover.series?.[p.markId];
        // Dedupe on the series KEY where one is given, not the mark id: one
        // series can be several marks (a settled run and its provisional tail
        // repeat the point they join at) and the tooltip must print it once.
        const key = `${meta?.k ?? p.markId}:${p.x}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          m: tipText(meta?.n ?? ""),
          c: meta?.c ?? SERIES,
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          l: tipText(hover.formatX(p.xValue)),
          v: tipText(hover.formatY(p.yValue)),
        };
      })
      .filter(Boolean);

    const payload = {
      w: WIDTH,
      h: HEIGHT,
      plot: (scene as any).chart,
      points,
      // Omitted entirely when there is nothing to annotate, so every other chart
      // carries exactly the payload it did before.
      ...(hits.length > 0 ? { markers: hits } : {}),
    };

    // Single-quoted attribute, so only the quote and & need escaping.
    const json = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return `<div class="chart-hover" data-chart='${json}' tabindex="0" role="group" aria-label="${esc(ariaLabel)}. Use arrow keys to read values.">${svg}</div>`;
  } finally {
    runtime.destroy();
  }
}

/**
 * `radius` on a bar mark emits `<rect rx="4">`, which rounds all four corners —
 * including the two sitting on the baseline, so the bar reads as detached from
 * its own axis. Bars should be rounded only at the data end. Rewrite those rects
 * as paths with top-only corners.
 *
 * Deliberately narrow: it only matches series-filled rects carrying the exact
 * radius we asked for. If a library upgrade changes the emitted markup the
 * pattern stops matching and the bars simply keep both ends rounded — a cosmetic
 * regression, never a broken chart.
 */
function topRoundedBars(svg: string): string {
  return svg.replace(
    /<rect([^>]*?)\srx="4"\s*\/>/g,
    (whole, attrs: string) => {
      if (!attrs.includes(`fill="${SERIES}"`)) return whole;
      const num = (name: string) => {
        const m = new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(attrs);
        return m ? Number(m[1]) : NaN;
      };
      const x = num("x");
      const y = num("y");
      const w = num("width");
      const h = num("height");
      if ([x, y, w, h].some(Number.isNaN)) return whole;
      // A bar shorter than the radius would produce a lopsided blob.
      const r = Math.min(4, w / 2, h);
      const keep = attrs.replace(/\s(?:x|y|width|height)="[^"]*"/g, "");
      const d =
        `M${x},${y + h}` +
        `L${x},${y + r}` +
        `A${r},${r} 0 0 1 ${x + r},${y}` +
        `L${x + w - r},${y}` +
        `A${r},${r} 0 0 1 ${x + w},${y + r}` +
        `L${x + w},${y + h}Z`;
      return `<path${keep} d="${d}"/>`;
    },
  );
}

/**
 * Dated annotations for a time-scaled chart: instants as dashed rules, spans as
 * shaded bands.
 *
 * An event asserts that something happened on a date. It never asserts that the
 * line moved because of it — which is exactly why markers are drawn in muted ink
 * and dashed. Dashed is annotation, solid is measurement; a marker in a series
 * hue would read as a second thing being measured.
 *
 * `endExclusive` is exactly that: the caller has already added the exclusive day.
 * A band covering Aug 20–27 inclusive spans [Aug 20 00:00, Aug 28 00:00). Pass
 * the inclusive end instead and the last day of the span falls outside its own
 * shading.
 *
 * Only the time-scaled charts accept these. On a band scale `scales.x.map(date)`
 * has no answer — a rule at an arbitrary date has no position — so
 * newSignupsChart, activationChart and conversionChart deliberately do not take
 * a markers argument rather than failing at render time.
 */
export interface ChartMarkers {
  rules: Array<{ at: Date; label: string; count?: number; kind?: string }>;
  bands: Array<{ start: Date; endExclusive: Date; label: string }>;
}

/** One entry in the data-chart payload's `markers` array, in viewBox units. */
interface MarkerHit {
  /** A rule's position. A band carries x1/x2 instead. */
  x?: number;
  x1?: number;
  x2?: number;
  label: string;
  /** The individual labels behind a clustered rule. */
  detail?: string[];
}

interface MarkerLayer {
  /** Bands. Drawn before the data marks, so the wash sits under the lines. */
  under: unknown[];
  /** Rules and their labels. Drawn after. */
  over: unknown[];
  /** Hit positions, read off the FINAL scene so a re-layout cannot desync them. */
  hits: (scene: any) => MarkerHit[];
}

const DAY_MS = 86_400_000;
/** Rules closer together than this on screen collapse into one clustered rule. */
const CLUSTER_PX = 14;
/** A label with less room than this to its right is anchored from its end instead. */
const EDGE_PX = 60;

/**
 * The marker marks, plus the tooltip payload that goes with them.
 *
 * Collision handling happens in DOMAIN space, before anything is rendered:
 * pixel positions do not exist until the scene resolves, and the scene being
 * resolved is the one we are building. So the plot width and the date span give
 * pxPerDay, which turns the 14px rule of thumb into a gap in milliseconds — a
 * question the dates can answer. A cluster of n collapses to a single rule at
 * the members' mean date labelled "n changes", with the individual labels
 * carried into the tooltip.
 */
function markerLayer(markers: ChartMarkers, scene: any): MarkerLayer | null {
  const xDomain = scene?.scales?.x?.domain as readonly unknown[] | undefined;
  const yDomain = scene?.scales?.y?.domain as readonly unknown[] | undefined;
  const plot = scene?.chart;
  if (!xDomain?.length || !yDomain?.length || !plot) return null;

  const t0 = Number(new Date(xDomain[0] as any));
  const t1 = Number(new Date(xDomain[xDomain.length - 1] as any));
  const yLo = Number(yDomain[0]);
  const yHi = Number(yDomain[yDomain.length - 1]);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) return null;

  const clamp = (time: number) => Math.min(t1, Math.max(t0, time));
  const pxPerDay = plot.width / Math.max(1, (t1 - t0) / DAY_MS);
  const clusterMs = (CLUSTER_PX / Math.max(pxPerDay, 0.001)) * DAY_MS;

  // Clamping is what keeps the second render honest: a band running past the
  // last day of data would otherwise widen the x domain and move every point.
  const bands = markers.bands
    .map((band, index) => ({
      id: `band-${index}`,
      x1: new Date(clamp(band.start.getTime())),
      x2: new Date(clamp(band.endExclusive.getTime())),
      lo: yLo,
      hi: yHi,
      label: band.label,
    }))
    // A span entirely outside the window clamps to a zero-width sliver on the
    // edge. Drop it rather than paint a hairline that means nothing.
    .filter((band) => band.x2.getTime() > band.x1.getTime());

  const sorted = markers.rules
    .map((rule) => ({
      at: clamp(rule.at.getTime()),
      label: rule.label,
      count: Math.max(1, Math.round(rule.count ?? 1)),
    }))
    .sort((a, b) => a.at - b.at);

  interface Cluster {
    /** Compared against the next rule — a greedy chain, left to right. */
    last: number;
    sum: number;
    total: number;
    labels: string[];
  }
  const clusters: Cluster[] = [];
  for (const rule of sorted) {
    const open = clusters[clusters.length - 1];
    if (open && rule.at - open.last < clusterMs) {
      open.last = rule.at;
      open.sum += rule.at;
      open.total += rule.count;
      open.labels.push(rule.label);
    } else {
      clusters.push({ last: rule.at, sum: rule.at, total: rule.count, labels: [rule.label] });
    }
  }

  const mapX = scene.scales.x.map as (value: unknown) => number;
  const rules = clusters.map((cluster, index) => {
    const at = new Date(Math.round(cluster.sum / cluster.labels.length));
    return {
      id: `rule-${index}`,
      at,
      px: mapX(at),
      top: yHi,
      // A count is the caller telling us this marker already stands for several
      // events, so it aggregates the same way a cluster does.
      label: cluster.total > 1 ? `${cluster.total} changes` : cluster.labels[0]!,
      detail: cluster.total > 1 ? cluster.labels : undefined,
    };
  });

  // A label is only allowed the room between its own rule and whatever is next
  // to it. Text is measured by estimate, not by the renderer, so the estimate is
  // deliberately pessimistic — a label that overruns its neighbour is worse than
  // one that ends in an ellipsis, and the full text is in the tooltip and the
  // events disclosure either way.
  //
  // ~6px per glyph at the 10px label size is the pessimistic figure: wide
  // enough for caps and digits, so real text usually comes in under it. Fewer
  // than four characters of room means no label at all — "SE…" identifies
  // nothing, and the rule plus its tooltip still mark the event.
  const fitLabel = (label: string, room: number): string | null => {
    const glyphs = Math.floor(room / 6);
    if (glyphs >= label.length) return label;
    if (glyphs < 4) return null;
    return `${label.slice(0, glyphs - 1).trimEnd()}…`;
  };
  const labels = rules
    .map((rule, index) => {
      const flip = rule.px > plot.x + plot.width - EDGE_PX;
      const room = flip
        ? rule.px - Math.max(plot.x, rules[index - 1]?.px ?? plot.x) - 6
        : Math.min(plot.x + plot.width, rules[index + 1]?.px ?? Infinity) - rule.px - 6;
      const label = fitLabel(rule.label, room);
      return label
        ? {
            id: rule.id,
            at: rule.at,
            top: rule.top,
            label,
            anchor: (flip ? "end" : "start") as "end" | "start",
            dx: flip ? -3 : 3,
          }
        : null;
    })
    .filter((label): label is NonNullable<typeof label> => label !== null);

  if (bands.length === 0 && rules.length === 0) return null;

  const under = bands.length
    ? [
        rect(bands, {
          id: "marker-band",
          x1: "x1",
          x2: "x2",
          y1: "lo",
          y2: "hi",
          fill: ANNOTATION_INK,
          fillOpacity: 0.07,
          // The default 0.75 inset would leave a hairline of surface between the
          // wash and the plot's own edges.
          inset: 0,
        }),
      ]
    : [];

  const over: unknown[] = rules.length
    ? [
        ruleX(rules, {
          id: "marker-rule",
          x: "at",
          stroke: ANNOTATION_INK,
          strokeWidth: 1,
          strokeDasharray: "3 3",
          strokeOpacity: 0.65,
        }),
        text(labels, {
          id: "marker-label",
          x: "at",
          y: "top",
          text: "label",
          fill: ANNOTATION_INK,
          fontSize: 10,
          anchor: (datum) => datum.anchor,
          dx: (datum) => datum.dx,
          // Baseline is middle, so this drops the label just inside the top of
          // the plot rather than straddling its edge.
          dy: 7,
        }),
      ]
    : [];

  return {
    under,
    over,
    hits: (final: any) => {
      const map = final?.scales?.x?.map;
      if (typeof map !== "function") return [];
      const at = (value: unknown) => Math.round(map(value) * 100) / 100;
      return [
        ...bands.map((band) => ({
          x1: at(band.x1),
          x2: at(band.x2),
          label: tipText(band.label),
        })),
        ...rules.map((rule) => ({
          x: at(rule.at),
          label: tipText(rule.label),
          ...(rule.detail ? { detail: rule.detail.map(tipText) } : {}),
        })),
      ];
    },
  };
}

/**
 * Escapes text bound for the tooltip.
 *
 * Everything else in the payload is a formatted date or number, but a marker
 * label is free text an operator or an agent typed into the event log, and the
 * hover script writes it with innerHTML. Escape it here rather than teach the
 * script to build nodes — server-side is where the budget is.
 */
function tipText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A band scale renders every category label, and 16 months of "Apr 25" at 11px
 * collide well before they run out of room. Blank out all but every other one,
 * always keeping the first and last so the range stays readable.
 */
function sparse(months: readonly string[]): (month: string) => string {
  const keep = new Set(months.filter((_, i) => i === 0 || i === months.length - 1 || i % 2 === 0));
  return (month) => (keep.has(month) ? monthLabel(month) : "");
}

/**
 * Zero-based y domain. `nice: true` alone picks a domain that hugs the data, so
 * a series that only moves between 28 and 72 gets an axis starting at 20 and the
 * decline looks far steeper than it is. Growth and activity charts start at 0.
 */
function zeroBased(max: number) {
  // Must be a configured scale INSTANCE, not a factory. A factory is treated as
  // "infer the domain from the data" and the configured domain is discarded —
  // which is exactly the bug this function exists to prevent.
  return scaleLinear().domain([0, max]);
}

const monthShort = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

/** "2026-03" -> "Mar '26" */
const monthLabel = (month: string) => monthShort(monthDate(month));

/** "2026-03" -> "March 2026". The tooltip's expansion of the axis's "Mar '26". */
const monthFull = (month: string) =>
  monthDate(month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const compact = (n: number) => n.toLocaleString("en-US");

/** Total registered users over time. Trend of a single series -> area + line. */
export function cumulativeUsersChart(
  points: readonly { date: Date; total: number }[],
  markers?: ChartMarkers,
): string {
  return render(
    defineChart({
      marks: [
        areaY(points, {
          id: "users-area",
          x: "date",
          y: "total",
          fill: SERIES,
          fillOpacity: 0.14,
        }),
        lineY(points, {
          id: "users-line",
          x: "date",
          y: "total",
          stroke: SERIES,
          strokeWidth: 2,
        }),
      ],
      x: {
        scale: scaleUtc,
        axis: { ticks: { count: 6, format: monthShort }, tickLabels: { thin: true } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: compact } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "Total registered users over time",
    "cum",
    {
      formatX: (d: Date) =>
        d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      formatY: (v: number) => `${compact(v)} registered accounts`,
    },
    markers,
  );
}

/** New signups per complete month. Comparing magnitude -> bars, one hue. */
export function newSignupsChart(rows: readonly MonthRow[]): string {
  return render(
    defineChart({
      marks: [barY(rows, { id: "signups", x: "month", y: "count", fill: SERIES, radius: 4 })],
      x: {
        scale: () => scaleBand<string>().padding(0.3),
        axis: { ticks: { format: sparse(rows.map((r) => r.month)) } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: compact } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "New signups per month",
    "new",
    { formatX: monthFull, formatY: (v: number) => `${compact(v)} signups` },
  );
}

/** Distinct users who liked at least one palette in each month. */
export function activeUsersChart(rows: readonly LikersRow[]): string {
  const points = rows.map((r) => ({ date: monthDate(r.month), likers: r.likers }));
  return render(
    defineChart({
      marks: [
        lineY(points, { id: "likers", x: "date", y: "likers", stroke: SERIES, strokeWidth: 2 }),
      ],
      x: {
        scale: scaleUtc,
        axis: { ticks: { count: 6, format: monthShort }, tickLabels: { thin: true } },
      },
      y: {
        scale: zeroBased(Math.max(10, ...points.map((p) => p.likers))),
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: compact } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "Monthly active users, measured as distinct users who liked a palette",
    "act",
    {
      formatX: (d: Date) =>
        d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      formatY: (v: number) => `${compact(v)} accounts liked something`,
    },
  );
}

/**
 * Cohorts below this size are dropped from the activation chart. The launch
 * month had a single user who happened to like something — a 100% bar that
 * compresses every real cohort into the bottom quarter of the plot and hides
 * the actual story, which is how flat the rate is.
 */
export const MIN_COHORT = 30;

/** Share of each signup cohort that has ever liked a palette. */
export function activationChart(cohorts: readonly CohortRow[]): string {
  const rows = cohorts
    .filter((c) => c.users >= MIN_COHORT)
    .map((c) => ({
      month: c.month,
      rate: c.users > 0 ? Math.round((c.activated / c.users) * 1000) / 10 : 0,
    }));
  return render(
    defineChart({
      marks: [barY(rows, { id: "activation", x: "month", y: "rate", fill: SERIES, radius: 4 })],
      x: {
        scale: () => scaleBand<string>().padding(0.3),
        axis: { ticks: { format: sparse(rows.map((r) => r.month)) } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: (v: number) => `${v}%` } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "Share of each signup cohort that has ever liked a palette",
    "actv",
    { formatX: monthFull, formatY: (v: number) => `${v}% of the cohort activated` },
  );
}

/**
 * Daily unique visitors from Cloudflare zone analytics.
 *
 * A daily series specifically — these are per-day distinct IPs, so adding them
 * up across the window would double-count every returning visitor. Only the
 * shape over time and the daily level mean anything.
 */
export function dailyVisitorsChart(days: readonly TrafficDay[], markers?: ChartMarkers): string {
  // Raw daily values carry a hard weekly sawtooth — weekends are a different
  // business from weekdays. The smoothed line is the one to read for direction;
  // the raw series stays underneath at low opacity so a genuine one-day spike
  // is still visible rather than averaged out of existence.
  const smoothed = rollingMean(days.map((d) => d.browserPageViews));
  const points = days.map((d, i) => ({
    date: new Date(`${d.date}T00:00:00Z`),
    browser: d.browserPageViews,
    automated: d.automatedPageViews,
    trend: smoothed[i],
  }));
  return render(
    defineChart({
      marks: [
        lineY(points, {
          id: "browser-line",
          x: "date",
          y: "browser",
          stroke: SERIES,
          strokeWidth: 1,
          strokeOpacity: 0.3,
        }),
        // Same hue, not a new palette slot: this is the same series, read
        // differently. A second colour would imply a second measurement.
        lineY(
          points.filter((p) => p.trend !== null),
          { id: "browser-trend", x: "date", y: "trend", stroke: SERIES, strokeWidth: 2 },
        ),
        lineY(points, {
          id: "automated-line",
          x: "date",
          y: "automated",
          stroke: SERIES_2,
          strokeWidth: 2,
        }),
      ],
      x: {
        scale: scaleUtc,
        axis: {
          ticks: {
            count: 6,
            format: (d: Date) =>
              d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
          },
          tickLabels: { thin: true },
        },
      },
      y: {
        scale: zeroBased(Math.max(1000, ...points.map((p) => Math.max(p.browser, p.automated)))),
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: (v: number) => `${Math.round(v / 1000)}k` } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "Daily pageviews from recognized browsers versus bots and unidentified clients",
    "vis",
    {
      formatX: (d: Date) =>
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
      formatY: (v: number) => `${compact(v)} views`,
      series: {
        "browser-trend": { n: "Browser views (7-day avg)", c: SERIES },
        "browser-line": { n: "Browser views (that day)", c: SERIES },
        "automated-line": { n: "Bots & unidentified", c: SERIES_2 },
      },
    },
    markers,
  );
}

/** Below this many points a 7-day mean is most of the series, not a smoothing of it. */
const SMOOTH_MIN = 21;

/**
 * Trailing 7-day mean that respects gaps.
 *
 * range.ts's rollingMean takes a dense number[]. A metric history is not dense —
 * a source can be down for a day — and averaging across a hole invents a value
 * for a day nobody measured. A window containing a gap is null, so the smoothed
 * line breaks exactly where the raw one does.
 */
function trailingMean(values: readonly (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const value = values[j];
      if (value == null) return null;
      sum += value;
    }
    return sum / window;
  });
}

export interface TrendPoint {
  date: Date;
  /** null is a gap, never a zero. The line breaks; it is never interpolated. */
  value: number | null;
  /** Today's partial day, a source still backfilling — anything not final yet. */
  provisional?: boolean;
}

export interface TrendSeries {
  label: string;
  points: TrendPoint[];
  /** A `var(--series-N)` reference. Defaults to slots 1..4 in order. */
  color?: string;
}

/**
 * Splits a series into alternating settled and provisional runs.
 *
 * The library styles a line mark as a whole — there is no per-segment stroke —
 * so "the provisional tail is dimmer" has to be two marks. Consecutive runs
 * repeat the point they join at so the line stays continuous instead of showing
 * a one-pixel notch; the tooltip dedupes that repeat away by series key.
 */
function provisionalRuns(
  points: readonly TrendPoint[],
): { provisional: boolean; points: TrendPoint[] }[] {
  const runs: { provisional: boolean; points: TrendPoint[] }[] = [];
  for (const point of points) {
    const provisional = point.provisional === true;
    let run = runs[runs.length - 1];
    if (!run || run.provisional !== provisional) {
      const previous = run?.points[run.points.length - 1];
      run = { provisional, points: previous ? [previous] : [] };
      runs.push(run);
    }
    run.points.push(point);
  }
  return runs;
}

/**
 * The color a series gets at a given position.
 *
 * Color follows the entity, never its rank, so callers must pass their series in
 * a stable order — a filter that drops one must not repaint the survivors.
 *
 * There is deliberately no fifth slot. A generated fifth hue is indistinguishable
 * from an existing one under colorblindness, so past four the answer is to fold
 * the tail into "Other" or facet into small multiples. Anything beyond the fourth
 * series is drawn in de-emphasis gray, which makes an over-full chart look wrong
 * instead of looking fine and lying.
 */
export function seriesColor(index: number): string {
  return SERIES_SLOTS[index] ?? ANNOTATION_INK;
}

/**
 * The generic multi-series time chart behind the metric history pages.
 *
 * Two or more series need a legend, and this returns only the plot, so the
 * caller builds one — the palette is exported for exactly that:
 *
 *   legend(series.map((s, i) => ({ color: s.color ?? seriesColor(i), label: s.label })))
 *
 * and passes it to chartCard's `legend` slot. Four series is the ceiling; see
 * seriesColor.
 *
 * `formatValue` is used for the axis ticks as well as the tooltip, so keep it a
 * bare number ("1.2k", "48%"). A tick is a position on the scale, not a data
 * point, and a formatter that says "1,240 sessions · 12% of tracked" will
 * happily print that on a round number no reader ever measured.
 */
export function metricTrendChart(
  series: TrendSeries[],
  opts: {
    ariaLabel: string;
    idPrefix: string;
    formatValue: (n: number) => string;
    markers?: ChartMarkers;
    /** Default true — growth and activity charts start at 0 (see zeroBased()). */
    zeroBase?: boolean;
    /** Render a trailing 7-day mean per series when the series is long enough. */
    smooth?: boolean;
  },
): string {
  const marks: unknown[] = [];
  const hover: Record<string, { n: string; c: string; k: string }> = {};
  let max = 0;

  series.forEach((entry, index) => {
    const color = entry.color ?? seriesColor(index);
    const key = `s${index}`;
    for (const point of entry.points) {
      if (point.value !== null && point.value > max) max = point.value;
    }

    const smoothed = opts.smooth === true && entry.points.length >= SMOOTH_MIN;
    let line = entry.points;
    if (smoothed) {
      // Same treatment as the daily visitors chart: the raw series stays
      // underneath at low opacity so a genuine one-day spike is still visible
      // rather than averaged out of existence. Same hue, not a new slot — this
      // is the same measurement read differently.
      marks.push(
        lineY(entry.points, {
          id: `${key}-raw`,
          x: "date",
          y: "value",
          stroke: color,
          strokeWidth: 1,
          strokeOpacity: 0.3,
        }),
      );
      hover[`${key}-raw`] = { n: `${entry.label} (that day)`, c: color, k: `${key}-raw` };
      const mean = trailingMean(entry.points.map((point) => point.value));
      line = entry.points.map((point, i) => ({
        date: point.date,
        value: mean[i] ?? null,
        provisional: point.provisional,
      }));
    }

    const base = smoothed ? `${entry.label} (7-day avg)` : entry.label;
    provisionalRuns(line).forEach((run, runIndex) => {
      const id = `${key}-${runIndex}${run.provisional ? "p" : ""}`;
      marks.push(
        lineY(run.points, {
          id,
          x: "date",
          y: "value",
          stroke: color,
          strokeWidth: 2,
          strokeOpacity: run.provisional ? 0.45 : 1,
        }),
      );
      hover[id] = {
        n: run.provisional ? `${base} · provisional` : base,
        c: color,
        k: key,
      };
    });
  });

  return render(
    defineChart({
      marks: marks as any,
      x: {
        scale: scaleUtc,
        axis: {
          ticks: {
            count: 6,
            format: (d: Date) =>
              d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
          },
          tickLabels: { thin: true },
        },
      },
      y: {
        scale: opts.zeroBase === false ? scaleLinear : zeroBased(Math.max(1, max)),
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: opts.formatValue } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    opts.ariaLabel,
    opts.idPrefix,
    {
      formatX: (d: Date) =>
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
      formatY: (v: number) => opts.formatValue(v),
      series: hover,
    },
    opts.markers,
  );
}

/**
 * Signups per 100,000 pageviews, by month — the visitor-to-account funnel.
 *
 * Normalised per pageview rather than shown as raw counts because traffic and
 * signups moved in opposite directions; a raw signup count hides that entirely.
 * Bots are in the denominator (Cloudflare's dataset has no bot filter here), so
 * treat the level as indicative and the trend as the signal.
 */
export function conversionChart(
  rows: readonly { month: string; per100k: number }[],
): string {
  return render(
    defineChart({
      marks: [barY(rows, { id: "conv", x: "month", y: "per100k", fill: SERIES, radius: 4 })],
      x: {
        scale: () => scaleBand<string>().padding(0.3),
        axis: { ticks: { format: (m: string) => monthLabel(m) } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 5, format: (v: number) => `${v}` } },
      },
      theme: THEME,
      margin: MARGIN,
    }),
    "Signups per 100,000 pageviews, by month",
    "conv",
    { formatX: monthFull, formatY: (v: number) => `${v} signups per 100k browser views` },
  );
}


/**
 * Ranked magnitude with long category names -> horizontal bars.
 *
 * Country names and URL paths do not fit under a vertical bar without rotating
 * the labels to the point of unreadability, so the categorical axis goes down
 * the side. Height grows with the row count rather than being fixed, otherwise
 * twelve rows in a 210px plot leaves each bar too thin to see.
 */
export function rankedBarChart(
  rows: readonly Breakdown[],
  ariaLabel: string,
  idPrefix: string,
  /**
   * Formats a TOOLTIP value. May be rich ("1,234 views · 12.3% of tracked") —
   * it is only ever applied to a real data point.
   */
  formatValue: (n: number) => string,
  /**
   * Expands the axis label for the tooltip. A tooltip that repeats what the
   * axis already says is wasted — the axis is a cramped "SG", the tooltip has
   * room for "Singapore". Defaults to identity for labels already spelled out.
   */
  expandLabel: (label: string) => string = (label) => label,
  /**
   * Formats an AXIS TICK. Separate from formatValue on purpose: ticks are
   * positions on the scale, not data points, so a share-of-total formatter
   * applied here computes percentages of arbitrary round numbers and happily
   * prints "125% of tracked" on a tick past the largest bar.
   */
  formatTick: (n: number) => string = compact,
): string {
  const height = Math.max(120, rows.length * 26 + 30);
  const runtime = createChartRuntime<any, any, any>();
  try {
    const definition = defineChart({
      marks: [barX(rows, { id: idPrefix, x: "count", y: "label", fill: SERIES, radius: 4 })],
      x: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { ticks: { count: 4, format: formatTick } },
      },
      y: { scale: () => scaleBand<string>().padding(0.25), axis: { ticks: {} } },
      theme: THEME,
      // Wide left gutter: the category labels live there.
      margin: { top: 8, right: 18, bottom: 24, left: 108 },
    });
    const scene = runtime.render(definition as any, { width: WIDTH, height });
    const svg = renderChartSvg(scene, {
      ariaLabel,
      idPrefix,
      className: "chart-svg",
      tabIndex: -1,
    });
    // tipText, not raw: these labels are request paths, search queries and
    // referrer URLs — none of them ours — and the hover script writes them
    // with innerHTML. expandLabel is usually decodeURIComponent, so a
    // percent-encoded payload arrives here already decoded into markup.
    // Anyone who can send a request to grabient.com can put a path in this
    // card's top-12.
    const points = (scene as any).points.map((p: any) => ({
      m: "",
      c: SERIES,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      l: tipText(expandLabel(String(p.yValue))),
      v: tipText(formatValue(p.xValue)),
    }));
    const payload = { w: WIDTH, h: height, plot: (scene as any).chart, points, axis: "y" };
    const json = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return `<div class="chart-hover" data-chart='${json}' tabindex="0" role="group" aria-label="${esc(ariaLabel)}. Use arrow keys to read values.">${svg}</div>`;
  } finally {
    runtime.destroy();
  }
}
