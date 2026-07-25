import { describe, expect, it, vi } from "vitest";
import {
  colorTextParts,
  normalizeSemanticQuery,
  POPULAR_SEARCHES,
  queryFromParam,
  queryHeading,
  queryHeadingParts,
  queryResultContext,
  querySlug,
  searchSemanticPalettes,
} from "../src/semantic-search";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

function searchEnv() {
  const values = new Map();
  const AI = {
    run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })),
  };
  const VECTORIZE = {
    query: vi.fn(async () => ({
      matches: [
        {
          score: 0.93,
          metadata: {
            seed: SEED,
            tags: ["sunset", "warm"],
            style: "linearGradient",
            steps: 7,
            angle: 135,
            likesCount: 4,
            createdAt: 1_700_000_000_000,
          },
        },
      ],
    })),
  };
  const SEARCH_CACHE = {
    get: vi.fn(async (key) => {
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    }),
    put: vi.fn(async (key, value) => values.set(key, value)),
  };
  return { AI, VECTORIZE, SEARCH_CACHE };
}

describe("semantic search", () => {
  it("normalizes and canonicalizes text, encoded, hex, and seed queries", () => {
    expect(queryFromParam("Warm-Sunset")).toBe("Warm Sunset");
    expect(queryFromParam("blue%20hour")).toBe("blue hour");
    expect(querySlug("Warm Sunset")).toBe("warm-sunset");
    expect(querySlug(SEED)).toBe(SEED);
    expect(normalizeSemanticQuery("#ff0000 night")).toContain("red");
    expect(normalizeSemanticQuery(SEED)).not.toBe(SEED);
    expect(queryHeading("warm sunset")).toBe("Warm sunset palettes");
    expect(queryHeadingParts("blue purple cyan rose")).toEqual([
      { kind: "color", value: "Blue", hex: "#0000ff" },
      { kind: "text", value: " " },
      { kind: "color", value: "purple", hex: "#800080" },
      { kind: "text", value: " " },
      { kind: "color", value: "cyan", hex: "#00ffff" },
      { kind: "text", value: " " },
      { kind: "color", value: "rose", hex: "#ff007f" },
      { kind: "text", value: " palettes" },
    ]);
    expect(colorTextParts("teal, azure, navy")).toEqual([
      { kind: "color", value: "teal", hex: "#008080" },
      { kind: "text", value: ", " },
      { kind: "color", value: "azure", hex: "#f0ffff" },
      { kind: "text", value: ", " },
      { kind: "color", value: "navy", hex: "#000080" },
    ]);
    expect(queryResultContext(SEED)).toEqual({ kind: "seed", seed: SEED });
    expect(queryResultContext("#ff0000 #00ff00")).toMatchObject({
      kind: "colors",
    });
    expect(queryResultContext("warm sunset")).toBeNull();
    expect(POPULAR_SEARCHES.length).toBeGreaterThan(20);
    expect(POPULAR_SEARCHES).toEqual(
      expect.arrayContaining(["blue", "purple", "cyan", "rose"]),
    );
    expect(queryFromParam("")).toBeNull();
  });

  it("queries Workers AI + Vectorize once and reuses the three-day KV result", async () => {
    const env = searchEnv();
    const first = await searchSemanticPalettes(env, "warm sunset", 48);
    const second = await searchSemanticPalettes(env, "warm sunset", 48);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ seed: SEED, score: 0.93 });
    expect(second).toEqual(first);
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect(env.VECTORIZE.query).toHaveBeenCalledTimes(1);
    expect(env.VECTORIZE.query).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      expect.objectContaining({ topK: 48, returnMetadata: "all" }),
    );
    expect(env.SEARCH_CACHE.put).toHaveBeenCalledOnce();
  });

  it("fails closed when semantic bindings are unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await searchSemanticPalettes({}, "sunset")).toEqual([]);
    warn.mockRestore();
  });
});
