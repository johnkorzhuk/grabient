import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, modifierTags, THRESHOLDS } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { hexToOkLch } from "@repo/data-ops/color-utils";
import { PROSE_SEEDS } from "./prose-corpus.js";
const T = THRESHOLDS;
const V = { style: "linearGradient", steps: 7, angle: 90 };
const band = (L) => (L > 0.87 ? "near white" : L >= T.LIGHT_LIGHTNESS ? "bright" : L < 0.18 ? "in deep shadow" : L < T.DARK_LIGHTNESS ? "dark" : null);
it("branch", () => {
  let brP = 0, brD = 0, dkP = 0, dkD = 0;
  const pairs = {};
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, V.style, V.steps, V.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const tags = modifierTags(f);
    const has = (w) => tags.includes(w);
    const L = v.hexColors.map((h) => hexToOkLch(h).L);
    const ramp = f.denseLightnessRange >= 0.25 && Math.abs(f.lightnessDelta) >= 0.8 * f.denseLightnessRange;
    const a = band(L[0]), b = band(L[L.length - 1]);
    const depth = a && b && a !== b;
    if ((has("brightening") || (f.turns === 1 && f.lightnessDelta > 0)) && ramp) { depth ? brD++ : brP++; if (depth) pairs[`${a}->${b}`] = (pairs[`${a}->${b}`] ?? 0) + 1; }
    if ((has("darkening") || (f.turns === 1 && f.lightnessDelta < 0)) && ramp) { depth ? dkD++ : dkP++; if (depth) pairs[`${a}->${b}`] = (pairs[`${a}->${b}`] ?? 0) + 1; }
  }
  const N = PROSE_SEEDS.length, bits = (n) => (-Math.log2(n / N)).toFixed(2);
  console.log("brightens plain", brP, bits(brP), "depth", brD, bits(brD));
  console.log("darkens  plain", dkP, bits(dkP), "depth", dkD, bits(dkD));
  console.log("pairs", JSON.stringify(pairs, null, 0));
});
