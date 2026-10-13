import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { RisingFrame } from "../../lib/orders.ts";
import {
  collectionHot,
  collectionsRisingLiked,
  collectionsRisingUnliked,
  NEW_WEIGHT,
  paletteHot,
  RISE_COLUMN,
  riseClock,
  risen,
  risingLiked,
  risingSaved,
  risingScore,
  risingUnliked
} from "./scores.ts";

/* grabient4's own outputs for these cases, which the orders already stored on live databases were written with */
const golden = JSON.parse(
  readFileSync(new URL("fixtures/hot-scores.json", import.meta.url), "utf8")
) as {
  NEW_WEIGHT: number;
  RISE_COLUMN: Record<string, string>;
  clock: Record<RisingFrame, number>;
  paletteHot: { likeTimes: number[]; createdAt: number; now: number; hot: number }[];
  rising: {
    frame: RisingFrame;
    times: number[];
    total: number;
    publishedAt: number;
    now: number;
    score: number;
    risenNow: number;
    risenWeekLater: number;
  }[];
  collectionHot: {
    itemHot: number[];
    joinedAt: number[];
    copiedAt: number[];
    publishedAt: number;
    now: number;
    hot: number;
  }[];
  sql: Record<string, string>;
};
const NOW = golden.paletteHot[0]!.now;
const WEEK = 7 * 86_400_000;

describe("hot", () => {
  test.each(golden.paletteHot)("a palette: $likeTimes.length likes, made at $createdAt", c => {
    expect(paletteHot(c.likeTimes, c.createdAt, c.now)).toBe(c.hot);
  });

  test.each(golden.collectionHot)("a collection of $itemHot.length palettes", c => {
    expect(collectionHot(c, c.now)).toBe(c.hot);
  });

  test("a new palette starts with half a like", () => {
    expect([NEW_WEIGHT, RISE_COLUMN]).toEqual([golden.NEW_WEIGHT, golden.RISE_COLUMN]);
  });
});

describe("rising", () => {
  test("each frame's clock", () => {
    for (const frame of ["1w", "3m", "1y"] as const) {
      expect(riseClock(frame, NOW)).toBe(golden.clock[frame]);
    }
  });

  test.each(golden.rising)("$frame: $times.length likes of $total, published $publishedAt", c => {
    const score = risingScore(c.times, c.total, c.now, c.frame, c.publishedAt);
    expect(score).toBeCloseTo(c.score, 9);
    expect(risen(score, c.frame, c.now)).toBeCloseTo(c.risenNow, 9);
    expect(risen(score, c.frame, c.now + WEEK)).toBeCloseTo(c.risenWeekLater, 9);
  });

  test("two scores keep their order as time passes, so none is written for time alone", () => {
    const fresh = risingScore([NOW], 1, NOW);
    const earlier = risingScore([NOW - 86_400_000, NOW - 2 * 86_400_000], 2, NOW);
    for (const later of [NOW, NOW + WEEK, NOW + 30 * WEEK]) {
      expect(risen(fresh, "1w", later) > risen(earlier, "1w", later)).toBe(fresh > earlier);
    }
  });

  test("the SQL a like and a saved copy move the scores with", () => {
    expect({
      risingLiked: risingLiked(NOW),
      collectionsRisingLiked: collectionsRisingLiked(NOW),
      risingUnliked: risingUnliked(NOW),
      collectionsRisingUnliked: collectionsRisingUnliked(NOW),
      risingSaved: risingSaved(NOW, "TRUE")
    }).toEqual(golden.sql);
  });
});
