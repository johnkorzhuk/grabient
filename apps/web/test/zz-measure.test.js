// scratch: measure prevalences, lengths, sentence histogram after D21
import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, classifyStructure, modifierTags, THRESHOLDS } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { hexToOkLch, relativeLuminance } from "@repo/data-ops/color-utils";
import { describePaletteName } from "../src/palette-name.ts";
import { paletteProse, paletteProseParts, impressionFires, IMPRESSIONS } from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
const T = THRESHOLDS;
const VIEW = { style: "linearGradient", steps: 7, angle: 90 };
const pct = (p, arr) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];

it("measure", () => {
  const counts = Object.fromEntries(IMPRESSIONS.map((i) => [i.id, 0]));
  const spoken = Object.fromEntries(IMPRESSIONS.map((i) => [i.id, 0]));
  const paraLen = [], bodyLen = [], metaLen = [], embedLen = [];
  const sentHist = {};
  const slotHist = {};
  let inkExtreme = 0, inkExtremeOk = 0, wordMax = 0, wordMaxS = "";
  const byN = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, VIEW.style, VIEW.steps, VIEW.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
    const prose = paletteProse(v.appliedCoeffs, v.hexColors, VIEW, { features: f, named });
    const parts = paletteProseParts(v.appliedCoeffs, v.hexColors, VIEW, { features: f, named });
    const fires = impressionFires(v.appliedCoeffs, v.hexColors, { features: f, named });
    for (const [id, on] of Object.entries(fires)) if (on) counts[id] += 1;
    for (const id of parts.impressions) {
      spoken[id] += 1;
      slotHist[IMPRESSIONS.find((i) => i.id === id).slot] = (slotHist[IMPRESSIONS.find((i) => i.id === id).slot] ?? 0) + 1;
    }
    paraLen.push(prose.paragraph.length);
    bodyLen.push(prose.paragraph.replace(parts.view, "").trim().length);
    metaLen.push(prose.metaDescription.length);
    embedLen.push(prose.embedText.length);
    const n = parts.impressions.length;
    sentHist[n] = (sentHist[n] ?? 0) + 1;
    if (byN[n].length < 3) byN[n].push(seed);
    for (const sen of parts.sentences) {
      const w = sen.split(/\s+/).filter(Boolean).length;
      if (w > wordMax) { wordMax = w; wordMaxS = sen; }
    }
    // ink guard measurement
    const L = v.hexColors.map((h) => hexToOkLch(h).L);
    const lum = v.hexColors.map(relativeLuminance);
    const band = (x) => (x > 0.87 ? "w" : x >= T.LIGHT_LIGHTNESS ? "b" : x < 0.18 ? "k" : x < T.DARK_LIGHTNESS ? "d" : null);
    const a = band(L[0]), b = band(L[L.length - 1]);
    if ((a === "w" && b === "k") || (a === "k" && b === "w")) {
      inkExtreme += 1;
      if (Math.max(lum[0], lum[lum.length - 1]) >= 4.5 * 0.05 - 0.05 && Math.min(lum[0], lum[lum.length - 1]) <= 1.05 / 4.5 - 0.05) inkExtremeOk += 1;
    }
  }
  const N = PROSE_SEEDS.length;
  console.log("PREVALENCES (measured / table)");
  for (const i of IMPRESSIONS) {
    const m = counts[i.id] / N;
    const flag = Math.abs(m - i.prevalence) >= 0.0006 ? "  <-- DRIFT" : "";
    console.log(`  ${i.id.padEnd(20)} ${m.toFixed(4)}  table ${String(i.prevalence).padEnd(7)} bits ${(-Math.log2(Math.max(m, 1 / N))).toFixed(2).padStart(5)} spoken ${String(spoken[i.id]).padStart(4)}${flag}`);
  }
  for (const arr of [paraLen, bodyLen, metaLen, embedLen]) arr.sort((a, b) => a - b);
  const rep = (n, a) => console.log(`${n}: p0 ${a[0]} p5 ${pct(0.05,a)} p25 ${pct(0.25,a)} p50 ${pct(0.5,a)} p75 ${pct(0.75,a)} p95 ${pct(0.95,a)} max ${a[a.length-1]}`);
  rep("paragraph", paraLen); rep("body", bodyLen); rep("meta", metaLen); rep("embed", embedLen);
  console.log("sentence hist (impressions)", JSON.stringify(sentHist));
  console.log("slot hist", JSON.stringify(slotHist));
  console.log("ink extreme band pairs", inkExtreme, "of which ink agrees", inkExtremeOk);
  console.log("longest sentence", wordMax, wordMaxS);
  console.log("examples by n", JSON.stringify(byN));
});
