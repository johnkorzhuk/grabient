import { hexToSrgb, toHex } from "@grabient/engine/color.ts";
import { gradientCss, spell } from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import { isSwatchStyle, STYLE_LABELS, type Style } from "@grabient/engine/view.ts";
import { dir, formatDate, formatNumber, type Locale, locale, msg, t } from "@grabient/i18n";
import { intlTag } from "@grabient/i18n/format.ts";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import { createUniqueId, For, Match, Show, Switch } from "solid-js";
import { colorFormat } from "../../lib/color-format.ts";
import styles from "./Chart.module.css";
import { ContrastChip, Example, type ExampleProps } from "./Example.tsx";
import { orderedScale, seriesOf, standsOut, TILE } from "./fit.ts";
import { drawnColors, inkOn, type Shown, type Theme, worstContrast } from "./paint.ts";
import { cssRule, effectColorsWords, stopsOf } from "./shared.ts";

/* Charts in the palette's colors: a site's visits as a dashboard in the reader's language, holding only the charts the
   palette works for, by fit.ts's checks. The colors are taken along the palette: a gradient's curve at FINE even steps,
   the bands' own colors in order, the colors an effect is drawn from.
   - As a color scale, where a value's color says how much: October's calendar, each day in the color at its place
     between the fewest visits and the most, where the colors run in order (orderedScale), blended, or a class for each
     band; and the hours' columns and the weeks' line in their values' colors only where every color also stands out
     from the tile (standsOut), since a part of a line in a color the tile hides shows nothing.
   - As series colors, one for each source of the visits: each month's bar cut into the sources' shares, October's donut
     and the weeks' visits stacked by source, where five of the colors, else four, stand out from the tile and are told
     apart (seriesOf).
   The board takes the tile theme on which more of these charts fit, and where as many fit on both, the one every color
   stands out from better, as tileFor chooses: the palette decides it, never the page's theme, so the server's board is
   the browser's. The address's style leads: bands put their series first, a gradient or an effect its scale. A chart
   that wants the width spans the board and the others stand two to a row, so no width leaves a hole. A number inside a
   color is in white or black, whichever reads on it, and the chip under the stage gives the least contrast one has. The
   code gives the same colors to a chart library, from the palette's JSON address too, for the charts shown. Nothing
   changes under the pointer: each chart is a picture named for a screen reader. */

/** A gradient's colors the charts take, evenly along its curve: as finely as fit.ts's thresholds were set on. */
const FINE = 24;

/** The sources of a site's visits, the largest first; the last of a chart's series is Other, which takes the rest.
    Their context, "source", is written out at each call: the extractor reads only a context written there. */
const SOURCES = [
  msg("Search", "source"),
  msg("Direct", "source"),
  msg("Social", "source"),
  msg("Referral", "source")
] as const;
const OTHER = msg("Other", "source");
/** Each named source's share of a month's visits in hundredths, May to October 2026. */
const SHARES: readonly (readonly number[])[] = [
  [40, 22, 10, 11],
  [39, 21, 11, 11],
  [37, 22, 12, 10],
  [36, 22, 13, 11],
  [35, 21, 14, 10],
  [34, 22, 15, 10]
];
const monthAt = (i: number) => Date.UTC(2026, 4 + i, 1);
const FIRST_MONTH = monthAt(0);
const LAST_MONTH = monthAt(SHARES.length - 1);
/** October 2026's visits, day by day: the 1st is a Thursday. */
const DAYS = [
  1418, 1192, 867, 876, 1517, 1574, 1656, 1547, 1351, 962, 989, 1743, 1845, 1751, 1753, 1497, 1034,
  1149, 1776, 2054, 2208, 1851, 1727, 1122, 1258, 1963, 2201, 2213, 2019, 1827, 1270
];
const VISITS = DAYS.reduce((sum, day) => sum + day, 0);
const FEWEST = Math.min(...DAYS);
const MOST = Math.max(...DAYS);
/** October's visits by the hour of the day they began in, from midnight: as many as its days'. */
const HOURS = [
  930, 691, 533, 442, 431, 521, 884, 1462, 2244, 2970, 3344, 3412, 3151, 3276, 3469, 3367, 3106,
  2709, 2324, 2131, 2029, 1916, 1610, 1258
];
/** Visits a week, the 26 weeks from Sunday 3 May to Saturday 31 October 2026: October's from its days. */
const WEEKS = [
  7940, 8160, 8050, 8410, 8330, 8620, 8710, 8480, 8260, 7890, 7720, 7610, 7830, 7690, 7950, 8240,
  8510, 8790, 9060, 8880, 9240, 9637, 9483, 10612, 11887, 12751
];
const WEEK_ONE = Date.UTC(2026, 4, 3);
const WEEK = 7 * 24 * 3600 * 1000;
/** The weekday October's 1st falls on, 0 for Sunday. */
const OCT_FIRST = 4;
/** The day of the week a calendar starts on where each language is read (CLDR, for the country its translation is
    written for): 0 Sunday, 1 Monday, 6 Saturday. */
const WEEK_START: Readonly<Record<Locale, number>> = {
  en: 0,
  ar: 6,
  de: 1,
  es: 0,
  fa: 6,
  fr: 1,
  id: 0,
  ja: 0,
  ko: 0,
  "pt-BR": 0,
  ru: 1,
  th: 0,
  tr: 1,
  uk: 1,
  vi: 1,
  "zh-Hans": 1
};

/** What the palette gives the charts on one tile theme. */
interface Fit {
  theme: Theme;
  /** the colors as an ordered scale, low to high on the tile, where they run as one */
  scale: string[] | null;
  /** the scale runs against the palette's order: its high end, the one that stands out most, is the palette's start */
  turned: boolean;
  /** every color stands out from the tile too: a line and columns may take the scale */
  marks: boolean;
  /** five series colors told apart on the tile, else four, else none */
  series: string[] | null;
  /** the charts that fit */
  count: number;
}
function fitOn(colors: readonly string[], theme: Theme): Fit {
  const tile = TILE[theme];
  const scale = orderedScale(colors, tile);
  const marks = scale.fits && standsOut(colors, tile);
  const five = seriesOf(colors, 5, tile);
  const series = five.fits ? five : seriesOf(colors, 4, tile);
  return {
    theme,
    scale: scale.fits ? scale.colors : null,
    turned: scale.colors[0] !== colors[0],
    marks,
    series: series.fits ? series.colors : null,
    count: (scale.fits ? 1 : 0) + (marks ? 2 : 0) + (series.fits ? 3 : 0)
  };
}
/** The tile theme on which more charts fit; where as many do on both, the one every color stands out from better. */
function fitOf(colors: readonly string[]): Fit {
  const dark = fitOn(colors, "dark");
  const light = fitOn(colors, "light");
  if (dark.count !== light.count) return dark.count > light.count ? dark : light;
  return worstContrast(TILE.dark, colors) >= worstContrast(TILE.light, colors) ? dark : light;
}

/** The palette's colors as the charts take them, with the curve's stops they are: a gradient's curve at FINE steps,
    the bands' own, an effect's (the glass's six and the blob's nine lie at even steps of the curve too, so the JSON
    address at that many steps gives them). */
function alongOf(s: Shown): Stop[] {
  if (s.effect) return sampleStops(s.palette, drawnColors(s).length);
  return isSwatchStyle(s.view.style) ? stopsOf(s) : sampleStops(s.palette, FINE);
}

/** The palette's own gradient as the charts take it, whatever the address names: FINE even steps of its curve. */
const plainStops = (s: Shown): Stop[] => sampleStops(s.palette, FINE);
/** Whether the palette suits this example (fit.ts), decided on its own gradient, so its page holds the charts in every
    style; where it does not, the page leaves the example out. */
export const chartFits = (s: ExampleProps["s"]): boolean =>
  fitOf(plainStops(s).map(stop => stop.hex)).count > 0;

/** What the charts make of the palette as the page shows it. */
interface Plan extends Fit {
  stops: Stop[];
  colors: string[];
  /** bands: the scale's classes, one for each band, and the series lead the board */
  bands: boolean;
  /** how the palette is drawn there, as the tag says it */
  drawn: string;
  /** shown otherwise than the address names it */
  differs: boolean;
  /** the palette's JSON address, whose colors are these */
  json: string;
}

/* the words that say how the palette is drawn: a style and its steps, with no angle where the charts have none */
const stepWords = (style: Style, steps: number) =>
  `${t(STYLE_LABELS[style])} · ${t("{count, plural, one {# step} other {# steps}}", { count: steps })}`;

function planOf(address: Shown, origin: string): Plan {
  /* the address's colors where a chart fits them, else the palette's own gradient's, which the tag says */
  const own = alongOf(address);
  const owned = fitOf(own.map(stop => stop.hex)).count > 0;
  const s: Shown = owned
    ? address
    : { ...address, effect: null, view: { ...address.view, style: "linearGradient" } };
  const stops = owned ? own : plainStops(address);
  const colors = stops.map(stop => stop.hex);
  const fit = fitOf(colors);
  const bands = !s.effect && isSwatchStyle(s.view.style);
  const n = colors.length;
  /* a scale runs from the fewest to the most, as a linear gradient or linear bands do: an angle or a center has no part
     in it. Series take some of the colors, as a press takes one: no other way of drawing the palette */
  const linear: Style = bands ? "linearSwatches" : "linearGradient";
  return {
    ...fit,
    stops,
    colors,
    bands,
    drawn: effectColorsWords(s) ?? stepWords(linear, n),
    differs: !!address.effect || address.view.style !== linear || address.view.steps !== n,
    json: `${origin}/${s.seed}.json?steps=${n}`
  };
}

/** The charts a board may hold. */
type Kind = "calendar" | "hours" | "weeks" | "months" | "donut" | "areas";
/** The charts whose shape wants the board's width; the others stand two to a row. */
const WIDE: readonly Kind[] = ["calendar", "months"];
const TITLES: Readonly<Record<Kind, string>> = {
  calendar: msg("Visits per day"),
  hours: msg("Visits by hour"),
  weeks: msg("Visits per week"),
  months: msg("Sources by month"),
  donut: msg("Visits by source"),
  areas: msg("Sources by week")
};
/** The charts of October alone; the others run from May. */
const OCTOBER: readonly Kind[] = ["calendar", "hours", "donut"];

/** The charts the palette fits, the address's style leading. */
function chartsOf(plan: Plan): Kind[] {
  const scale: Kind[] = plan.scale
    ? ["calendar", ...(plan.marks ? (["hours", "weeks"] as const) : [])]
    : [];
  const series: Kind[] = plan.series ? ["months", "donut", "areas"] : [];
  return plan.bands ? [...series, ...scale] : [...scale, ...series];
}
/** Whether a chart spans the board: a wide one, or the last of an odd run of the others, so no row keeps a hole. */
function spans(kinds: readonly Kind[], at: number): boolean {
  if (WIDE.includes(kinds[at])) return true;
  let from = at;
  while (from > 0 && !WIDE.includes(kinds[from - 1])) from--;
  let to = at;
  while (to < kinds.length - 1 && !WIDE.includes(kinds[to + 1])) to++;
  return at === to && (to - from) % 2 === 0;
}

/** A chart's series: the first sources and Other, which takes the rest, in the colors' order. */
interface Part {
  name: string;
  /** in hundredths */
  share: number;
  color: string;
  /** white or black, whichever reads on the color, and the contrast it has there */
  ink: string;
  ratio: number;
}
function partsOf(colors: readonly string[], shares: readonly number[]): Part[] {
  const named = shares.slice(0, colors.length - 1);
  const rest = 100 - named.reduce((sum, share) => sum + share, 0);
  return [...named, rest].map((share, i) => ({
    name: t(i < named.length ? SOURCES[i] : OTHER, { $context: "source" }),
    share,
    color: colors[i],
    ...inkOn([colors[i]])
  }));
}
/** October's series with their visits, Other's taking what the rounding leaves. */
function ofOctober(colors: readonly string[]): (Part & { visits: number })[] {
  const parts = partsOf(colors, SHARES[SHARES.length - 1]);
  const visits = parts.map(part => Math.round((VISITS * part.share) / 100));
  visits[visits.length - 1] = VISITS - visits.slice(0, -1).reduce((sum, v) => sum + v, 0);
  return parts.map((part, i) => ({ ...part, visits: visits[i] }));
}
/** The sources' shares in a week, drawn from the months' as they change from one to the next. */
function sharesAt(week: number): number[] {
  const at = (week / (WEEKS.length - 1)) * (SHARES.length - 1);
  const from = Math.floor(at);
  const to = Math.min(SHARES.length - 1, from + 1);
  return SHARES[from].map((share, k) => share + (SHARES[to][k] - share) * (at - from));
}

const percent = (hundredths: number) => formatNumber(hundredths / 100, { style: "percent" });
const fixed = (n: number) => +n.toFixed(2);
/** Where a value stands between the fewest and the most of its own, 0 to 1. */
const placeIn = (values: readonly number[], value: number) =>
  (value - Math.min(...values)) / (Math.max(...values) - Math.min(...values));

/** The color at a place on the scale, 0 to 1: blended between the colors as CSS blends a gradient's stops in sRGB (as
    D3's piecewise interpolateRgb does), or its class's, the range cut into as many as there are colors (D3's
    quantize). */
function colorAt(colors: readonly string[], classes: boolean, at: number): string {
  const n = colors.length;
  const u = Math.min(1, Math.max(0, at));
  if (classes || n < 2) return colors[Math.min(n - 1, Math.floor(u * n))];
  const x = u * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const a = hexToSrgb(colors[i]) ?? [0, 0, 0];
  const b = hexToSrgb(colors[i + 1]) ?? [0, 0, 0];
  return toHex(a.map((v, k) => v + (b[k] - v) * (x - i)));
}

/** A month and its year, written the reader's way. */
const monthWords = (date: number) =>
  formatDate(date, { month: "long", year: "numeric", timeZone: "UTC" });
/** Two months as a range, written the reader's way: "May – Oct 2026". formatDate has no range of its own. */
const monthRange = (from: number, to: number) =>
  new Intl.DateTimeFormat(intlTag(locale()), {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).formatRange(new Date(from), new Date(to));

export function ChartExample(props: ExampleProps) {
  const plan = () => planOf(props.s, props.origin);
  const charts = () => chartsOf(plan());
  /* the least contrast a number inside a color has on the board: every day's in the calendar, the shares the donut
     writes in its wedges */
  const inside = () => {
    const { scale, series, bands } = plan();
    const ratios = [
      ...(scale ? DAYS.map(day => inkOn([colorAt(scale, bands, placeIn(DAYS, day))]).ratio) : []),
      ...(series
        ? ofOctober(series)
            .filter(part => part.share >= WEDGE_LABEL)
            .map(part => part.ratio)
        : [])
    ];
    return ratios.length ? Math.min(...ratios) : null;
  };
  return (
    <Example
      id="chart"
      n={props.n}
      title={t("Charts")}
      about={t("For dashboards and reports.")}
      drawn={plan().drawn}
      differs={plan().differs}
      notes={<Show when={inside()}>{ratio => <ContrastChip ratio={ratio()} />}</Show>}
      code={codeOf(plan())}
      codeLabel={t("The charts' code")}
    >
      <div class={styles.board} data-theme={plan().theme}>
        <For each={charts()}>
          {(kind, i) => <Chart kind={kind} plan={plan()} wide={spans(charts(), i())} />}
        </For>
      </div>
    </Example>
  );
}

/** A dashboard's tile: its title and period over its chart. */
function Chart(props: { kind: Kind; plan: Plan; wide: boolean }) {
  const title = () => t(TITLES[props.kind]);
  const when = () =>
    OCTOBER.includes(props.kind) ? monthWords(LAST_MONTH) : monthRange(FIRST_MONTH, LAST_MONTH);
  const label = () => `${title()} · ${when()}`;
  /* a chart's colors never fail it, even in the moment before the board lets go of a chart the palette no longer fits */
  const scale = () => props.plan.scale ?? props.plan.colors;
  const series = () => props.plan.series ?? props.plan.colors.slice(0, 4);
  return (
    <div class={styles.tile} data-wide={props.wide ? "" : undefined}>
      <div class={styles.head}>
        <h3 class={styles.title}>{title()}</h3>
        <span class={styles.period}>{when()}</span>
      </div>
      <Switch>
        <Match when={props.kind === "calendar"}>
          <Calendar scale={scale()} classes={props.plan.bands} label={label()} />
        </Match>
        <Match when={props.kind === "hours"}>
          <Columns scale={scale()} classes={props.plan.bands} label={label()} />
        </Match>
        <Match when={props.kind === "weeks"}>
          <Line scale={scale()} classes={props.plan.bands} label={label()} />
        </Match>
        <Match when={props.kind === "months"}>
          <Keys parts={partsOf(series(), SHARES[0])} />
          <Bars colors={series()} label={label()} />
        </Match>
        <Match when={props.kind === "donut"}>
          <Donut colors={series()} label={label()} />
        </Match>
        <Match when={props.kind === "areas"}>
          <Area colors={series()} label={label()} />
        </Match>
      </Switch>
    </div>
  );
}

/* ---- the bars: each month's visits, cut into the sources' shares ---- */

/** A month's bar and the room from one to the next, in px. */
const BAR = 20;
const BAR_PITCH = 28;

function Bars(props: { colors: string[]; label: string }) {
  const clip = createUniqueId();
  /* each source's run down the months; across in percent, as its share runs, so the tile's width sets the bars' */
  const runs = () => {
    const rtl = dir() === "rtl";
    const months = SHARES.map(shares => partsOf(props.colors, shares));
    return months[0].map((source, k) => ({
      color: source.color,
      marks: months.map((parts, row) => {
        const start = parts.slice(0, k).reduce((sum, part) => sum + part.share, 0);
        const share = parts[k].share;
        return { share, x: rtl ? 100 - start - share : start, y: row * BAR_PITCH };
      })
    }));
  };
  const height = SHARES.length * BAR_PITCH - (BAR_PITCH - BAR);
  return (
    <div class={styles.bars}>
      <ol
        class={styles.months}
        style={{ "grid-auto-rows": `${BAR}px`, "row-gap": `${BAR_PITCH - BAR}px` }}
        aria-hidden="true"
      >
        <For each={SHARES} keyed={false}>
          {(_, row) => <li>{formatDate(monthAt(row), { month: "short", timeZone: "UTC" })}</li>}
        </For>
      </ol>
      <svg class={styles.plot} height={height} role="img" aria-label={props.label}>
        <defs>
          <clipPath id={clip}>
            <For each={SHARES} keyed={false}>
              {(_, row) => <rect y={row * BAR_PITCH} width="100%" height={BAR} rx="4" />}
            </For>
          </clipPath>
        </defs>
        <g class={styles.gaps} clip-path={`url(#${clip})`}>
          <For each={runs()} keyed={false}>
            {run => (
              <For each={run().marks} keyed={false}>
                {mark => (
                  <rect
                    x={`${mark().x}%`}
                    y={mark().y}
                    width={`${mark().share}%`}
                    height={BAR}
                    fill={run().color}
                  />
                )}
              </For>
            )}
          </For>
        </g>
      </svg>
    </div>
  );
}

/** The series' names beside their colors. */
function Keys(props: { parts: Part[] }) {
  return (
    <ul class={styles.keys}>
      <For each={props.parts} keyed={false}>
        {part => (
          <li>
            <span class={styles.key} style={{ background: part().color }} />
            {part().name}
          </li>
        )}
      </For>
    </ul>
  );
}

/* ---- the donut: October's visits by source ---- */

/** The donut's outer and inner radius, in a box 200 across. */
const OUTER = 96;
const INNER = 60;
/** A share is written in its wedge from this many hundredths. */
const WEDGE_LABEL = 7;

const at = (r: number, degrees: number) => {
  const turn = (degrees * Math.PI) / 180;
  return `${fixed(r * Math.sin(turn))} ${fixed(-r * Math.cos(turn))}`;
};
/** A wedge of the donut from one angle to another, clockwise from the top as a conic gradient turns. */
function wedge(from: number, to: number): string {
  const large = to - from > 180 ? 1 : 0;
  return `M${at(OUTER, from)}A${OUTER} ${OUTER} 0 ${large} 1 ${at(OUTER, to)}L${at(INNER, to)}A${INNER} ${INNER} 0 ${large} 0 ${at(INNER, from)}Z`;
}

/** October's sources as a donut from the top, its visits in the middle. */
function Donut(props: { colors: string[]; label: string }) {
  const wedges = () => {
    let turned = 0;
    return ofOctober(props.colors).map(part => {
      const from = turned;
      turned += (360 * part.share) / 100;
      const [x, y] = at((OUTER + INNER) / 2, (from + turned) / 2).split(" ");
      return { ...part, path: wedge(from, turned), x, y };
    });
  };
  return (
    <svg class={styles.round} viewBox="-100 -100 200 200" role="img" aria-label={props.label}>
      <g class={`${styles.marks} ${styles.gaps}`} text-anchor="middle">
        <For each={wedges()} keyed={false}>
          {part => (
            <>
              <path d={part().path} fill={part().color} />
              <Show when={part().share >= WEDGE_LABEL}>
                <text x={part().x} y={part().y} fill={part().ink}>
                  {percent(part().share)}
                </text>
              </Show>
            </>
          )}
        </For>
      </g>
      <g text-anchor="middle">
        <text class={styles.total} y="3">
          {formatNumber(VISITS)}
        </text>
        <text class={styles.unit} y="20">
          {t("{count, plural, one {visit} other {visits}}", { count: VISITS })}
        </text>
      </g>
    </svg>
  );
}

/* ---- the weeks: the sources' visits stacked, or the visits' line ---- */

/** A trend's room in its own units, as wide as the weeks run and a hundred tall, stretched to its tile's. */
const PLOT_W = 250;
const PLOT_H = 100;
/** The stacked weeks' top, a little over the busiest week. */
const STACK_TOP = 13000;

/** Where each week stands across a trend, the latest at its end. */
const weekX = (week: number) => {
  const last = WEEKS.length - 1;
  return fixed(((dir() === "rtl" ? last - week : week) / last) * PLOT_W);
};
/** Each month's first day along the weeks, the first at the start: where its name stands, in percent. */
const monthTicks = () =>
  SHARES.map((_, i) => ({
    at: fixed(Math.max(0, (monthAt(i) - WEEK_ONE) / WEEK / (WEEKS.length - 1)) * 100),
    text: formatDate(monthAt(i), { month: "short", timeZone: "UTC" })
  }));

/** Labels along a chart's foot, each at its place from the chart's start, in percent. */
function Ticks(props: { ticks: { at: number; text: string }[] }) {
  return (
    <div class={styles.axis} aria-hidden="true">
      <For each={props.ticks} keyed={false}>
        {tick => <span style={{ "inset-inline-start": `${tick().at}%` }}>{tick().text}</span>}
      </For>
    </div>
  );
}

/** Each week's visits stacked by source, the first at the foot. */
function Area(props: { colors: string[]; label: string }) {
  const layers = () => {
    const y = (v: number) => fixed(PLOT_H * (1 - v / STACK_TOP));
    /* each week's sources summed from the first up: the top of each one's layer */
    const tops = WEEKS.map((total, week) => {
      let sum = 0;
      return partsOf(props.colors, sharesAt(week)).map(part => {
        sum += (total * part.share) / 100;
        return sum;
      });
    });
    return partsOf(props.colors, SHARES[0]).map((part, k) => {
      const top = WEEKS.map((_, week) => `${weekX(week)} ${y(tops[week][k])}`);
      const foot = WEEKS.map((_, week) => `${weekX(week)} ${y(k ? tops[week][k - 1] : 0)}`);
      return { color: part.color, d: `M${top.join("L")}L${foot.reverse().join("L")}Z` };
    });
  };
  return (
    <div class={styles.trend}>
      <div class={styles.frame}>
        <svg
          class={styles.fill}
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={props.label}
        >
          <g class={styles.gaps}>
            <For each={layers()} keyed={false}>
              {layer => <path d={layer().d} fill={layer().color} />}
            </For>
          </g>
        </svg>
      </div>
      <Ticks ticks={monthTicks()} />
    </div>
  );
}

/** The visits' line, each height in the scale's color there, so a week takes the color its visits do, over a wash of
    the same; a dot at its end, the latest week. */
function Line(props: { scale: string[]; classes: boolean; label: string }) {
  const paint = createUniqueId();
  const fewest = Math.min(...WEEKS);
  const most = Math.max(...WEEKS);
  /* the weeks between their fewest and most, with room over and under the line */
  const room = (most - fewest) / 8;
  const y = (v: number) => fixed(PLOT_H * (1 - (v - fewest + room) / (most - fewest + 2 * room)));
  const latest = WEEKS[WEEKS.length - 1];
  const line = () => WEEKS.map((v, week) => `${weekX(week)} ${y(v)}`).join("L");
  /* the scale up the line's height: blended, or a band a class */
  const stops = () => {
    const n = props.scale.length;
    return props.classes
      ? props.scale.flatMap((color, i) => [
          { at: fixed(i / n), color },
          { at: fixed((i + 1) / n), color }
        ])
      : props.scale.map((color, i) => ({ at: fixed(i / Math.max(1, n - 1)), color }));
  };
  return (
    <div class={styles.trend}>
      <div class={styles.frame}>
        <svg
          class={styles.fill}
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={props.label}
        >
          <defs>
            <linearGradient
              id={paint}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={y(fewest)}
              x2="0"
              y2={y(most)}
            >
              <For each={stops()} keyed={false}>
                {stop => <stop offset={stop().at} stop-color={stop().color} />}
              </For>
            </linearGradient>
          </defs>
          <path
            class={styles.wash}
            d={`M${line()}L${weekX(WEEKS.length - 1)} ${PLOT_H}L${weekX(0)} ${PLOT_H}Z`}
            fill={`url(#${paint})`}
          />
          <path class={styles.line} d={`M${line()}`} stroke={`url(#${paint})`} />
        </svg>
        <span
          class={styles.dot}
          style={{
            top: `${y(latest)}%`,
            background: colorAt(props.scale, props.classes, placeIn(WEEKS, latest))
          }}
        />
      </div>
      <Ticks ticks={monthTicks()} />
    </div>
  );
}

/* ---- the hours: October's visits by the hour, each column in its value's color ---- */

/** The share of an hour's room left between two columns, and the room over the tallest, in percent of the chart. */
const COLUMN_ROOM = 0.25;
const COLUMN_HEADROOM = 6;

function Columns(props: { scale: string[]; classes: boolean; label: string }) {
  const most = Math.max(...HOURS);
  const columns = () => {
    const rtl = dir() === "rtl";
    return HOURS.map((visits, hour) => {
      const tall = ((100 - COLUMN_HEADROOM) * visits) / most;
      return {
        x: fixed((((rtl ? 23 - hour : hour) + COLUMN_ROOM / 2) / 24) * 100),
        y: fixed(100 - tall),
        /* past the foot, which cuts it square: only its top is rounded */
        tall: fixed(tall + 8),
        color: colorAt(props.scale, props.classes, placeIn(HOURS, visits))
      };
    });
  };
  const width = `${fixed(((1 - COLUMN_ROOM) / 24) * 100)}%`;
  const ticks = () =>
    [0, 6, 12, 18].map(hour => ({
      at: fixed((hour / 24) * 100),
      text: formatDate(Date.UTC(2026, 9, 1, hour), { hour: "numeric", timeZone: "UTC" })
    }));
  return (
    <div class={styles.trend}>
      <div class={styles.frame}>
        <svg class={styles.fill} role="img" aria-label={props.label}>
          <For each={columns()} keyed={false}>
            {column => (
              <rect
                x={`${column().x}%`}
                y={`${column().y}%`}
                width={width}
                height={`${column().tall}%`}
                rx="3"
                fill={column().color}
              />
            )}
          </For>
        </svg>
      </div>
      <Ticks ticks={ticks()} />
    </div>
  );
}

/* ---- the calendar: October's visits per day on the scale ---- */

/** A day's square, the room between two, and the weekdays' line over them, in a box as wide as seven. */
const CELL = 38;
const CELL_GAP = 4;
const PITCH = CELL + CELL_GAP;
const WEEKDAYS = 22;

function Calendar(props: { scale: string[]; classes: boolean; label: string }) {
  const first = () => WEEK_START[locale()];
  const lead = () => (OCT_FIRST - first() + 7) % 7;
  const rows = () => Math.ceil((lead() + DAYS.length) / 7);
  const column = (c: number) => (dir() === "rtl" ? 6 - c : c) * PITCH;
  const days = () =>
    DAYS.map((visits, i) => {
      const place = lead() + i;
      const color = colorAt(props.scale, props.classes, placeIn(DAYS, visits));
      return {
        day: i + 1,
        color,
        ink: inkOn([color]).ink,
        x: column(place % 7),
        y: WEEKDAYS + Math.floor(place / 7) * PITCH
      };
    });
  return (
    <div class={styles.body}>
      <svg
        class={styles.calendar}
        viewBox={`0 0 ${7 * PITCH - CELL_GAP} ${WEEKDAYS + rows() * PITCH - CELL_GAP}`}
        role="img"
        aria-label={props.label}
      >
        <g class={styles.weekday} text-anchor="middle">
          <For each={[0, 1, 2, 3, 4, 5, 6]} keyed={false}>
            {c => (
              <text x={column(c()) + CELL / 2} y="11">
                {formatDate(Date.UTC(2026, 9, 4 + ((first() + c()) % 7)), {
                  weekday: "narrow",
                  timeZone: "UTC"
                })}
              </text>
            )}
          </For>
        </g>
        <g class={styles.marks} text-anchor="middle">
          <For each={days()} keyed={false}>
            {day => (
              <>
                <rect
                  x={day().x}
                  y={day().y}
                  width={CELL}
                  height={CELL}
                  rx="6"
                  fill={day().color}
                />
                <text x={day().x + CELL / 2} y={day().y + CELL / 2} fill={day().ink}>
                  {formatNumber(day().day)}
                </text>
              </>
            )}
          </For>
        </g>
      </svg>
      <div class={styles.side}>
        <div class={styles.stat}>
          <span class={styles.figure}>{formatNumber(VISITS)}</span>
          <span class={styles.caption}>
            {t("{count, plural, one {visit} other {visits}}", { count: VISITS })}
          </span>
        </div>
        {/* the scale runs from the fewest at its left to the most */}
        <div class={styles.legend}>
          <span
            class={styles.scale}
            style={{
              background: gradientCss(
                props.scale,
                props.classes ? "linearSwatches" : "linearGradient",
                90
              )
            }}
          />
          <span class={styles.ends}>
            <span>{formatNumber(FEWEST)}</span>
            <span>{formatNumber(MOST)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---- the code: the same colors for a chart library ---- */

/** A line of code at its longest, where a list breaks onto more; a line of a broken list at its longest, which a
    phone's code shows whole. */
const LINE = 76;
const LIST_LINE = 40;
/** Items a few to a line, the lines as full as one another and none longer than a phone's code shows whole. */
function rowsOf(items: readonly string[], indent: string): string[] {
  const widest = Math.max(...items.map(item => item.length)) + 2;
  const fit = Math.max(1, Math.floor((LIST_LINE - indent.length) / widest));
  const count = Math.ceil(items.length / fit);
  const lines: string[] = [];
  for (let i = 0, from = 0; i < count; i++) {
    const take = Math.ceil((items.length - from) / (count - i));
    lines.push(indent + items.slice(from, from + take).join(", "));
    from += take;
  }
  return lines;
}
/** A list as code writes it: on its line where it fits after `lead` characters, else on as few lines as a phone shows
    whole. */
function listCode(items: readonly string[], indent: string, lead: number): string {
  const inline = `[${items.join(", ")}]`;
  if (lead + inline.length <= LINE) return inline;
  return `[\n${rowsOf(items, `${indent}  `).join(",\n")}\n${indent}]`;
}
const quoted = (items: readonly string[]) => items.map(item => JSON.stringify(item));
/** A share of a box as CSS writes it: "16.667%". */
const share = (x: number) => `${+(x * 100).toFixed(3)}%`;
/** The scale as D3 builds it from a list: blended as the stage blends it, or a class for each band. */
const scaleCode = (classes: boolean, list: string) =>
  classes
    ? `d3.scaleQuantize([${FEWEST}, ${MOST}], ${list})`
    : `d3.scaleSequential(\n  [${FEWEST}, ${MOST}],\n  d3.piecewise(d3.interpolateRgb, ${list})\n)`;

function codeOf(plan: Plan): CodeTab[] {
  const { scale, series, bands } = plan;
  const kind = colorFormat();
  /* a color in the reader's spelling: each is one of the palette's stops */
  const spelled = (hex: string) => {
    const stop = plan.stops.find(found => found.hex === hex);
    return stop ? spell(kind, stop) : hex;
  };
  const js: string[] = [];
  const css: string[] = [];
  const json: string[] = [];
  if (series) {
    const names = quoted(partsOf(series, SHARES[0]).map(part => part.name));
    /* where the series stand among the address's colors: all of them, a run of them, or the ones taken */
    const taken = series.map(hex => plan.colors.indexOf(hex));
    const run = taken.every((place, i) => place === taken[0] + i);
    const from = (list: string) =>
      run && taken.length === plan.colors.length
        ? list
        : run
          ? `${list}.slice(${taken[0]}, ${taken[0] + taken.length})`
          : `taken.map(i => ${list}[i])`;
    js.push(`const series = ${listCode(quoted(series), "", 15)};`);
    css.push(
      cssRule(
        ":root",
        series.map((hex, i) => `--chart-${i + 1}: ${spelled(hex)};`)
      )
    );
    json.push(`const sources = ${listCode(names, "", 16)};`);
    json.push(`const response = await fetch("${plan.json}");`);
    json.push("const { colors, contrast } = await response.json();");
    if (!run) json.push(`const taken = ${listCode(taken.map(String), "", 14)};`);
    json.push(
      `const color = d3.scaleOrdinal(sources, ${from("colors")});`,
      `const ink = d3.scaleOrdinal(sources, ${from("contrast.text")});`
    );
  } else {
    json.push(`const response = await fetch("${plan.json}");`);
    json.push("const { colors } = await response.json();");
  }
  if (scale) {
    const n = scale.length;
    const stops = bands
      ? scale.map((hex, i) => `${spelled(hex)} ${share(i / n)} ${share((i + 1) / n)}`)
      : scale.map(spelled);
    /* the oklch spelling names its blend, as every gradient the site writes in it does */
    const head = `90deg${kind === "oklch" && !bands ? " in oklch" : ""}`;
    const inline = `linear-gradient(${head}, ${stops.join(", ")})`;
    js.push(`const scale = ${listCode(quoted(scale), "", 14)};`);
    css.push(
      cssRule(".scale", [
        `background: ${
          inline.length + 14 <= LINE
            ? inline
            : `linear-gradient(\n    ${head},\n${rowsOf(stops, "    ").join(",\n")}\n  )`
        };`
      ])
    );
    json.push(
      `const heat = ${scaleCode(bands, plan.turned ? "[...colors].reverse()" : "colors")};`
    );
  }
  return [
    { label: "JS", code: js.join("\n"), where: { text: t("For any chart library") } },
    { label: "CSS", code: css.join("\n") },
    { label: "JSON", code: json.join("\n") }
  ];
}
