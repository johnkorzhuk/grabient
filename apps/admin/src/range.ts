// Time ranges, and the comparison arithmetic that makes them mean something.
//
// The user story this exists for:
//
//   "I opened the dashboard. Did anything change, and is the change real?"
//
// That is the question almost every visit is really asking, and a raw daily
// chart answers it badly. Two things get in the way, and both are handled here
// rather than left to the reader's judgement:
//
//   1. Day-of-week seasonality. A design tool is a weekday habit; weekends fall
//      off a cliff. On a raw series every Saturday looks like a crisis and every
//      Tuesday like a recovery, so the eye reads a sawtooth and infers nothing.
//      A trailing 7-day mean removes exactly one week of periodicity, which is
//      why 7 and not 5 or 10.
//
//   2. No baseline. "56,000 views" is not information. "56,000, up 12% on the
//      previous 28 days" is. Every range therefore carries an equal-length
//      window immediately before it, so current-vs-previous is always available
//      and always like-for-like.
//
// Ranges are URL state (?range=28d), not client state: the page stays
// server-rendered with no JS, and a range is linkable — which matters when the
// reader is an agent being pointed at a specific window.

export type RangeKey = "7d" | "28d" | "90d" | "180d";

export interface RangeOption {
  key: RangeKey;
  days: number;
  label: string;
  /** Shown next to a delta, e.g. "vs previous 28 days". */
  comparisonLabel: string;
}

export const RANGES: readonly RangeOption[] = [
  { key: "7d", days: 7, label: "7 days", comparisonLabel: "vs previous 7 days" },
  { key: "28d", days: 28, label: "28 days", comparisonLabel: "vs previous 28 days" },
  { key: "90d", days: 90, label: "90 days", comparisonLabel: "vs previous 90 days" },
  { key: "180d", days: 180, label: "180 days", comparisonLabel: "vs previous 180 days" },
];

/**
 * 28 rather than 30, because 28 is exactly four weeks. A 30-day window contains
 * two extra weekdays, so comparing it against the previous 30 days compares
 * four-and-a-bit weeks against a differently-shaped four-and-a-bit weeks and
 * manufactures a swing of a few percent from nothing but the calendar.
 */
export const DEFAULT_RANGE: RangeKey = "28d";

export function parseRange(value: string | undefined | null): RangeOption {
  const found = RANGES.find((range) => range.key === value);
  return found ?? RANGES.find((range) => range.key === DEFAULT_RANGE)!;
}

/**
 * Splits a chronological daily series into the selected window and the
 * equal-length window before it.
 *
 * `previous` is empty when history does not reach back far enough. Callers must
 * treat that as "no comparison available" rather than as zero — a delta against
 * a window that does not exist is not a decline.
 */
export function splitPeriods<T>(series: readonly T[], days: number): { current: T[]; previous: T[] } {
  const current = series.slice(-days);
  const previousStart = Math.max(0, series.length - days * 2);
  const previous = series.slice(previousStart, series.length - days);
  return { current, previous: previous.length === days ? previous : [] };
}

/**
 * Trailing mean over `window` points. Trailing, not centred: a centred average
 * needs future data, so the last few points would be missing or computed over a
 * shorter window and would droop toward zero — a smoothing artefact that reads
 * exactly like a decline at the right-hand edge, which is the one place a reader
 * looks hardest.
 *
 * The first `window - 1` points have no full window behind them and are null,
 * so the line starts where it becomes meaningful instead of ramping up from a
 * partial average.
 */
export function rollingMean(values: readonly number[], window = 7): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= window) sum -= values[i - window]!;
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

export interface Change {
  current: number;
  previous: number;
  /** Percent change, or null when there is no comparable previous window. */
  pct: number | null;
  /** True when the movement is small enough to be indistinguishable from noise. */
  withinNoise: boolean;
}

/**
 * Period-over-period change, with an explicit noise floor.
 *
 * The floor exists because this dashboard reports on small numbers — around 160
 * signups a month — where ordinary variance produces double-digit percentage
 * swings with no cause behind them. Presenting "▲ 8%" on 12 signups versus 11
 * invites a decision that the data does not support.
 *
 * The threshold is a Poisson-style approximation: counting processes have a
 * standard deviation of roughly √n, so a move smaller than √n on the previous
 * period's count is inside one standard deviation and should not be read as a
 * trend. Cheap, assumption-light, and much better than treating every
 * percentage as signal.
 */
export function change(current: number, previous: number): Change {
  if (previous <= 0) {
    return { current, previous, pct: null, withinNoise: false };
  }
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 1000) / 10;
  return {
    current,
    previous,
    pct,
    withinNoise: Math.abs(delta) < Math.sqrt(previous),
  };
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** "2026-08-17" — the only date shape the daily APIs and metric_daily speak. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ResolvedWindow {
  /** Inclusive ISO dates. */
  since: string;
  until: string;
  days: number;
  /** Equal-length window immediately before `since`, for compare mode. */
  prevSince: string;
  prevUntil: string;
}

/**
 * One window arithmetic for every tool, because two implementations disagreed:
 * the old code computed `since = until - days`, which with inclusive endpoints
 * covers days+1 days — harmless for one aggregate, wrong the moment a
 * "previous N days" window is built the same way, since the two then overlap
 * by a day. Here `days: 28` is exactly 28 dates and the previous window abuts
 * without overlap.
 *
 * `end` accepts "today"/"yesterday" so callers can reach fresher-than-default
 * data (hourly Search Console) without every caller re-deriving dates.
 * Explicit start/end win over `days`; `lagDays` only shapes the default end.
 */
export function resolveWindow(
  now: Date,
  options: { start?: string; end?: string; days?: number },
  defaults: { days: number; lagDays: number; maxDays: number },
): ResolvedWindow {
  const dayMs = 86_400_000;
  const today = new Date(now.getTime());
  // A null-prototype map: on an object literal, `named["constructor"]` and
  // `named["toString"]` are truthy, so end:"toString" returned a FUNCTION and
  // the next line threw "until.getTime is not a function" at the agent.
  const named: Record<string, Date> = Object.assign(Object.create(null), {
    today,
    yesterday: new Date(now.getTime() - dayMs),
  });

  const parse = (value: string | undefined): Date | null => {
    if (!value) return null;
    if (named[value] instanceof Date) return named[value]!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    // The regex admits impossible dates (2026-13-45), which become an Invalid
    // Date and then a RangeError inside toISOString().
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const until = parse(options.end) ?? new Date(now.getTime() - defaults.lagDays * dayMs);

  const requested = Math.max(1, Math.min(defaults.maxDays, options.days ?? defaults.days));
  let since = parse(options.start) ?? new Date(until.getTime() - (requested - 1) * dayMs);
  if (since > until) since = new Date(until.getTime());

  // Both ends floored to UTC midnight before differencing: `until` carries a
  // time-of-day when it defaults from `now`, and the fraction rounded up past
  // noon — so an afternoon query compared a 19-day window against a 20-day one
  // and called the difference a change.
  const floor = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((floor(until) - floor(since)) / dayMs) + 1;
  const prevUntil = new Date(since.getTime() - dayMs);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * dayMs);

  return {
    since: isoDay(since),
    until: isoDay(until),
    days,
    prevSince: isoDay(prevSince),
    prevUntil: isoDay(prevUntil),
  };
}
