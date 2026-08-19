import { describe, expect, it } from "vitest";
import { rankedBarChart } from "../src/charts";
import { pageFilterValue, pageLabel } from "../src/search-page";

/**
 * Regression tests for the landing-page drill-down.
 *
 * The first version of this feature built the Search Console filter as
 * `https://grabient.com` + encodeURI(displayed path). Both halves were wrong
 * against real data:
 *
 *   - The property is `sc-domain:`, so it aggregates http/https x apex/www and
 *     the pre-canonical www URLs still draw impressions. Rebuilding every row
 *     onto the https apex sent a URL Google had never stored.
 *   - Rows arrive ALREADY percent-encoded. encodeURI does not treat `%` as
 *     safe, so a stored `%2B` went out as `%252B`.
 *
 * `equals` is a literal string match, so either mistake returns zero rows —
 * and zero rows is indistinguishable from "this page had no impressions",
 * which is why it could have sat there looking like data rather than a bug.
 */
describe("pageFilterValue", () => {
  it("passes a stored URL through untouched — it is already Google's form", () => {
    const stored =
      "http://www.grabient.com/HQFgHA7ANMBsBMBGGEAMYb1dAtK4iqqUeBiIJ%2BAzAKzyXBUCcGpEi0wYzMssxwCPDBA?page=15&style=angularGradient";
    expect(pageFilterValue(stored)).toBe(stored);
  });

  it("does not re-encode an existing escape", () => {
    expect(pageFilterValue("https://grabient.com/palettes/aqua%2C-magenta")).not.toContain("%252C");
  });

  it("keeps the scheme and host a row was stored under", () => {
    for (const host of [
      "https://grabient.com",
      "https://www.grabient.com",
      "http://www.grabient.com",
      "http://grabient.com",
    ]) {
      expect(pageFilterValue(`${host}/x`)).toBe(`${host}/x`);
    }
  });

  it("still canonicalises a bare path, which is the only unencoded input", () => {
    expect(pageFilterValue("/palettes/duotone")).toBe("https://grabient.com/palettes/duotone");
    expect(pageFilterValue("/palettes/aqua,-magenta")).toBe("https://grabient.com/palettes/aqua%2C-magenta");
  });
});

describe("pageLabel", () => {
  it("strips the canonical origin and nothing else", () => {
    expect(pageLabel("https://grabient.com/")).toBe("/");
    expect(pageLabel("https://grabient.com/?page=2")).toBe("/?page=2");
  });

  it("keeps a non-canonical host visible, so two different URLs do not both read as /", () => {
    expect(pageLabel("https://www.grabient.com/")).toBe("www.grabient.com/");
    expect(pageLabel("https://grabient.com/")).not.toBe(pageLabel("https://www.grabient.com/"));
  });

  it("decodes for the reader", () => {
    expect(pageLabel("https://grabient.com/palettes/aqua%2C-magenta")).toBe("/palettes/aqua,-magenta");
  });

  it("survives a malformed escape rather than throwing", () => {
    expect(() => pageLabel("https://grabient.com/%E0%A4%A")).not.toThrow();
  });
});

describe("rankedBarChart row links", () => {
  it("gives rows that DISPLAY identically their own distinct links", () => {
    // The exact collision the index argument exists for: a domain property
    // reports the apex and www home pages separately and both render as "/".
    const rows = [
      { label: "/", count: 721 },
      { label: "/", count: 1 },
    ];
    const html = rankedBarChart(rows, "Clicks by landing page", "t", (n) => `${n} clicks`, (l) => l, undefined, (_label, index) =>
      index === 0 ? "/search?page=apex" : "/search?page=www",
    );
    expect(html).toContain("/search?page=apex");
    expect(html).toContain("/search?page=www");
  });

  it("hands the link builder an index that indexes the rows it was given", () => {
    const rows = [
      { label: "alpha", count: 3 },
      { label: "beta", count: 2 },
      { label: "gamma", count: 1 },
    ];
    const seen: Array<[string, number]> = [];
    rankedBarChart(rows, "x", "t", (n) => String(n), (l) => l, undefined, (label, index) => {
      seen.push([label, index]);
      return null;
    });
    expect(seen.length).toBe(rows.length);
    for (const [label, index] of seen) expect(rows[index]!.label).toBe(label);
  });

  it("renders no overlay at all when no link builder is passed", () => {
    const html = rankedBarChart([{ label: "/", count: 1 }], "x", "t", (n) => String(n));
    expect(html).not.toContain("chart-row-link");
  });
});
