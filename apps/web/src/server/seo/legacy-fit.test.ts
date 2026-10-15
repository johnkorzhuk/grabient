import { expect, test } from "vitest";
import { oldFit } from "./legacy-fit.ts";

test("only an old `_` seed no map holds, at its page's own address, is ever fitted", () => {
  expect(
    oldFit(
      "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa",
      new URLSearchParams("style=radialSwatches&x=1")
    )
  ).toEqual({
    seed: "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa",
    view: { style: "radialSwatches", steps: 7, angle: 90 }
  });
  for (const path of [
    // a map holds it
    "/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu",
    // its editor's address, which leads to its page first
    "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa/edit",
    // no old seed the browser can read either: too short, too long, an old `~` form
    "/_abc1234",
    "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgK",
    "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKaa",
    "/~AAbNSoVXwEAgBPwvNVIAgIAUUlhVeAQCASTA",
    // an lz-string id, which leads to its `_` form first
    "/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA",
    "/kS7Q8Yy5S_SChv0",
    "/palettes",
    "/"
  ]) {
    expect([path, oldFit(path, new URLSearchParams())]).toEqual([path, null]);
  }
});
