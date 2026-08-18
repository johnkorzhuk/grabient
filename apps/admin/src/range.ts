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
