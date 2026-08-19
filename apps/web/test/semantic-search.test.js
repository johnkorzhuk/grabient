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
    expect(queryHeading("warm sunset")).toBe("Warm sunset gradient palettes");

    // The noun follows what the URL pins (owner rule, 2026-08-18), through the
    // same viewNounPlural the seed title uses. The unpinned case keeps BOTH
    // nouns on purpose: list and seed canonicals both strip style/steps, so the
    // param-free variant is the only one Google indexes and it has to carry the
    // "{color} gradient color palette" grammar.
    const at = (style, styleInUrl, steps) =>
      queryHeading("nautical", { style, styleInUrl, steps });
    expect(at("linearGradient", false, "auto")).toBe("Nautical gradient palettes");
    expect(at("linearGradient", true, "auto")).toBe("Nautical gradients");
    expect(at("radialGradient", true, 24)).toBe("Nautical gradients");
    expect(at("linearSwatches", true, "auto")).toBe("Nautical swatches");
    expect(at("linearSwatches", true, 5)).toBe("Nautical swatches");
    // Same 8-step line the seed title uses: a fine strip reads as a gradient.
    expect(at("linearSwatches", true, 8)).toBe("Nautical gradient palettes");
    expect(at("angularSwatches", true, 24)).toBe("Nautical gradient palettes");
    expect(queryHeadingParts("blue purple cyan rose")).toEqual([
      { kind: "color", value: "Blue", hex: "#0000ff" },
      { kind: "text", value: " " },
      { kind: "color", value: "purple", hex: "#800080" },
      { kind: "text", value: " " },
      { kind: "color", value: "cyan", hex: "#00ffff" },
      { kind: "text", value: " " },
      { kind: "color", value: "rose", hex: "#ff007f" },
      { kind: "text", value: " gradient palettes" },
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

// The chip row points at colour-name and journey pages ("cream to fire brick"),
// and whether those pages may be indexed was decided by an embedding score
// against an index that has never seen this vocabulary — measured on staging
// 2026-08-18, /palettes/fire-brick was noindex while /palettes/coral-pink was
// not. queryResultContext now answers it by rule. The bound that keeps the
// keyword-injection hole shut is that EVERY token must resolve against the
// corpus, so these assertions are the contract, not examples.
describe("colour-name queries are their own subject matter", () => {
  it("recognises single, multi-word, journey and combination colour queries", () => {
    for (const query of [
      "white",
      "fire brick",
      "cream to fire brick",
      "puce to dark navy",
      "cream light salmon fire brick",
    ]) {
      const context = queryResultContext(query);
      expect(context?.kind, query).toBe("colors");
      expect(context?.kind === "colors" && context.colors.length, query).toBeGreaterThan(0);
    }
  });

  it("refuses anything the corpus does not name", () => {
    for (const query of [
      "buy cheap viagra",
      "white to viagra",
      "gradient generator",
      "",
    ])
      expect(queryResultContext(query), query).toBeNull();
  });
});
