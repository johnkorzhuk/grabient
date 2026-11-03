import { decodePalette } from "@grabient/engine/codec.ts";
import { describe, expect, it } from "vitest";
import { madeCard, raised, shown, type ViewGiven } from "./cards.ts";
import cardsGolden from "./fixtures/cards.json" with { type: "json" };
import hexesGolden from "./fixtures/hexes.json" with { type: "json" };
import { hexes } from "./tools/admin/common.ts";

const ORIGIN = "https://grabient.com";

describe("cards", () => {
  it("draw each palette in the view a call names, with its colors, CSS and files", () => {
    for (const golden of cardsGolden) {
      const s = shown(
        golden.card.seed,
        decodePalette(golden.card.seed)!,
        golden.given as ViewGiven
      );
      expect({ style: s.style, steps: s.steps, angle: s.angle }, golden.label).toEqual(golden.view);
      expect(raised(s, (golden.given as ViewGiven).steps)).toEqual(golden.raised);
      expect(madeCard(ORIGIN, s, "Title", [], {}, false)).toEqual(golden.card);
      // an app that draws the view is given no file's address
      expect(Object.keys(madeCard(ORIGIN, s, "Title", [], {}, true))).toEqual(golden.drawn);
    }
  });

  it("draw a soft and a grain the call names: in the addresses, and the CSS's blurred stops under the grain's tile", () => {
    const seed = cardsGolden[0]!.card.seed;
    const s = shown(seed, decodePalette(seed)!, { style: "linearSwatches", soft: 40, grain: 25 });
    expect(s).toMatchObject({ style: "linearSwatches", soft: 40, grain: 25 });
    const made = madeCard(ORIGIN, s, "Title", [], {}, false) as Record<string, unknown> & {
      css: string;
      files: Record<string, string>;
    };
    expect(made).toMatchObject({ soft: 40, grain: 25 });
    expect(made.url).toContain("soft=40&grain=25");
    for (const file of Object.values(made.files)) expect(file).toContain("soft=40&grain=25");
    /* bands melt into one another: the CSS is a gradient of blurred stops where they stand, and the tile over it by
       its address, a speck a CSS pixel */
    expect(made.css).toMatch(
      /^background: url\("https:\/\/grabient\.com\/assets\/grain-test\/25\.png"\) 0 0 \/ 128px 128px, linear-gradient\(/
    );
    expect(made.css).toMatch(/ \d+(\.\d+)?%, /);
    /* a view held for the palette keeps its soft and grain where the call gives none */
    expect(shown(seed, decodePalette(seed)!, {}, { soft: 12 })).toMatchObject({ soft: 12 });
    /* and none is none */
    expect(Object.keys(shown(seed, decodePalette(seed)!, {}))).not.toContain("soft");
  });

  it("list an admin's colors as the view draws them, up to eight stops of a gradient", () => {
    const seeds = Object.fromEntries(cardsGolden.map(golden => [golden.label, golden.card.seed]));
    for (const golden of hexesGolden) {
      const seed = seeds[golden.label]!;
      expect(hexes(seed, { steps: 9 })).toEqual(golden.gradient9);
      expect(hexes(seed, { steps: 40 })).toEqual(golden.gradient40);
      expect(hexes(seed, { style: "radialSwatches", steps: 13 })).toEqual(golden.swatches13);
    }
  });
});
