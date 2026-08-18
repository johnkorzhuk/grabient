// scratch: survey the fixture — richness strata + current paragraphs
import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, classifyStructure, modifierTags } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import { paletteProse, paletteProseParts, impressionFires } from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";

const VIEW = { style: "linearGradient", steps: 7, angle: 90 };

it("survey", () => {
  const rows = [];
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, VIEW.style, VIEW.steps, VIEW.angle);
    if (!v) continue;
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
    const prose = paletteProse(v.appliedCoeffs, v.hexColors, VIEW, { features: f, named });
    const parts = paletteProseParts(v.appliedCoeffs, v.hexColors, VIEW, { features: f, named });
    const fires = impressionFires(v.appliedCoeffs, v.hexColors, { features: f, named });
    const n = Object.values(fires).filter(Boolean).length;
    rows.push({
      seed, n, struct: classifyStructure(f),
      turns: f.turns, travel: Math.round(f.hueTravel), cyc: +((f.channelCycles[0]+f.channelCycles[1]+f.channelCycles[2])/3).toFixed(2),
      lr: +f.lightnessRange.toFixed(2), mc: +f.meanChroma.toFixed(3),
      hex: v.hexColors.join(","),
      imp: parts.impressions.join("|"),
      para: prose.paragraph,
    });
  }
  rows.sort((a, b) => a.n - b.n);
  const q = (p) => rows[Math.floor(p * (rows.length - 1))];
  console.log("richness n: min", rows[0].n, "p25", q(0.25).n, "p50", q(0.5).n, "p75", q(0.75).n, "max", rows[rows.length-1].n);
  const hist = {};
  for (const r of rows) hist[r.n] = (hist[r.n] ?? 0) + 1;
  console.log("hist", JSON.stringify(hist));
  const structHist = {};
  for (const r of rows) structHist[r.struct] = (structHist[r.struct] ?? 0) + 1;
  console.log("structures", JSON.stringify(structHist));
  // print a stratified sample
  const picks = [0, 0.02, 0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 0.98, 1].map((p) => rows[Math.floor(p * (rows.length - 1))]);
  for (const r of picks) {
    console.log(`\n--- n=${r.n} ${r.struct} turns=${r.turns} travel=${r.travel} cyc=${r.cyc} lr=${r.lr} mc=${r.mc}\nSEED ${r.seed}\nHEX  ${r.hex}\nIMP  ${r.imp}\nPARA ${r.para}`);
  }
});
