import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, classifyStructure, modifierTags, THRESHOLDS } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import { impressionFires, IMPRESSIONS, paletteProseParts } from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
const T = THRESHOLDS;
const V = { style: "linearGradient", steps: 7, angle: 90 };
const slotOf = (id) => IMPRESSIONS.find((i) => i.id === id).slot;
const score = (id) => -Math.log2(Math.max(IMPRESSIONS.find((i) => i.id === id).prevalence, 1 / 867));
it("diag", () => {
  const emptySlot = { tone: 0, form: 0, motion: 0, intensity: 0 };
  const emptyAfterBar = { tone: 0, form: 0, motion: 0, intensity: 0 };
  const spanHist = {};
  let hueAdvMulti = 0, hueRevMulti = 0, span180 = 0, span180multi = 0;
  const N = PROSE_SEEDS.length;
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, V.style, V.steps, V.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
    const fires = impressionFires(v.appliedCoeffs, v.hexColors, { features: f, named });
    const on = Object.entries(fires).filter(([, b]) => b).map(([id]) => id);
    for (const s of Object.keys(emptySlot)) {
      if (!on.some((id) => slotOf(id) === s)) emptySlot[s]++;
      if (!on.some((id) => slotOf(id) === s && score(id) >= 2)) emptyAfterBar[s]++;
    }
    const st = classifyStructure(f);
    const tags = modifierTags(f);
    const b = Math.floor(f.hueSpan / 45) * 45;
    spanHist[b] = (spanHist[b] ?? 0) + 1;
    if (st === "multicolor" || st === "rainbow") {
      if (tags.includes("hue-advancing")) hueAdvMulti++;
      if (tags.includes("hue-reversing")) hueRevMulti++;
    }
    if (f.hueSpan >= 180) { span180++; if (st === "multicolor") span180multi++; }
  }
  console.log("slots with NO fired row:", JSON.stringify(emptySlot));
  console.log("slots with no row >=2 bits:", JSON.stringify(emptyAfterBar));
  console.log("hueSpan hist (45deg bins)", JSON.stringify(spanHist));
  console.log("hue-adv on multi/rainbow", hueAdvMulti, (-Math.log2(hueAdvMulti/N)).toFixed(2), "hue-rev", hueRevMulti, (-Math.log2(hueRevMulti/N)).toFixed(2));
  console.log("hueSpan>=180", span180, "of which multicolor", span180multi);
});
