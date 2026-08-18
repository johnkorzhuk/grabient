import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import { paletteProse, paletteProseParts } from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
const V = { style: "linearGradient", steps: 7, angle: 90 };
it("show", () => {
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(",") : PROSE_SEEDS.filter((_, i) => i % 71 === 0);
  for (const seed of seeds) {
    const v = renderPalette(seed, V.style, V.steps, V.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
    const prose = paletteProse(v.appliedCoeffs, v.hexColors, V, { features: f, named });
    const parts = paletteProseParts(v.appliedCoeffs, v.hexColors, V, { features: f, named });
    console.log(`\nSEED ${seed}\nHEX  ${v.hexColors.join(",")}\nIMP  ${parts.impressions.join(" | ")}  (${prose.paragraph.length} chars)\n${prose.paragraph}`);
  }
});
