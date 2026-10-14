import { describe, expect, it } from "vitest";
import { collectionHot, risingScore } from "../../src/server/gallery/scores.ts";
import { scores } from "./scores.ts";

const NOW = 1791806400000;
const HOUR = 3_600_000;

describe("the scores", () => {
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
