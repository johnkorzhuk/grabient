// The lift engine: did a campaign window move a metric beyond what ordinary
// variance explains?
//
// This is a before/after comparison against MATCHED WEEKDAYS, not an
// experiment — nothing was held back as a control, and the output vocabulary
// is deliberately about evidence ("clear-movement"), never cause ("worked").
// The philosophy is range.ts's noise floor, extended one honest step: the
// baseline is itself an estimate from K samples, so its variance joins the
// floor. At K=4 that inflates it ~12% — one multiply, no stats library,
// strictly more conservative than the existing rule.

import { change } from "./range";

/** Below this expected count the Poisson-normal approximation is poor. */
export const MIN_EXPECTED = 10;
/** Below this many days, refuse entirely. */
export const MIN_WINDOW = 3;
/** Below this many baseline weeks, refuse the seasonality adjustment. */
export const MIN_BASELINE_K = 2;

export type LiftVerdict =
  | "too-early"
  | "insufficient-data"
  | "no-noise-model"
  | "no-detectable-effect"
  | "possible-effect"
  | "clear-movement";

export interface LiftResult {
  metric: string;
  verdict: LiftVerdict;
  observed: number | null;
  expected: number | null;
  lift: number | null;
  pct: number | null;
  withinNoise: boolean | null;
  sigmas: number | null;
  noiseFloor: number | null;
  /** Which floor won — "empirical" means the series is noisier than Poisson. */
  noiseModel?: "poisson" | "empirical";
  baselineWeeksRequested: number;
  baselineWeeksUsed: number;
  minimumDetectableEffect: { absolute: number; pct: number } | null;
  note?: string;
}

/**
 * `series` maps 'YYYY-MM-DD' -> value and must cover the campaign window plus
 * K weeks before it (missing days are treated as absent, not zero — a gap in
 * collection must not read as a traffic collapse).
 */
export function computeLift(options: {
  metric: string;
  /** Only "count" metrics get the sqrt(n) model; everything else refuses. */
  metricKind: "count" | "rate" | "position" | "sparse";
  series: ReadonlyMap<string, number>;
  startsOn: string;
  endsOn: string;
  baselineWeeks: number;
  windowComplete: boolean;
}): LiftResult {
  const { metric, series, startsOn, endsOn } = options;
  const K = Math.max(0, options.baselineWeeks);
  const base: Omit<LiftResult, "verdict"> = {
    metric,
    observed: null,
    expected: null,
    lift: null,
    pct: null,
    withinNoise: null,
    sigmas: null,
    noiseFloor: null,
    baselineWeeksRequested: options.baselineWeeks,
    baselineWeeksUsed: 0,
    minimumDetectableEffect: null,
  };

  if (options.metricKind !== "count") {
    return {
      ...base,
      verdict: "no-noise-model",
      note:
        options.metricKind === "sparse"
          ? "Not a daily series — sweeps happen when they happen, so a window sum is undefined."
          : "Not a count. The sqrt(n) floor used everywhere else does not apply and no substitute is computed.",
    };
  }

  const days = eachDay(startsOn, endsOn);
  if (days.length < MIN_WINDOW) {
    return { ...base, verdict: "insufficient-data", note: `Window is ${days.length} days; minimum is ${MIN_WINDOW}.` };
  }
  if (!options.windowComplete) {
    return { ...base, verdict: "too-early", note: "The window is not complete at this source's lag yet." };
  }

  // Matched-weekday baseline: each campaign day is expected to look like the
  // mean of that same weekday over the K weeks before the start. A Tuesday is
  // only ever compared to Tuesdays, so a Monday launch cannot borrow a
  // weekend's decline.
  let observed = 0;
  let expected = 0;
  let observedDays = 0;
  let weeksUsedMin = Infinity;
  // Variance of the day-level expectation, accumulated from the same matched
  // samples. Summed across days because the window total is a sum of
  // independent-ish day totals.
  let empiricalVariance = 0;
  for (const day of days) {
    const value = series.get(day);
    if (value === undefined) continue;
    observed += value;
    observedDays += 1;
    const samples: number[] = [];
    for (let k = 1; k <= K; k++) {
      const pv = series.get(shiftDays(day, -7 * k));
      if (pv !== undefined) samples.push(pv);
    }
    weeksUsedMin = Math.min(weeksUsedMin, samples.length);
    if (samples.length > 0) {
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expected += mean;
      if (samples.length > 1) {
        // Sample variance of this weekday's history.
        empiricalVariance +=
          samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (samples.length - 1);
      }
    }
  }
  const weeksUsed = Number.isFinite(weeksUsedMin) ? weeksUsedMin : 0;

  if (observedDays < MIN_WINDOW || weeksUsed < MIN_BASELINE_K) {
    return {
      ...base,
      baselineWeeksUsed: weeksUsed,
      verdict: "insufficient-data",
      note:
        observedDays < MIN_WINDOW
          ? `Only ${observedDays} of ${days.length} window days have data.`
          : `Only ${weeksUsed} complete matched-weekday baseline week(s) exist before this window; minimum is ${MIN_BASELINE_K}. The series may simply be younger than the campaign.`,
    };
  }
  if (expected < MIN_EXPECTED) {
    return {
      ...base,
      observed,
      expected: round1(expected),
      baselineWeeksUsed: weeksUsed,
      verdict: "insufficient-data",
      note: `Expected count over the window is ${round1(expected)}; below ${MIN_EXPECTED} the noise model is unreliable.`,
    };
  }

  // Two floors, and the wider one wins.
  //
  // Poisson: Var = expected, plus expected/K because the baseline is itself
  // estimated from K samples rather than known.
  //
  // Empirical: the observed spread of those same matched-weekday samples. This
  // matters because web traffic is not Poisson — it has a coefficient of
  // variation around 0.1-0.2, where Poisson implies 1/sqrt(n). At 5,000
  // sessions Poisson calls 1.4% a standard deviation, so an ordinary 5% weekly
  // drift would clear two sigma and get reported as clear-movement under
  // whatever campaign happened to be running. Taking the max keeps the
  // small-count behaviour (where Poisson is right and the sample variance is
  // noisy) and stops the engine over-claiming on large ones.
  const poissonFloor = Math.sqrt(expected * (1 + 1 / weeksUsed));
  const empiricalFloor = Math.sqrt(empiricalVariance * (1 + 1 / weeksUsed));
  const noiseFloor = Math.max(poissonFloor, empiricalFloor);
  const lift = observed - expected;
  const sigmas = lift / noiseFloor;
  const mdeAbs = 2 * noiseFloor;
  const ch = change(observed, Math.round(expected));

  const verdict: LiftVerdict =
    Math.abs(sigmas) < 1 ? "no-detectable-effect" : Math.abs(sigmas) < 2 ? "possible-effect" : "clear-movement";

  return {
    metric,
    verdict,
    observed,
    expected: round1(expected),
    lift: round1(lift),
    pct: ch.pct,
    withinNoise: ch.withinNoise,
    sigmas: round1(sigmas),
    noiseFloor: round1(noiseFloor),
    noiseModel: empiricalFloor > poissonFloor ? "empirical" : "poisson",
    baselineWeeksRequested: options.baselineWeeks,
    baselineWeeksUsed: weeksUsed,
    minimumDetectableEffect: {
      absolute: Math.ceil(mdeAbs),
      pct: round1((mdeAbs / expected) * 100),
    },
  };
}

/**
 * The field that earns its keep BEFORE money is spent: the smallest lift this
 * window could detect at 2 sigma, from the baseline alone. On a site this
 * size it is often larger than the effect being bought.
 */
export function minimumDetectableEffect(options: {
  series: ReadonlyMap<string, number>;
  startsOn: string;
  endsOn: string;
  baselineWeeks: number;
}): { absolute: number; pct: number; expected: number } | null {
  const days = eachDay(options.startsOn, options.endsOn);
  const K = Math.max(MIN_BASELINE_K, options.baselineWeeks);
  let expected = 0;
  let covered = 0;
  let variance = 0;
  // The ACHIEVED number of baseline weeks, not the requested one: asking for 8
  // when only 2 exist used to widen the denominator and understate the floor.
  let weeksUsed = Infinity;
  for (const day of days) {
    const samples: number[] = [];
    for (let k = 1; k <= K; k++) {
      const pv = options.series.get(shiftDays(day, -7 * k));
      if (pv !== undefined) samples.push(pv);
    }
    if (samples.length >= MIN_BASELINE_K) {
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expected += mean;
      variance += samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (samples.length - 1);
      weeksUsed = Math.min(weeksUsed, samples.length);
      covered += 1;
    }
  }
  if (covered < MIN_WINDOW || expected < MIN_EXPECTED || !Number.isFinite(weeksUsed)) return null;
  const floor = Math.max(
    Math.sqrt(expected * (1 + 1 / weeksUsed)),
    Math.sqrt(variance * (1 + 1 / weeksUsed)),
  );
  return {
    absolute: Math.ceil(2 * floor),
    pct: round1(((2 * floor) / expected) * 100),
    expected: round1(expected),
  };
}

/** Mean of the 7 days before / after a point event — neighbourhood, not effect. */
export function beforeAfter(
  series: ReadonlyMap<string, number>,
  on: string,
): { valueOnDay: number | null; mean7Before: number | null; mean7After: number | null; change: ReturnType<typeof change> | null } {
  const window = (dir: -1 | 1) => {
    let sum = 0;
    let n = 0;
    for (let i = 1; i <= 7; i++) {
      const v = series.get(shiftDays(on, dir * i));
      if (v !== undefined) {
        sum += v;
        n += 1;
      }
    }
    return n >= 4 ? sum / n : null; // less than 4 of 7 days is not a mean worth printing
  };
  const before = window(-1);
  const after = window(1);
  return {
    valueOnDay: series.get(on) ?? null,
    mean7Before: before === null ? null : round1(before),
    mean7After: after === null ? null : round1(after),
    change:
      before !== null && after !== null ? change(Math.round(after), Math.round(before)) : null,
  };
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function shiftDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
