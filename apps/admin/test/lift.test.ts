import { describe, expect, it } from "vitest";
import {
  MIN_BASELINE_K,
  MIN_EXPECTED,
  MIN_WINDOW,
  beforeAfter,
  computeLift,
  eachDay,
  minimumDetectableEffect,
  shiftDays,
} from "../src/lift";

/**
 * A series where every day of the week has its own level, so a matched-weekday
 * baseline and a naive mean give visibly different answers — which is the
 * whole reason the baseline is matched.
 */
function weekdaySeries(
  from: string,
  days: number,
  byWeekday: readonly number[],
  bump: Record<string, number> = {},
): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const day = shiftDays(from, i);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    out.set(day, (byWeekday[dow] ?? 0) + (bump[day] ?? 0));
  }
  return out;
}

describe("date helpers", () => {
  it("eachDay is inclusive of both ends", () => {
    expect(eachDay("2026-08-20", "2026-08-27")).toHaveLength(8);
    expect(eachDay("2026-08-20", "2026-08-20")).toEqual(["2026-08-20"]);
  });

  it("shiftDays crosses month and year boundaries", () => {
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDays("2026-08-20", -7)).toBe("2026-08-13");
  });
});

describe("computeLift guards", () => {
  const base = {
    metric: "d1.signups",
    startsOn: "2026-08-20",
    endsOn: "2026-08-27",
    baselineWeeks: 4,
    windowComplete: true,
  } as const;

  it("refuses a verdict for non-count metrics rather than printing a meaningless sigma", () => {
    for (const kind of ["rate", "position", "sparse"] as const) {
      const result = computeLift({ ...base, metricKind: kind, series: new Map() });
      expect(result.verdict).toBe("no-noise-model");
      expect(result.sigmas).toBeNull();
    }
  });

  it("reports too-early before the window is complete, without inventing numbers", () => {
    const series = weekdaySeries("2026-07-01", 60, [40, 40, 40, 40, 40, 40, 40]);
    const result = computeLift({ ...base, metricKind: "count", series, windowComplete: false });
    expect(result.verdict).toBe("too-early");
    expect(result.observed).toBeNull();
  });

  it("refuses a window shorter than MIN_WINDOW", () => {
    const series = weekdaySeries("2026-07-01", 60, [40, 40, 40, 40, 40, 40, 40]);
    const result = computeLift({
      ...base,
      metricKind: "count",
      series,
      startsOn: "2026-08-20",
      endsOn: shiftDays("2026-08-20", MIN_WINDOW - 2),
    });
    expect(result.verdict).toBe("insufficient-data");
  });

  it("refuses when fewer than MIN_BASELINE_K matched weeks exist — a young series is not a decline", () => {
    // Data starts only one week before the campaign.
    const series = weekdaySeries("2026-08-13", 22, [40, 40, 40, 40, 40, 40, 40]);
    const result = computeLift({ ...base, metricKind: "count", series });
    expect(result.verdict).toBe("insufficient-data");
    expect(result.baselineWeeksUsed).toBeLessThan(MIN_BASELINE_K);
    expect(result.note).toMatch(/younger|baseline/i);
  });

  it("refuses when the expected count is below MIN_EXPECTED", () => {
    const series = weekdaySeries("2026-07-01", 60, [0, 1, 0, 1, 0, 1, 0]);
    const result = computeLift({ ...base, metricKind: "count", series });
    expect(result.verdict).toBe("insufficient-data");
    expect(result.expected).toBeLessThan(MIN_EXPECTED);
  });
});

describe("computeLift arithmetic", () => {
  const base = {
    metric: "d1.signups",
    metricKind: "count",
    startsOn: "2026-08-20",
    endsOn: "2026-08-26",
    baselineWeeks: 4,
    windowComplete: true,
  } as const;

  it("expects the matched weekday, not the overall mean", () => {
    // Weekends are a third of weekdays. A naive mean would expect ~7*54=378;
    // the matched-weekday baseline expects exactly the same shape back.
    const series = weekdaySeries("2026-06-01", 120, [20, 70, 70, 70, 70, 70, 20]);
    const result = computeLift({ ...base, series });
    expect(result.expected).toBeCloseTo(20 + 70 * 5 + 20, 5);
    expect(result.lift).toBeCloseTo(0, 5);
    expect(result.verdict).toBe("no-detectable-effect");
  });

  it("flags a real lift as clear-movement and keeps the sign", () => {
    const flat = [50, 50, 50, 50, 50, 50, 50];
    const bump: Record<string, number> = {};
    for (const day of eachDay("2026-08-20", "2026-08-26")) bump[day] = 40;
    const series = weekdaySeries("2026-06-01", 120, flat, bump);
    const result = computeLift({ ...base, series });
    expect(result.observed).toBe(7 * 90);
    expect(result.expected).toBeCloseTo(350, 5);
    expect(result.lift).toBeCloseTo(280, 5);
    expect(result.sigmas).toBeGreaterThan(2);
    expect(result.verdict).toBe("clear-movement");
  });

  it("flags a real decline too — sigmas carry the sign", () => {
    const drop: Record<string, number> = {};
    for (const day of eachDay("2026-08-20", "2026-08-26")) drop[day] = -30;
    const series = weekdaySeries("2026-06-01", 120, [50, 50, 50, 50, 50, 50, 50], drop);
    const result = computeLift({ ...base, series });
    expect(result.lift).toBeLessThan(0);
    expect(result.sigmas).toBeLessThan(-2);
    expect(result.verdict).toBe("clear-movement");
  });

  it("keeps a small move inside the noise floor", () => {
    const nudge: Record<string, number> = {};
    for (const day of eachDay("2026-08-20", "2026-08-26")) nudge[day] = 1;
    const series = weekdaySeries("2026-06-01", 120, [50, 50, 50, 50, 50, 50, 50], nudge);
    const result = computeLift({ ...base, series });
    expect(Math.abs(result.sigmas!)).toBeLessThan(1);
    expect(result.verdict).toBe("no-detectable-effect");
  });

  it("inflates the floor for the estimated baseline — fewer weeks means a wider floor", () => {
    const series = weekdaySeries("2026-06-01", 120, [50, 50, 50, 50, 50, 50, 50]);
    const withTwo = computeLift({ ...base, series, baselineWeeks: 2 });
    const withEight = computeLift({ ...base, series, baselineWeeks: 8 });
    expect(withTwo.noiseFloor).toBeGreaterThan(withEight.noiseFloor!);
    // sqrt(expected * (1 + 1/K)) — check one exactly.
    expect(withTwo.noiseFloor).toBeCloseTo(Math.sqrt(350 * 1.5), 1);
  });

  it("only counts days that exist — a gap is not a zero", () => {
    const series = weekdaySeries("2026-06-01", 120, [50, 50, 50, 50, 50, 50, 50]);
    series.delete("2026-08-22");
    const result = computeLift({ ...base, series });
    // Six observed days, and the expectation covers only those six.
    expect(result.observed).toBe(300);
    expect(result.expected).toBeCloseTo(300, 5);
    expect(result.verdict).toBe("no-detectable-effect");
  });

  it("reports an MDE that is larger than the lift it would take to be sure", () => {
    const series = weekdaySeries("2026-06-01", 120, [50, 50, 50, 50, 50, 50, 50]);
    const result = computeLift({ ...base, series });
    expect(result.minimumDetectableEffect!.absolute).toBeGreaterThanOrEqual(
      Math.ceil(2 * result.noiseFloor!),
    );
    expect(result.minimumDetectableEffect!.pct).toBeGreaterThan(0);
  });
});

describe("minimumDetectableEffect", () => {
  it("is computable before a campaign runs, from the baseline alone", () => {
    const series = weekdaySeries("2026-06-01", 80, [50, 50, 50, 50, 50, 50, 50]);
    const mde = minimumDetectableEffect({
      series,
      startsOn: "2026-08-20",
      endsOn: "2026-08-26",
      baselineWeeks: 4,
    });
    expect(mde).not.toBeNull();
    expect(mde!.expected).toBeCloseTo(350, 0);
    expect(mde!.absolute).toBeGreaterThan(0);
  });

  it("returns null rather than a fake number when there is no history", () => {
    expect(
      minimumDetectableEffect({
        series: new Map(),
        startsOn: "2026-08-20",
        endsOn: "2026-08-26",
        baselineWeeks: 4,
      }),
    ).toBeNull();
  });
});

describe("beforeAfter", () => {
  it("describes the neighbourhood of a point event", () => {
    const series = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const day = shiftDays("2026-08-01", i);
      series.set(day, day < "2026-08-15" ? 100 : 150);
    }
    const result = beforeAfter(series, "2026-08-15");
    expect(result.valueOnDay).toBe(150);
    expect(result.mean7Before).toBe(100);
    expect(result.mean7After).toBe(150);
    expect(result.change!.withinNoise).toBe(false);
  });

  it("refuses a mean built from fewer than four of seven days", () => {
    const series = new Map([["2026-08-15", 10], ["2026-08-16", 12]]);
    const result = beforeAfter(series, "2026-08-15");
    expect(result.mean7Before).toBeNull();
    expect(result.change).toBeNull();
  });
});
