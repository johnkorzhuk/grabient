import { describe, expect, it } from "vitest";
import { LAG_BY_SOURCE, METRIC, liftKind, metricDef, rollup, slugify } from "../src/metrics";
import { rowsPerStatement, chunk } from "../src/db";

describe("the metric catalog", () => {
  it("gives every catalogued key an aggregation and a caveat", () => {
    for (const [key, def] of Object.entries(METRIC)) {
      expect(def.agg, key).toBeTruthy();
      expect(def.caveat.length, key).toBeGreaterThan(20);
      expect(LAG_BY_SOURCE[def.source], key).toBeGreaterThanOrEqual(0);
    }
  });

  it("resolves prefix families that upstream invents without notice", () => {
    const channel = metricDef("ga4.sessions.ai_assistant");
    expect(channel?.catalogued).toBe(true);
    expect(channel?.agg).toBe("sum");
    expect(channel?.caveat).toMatch(/2026-05-13/);
    expect(metricDef("cf.bot.googlebot")?.catalogued).toBe(true);
    expect(metricDef("cf.verified_bot.search_engine_crawler")?.catalogued).toBe(true);
  });

  it("charts an unknown key rather than breaking, but says it is uncatalogued", () => {
    const unknown = metricDef("someday.new_thing");
    expect(unknown?.catalogued).toBe(false);
    expect(unknown?.caveat).toMatch(/uncatalogued/i);
  });

  it("marks position as lower-is-better so a goal reads the right direction", () => {
    expect(METRIC["gsc.position"]!.better).toBe("down");
  });
});

describe("rollup — the only summation path", () => {
  const points = (values: number[], from = 1) =>
    values.map((value, i) => ({ day: `2026-08-${String(from + i).padStart(2, "0")}`, value }));

  it("sums a flow metric", () => {
    expect(rollup("gsc.clicks", points([10, 20, 30]))).toBe(60);
  });

  it("AVERAGES a per-day unique count — summing would triple-count one person", () => {
    expect(rollup("ga4.users", points([100, 100, 100]))).toBe(100);
    expect(rollup("cf.uniques", points([10, 20]))).toBe(15);
  });

  it("takes the last value of a cumulative series", () => {
    expect(rollup("d1.users", points([3550, 3555, 3561]))).toBe(3561);
    expect(rollup("index.indexed", points([0, 120, 300]))).toBe(300);
  });

  it("recomputes a ratio from its parts instead of averaging percentages", () => {
    // 1 click/1000 impressions then 99/1000: the true CTR is 5%, the mean of
    // the daily rates is also 5% here, so use lopsided volumes to tell them
    // apart — 1/10 and 99/1990 average to 7.5% but truly are 5%.
    const companions = new Map([
      ["gsc.clicks", points([1, 99])],
      ["gsc.impressions", points([10, 1990])],
    ]);
    const value = rollup("gsc.ctr", points([10, 4.97]), companions)!;
    expect(value).toBeCloseTo(5, 5);
    expect(value).not.toBeCloseTo((10 + 4.97) / 2, 1);
  });

  it("weights position by impressions — three impressions at #1 must not outrank the site", () => {
    const companions = new Map([["gsc.impressions", points([3, 9997])]]);
    const value = rollup("gsc.position", points([1, 9]), companions)!;
    expect(value).toBeGreaterThan(8.9);
    expect(value).not.toBeCloseTo(5, 1);
  });

  it("returns null for an empty window rather than zero", () => {
    expect(rollup("gsc.clicks", [])).toBeNull();
    expect(rollup("d1.users", [])).toBeNull();
  });
});

describe("liftKind", () => {
  it("only lets counting processes reach the sqrt(n) noise model", () => {
    expect(liftKind("d1.signups")).toBe("count");
    expect(liftKind("ga4.sessions.organic_search")).toBe("count");
    expect(liftKind("gsc.ctr")).toBe("rate");
    expect(liftKind("ga4.users")).toBe("rate");
    expect(liftKind("gsc.position")).toBe("position");
    expect(liftKind("index.indexed")).toBe("sparse");
  });
});

describe("slugify", () => {
  it("turns upstream channel labels into stable key segments", () => {
    expect(slugify("AI Assistant")).toBe("ai_assistant");
    expect(slugify("Organic Search")).toBe("organic_search");
    expect(slugify("(not set)")).toBe("not_set");
    expect(slugify("")).toBe("unknown");
  });
});

describe("D1 parameter chunking", () => {
  it("keeps every statement under the 100-bound-parameter cap", () => {
    for (const params of [1, 6, 12, 14, 33]) {
      const rows = rowsPerStatement(params);
      expect(rows * params).toBeLessThanOrEqual(100);
      expect(rows).toBeGreaterThanOrEqual(1);
    }
  });

  it("chunk covers every element exactly once", () => {
    const items = Array.from({ length: 47 }, (_, i) => i);
    const groups = chunk(items, 15);
    expect(groups.flat()).toEqual(items);
    expect(Math.max(...groups.map((g) => g.length))).toBeLessThanOrEqual(15);
  });
});
