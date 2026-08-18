// The prose generator: determinism, step behavior, number truth, corpus-level
// anti-template acceptance, the measure-first prevalence contract, and the
// canonical describePalette triple. Fixture = the 867 live-sitemap seeds in
// prose-corpus.js, rendered at the default view (linearGradient, 7 steps, 90°)
// — the view an uncustomized seed page serves. Every asserted band below was
// MEASURED over that fixture on 2026-08-17; re-measure before moving one.
import { describe, expect, it, vi } from "vitest";
import { renderPalette } from "../src/palette.ts";
import { cosineGradient, rgbToHex } from "@repo/data-ops/gradient-gen/cosine";
import {
  modifierTags,
  paletteFeatures,
  DESCRIPTORS,
  spokenWord,
  THRESHOLDS,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import { describePaletteName } from "../src/palette-name.ts";
import {
  describePalette,
  familyWord,
  measureFirstFires,
  MEASURE_FIRST,
  paletteEmbedText,
  paletteProse,
  paletteProseParts,
  relatedSearches,
  relatedSearchSlug,
} from "../src/palette-prose.ts";
import { querySlug } from "../src/semantic-search.ts";
import { PROSE_SEEDS } from "./prose-corpus.js";
import { hexToOkLch, NAMED_COLORS } from "@repo/data-ops/color-utils";

const caseHexL = (hex) => hexToOkLch(hex).L;

// Counts real analysis passes so the one-pass contract of describePalette is
// verifiable. The wrapper delegates to the actual implementation, so every
// other assertion in this file exercises the true code path.
const analysisCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@repo/data-ops/gradient-gen/palette-modifiers", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    paletteFeatures: (...args) => {
      analysisCalls.n += 1;
      return actual.paletteFeatures(...args);
    },
  };
});

const VIEW = { style: "linearGradient", steps: 7, angle: 90 };

const render = (seed, steps = VIEW.steps, style = VIEW.style, angle = VIEW.angle) => {
  const view = renderPalette(seed, style, steps, angle);
  if (!view) throw new Error(`unrenderable seed ${seed}`);
  return view;
};

/**
 * One shared analysis per seed — the fixture is walked many times below.
 * baseTags is deliberately NOT passed: paletteProse defaults it internally
 * from the same palette-tags import seedPaletteText uses, so this fixture
 * exercises the LIVE page composition (journey wording included) rather than
 * a journey-less variant.
 */
const caseCache = new Map();
const caseFor = (seed) => {
  let c = caseCache.get(seed);
  if (!c) {
    const view = render(seed);
    const features = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const named = describePaletteName(view.appliedCoeffs, view.hexColors, { features });
    const prose = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
    const parts = paletteProseParts(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
    c = { view, features, named, prose, parts };
    caseCache.set(seed, c);
  }
  return c;
};

// Deterministic LCG (numerical recipes constants) for pair sampling — the
// MODULE may not hash or randomize, but the harness needs reproducible pairs.
const lcg = (seed) => {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
};

const stripHex = (s) => s.replace(/#[0-9a-fA-F]{6}/g, "");

describe("determinism and purity", () => {
  it("is byte-identical across repeated calls", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 61 === 0)) {
      const { view, features, named } = caseFor(seed);
      const a = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      const b = paletteProse(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      expect(a).toEqual(b);
      // And without the reuse options — same analysis, same bytes.
      const c = paletteProse(view.appliedCoeffs, view.hexColors, VIEW);
      expect(c.paragraph).toBe(a.paragraph);
      expect(c.embedText).toBe(a.embedText);
    }
  });

  it("keeps steps, style and angle out of everything except R6", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 97 === 0)) {
      const { view, prose } = caseFor(seed);
      // The paragraph's view sentence is R6 and only R6.
      expect(prose.paragraph).toContain("Shown here as a linear gradient in 7 steps at 90°");
      // embedText: no hex, no view tokens — the index describes the palette,
      // not this render of it.
      expect(prose.embedText).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(prose.embedText).not.toContain("Shown here");
      expect(prose.embedText).not.toContain(" steps");
      expect(prose.embedText).not.toContain("linear gradient");
      expect(prose.metaDescription).not.toMatch(/#[0-9a-fA-F]{6}/);
      // identity is the no-hex R1.
      expect(prose.identity).not.toMatch(/#[0-9a-fA-F]{6}/);
      // The paragraph opens on the same R1 the identity is (hexes aside).
      expect(prose.paragraph.slice(0, 30)).toBe(prose.identity.slice(0, 30));
      // embedText is view-independent for style/angle (steps legitimately
      // move the rendered names), and paletteEmbedText is that composition.
      const alt = paletteProse(view.appliedCoeffs, view.hexColors, {
        style: "angularSwatches",
        steps: 7,
        angle: 45,
      });
      expect(alt.embedText).toBe(prose.embedText);
      expect(paletteEmbedText(view.appliedCoeffs, view.hexColors)).toBe(prose.embedText);
    }
  });
});

describe("step behavior", () => {
  it("holds R2 and the structure word byte-identical at 3/7/13/24 steps", () => {
    // 22 seeds at a fixed stride — wide enough to cover every structure class
    // (the fixture holds 24 grayscale seeds as its rarest class).
    const sample = PROSE_SEEDS.filter((_, i) => i % 40 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(20);
    for (const seed of sample) {
      const at = (steps) => {
        const v = render(seed, steps);
        return paletteProseParts(v.appliedCoeffs, v.hexColors, { ...VIEW, steps });
      };
      const base = at(7);
      for (const steps of [3, 13, 24]) {
        const p = at(steps);
        expect(p.structure, `${seed} @ ${steps}`).toBe(base.structure);
        expect(p.r2, `${seed} @ ${steps}`).toBe(base.r2);
      }
    }
  });
});

describe("number round-trip", () => {
  // Every printed number is recomputed from the features at its stated
  // precision. Each row is (context regex → expected values); after all rows
  // run, no digit may remain unclaimed in the paragraph — a new number needs
  // a new row, which is the point.
  const f2 = (x) => x.toFixed(2);
  const f1 = (x) => x.toFixed(1);
  const ceil2 = (x) => (Math.ceil(x * 100 - 1e-9) / 100).toFixed(2);
  // WCAG ratio prints floored (never a false "clears" at 4.45–4.4999); the
  // helper mirrors floor1 in palette-prose.ts.
  const floor1 = (x) => (Math.floor(x * 10 + 1e-6) / 10).toFixed(1);

  it("recomputes every printed number at its stated precision", () => {
    for (const seed of PROSE_SEEDS) {
      const { view, features: f, prose, named } = caseFor(seed);
      const meanCycles = (f.channelCycles[0] + f.channelCycles[1] + f.channelCycles[2]) / 3;
      const endL = [view.hexColors[0], view.hexColors[view.hexColors.length - 1]].map(
        (h) => caseHexL(h),
      );
      const allL = view.hexColors.map((h) => caseHexL(h));
      void named;

      const rows = [
        [/fits inside a (\d+)° arc/g, () => [String(Math.round(f.hueSpan))]],
        [/sit (\d+)° apart/g, () => [String(Math.round(f.clusterSeparation))]],
        [/drifts (\d+)°/g, () => [String(Math.round(f.hueSpan))]],
        [/spans (\d+)° in one connected arc/g, () => [String(Math.round(f.hueSpan))]],
        [
          /falls into (\d+) separate clusters spread across (\d+)°/g,
          () => [String(f.hueClusters), String(Math.round(f.hueSpan))],
        ],
        [/covers (\d+)° of the hue circle/g, () => [String(Math.round(f.hueSpan))]],
        [/(\d+)° of hue in one pass/g, () => [String(Math.round(f.hueSpan))]],
        [/completes (\d+\.\d) full cycles/g, () => [f1(meanCycles)]],
        [/repeats (\d+\.\d)× along the ramp/g, () => [f1(meanCycles)]],
        [
          /(\d+\.\d\d) of lightness between its darkest and lightest (?:gray|stop)/g,
          () => [f2(f.denseLightnessRange)],
        ],
        [
          /registers on only (\d+)% of the run/g,
          () => [String(Math.round(f.chromaticFraction * 100))],
        ],
        [/lightness travels (\d+\.\d\d) of its scale/g, () => [f2(f.lightnessRange)]],
        [
          // R3 capitalizes "Lightness…" when no lead adjective earned a colon.
          /[Ll]ightness (?:climbs|falls)(?: only)? from (\d\.\d\d) to (\d\.\d\d)/g,
          () => [f2(endL[0]), f2(endL[1])],
        ],
        [/stays nearly flat, (\d\.\d\d) to (\d\.\d\d)/g, () => [f2(endL[0]), f2(endL[1])]],
        [
          /bends once between (\d\.\d\d) and (\d\.\d\d)/g,
          () => [f2(Math.min(...allL)), f2(Math.max(...allL))],
        ],
        [/changing direction (\d+) times/g, () => [String(f.turns)]],
        [/holds at lightness (\d\.\d\d) and chroma (\d\.\d\d)/g, () => null], // solid only; not in fixture
        [/mean chroma held below (\d\.\d\d)/g, () => [f2(THRESHOLDS.PASTEL_CHROMA)]],
        [/mean chroma under (\d\.\d\d)/g, () => [ceil2(THRESHOLDS.MUTED_CHROMA)]],
        [/chroma never rising above (\d\.\d\d)/g, () => [f2(f.maxChroma)]],
        [/jewel tones \(mean (\d\.\d\d)\)/g, () => [f2(f.meanChroma)]],
        [/mean chroma (\d\.\d\d)/g, () => [f2(f.meanChroma)]],
        [/peaking at (\d\.\d\d)/g, () => [f2(f.maxChroma)]],
        [/measure (\d+\.\d):1/g, () => [floor1(f.contrastRatio)]],
        [/the (4\.5):1 WCAG AA threshold/g, () => ["4.5"]],
        [/(\d+)% of the run is pinned/g, () => [String(Math.round(f.clipped * 100))]],
        [/in (\d+) steps at (\d+)°/g, () => [String(VIEW.steps), String(Math.round(VIEW.angle))]],
      ];

      let text = stripHex(prose.paragraph);
      for (const [re, expected] of rows) {
        text = text.replace(re, (m, ...groups) => {
          const want = expected();
          if (want) {
            const got = groups.slice(0, want.length);
            expect(got, `${seed}: ${m}`).toEqual(want);
          }
          return m.replace(/\d/g, "•"); // claim the digits
        });
      }
      expect(text, `${seed}: unclaimed number in "${text}"`).not.toMatch(/\d/);
    }
  });
});

describe("solid-color veto", () => {
  // b = 0 in every channel collapses the cosine to its offset — every stop
  // one hex. The editor reaches this directly (contrast slider at 0).
  const coeffs = [
    [0.42, 0.31, 0.25],
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ];
  const hexColors = cosineGradient(7, coeffs).map(([r, g, b]) => rgbToHex(r, g, b));

  it("states the degenerate case and drops every journey construction", () => {
    const prose = paletteProse(coeffs, hexColors, VIEW);
    expect(new Set(hexColors).size).toBe(1);
    expect(prose.paragraph).toContain("one solid color");
    expect(prose.paragraph).toContain("at every stop");
    for (const journey of [
      " to ",
      "easing",
      "running",
      "sweeping",
      "winding",
      "arcing",
      "weaving",
      "circling",
      "brightens",
      "darkens",
      "advance",
      "wanders",
    ])
      expect(prose.paragraph, journey).not.toContain(journey);
    // Stops after R3/R5: no R7 close, but the page still gets its R6.
    expect(prose.paragraph).toContain("Shown here as");
    expect(prose.embedText).toContain("Tags:");
    expect(prose.embedText).toContain("solid");
  });
});

describe("length bounds", () => {
  it("holds every surface inside its measured band", () => {
    // Paragraph target is 350–800; measured over the fixture after the trim
    // ladder (live composition, journey wording included): p0 353, p5 506,
    // p50 660, p95 777, max 800 — the truth-lens rewording pass shortened the
    // over-800 tail to zero. The hard bounds below bracket that measurement;
    // the percentile assertions pin the distribution so a regression cannot
    // hide in the tails.
    const lengths = [];
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      lengths.push(prose.paragraph.length);
      expect(prose.paragraph.length, seed).toBeGreaterThanOrEqual(350);
      expect(prose.paragraph.length, seed).toBeLessThanOrEqual(900);
      expect(prose.metaDescription.length, seed).toBeLessThanOrEqual(160);
      expect(prose.embedText.length, seed).toBeLessThanOrEqual(1600);
    }
    lengths.sort((a, b) => a - b);
    const q = (p) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))];
    expect(q(0.05)).toBeGreaterThanOrEqual(450);
    expect(q(0.5)).toBeGreaterThanOrEqual(350);
    expect(q(0.5)).toBeLessThanOrEqual(800);
    expect(q(0.95)).toBeLessThanOrEqual(800);
  });
});

describe("template coverage", () => {
  it("exercises all seven R2 shapes across the fixture", () => {
    // Fixture census: multicolor 238, analogous 252, rainbow 117, monochrome
    // 144, grayscale 24, complementary 46, duotone 46.
    const signatures = {
      monochrome: /Every stop shares one hue/,
      // Two value forms: per-stop wording when NO dense sample clears the
      // chroma floor, the measured-fraction wording when a few do (the
      // chromaticFraction < 0.15 disjunct of the classification).
      grayscale: /(reads as pure value|comes across as value more than color)/,
      duotone: /The two families sit \d+° apart/,
      complementary: /The two hues sit \d+° apart/,
      analogous: /Hue drifts \d+°/,
      // Connected-arc wording only for the single-cluster case; the
      // fallthrough's multi-cluster palettes state their cluster count.
      multicolor: /Hue (spans \d+° in one connected arc|falls into \d+ separate clusters)/,
      rainbow: /(covers \d+° of the hue circle|sweeps the entire color wheel)/,
    };
    const seen = new Set();
    for (const seed of PROSE_SEEDS) {
      const { parts } = caseFor(seed);
      seen.add(parts.structure);
      expect(parts.r2, `${seed} (${parts.structure})`).toMatch(signatures[parts.structure]);
    }
    expect([...seen].sort()).toEqual(Object.keys(signatures).sort());
  });
});

describe("measure-first prevalence contract", () => {
  it("re-measures every detector into its recorded rate and band", () => {
    const counts = Object.fromEntries(Object.keys(MEASURE_FIRST).map((w) => [w, 0]));
    for (const seed of PROSE_SEEDS) {
      const { view, features } = caseFor(seed);
      const fires = measureFirstFires(features, view.hexColors);
      for (const [w, v] of Object.entries(fires)) if (v) counts[w] += 1;
    }
    for (const [word, { use, rate }] of Object.entries(MEASURE_FIRST)) {
      const measured = counts[word] / PROSE_SEEDS.length;
      // The fixture is fixed, so the recorded rate is exact, not a band.
      expect(Math.abs(measured - rate), `${word}: ${measured}`).toBeLessThan(0.0005);
      // The band rule that placed each word: 2%–60% speaks in prose, under
      // 2% is embedding-tail only, over 60% would say nothing and stay silent.
      const expectedUse = measured >= 0.02 && measured <= 0.6 ? "prose" : measured < 0.02 ? "embed" : "silent";
      expect(use, word).toBe(expectedUse);
    }
  });
});

describe("corpus acceptance (the templated-page test)", () => {
  it("never repeats a paragraph across distinct palettes", () => {
    // Two seed PAIRS in the live sitemap are the same palette twice — applied
    // coefficients differing by ≤ 4e-4 (globals-baking float residue below
    // the 3-decimal quantum), byte-identical at 7 steps. A deterministic
    // generator must describe the same palette the same way, so collisions
    // are asserted to occur ONLY between identical renders, and only those
    // two known pairs exist.
    const byParagraph = new Map();
    let collisions = 0;
    for (const seed of PROSE_SEEDS) {
      const { view, prose } = caseFor(seed);
      const prev = byParagraph.get(prose.paragraph);
      if (prev) {
        collisions++;
        expect(prev.hexColors, `${prev.seed} vs ${seed}`).toEqual(view.hexColors);
      } else {
        byParagraph.set(prose.paragraph, { seed, hexColors: view.hexColors });
      }
    }
    expect(collisions).toBeLessThanOrEqual(2);
  });

  it("varies the skeleton, not just the fill", () => {
    // Strip everything palette-specific — digits, hexes, the palette's own
    // color names, the family words — and count what remains. Measured: 836
    // distinct skeletons over the 867 seeds; 50 is the acceptance floor at
    // which the corpus stops reading as one fill-in-the-blanks template.
    const familyWords = [...new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)))];
    const skeletons = new Set();
    for (const seed of PROSE_SEEDS) {
      const { prose, named } = caseFor(seed);
      let s = stripHex(prose.paragraph).replace(/\d+(\.\d+)?/g, "#");
      for (const name of [...named.colorNames].sort((a, b) => b.length - a.length))
        s = s.split(name).join("~");
      for (const w of familyWords) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), "~");
      skeletons.add(s);
    }
    expect(skeletons.size).toBeGreaterThanOrEqual(50);
  });

  it("keeps pairwise word-trigram overlap low", () => {
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
    const sets = new Map();
    const setFor = (seed) => {
      let s = sets.get(seed);
      if (!s) {
        s = trigrams(caseFor(seed).prose.paragraph);
        sets.set(seed, s);
      }
      return s;
    };
    let sum = 0;
    let max = 0;
    const PAIRS = 200;
    for (let i = 0; i < PAIRS; i++) {
      const a = PROSE_SEEDS[Math.floor(rand() * PROSE_SEEDS.length)];
      let b = PROSE_SEEDS[Math.floor(rand() * PROSE_SEEDS.length)];
      if (a === b) b = PROSE_SEEDS[(PROSE_SEEDS.indexOf(a) + 1) % PROSE_SEEDS.length];
      const j = jaccard(setFor(a), setFor(b));
      sum += j;
      max = Math.max(max, j);
    }
    // Measured over this sampling: mean 0.21, max 0.43.
    expect(sum / PAIRS).toBeLessThan(0.35);
    expect(max).toBeLessThan(0.8);
  });

  it("carries the demand phrase in every R1", () => {
    for (const seed of PROSE_SEEDS) {
      const { prose } = caseFor(seed);
      expect(prose.identity).toContain("gradient color palette");
      expect(prose.paragraph).toContain("gradient color palette");
    }
  });
});

describe("relatedSearches", () => {
  it("returns deterministic, bounded, deduped labels from the bounded vocabularies", () => {
    const familyWords = new Set(Array.from({ length: 360 }, (_, h) => familyWord(h)));
    const spokenWords = new Set(DESCRIPTORS.filter((d) => d.spoken).map((d) => spokenWord(d)));
    for (const seed of PROSE_SEEDS) {
      const { features, named } = caseFor(seed);
      const tags = modifierTags(features);
      const labels = relatedSearches(features, named, tags);
      expect(labels).toEqual(relatedSearches(features, named, tags));
      expect(labels.length).toBeGreaterThanOrEqual(1);
      expect(labels.length).toBeLessThanOrEqual(6);
      const lower = labels.map((l) => l.toLowerCase());
      expect(new Set(lower).size).toBe(labels.length);
      for (const label of labels) {
        const ok =
          named.colorNames.includes(label) ||
          spokenWords.has(label) ||
          familyWords.has(label);
        expect(ok, `${seed}: "${label}" outside the bounded vocabularies`).toBe(true);
      }
      // Ramp order first: the leading labels are the color names themselves.
      expect(labels[0]).toBe(named.colorNames[0]);
    }
  });

  it("slugs every possible label exactly as querySlug does", () => {
    // The island links the chips with relatedSearchSlug (it cannot import
    // semantic-search — Env-typed search client vs the islands typecheck), so
    // the two rules must agree over the ENTIRE bounded label vocabulary:
    // corpus color names ∪ registry spoken words ∪ the family anchors. This
    // also proves no label decodes as a seed (querySlug's other branch).
    const labels = new Set([
      ...NAMED_COLORS.map((c) => c.name),
      ...DESCRIPTORS.filter((d) => d.spoken).map((d) => spokenWord(d)),
      ...Array.from({ length: 360 }, (_, h) => familyWord(h)),
    ]);
    expect(labels.size).toBeGreaterThan(900);
    for (const label of labels) {
      expect(relatedSearchSlug(label), label).toBe(querySlug(label));
    }
  });
});

describe("describePalette (the canonical triple)", () => {
  it("returns a non-empty, consistent triple for every fixture seed", () => {
    for (const seed of PROSE_SEEDS.filter((_, i) => i % 9 === 0)) {
      const { view, features, named, prose } = caseFor(seed);
      const d = describePalette(view.appliedCoeffs, view.hexColors, VIEW, { features, named });
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
      expect(d.title).toBe(named.name);
      expect(d.description).toBe(prose.paragraph);
      expect(d.tags).toEqual(relatedSearches(features, named, modifierTags(features)));
    }
  });

  it("names, describes and tags from exactly one analysis pass", () => {
    const { view, named } = caseFor(PROSE_SEEDS[0]);
    analysisCalls.n = 0;
    const d = describePalette(view.appliedCoeffs, view.hexColors, VIEW);
    // One dense sample fed the name, the prose AND the related labels.
    expect(analysisCalls.n).toBe(1);
    expect(d.title).toBe(named.name);
  });
});
