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
