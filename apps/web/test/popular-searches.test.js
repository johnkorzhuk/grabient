import { describe, expect, it, vi } from "vitest";
import {
  getPopularSearchSuggestions,
  POPULAR_SEARCH_COUNT,
} from "../src/popular-searches";

const HOUR = 1_800_000_000_000;

function cache() {
  const values = new Map();
  return {
    get: vi.fn(async (key) => {
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    }),
    put: vi.fn(async (key, value) => {
      values.set(key, value);
    }),
  };
}

describe("Popular search suggestions", () => {
  it("is stable within an hour and rotates a broad part of the set at rollover", async () => {
    const first = await getPopularSearchSuggestions(undefined, HOUR);
    const repeated = await getPopularSearchSuggestions(undefined, HOUR + 59 * 60 * 1000);
    const next = await getPopularSearchSuggestions(undefined, HOUR + 60 * 60 * 1000);

    expect(first).toEqual(repeated);
    expect(first).toHaveLength(POPULAR_SEARCH_COUNT);
    expect(new Set(first.map(({ query }) => query.toLowerCase())).size).toBe(
      POPULAR_SEARCH_COUNT,
    );
    expect(first.map(({ query }) => query)).toEqual(
      expect.arrayContaining([
        "blue",
        "purple",
        "cyan",
        "rose",
        "charcoal & chocolate",
        "teal, azure, navy",
      ]),
    );
    expect(next).not.toEqual(first);
    const fixed = new Set([
      "blue",
      "purple",
      "cyan",
      "rose",
      "charcoal & chocolate",
      "teal, azure, navy",
    ]);
    const firstRotating = first
      .map(({ query }) => query)
      .filter((query) => !fixed.has(query));
    const nextRotating = new Set(
      next.map(({ query }) => query).filter((query) => !fixed.has(query)),
    );
    expect(firstRotating.filter((query) => nextRotating.has(query)).length).toBeLessThan(10);
  });

  it("reuses the cached provider result and starts a new cache bucket next hour", async () => {
    const store = cache();
    const provider = {
      id: "test-llm-v1",
      generate: vi.fn(async ({ hour }) => [
        {
          query: `Martian dusk ${hour}`,
          swatches: ["#ABCDEF", "not-a-color"],
          source: "llm",
        },
        { query: "  quiet   circuitry  ", source: "llm" },
        { query: "quiet circuitry", source: "duplicate" },
        { query: "" },
      ]),
    };

    const first = await getPopularSearchSuggestions(store, HOUR, provider);
    const repeated = await getPopularSearchSuggestions(store, HOUR + 1000, provider);
    const next = await getPopularSearchSuggestions(
      store,
      HOUR + 60 * 60 * 1000,
      provider,
    );

    expect(repeated).toEqual(first);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(first[0]).toMatchObject({
      query: expect.stringMatching(/^Martian dusk /),
      swatches: ["#abcdef"],
      source: "llm",
    });
    expect(first.filter(({ query }) => query === "quiet circuitry")).toHaveLength(1);
    expect(first).toHaveLength(POPULAR_SEARCH_COUNT);
    expect(next[0].query).not.toBe(first[0].query);
    expect(store.put).toHaveBeenCalledTimes(2);
    expect(store.put.mock.calls[0][2]).toEqual({ expirationTtl: 7200 });
  });

  it("falls back to the curated hourly mix when a future provider fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = {
      id: "broken-provider",
      generate: vi.fn(async () => {
        throw new Error("offline");
      }),
    };

    const suggestions = await getPopularSearchSuggestions(undefined, HOUR, provider);

    expect(suggestions).toHaveLength(POPULAR_SEARCH_COUNT);
    expect(suggestions.map(({ query }) => query)).toContain("blue");
    warn.mockRestore();
  });
});
