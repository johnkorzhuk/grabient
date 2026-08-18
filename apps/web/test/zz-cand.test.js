// scratch: measure candidate new gates over the 867 fixture
import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, classifyStructure, modifierTags, THRESHOLDS } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { hexToOkLch } from "@repo/data-ops/color-utils";
import { PROSE_SEEDS } from "./prose-corpus.js";
const T = THRESHOLDS;
const VIEW = { style: "linearGradient", steps: 7, angle: 90 };
const mid = (t) => t > 1 / 3 && t < 2 / 3;

it("cand", () => {
  const c = {};
  const bump = (k, v) => { if (v) c[k] = (c[k] ?? 0) + 1; };
  const N = PROSE_SEEDS.length;
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, VIEW.style, VIEW.steps, VIEW.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const tags = modifierTags(f);
    const has = (w) => tags.includes(w);
    const L = v.hexColors.map((h) => hexToOkLch(h).L);
    const C = v.hexColors.map((h) => hexToOkLch(h).C);
    const st = classifyStructure(f);
    bump("saturating", has("saturating"));
    bump("desaturating", has("desaturating"));
    bump("sat+visible", has("saturating") && f.denseChromaRange >= 0.05);
    bump("desat+visible", has("desaturating") && f.denseChromaRange >= 0.05);
    bump("sat+vis08", has("saturating") && f.denseChromaRange >= 0.08);
    bump("desat+vis08", has("desaturating") && f.denseChromaRange >= 0.08);
    bump("peakMid", mid(f.chromaPeakT) && f.denseChromaRange >= 0.05);
    bump("peakMid08", mid(f.chromaPeakT) && f.denseChromaRange >= 0.08);
    bump("valleyMid", mid(f.chromaValleyT) && f.denseChromaRange >= 0.05);
    bump("valleyMid08", mid(f.chromaValleyT) && f.denseChromaRange >= 0.08);
    bump("evenC", f.denseChromaRange < 0.03 && f.meanChroma >= T.MUTED_CHROMA);
    bump("evenC02", f.denseChromaRange < 0.02 && f.meanChroma >= T.MUTED_CHROMA);
    bump("unclipped", f.inGamutAlways);
    bump("hue-adv", has("hue-advancing"));
    bump("hue-rev", has("hue-reversing"));
    bump("clipHi", has("clipped-highlights"));
    bump("crushLo", has("crushed-shadows"));
    bump("flatChan", has("flat-channel"));
    // end-band branches
    const first = L[0], last = L[L.length - 1];
    bump("brightens", (has("brightening") || (f.turns === 1 && f.lightnessDelta > 0)) && f.denseLightnessRange >= 0.25 && Math.abs(f.lightnessDelta) >= 0.8 * f.denseLightnessRange);
    bump("darkens", (has("darkening") || (f.turns === 1 && f.lightnessDelta < 0)) && f.denseLightnessRange >= 0.25 && Math.abs(f.lightnessDelta) >= 0.8 * f.denseLightnessRange);
    bump("br+darkstart", (has("brightening")) && first < 0.18);
    bump("br+lightend", (has("brightening")) && last > 0.87);
    bump("dk+lightstart", (has("darkening")) && first > 0.87);
    bump("dk+darkend", (has("darkening")) && last < 0.18);
    bump("fullrange", f.lightnessRange > T.HIGH_CONTRAST_RANGE && Math.min(...L) < 0.18 && Math.max(...L) > 0.87);
    bump("fullrange&ramp", f.lightnessRange > T.HIGH_CONTRAST_RANGE && Math.min(...L) < 0.18 && Math.max(...L) > 0.87 && (has("brightening") || has("darkening")));
    bump("wideRange", f.lightnessRange > 0.45 && f.lightnessRange <= T.HIGH_CONTRAST_RANGE);
    // ends: both light / both dark / equal weight
    bump("endsEqual", Math.abs(first - last) < 0.06 && f.lightnessRange >= 0.25);
    bump("endsBothLight", Math.min(first, last) > 0.8);
    bump("endsBothDark", Math.max(first, last) < 0.3);
    bump("oneEndBlack", Math.min(first, last) < 0.18 && Math.max(first, last) <= 0.87);
    bump("oneEndWhite", Math.max(first, last) > 0.87 && Math.min(first, last) >= 0.18);
    // structure
    bump(`st:${st}`, true);
  }
  const rows = Object.entries(c).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of rows) console.log(k.padEnd(16), String(n).padStart(4), (n / N * 100).toFixed(1) + "%", "bits", (-Math.log2(n / N)).toFixed(2));
});
