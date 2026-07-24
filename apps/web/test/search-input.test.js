import { describe, expect, it } from "vitest";
import { parseSearchInput, searchRouteSegment } from "../src/search-input";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

describe("search input parsing", () => {
  it("parses Grabient links and lets their palette params override the page view", () => {
    const parsed = parseSearchInput(
      `https://grabient-lite.jkorzhuk.workers.dev/${SEED}?style=radialGradient&angle=45&steps=11&page=3`,
      "https://grabient-lite.jkorzhuk.workers.dev",
    );
    expect(parsed).toEqual({
      kind: "url",
      query: SEED,
      searchParams: {
        style: "radialGradient",
        angle: "45",
        steps: "11",
      },
    });
    expect(searchRouteSegment(parsed.query)).toBe(SEED);
  });

  it("converts a four-vector coefficient input to a searchable seed", () => {
    const parsed = parseSearchInput(
      "[[0.5,0.5,0.5],[0.5,0.5,0.5],[1,1,1],[0,0.33,0.67]]",
    );
    expect(parsed?.kind).toBe("vector");
    expect(parsed?.query).toMatch(/^_/);
    expect(searchRouteSegment(parsed.query)).toBe(parsed.query);
  });

  it("recognizes raw seeds and leaves ordinary text as text", () => {
    expect(parseSearchInput(SEED)).toMatchObject({ kind: "seed", query: SEED });
    expect(parseSearchInput("Warm Sunset")).toEqual({
      kind: "text",
      query: "Warm Sunset",
      searchParams: {},
    });
    expect(searchRouteSegment("Warm Sunset")).toBe("warm-sunset");
  });
});
