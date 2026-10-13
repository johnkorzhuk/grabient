import { describe, expect, it } from "vitest";
import { collectionHot, type Frame, paletteHot, riseClock, risingScore, scores } from "./scores.ts";

/* grabient4's six-hour pass at 2026-10-12 12:00 UTC (U03 hot-scores.json): the scores must stay these. */
const NOW = 1791806400000;
const HOUR = 3_600_000;

describe("the scores", () => {
  it("measures each frame from 1970 in its own half-lives", () => {
    expect(riseClock("1w", NOW)).toBeCloseTo(7187.416402021213, 9);
    expect(riseClock("3m", NOW)).toBeCloseTo(319.4407289787206, 9);
    expect(riseClock("1y", NOW)).toBeCloseTo(79.86018224468015, 9);
  });

  it.each([
    [[], 0, 0],
    [[NOW], 0, 1],
    [[], NOW, 0.5],
    [[1790596800000], 0, 0.3679],
    [[1791720000000, 1791633600000], 1791547200000, 2.1237],
    [[1783166400000], 1783166400000, 0.0008],
    [[1791892800000], 1791892800000, 1.5]
  ])("heats a palette liked at %j and made at %d to %d", (times, made, hot) => {
    expect(paletteHot(times, made, NOW)).toBe(hot);
  });

  it.each([
    ["1w", [], 0, 0, 0],
    ["1w", [NOW], 1, 0, 7187.416402021213],
    ["1w", [NOW], 11, 0, 7185.018506748414],
    ["1w", [1791633600000], 1, 0, 7186.723254840653],
    ["1w", [NOW, 1791720000000, 1791374400000], 3, 0, 7187.2698298740515],
    ["1w", [1729512000000], 1, 0, 0],
    ["1w", [], 0, NOW, 7186.723254840653],
    ["1w", [], 0, 1729512000000, 0],
    ["1w", [1791720000000], 40, 1791547200000, 7185.778844249618],
    ["3m", [NOW], 11, 0, 317.0428337059222],
    ["3m", [NOW, 1791720000000, 1791374400000], 3, 0, 320.0012388937126],
    ["3m", [], 0, NOW, 318.74758179816064],
    ["3m", [1791720000000], 40, 1791547200000, 318.7516508498867],
    ["1y", [1791633600000], 1, 0, 79.85248060934059],
    ["1y", [NOW, 1791720000000, 1791374400000], 3, 0, 80.45480201874442],
    ["1y", [1791720000000], 40, 1791547200000, 79.20464086796478]
  ] as [Frame, number[], number, number, number][])(
    "raises in the %s frame likes at %j of %d, made public at %d, to %d",
    (frame, times, total, published, score) => {
      expect(risingScore(times, total, NOW, frame, published)).toBeCloseTo(score, 9);
    }
  );

  it("heats a collection by its hottest twelve, its joins, its copies and its newness", () => {
    const empty = { itemHot: [], joinedAt: [], copiedAt: [], publishedAt: 0 };
    expect(collectionHot(empty, NOW)).toBe(0);
    expect(
      collectionHot(
        {
          itemHot: [2, 1, 1],
          joinedAt: [NOW],
          copiedAt: [1791720000000],
          publishedAt: 1789214400000
        },
        NOW
      )
    ).toBe(3.1879);
    const twenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(
      collectionHot(
        { itemHot: twenty, joinedAt: twenty.map(() => NOW), copiedAt: [], publishedAt: NOW },
        NOW
      )
    ).toBe(90.5);
  });

  it("scores the palettes the pass reads and the public collections, counting a palette once per collection", () => {
    const { palettes, collections } = scores(
      {
        likes: [
          { palette_id: "liked", created_at: NOW - HOUR },
          { palette_id: "liked", created_at: NOW - 2 * HOUR }
        ],
        palettes: [
          { seed: "liked", created_at: NOW - 400 * 24 * HOUR, likes_count: 2 },
          { seed: "new", created_at: NOW - HOUR, likes_count: 0 },
          { seed: "old", created_at: NOW - 400 * 24 * HOUR, likes_count: 3 }
        ],
        collections: [
          { id: "c", created_at: NOW - 3 * HOUR, published_at: null, likes_sum: 2, fork_count: 0 }
        ],
        items: [
          { collection_id: "c", seed: "liked", created_at: null },
          { collection_id: "c", seed: "liked", created_at: NOW - 3 * HOUR }
        ],
        copies: []
      },
      NOW
    );
    expect([...palettes.keys()].sort()).toEqual(["liked", "new"]);
    expect(palettes.get("liked")!["1w"]).toBeGreaterThan(0);
    const c = collections.get("c")!;
    expect(c.hot).toBe(
      collectionHot(
        {
          itemHot: [palettes.get("liked")!.hot],
          joinedAt: [],
          copiedAt: [],
          publishedAt: NOW - 3 * HOUR
        },
        NOW
      )
    );
    expect(c["1w"]).toBeCloseTo(
      risingScore([NOW - HOUR, NOW - 2 * HOUR], 2, NOW, "1w", NOW - 3 * HOUR),
      9
    );
  });
});
