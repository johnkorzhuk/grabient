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

// The SVG is emitted with a viewBox and scaled to its container by CSS, which
// scales the tick text along with the geometry. So the intrinsic size is chosen
// to match the real rendered width — a two-column card inside max-w-6xl, minus
// the gap and the card padding — and the labels land at their intended 11px
// instead of being shrunk to ~7px by a 760px chart squeezed into a 528px card.
const WIDTH = 520;
const HEIGHT = 210;

const SERIES = "var(--series-1)";
const SERIES_2 = "var(--series-2)";

// Hairline, recessive chrome: the data is the loud part, the grid sits one shade
// off the surface and is never dashed.
const THEME = {
  foreground: "var(--ink)",
  muted: "var(--ink-muted)",
  grid: "var(--grid)",
  background: "var(--surface)",
  palette: [SERIES, SERIES_2],
} as const;

const MARGIN = { top: 12, right: 18, bottom: 26, left: 46 };

interface HoverOptions {
  /** Formats the x value into the tooltip's heading. */
  formatX: (value: any) => string;
  /** Formats a y value into the tooltip's readout. */
  formatY: (value: any) => string;
  /** markId -> label and swatch color. A single-series chart can omit this. */
  series?: Record<string, { n: string; c: string }>;
}

function render(
  definition: unknown,
  ariaLabel: string,
  idPrefix: string,
  hover: HoverOptions,
): string {
  const runtime = createChartRuntime<any, any, any>();
  try {
    const scene = runtime.render(definition as any, { width: WIDTH, height: HEIGHT });
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
        // An area mark sits under its own line and resolves to the same points;
        // keeping both would print every value twice in the tooltip.
        if (String(p.markId).endsWith("-area")) return null;
        const key = `${p.markId}:${p.x}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const meta = hover.series?.[p.markId];
        return {
          m: meta?.n ?? "",
          c: meta?.c ?? SERIES,
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          l: hover.formatX(p.xValue),
          v: hover.formatY(p.yValue),
        };
      })
      .filter(Boolean);

    const payload = {
      w: WIDTH,
      h: HEIGHT,
      plot: (scene as any).chart,
      points,
    };

    // Single-quoted attribute, so only the quote and & need escaping.
    const json = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return `<div class="chart-hover" data-chart='${json}' tabindex="0" role="group" aria-label="${
      ariaLabel
    }. Use arrow keys to read values.">${svg}</div>`;
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
export function cumulativeUsersChart(points: readonly { date: Date; total: number }[]): string {
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
export function dailyVisitorsChart(days: readonly TrafficDay[]): string {
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
    const points = (scene as any).points.map((p: any) => ({
      m: "",
      c: SERIES,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      l: expandLabel(String(p.yValue)),
      v: formatValue(p.xValue),
    }));
    const payload = { w: WIDTH, h: height, plot: (scene as any).chart, points, axis: "y" };
    const json = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return `<div class="chart-hover" data-chart='${json}' tabindex="0" role="group" aria-label="${ariaLabel}. Use arrow keys to read values.">${svg}</div>`;
  } finally {
    runtime.destroy();
  }
}
