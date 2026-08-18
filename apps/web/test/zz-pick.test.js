import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { paletteFeatures, classifyStructure, modifierTags } from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import { paletteProse, paletteProseParts } from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
const V = { style: "linearGradient", steps: 7, angle: 90 };
it("pick", () => {
  const rows = [];
  for (const seed of PROSE_SEEDS) {
    const v = renderPalette(seed, V.style, V.steps, V.angle);
    const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
    const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
    const prose = paletteProse(v.appliedCoeffs, v.hexColors, V, { features: f, named });
    const parts = paletteProseParts(v.appliedCoeffs, v.hexColors, V, { features: f, named });
    rows.push({ seed, n: parts.impressions.length, st: classifyStructure(f), tags: modifierTags(f),
      cyc: (f.channelCycles[0]+f.channelCycles[1]+f.channelCycles[2])/3, turns: f.turns,
      imp: parts.impressions, para: prose.paragraph, hex: v.hexColors.join(","), len: prose.paragraph.length });
  }
  const want = [
    ["simple-1sent-a", (r) => r.n === 1 && r.st === "monochrome"],
    ["simple-1sent-b", (r) => r.n === 1 && r.tags.includes("pastel")],
    ["simple-1sent-c", (r) => r.n === 1 && r.st === "analogous"],
    ["grayscale", (r) => r.st === "grayscale"],
    ["mono-series", (r) => r.st === "monochrome" && r.n >= 3],
    ["duotone", (r) => r.st === "duotone" && r.n >= 3],
    ["complementary", (r) => r.st === "complementary"],
    ["pale-wash", (r) => r.tags.includes("pastel") && r.tags.includes("high-key") && r.n <= 2],
    ["dark-low", (r) => r.tags.includes("low-key") && r.n >= 3],
    ["neon", (r) => r.tags.includes("neon") && r.n >= 3],
    ["rainbow-full", (r) => r.tags.includes("full-wheel")],
    ["rainbow", (r) => r.st === "rainbow" && r.n === 4],
    ["cycles", (r) => r.cyc >= 1.4],
    ["black-plateau", (r) => r.tags.includes("pure-black-plateau")],
    ["white-plateau", (r) => r.tags.includes("pure-white-plateau")],
    ["wavy", (r) => r.turns >= 3],
    ["iso", (r) => r.tags.includes("iso-luminant") && r.n >= 3],
    ["longest", (r) => r.len >= 430],
  ];
  const used = new Set();
  for (const [label, f] of want) {
    const r = rows.find((x) => f(x) && !used.has(x.seed));
    if (!r) { console.log(`${label}: NONE`); continue; }
    used.add(r.seed);
    console.log(`\n### ${label} n=${r.n} ${r.st} len=${r.len}\nSEED ${r.seed}\nHEX  ${r.hex}\nIMP  ${r.imp.join(" | ")}\n${r.para}`);
  }
});
