import { expect, test } from "vitest";
import { oldFit } from "./legacy-fit.ts";

const OLD = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa";

test("only an old `_` seed no map holds, at its page's own address or its share card's, is ever fitted", () => {
  expect(oldFit(`/${OLD}`, new URLSearchParams("style=radialSwatches&size=800x400&x=1"))).toEqual({
    seed: OLD,
    view: { style: "radialSwatches", steps: 7, angle: 90, size: { width: 800, height: 400 } },
    card: false
  });
  // the card grabient.com's pages named, its view as a crawler copied it from HTML
  expect(
    oldFit("/api/og", new URLSearchParams(`seed=${OLD}&v=16&amp;style=radialSwatches&size=800x400`))
  ).toEqual({ seed: OLD, view: { style: "radialSwatches", steps: 7, angle: 90 }, card: true });
  for (const [path, query] of [
    // a map holds it
    ["/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu", ""],
    ["/api/og", "seed=_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu"],
    // its editor's address, which leads to its page first
    [`/${OLD}/edit`, ""],
    // no old seed the browser can read either: too short, too long, an old `~` form
    ["/_abc1234", ""],
    [`/${OLD.slice(0, -1)}`, ""],
    [`/${OLD}a`, ""],
    ["/~AAbNSoVXwEAgBPwvNVIAgIAUUlhVeAQCASTA", ""],
    // an lz-string id, which leads to its `_` form first
    ["/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA", ""],
    // another picture of it, and a card of another seed or of none
    ["/api/png", `seed=${OLD}`],
    [`/${OLD}.png`, ""],
    ["/api/og", "seed=kS7Q8Yy5S_SChv0"],
    ["/api/og", ""],
    ["/kS7Q8Yy5S_SChv0", ""],
    ["/palettes", ""],
    ["/", ""]
  ]) {
    expect([path, query, oldFit(path, new URLSearchParams(query))]).toEqual([path, query, null]);
  }
});
