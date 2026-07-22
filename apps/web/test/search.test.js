// TanStack-style search validation: invalid values collapse to defaults
// (v.fallback pattern) and normalizeSearch strips them from the URL like
// stripSearchParams — preserving unknown params.
import { describe, expect, it } from "vitest";
import {
  normalizeSearch,
  parseListSearch,
  parseSize,
  searchString,
  sizeParam,
  STYLE_VALUES,
} from "../src/search";
import { PALETTE_STYLES } from "@repo/data-ops/valibot-schema/grabient";

const sp = (s) => new URLSearchParams(s);

describe("parseListSearch", () => {
  it("parses valid params with strong types", () => {
    expect(parseListSearch(sp("style=radialGradient&steps=5&angle=45&page=2&limit=48"))).toEqual({
      style: "radialGradient",
      steps: 5,
      angle: 45,
      page: 2,
      limit: 48,
    });
  });

  it("collapses invalid values to defaults instead of throwing", () => {
    expect(parseListSearch(sp("style=bogus&steps=999&angle=-5&page=0&limit=abc"))).toEqual({
      style: "auto",
      steps: "auto",
      angle: "auto",
      page: 1,
      limit: 24,
    });
    expect(parseListSearch(sp("steps=NaN&angle=Infinity&page=1.7"))).toEqual({
      style: "auto",
      steps: "auto",
      angle: "auto",
      page: 1,
      limit: 24,
    });
  });

  it("defaults everything when params are absent", () => {
    expect(parseListSearch(sp(""))).toEqual({
      style: "auto",
      steps: "auto",
      angle: "auto",
      page: 1,
      limit: 24,
    });
  });
});

describe("normalizeSearch (stripSearchParams behavior)", () => {
  it("strips invalid values from the URL", () => {
    expect(normalizeSearch(sp("steps=999&style=bogus"))).toBe("");
  });

  it("strips explicit defaults", () => {
    expect(normalizeSearch(sp("style=auto&page=1&limit=24"))).toBe("");
  });

  it("keeps valid non-default values and preserves unknown params", () => {
    expect(normalizeSearch(sp("utm_source=x&steps=999&angle=45"))).toBe("?utm_source=x&angle=45");
  });

  it("returns null when already canonical (idempotent)", () => {
    expect(normalizeSearch(sp("steps=6"))).toBeNull();
    const once = normalizeSearch(sp("utm_source=x&steps=999&angle=45"));
    expect(normalizeSearch(sp(once))).toBeNull();
  });
});

describe("searchString", () => {
  it("omits defaults and round-trips through parse", () => {
    const s = { style: "auto", steps: 6, angle: "auto", page: 3, limit: 24 };
    expect(searchString(s)).toBe("?steps=6&page=3");
    expect(parseListSearch(sp(searchString(s)))).toEqual(s);
  });

  it("card-href overrides make effective palette values explicit", () => {
    // User set steps=6; style/angle come from the palette row via overrides.
    const userParams = { style: "auto", steps: 6, angle: "auto", page: 2, limit: 24 };
    const href = searchString(userParams, { page: 1, style: "radialGradient", steps: 6, angle: 180 });
    expect(href).toBe("?style=radialGradient&steps=6&angle=180");
  });
});

describe("parseSize (preview dimensions)", () => {
  it("parses WxH within bounds and round-trips through sizeParam", () => {
    expect(parseSize("1920x1080")).toEqual([1920, 1080]);
    expect(sizeParam([1920, 1080])).toBe("1920x1080");
    expect(sizeParam("auto")).toBeNull();
  });
  it("collapses missing, malformed, and out-of-range values to auto", () => {
    expect(parseSize(null)).toBe("auto");
    expect(parseSize("banana")).toBe("auto");
    expect(parseSize("1920x")).toBe("auto");
    expect(parseSize("10x10")).toBe("auto"); // below MIN_DIM
    expect(parseSize("9999x100")).toBe("auto"); // above MAX_DIM
  });
  it("is preserved by normalizeSearch as an island-owned param", () => {
    expect(normalizeSearch(new URLSearchParams("size=1920x1080"))).toBeNull();
  });
});

describe("source of truth", () => {
  it("STYLE_VALUES matches data-ops PALETTE_STYLES", () => {
    expect([...STYLE_VALUES]).toEqual([...PALETTE_STYLES]);
  });
});
