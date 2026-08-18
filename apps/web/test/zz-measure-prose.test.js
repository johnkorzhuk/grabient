// SCRATCH acceptance measurement for PACKAGE V1 — deleted after the run.
// Renders all 867 fixture seeds through the exact production wiring
// (seedPaletteText's calls: describePaletteName once, tagsToArray once,
// paletteProse with named+features+baseTags) at the DEFAULT view and dumps
// the acceptance distributions as JSON for seo-research/palette-prose.md.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { renderPalette } from "../src/palette.ts";
import {
  analyzeCoefficients,
  tagsToArray,
} from "@repo/data-ops/gradient-gen/palette-tags";
import {
  DESCRIPTORS,
  modifierTags,
  paletteFeatures,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import {
  familyWord,
  measureFirstFires,
  MEASURE_FIRST,
  paletteProse,
  paletteProseParts,
  relatedSearches,
} from "../src/palette-prose.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";

const OUT =
  "/tmp/claude-1000/-home-korz-projects-grabient33-grabient/176009a3-3767-4299-bfdc-0c008c5b768e/scratchpad/measure-prose.json";

const VIEW = { style: "linearGradient", steps: 7, angle: 90 };

// Deterministic LCG (numerical recipes) — same generator the acceptance test
// uses, so sampled pairs / spot-check seeds are reproducible.
const lcg = (seed) => {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
};

const stripHex = (s) => s.replace(/#[0-9a-fA-F]{6}/g, "");

const percentiles = (values, ps = [0.05, 0.25, 0.5, 0.75, 0.95]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const out = {};
  for (const p of ps) out[`p${Math.round(p * 100)}`] = q(p);
  out.max = sorted[sorted.length - 1];
  out.min = sorted[0];
  return out;
};

it("measures the corpus", () => {
  // ---- one production-shaped pass per seed --------------------------------
  const cases = PROSE_SEEDS.map((seed) => {
    const view = renderPalette(seed, VIEW.style, VIEW.steps, VIEW.angle);
    if (!view) throw new Error(`unrenderable ${seed}`);
    const features = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const named = describePaletteName(view.appliedCoeffs, view.hexColors, { features });
    const base = tagsToArray(analyzeCoefficients(view.appliedCoeffs));
    const prose = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, {
      named,
      features,
      baseTags: base,
    });
    const parts = paletteProseParts(view.appliedCoeffs, view.hexColors, VIEW, {
      named,
      features,
      baseTags: base,
    });
    const related = relatedSearches(features, named, named.tags);
    return { seed, view, features, named, base, prose, parts, related };
  });

  // ---- length distributions ----------------------------------------------
  const paragraphChars = percentiles(cases.map((c) => c.prose.paragraph.length));
  const embedChars = percentiles(cases.map((c) => c.prose.embedText.length));
  const metaChars = percentiles(cases.map((c) => c.prose.metaDescription.length));
  const sentenceCounts = percentiles(
    cases.map((c) => c.prose.paragraph.split(/(?<=[.!?]) /).length),
  );

  // ---- identical paragraphs ----------------------------------------------
  const byParagraph = new Map();
  for (const c of cases) {
    const list = byParagraph.get(c.prose.paragraph) ?? [];
    list.push(c.seed);
    byParagraph.set(c.prose.paragraph, list);
  }
  const duplicateGroups = [...byParagraph.values()].filter((g) => g.length > 1);

  // ---- stripped skeletons (same stripping as the acceptance test) --------
  const familyWords = [...new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)))];
  const skeletons = new Set();
  for (const c of cases) {
    let s = stripHex(c.prose.paragraph).replace(/\d+(\.\d+)?/g, "#");
    for (const name of [...c.named.colorNames].sort((a, b) => b.length - a.length))
      s = s.split(name).join("~");
    for (const w of familyWords) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), "~");
    skeletons.add(s);
  }

  // ---- trigram Jaccard over 300 sampled pairs ----------------------------
  const trigrams = (text) => {
    const words = text.toLowerCase().replace(/[^a-z0-9# ]/g, "").split(/\s+/).filter(Boolean);
    const set = new Set();
    for (let i = 0; i + 2 < words.length; i++)
      set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    return set;
  };
  const jaccard = (a, b) => {
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter);
  };
  const rand = lcg(42);
  const sets = cases.map((c) => trigrams(c.prose.paragraph));
  let jSum = 0;
  let jMax = 0;
  const PAIRS = 300;
  for (let i = 0; i < PAIRS; i++) {
    const a = Math.floor(rand() * cases.length);
    let b = Math.floor(rand() * cases.length);
    if (a === b) b = (a + 1) % cases.length;
    const j = jaccard(sets[a], sets[b]);
    jSum += j;
    jMax = Math.max(jMax, j);
  }

  // ---- R2 template counts (structure census) -----------------------------
  const structureCounts = {};
  for (const c of cases)
    structureCounts[c.parts.structure] = (structureCounts[c.parts.structure] ?? 0) + 1;

  // ---- measure-first firing rates ----------------------------------------
  const mfCounts = Object.fromEntries(Object.keys(MEASURE_FIRST).map((w) => [w, 0]));
  for (const c of cases) {
    const fires = measureFirstFires(c.features, c.view.hexColors);
    for (const [w, v] of Object.entries(fires)) if (v) mfCounts[w] += 1;
  }
  const measureFirst = Object.fromEntries(
    Object.entries(mfCounts).map(([w, n]) => [
      w,
      { count: n, rate: n / cases.length, use: MEASURE_FIRST[w].use },
    ]),
  );

  // ---- new tag descriptor firing rates (motion + channel axes) -----------
  const newAxes = new Set(["motion", "channel"]);
  const newWords = DESCRIPTORS.filter((d) => newAxes.has(d.axis));
  const tagCounts = Object.fromEntries(newWords.map((d) => [d.word, 0]));
  for (const c of cases) {
    const tags = modifierTags(c.features);
    for (const d of newWords) if (tags.includes(d.word)) tagCounts[d.word] += 1;
  }
  const newTagRates = Object.fromEntries(
    newWords.map((d) => [
      d.word,
      {
        axis: d.axis,
        count: tagCounts[d.word],
        rate: tagCounts[d.word] / cases.length,
        registryPrevalence: d.prevalence,
      },
    ]),
  );

  // ---- relatedSearches label distribution --------------------------------
  const labelFreq = new Map();
  const perPage = [];
  for (const c of cases) {
    perPage.push(c.related.length);
    for (const label of c.related) {
      const key = label.toLowerCase();
      labelFreq.set(key, (labelFreq.get(key) ?? 0) + 1);
    }
  }
  const topLabels = [...labelFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  // ---- step stability over 100 seeds -------------------------------------
  // Stride 8 spans the whole corpus. R6 says "in N steps" so the raw paragraph
  // always differs; the comparison strips R6 (always the final sentence,
  // always opening "Shown here as"). Name/number drift decomposed by block.
  // Byte comparisons split legitimate churn from real drift: rendered-stop
  // NUMBERS may move with step count (true at every instant, documented) and
  // NAMES track steps (documented name-system behavior), but the tone
  // WORDING — bands, clause presence, verbs — flipping is the 98.6%+ claim
  // under test, so the skeleton comparison strips digits/hex/names first.
  const stepSeeds = PROSE_SEEDS.filter((_, i) => i % 8 === 0).slice(0, 100);
  let structureChanged = 0;
  let bodyChanged = 0;
  let toneNumbersChanged = 0;
  let toneSkeletonChanged = 0;
  let toneSkeletonChanged724 = 0; // excluding the 3-step render
  let r1Changed = 0;
  let factsCompared = 0;
  let factsFlipped = 0;
  let factsCompared724 = 0;
  let factsFlipped724 = 0;
  const toneDriftSeeds = [];
  const stripR6 = (p) => p.replace(/ Shown here as .*$/, "");
  const stripDigits = (s) => stripHex(s).replace(/\d+(\.\d+)?/g, "#");
  for (const seed of stepSeeds) {
    const at = (steps) => {
      const v = renderPalette(seed, VIEW.style, steps, VIEW.angle);
      const f = paletteFeatures(v.appliedCoeffs, v.hexColors);
      const named = describePaletteName(v.appliedCoeffs, v.hexColors, { features: f });
      const base = tagsToArray(analyzeCoefficients(v.appliedCoeffs));
      const opt = { named, features: f, baseTags: base };
      const view = { ...VIEW, steps };
      return {
        parts: paletteProseParts(v.appliedCoeffs, v.hexColors, view, opt),
        prose: paletteProse(v.appliedCoeffs, v.hexColors, view, opt),
      };
    };
    const base = at(7);
    const toneBlock = (p) =>
      [p.r3, ...p.clauses.map((c) => c.text), p.r5, p.r7 ?? ""].join("|");
    let sc = false;
    let bc = false;
    let tn = false;
    let ts = false;
    let ts724 = false;
    let rc = false;
    for (const steps of [3, 13, 24]) {
      const p = at(steps);
      if (p.parts.structure !== base.parts.structure || p.parts.r2 !== base.parts.r2)
        sc = true;
      if (stripR6(p.prose.paragraph) !== stripR6(base.prose.paragraph)) bc = true;
      if (toneBlock(p.parts) !== toneBlock(base.parts)) tn = true;
      // Per-fact accounting, to compare against the measured per-fact step
      // stability (98.6%+): r3 / r5 / r7 skeletons plus the clause SET.
      const baseFacts = [
        stripDigits(base.parts.r3),
        stripDigits(base.parts.r5),
        base.parts.r7 ?? "",
      ];
      const atFacts = [stripDigits(p.parts.r3), stripDigits(p.parts.r5), p.parts.r7 ?? ""];
      let flips = 0;
      for (let k = 0; k < 3; k++) if (baseFacts[k] !== atFacts[k]) flips++;
      const baseClauses = new Set(base.parts.clauses.map((c) => c.text));
      const atClauses = new Set(p.parts.clauses.map((c) => c.text));
      for (const t of baseClauses) if (!atClauses.has(t)) flips++;
      for (const t of atClauses) if (!baseClauses.has(t)) flips++;
      factsCompared += 3 + Math.max(baseClauses.size, atClauses.size);
      factsFlipped += flips;
      if (steps !== 3) {
        factsCompared724 += 3 + Math.max(baseClauses.size, atClauses.size);
        factsFlipped724 += flips;
      }
      if (stripDigits(toneBlock(p.parts)) !== stripDigits(toneBlock(base.parts))) {
        ts = true;
        if (steps !== 3) ts724 = true;
        if (!toneDriftSeeds.some((d) => d.seed === seed))
          toneDriftSeeds.push({
            seed,
            steps,
            base: stripDigits(toneBlock(base.parts)),
            at: stripDigits(toneBlock(p.parts)),
          });
      }
      if (p.parts.r1 !== base.parts.r1) rc = true;
    }
    if (sc) structureChanged++;
    if (bc) bodyChanged++;
    if (tn) toneNumbersChanged++;
    if (ts) toneSkeletonChanged++;
    if (ts724) toneSkeletonChanged724++;
    if (rc) r1Changed++;
  }

  // ---- spot-check dump: 10 LCG-chosen seeds with raw features ------------
  const pick = lcg(7);
  const spotIdx = new Set();
  while (spotIdx.size < 10) spotIdx.add(Math.floor(pick() * cases.length));
  const spot = [...spotIdx].map((i) => {
    const c = cases[i];
    return {
      seed: c.seed,
      paragraph: c.prose.paragraph,
      embedText: c.prose.embedText,
      metaDescription: c.prose.metaDescription,
      structure: c.parts.structure,
      toneLeads: c.parts.toneLeads,
      hexColors: c.view.hexColors,
      colorNames: c.named.colorNames,
      modifierPhrase: c.named.modifierPhrase,
      tags: c.named.tags,
      baseTags: c.base,
      related: c.related,
      features: c.features,
    };
  });

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        corpusSize: cases.length,
        over800: cases.filter((c) => c.prose.paragraph.length > 800).length,
        paragraphChars,
        sentenceCounts,
        metaChars,
        embedChars,
        duplicateGroups,
        skeletonCount: skeletons.size,
        trigramJaccard: { pairs: PAIRS, mean: jSum / PAIRS, max: jMax },
        structureCounts,
        measureFirst,
        newTagRates,
        related: {
          perPage: percentiles(perPage),
          distinctLabels: labelFreq.size,
          top20: topLabels,
        },
        stepStability: {
          seeds: stepSeeds.length,
          structureChanged,
          bodyChanged,
          toneNumbersChanged,
          toneSkeletonChanged,
          toneSkeletonChanged724,
          r1Changed,
          factsCompared,
          factsFlipped,
          perFactFlipRate: factsFlipped / factsCompared,
          perFactFlipRate724: factsFlipped724 / factsCompared724,
          toneDriftSeeds,
        },
        spot,
      },
      null,
      2,
    ),
  );
}, 240000);
