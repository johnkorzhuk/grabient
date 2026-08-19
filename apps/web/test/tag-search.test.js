import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import {
  applyTagFilter,
  recognizeTagQuery,
  tagQueryMatch,
  COLOR_MATCH_MAX,
  TAG_FILTER_VERSION,
} from "../src/tag-search";
import { hexToOkLch, hexToRgb, oklabDistance, rgbToOklab } from "@repo/data-ops/color-utils";
import { paletteFeatures } from "@repo/data-ops/gradient-gen/palette-modifiers";
import {
  CHARACTERISTICS,
  characteristicCtx,
} from "@repo/data-ops/gradient-gen/palette-characteristics";
import { analyzeCoefficients, tagsToArray } from "@repo/data-ops/gradient-gen/palette-tags";
import { renderPalette } from "../src/palette";
import { gatedFamily } from "../src/palette-prose";

const labOf = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
};
import { TAG_OVERFETCH_TOPK } from "../src/semantic-search";
import { getUniqueColorNames } from "@repo/data-ops/color-utils";
import { PROSE_SEEDS } from "./prose-corpus.js";

// Fixture seeds, classified by the same registry the chips come from (picked
// with a scratch pass over the 867-seed prose corpus, printed tags beside each).
const MUTED_DUOTONE = "_gJ0gHlgDgf7Cf7YgHyf5kf7zgCwgVgf3ifxH"; // duotone, cool, muted
const MUTED_DUOTONE_2 = "_gLngJLgKcf89gBkgCEf2-f8Nf65gBzgDFf_W"; // duotone, muted, high-key
const MUTED_MONOCHROME = "_gMmgLvgL-gGNgGGgF6gBngCegClhCZhCPhCp"; // monochrome, earthy, muted
const RAINBOW = "_gH_gHZgFPgHQgFRgDygMGgMZgK_gHSgIIgp7dW33xcgA"; // rainbow, warm, high-contrast
const GRAYSCALE = "_gA1gAwgBYgCVgCdgCOgDcgDUgDdg6Bg6Lg5t"; // grayscale, dark
const BLUE_PALETTE = "_gLqgLqgPhf83gBkf-cf5cf5Wf4wgA3gDPf8O"; // 5 of 7 stops in the blue band
const NO_BLUE_PASTEL = "_gIagJDgH1fragFzf8wgDFgDZgFrgp7gAAgguk7kt2RYD"; // sunset, pastel, no blue
const CORAL_NEAR = "_gIagJDgH1fragFzf8wgDGgDagFtgh-f4DgYx"; // 0.0060 from corpus coral
const CORAL_FAR = "_gCZgC4gCsgCfgEggDUgIngMJgKogEYgEYgEYdbn-tEgA"; // 0.5344 from corpus coral

const results = (...seeds) => seeds.map((seed) => ({ seed, steps: 7 }));

/** The same facts `applyTagFilter` computes, for asserting on one result. */
const factsFor = (seed) => {
  const view = renderPalette(seed, "linearGradient", 7, 90);
  const features = paletteFeatures(view.appliedCoeffs, view.hexColors);
  const { journey } = analyzeCoefficients(view.appliedCoeffs);
  const ctx = characteristicCtx(features, view.hexColors, {
    journey: journey === "warming" || journey === "cooling" ? journey : null,
  });
  return {
    labs: view.hexColors.map(labOf),
    hexColors: view.hexColors,
    features,
    ctx,
    families: view.hexColors.map((hex) => gatedFamily(hexToOkLch(hex))),
  };
};
const seedsOf = (list) => list.map((r) => r.seed);

describe("tag query recognition", () => {
  it("recognizes the chip vocabulary and nothing else", () => {
    const compound = recognizeTagQuery("muted duotone");
    expect(compound.terms.map((t) => `${t.kind}:${t.label}`)).toEqual([
      "characteristic:muted",
      "characteristic:duotone",
    ]);
    expect(compound.needsFeatures).toBe(true);
    // A compound searches its own text, then each half, then what the halves
    // imply — `duotone` shadows `hue contrast` in the registry. See
    // TAG_OVERFETCH_TOPK for why the pool has to grow sideways, not deeper.
    expect(compound.expansions).toEqual(["muted", "duotone", "hue contrast"]);

    // A single registry word expands to what the registry says it implies, and
    // only that: `sunset` implies `warm`, which the OLD indexed vocabulary
    // actually contains.
    expect(recognizeTagQuery("sunset").expansions).toEqual(["warm"]);
    expect(recognizeTagQuery("monochrome").expansions).toEqual([]);

    // Hyphenated registry words survive the route's hyphen-as-space rule.
    expect(recognizeTagQuery("high contrast").terms.map((t) => `${t.kind}:${t.label}`)).toEqual([
      "characteristic:high-contrast",
    ]);
    // ...and every one of the 133 registry terms resolves to the closure that
    // decides it, multi-word and hyphenated terms included (D25.6). The eleven
    // family words resolve one branch down, where the same predicate is graded
    // by share instead of by the margin — see "the family branch is the
    // registry's family predicate" below.
    for (const c of CHARACTERISTICS) {
      const q = recognizeTagQuery(c.term);
      expect(q, c.term).toBeTruthy();
      expect(q.terms.length, c.term).toBe(1);
      const term = q.terms[0];
      if (term.kind === "family") expect(term.label, c.term).toBe(c.term);
      else expect(term.terms.map((x) => x.term), c.term).toContain(c.term);
    }

    // A bare family word is the family band, not the corpus entry of the same
    // name: nothing in a navy-to-sky ramp sits within one JND of #0000ff.
    expect(recognizeTagQuery("blue").terms[0].kind).toBe("family");
    expect(recognizeTagQuery("marine blue").terms[0]).toMatchObject({ kind: "color" });
    // A word that is BOTH a registry term and a corpus name carries both
    // readings, and a palette satisfies it under either (D25.6).
    const navy = recognizeTagQuery("navy").terms[0];
    expect(navy.kind).toBe("characteristic");
    expect(navy.terms.map((c) => c.term)).toEqual(["navy"]);
    expect(navy.color).toBeTruthy();
    expect(recognizeTagQuery("deep sky blue").terms[0].label).toBe("deep sky blue");
    expect(recognizeTagQuery("Pastel  Rainbow").terms.map((t) => t.label)).toEqual([
      "pastel",
      "rainbow",
    ]);

    // THE JOURNEY AND LIST FORMS (D23.1), which the chip row emits and which
    // this used to refuse. `to` is stepped over rather than resolved — a
    // gradient from grey to white holds the same two colours as one from white
    // to grey — and the terms on either side do the filtering.
    expect(recognizeTagQuery("cream to fire brick").terms.map((t) => t.label)).toEqual([
      "cream",
      "fire brick",
    ]);
    expect(recognizeTagQuery("salmon teal turquoise").terms.map((t) => t.label)).toEqual([
      "salmon",
      "teal",
      "turquoise",
    ]);
    // Two colour terms were null until QA round 3, on a measurement taken
    // against an AND-only filter ("single-digit result counts"). The filter has
    // ranked by PARTIAL CREDIT since round 2 and never removes a result, so a
    // palette holding one of two named colours sits above one holding neither
    // and the page fills from the ranked backfill.
    expect(recognizeTagQuery("teal navy").terms.map((t) => t.label)).toEqual([
      "teal",
      "navy",
    ]);

    // Not our vocabulary: free text, a list longer than the grammar, a bare
    // join, three dimension words.
    expect(recognizeTagQuery("buy cheap viagra")).toBeNull();
    expect(recognizeTagQuery("cyan rose teal navy")).toBeNull();
    expect(recognizeTagQuery("to")).toBeNull();
    expect(recognizeTagQuery("teal to")).toBeNull();
    expect(recognizeTagQuery("pastel muted rainbow")).toBeNull();
    expect(recognizeTagQuery("")).toBeNull();
  });
});

describe("tag filter", () => {
  it("puts only palettes that satisfy the dimension in front, both parts of a compound", () => {
    const query = recognizeTagQuery("muted duotone");
    const input = results(NO_BLUE_PASTEL, MUTED_DUOTONE, RAINBOW, MUTED_DUOTONE_2, GRAYSCALE);
    const filtered = applyTagFilter(query, input, 48);

    // The two muted duotones lead, in the order the index returned them.
    expect(seedsOf(filtered).slice(0, 2)).toEqual([MUTED_DUOTONE, MUTED_DUOTONE_2]);
    // ...and only they: a muted monochrome satisfies one half and is not enough.
    expect(seedsOf(applyTagFilter(query, results(MUTED_MONOCHROME, MUTED_DUOTONE), 48))).toEqual([
      MUTED_DUOTONE,
      MUTED_MONOCHROME,
    ]);
  });

  it("backfills instead of shrinking when the filter is too strict", () => {
    const query = recognizeTagQuery("grayscale");
    const input = results(NO_BLUE_PASTEL, MUTED_DUOTONE, RAINBOW);
    const filtered = applyTagFilter(query, input, 48);

    // Nothing satisfies, so the page is exactly the semantic page it was: same
    // results, same order, same count. A strict filter can never 404 a page.
    expect(seedsOf(filtered)).toEqual(seedsOf(input));

    // One match: it leads, the rest keep their order behind it.
    expect(seedsOf(applyTagFilter(query, results(RAINBOW, GRAYSCALE, MUTED_DUOTONE), 48))).toEqual([
      GRAYSCALE,
      RAINBOW,
      MUTED_DUOTONE,
    ]);

    // An undecodable seed is a backfill case too, never a thrown request.
    expect(seedsOf(applyTagFilter(query, results("not-a-seed", GRAYSCALE), 48))).toEqual([
      GRAYSCALE,
      "not-a-seed",
    ]);
  });

  it("ranks a colour chip by OkLab proximity and a family chip by share", () => {
    const coral = recognizeTagQuery("coral");
    // `coral` is a registry hue name AND a corpus entry, so it ranks by the
    // nearer of the two readings; the corpus one is what separates these two.
    expect(coral.terms[0].color).toBeTruthy();
    expect(seedsOf(applyTagFilter(coral, results(CORAL_FAR, CORAL_NEAR), 48))).toEqual([
      CORAL_NEAR,
      CORAL_FAR,
    ]);
    // CORAL_FAR is half the solid away (0.53), so it never counts as coral: it
    // is here only because backfill keeps it, behind everything that matches.
    expect(COLOR_MATCH_MAX).toBeLessThan(0.53);

    const blue = recognizeTagQuery("blue");
    expect(seedsOf(applyTagFilter(blue, results(NO_BLUE_PASTEL, BLUE_PALETTE), 48))).toEqual([
      BLUE_PALETTE,
      NO_BLUE_PASTEL,
    ]);
  });

  it("never drops results and honours the limit", () => {
    const query = recognizeTagQuery("muted duotone");
    const input = results(NO_BLUE_PASTEL, MUTED_DUOTONE, RAINBOW, MUTED_DUOTONE_2);
    expect(applyTagFilter(query, input, 48)).toHaveLength(input.length);
    expect(new Set(seedsOf(applyTagFilter(query, input, 48)))).toEqual(new Set(seedsOf(input)));
    expect(applyTagFilter(query, input, 2)).toHaveLength(2);
  });
});

function tagEnv() {
  const puts = [];
  return {
    puts,
    DB: {},
    PUBLIC_ORIGIN: "https://grabient-lite.jkorzhuk.workers.dev",
    AI: {
      // One embedding per text in the batch, which is how Workers AI answers.
      run: vi.fn(async (_model, { text }) => ({ data: text.map((_, i) => [0.1, i]) })),
    },
    VECTORIZE: {
      query: vi.fn(async () => ({
        matches: [MUTED_DUOTONE, RAINBOW].map((seed, i) => ({
          score: 0.9 - i / 100,
          metadata: {
            seed,
            tags: ["muted"],
            style: "linearGradient",
            steps: 7,
            angle: 135,
            likesCount: 3 - i,
            createdAt: 1_700_000_000_000,
          },
        })),
      })),
    },
    SEARCH_CACHE: {
      get: vi.fn(async () => null),
      put: vi.fn(async (key, value) => puts.push([key, value])),
    },
  };
}

describe("the colour class guard (D22 QA)", () => {
  const factsOf = (hexes) => ({ labs: hexes.map(labOf), hexColors: hexes, tags: null, families: null });

  it("keeps a neutral name off tinted stops and a coloured name out of another family", () => {
    // THE REPORTED DEFECT. A `silver` chip passed its precision test at 100% and
    // the test meant nothing: only 4 of 24 results had a stop a person would
    // call neutral, and the other 20 matched on warm taupe (#ccbeb2), sage
    // (#bdc7ba) and lilac (#bfc0e0) — hues 5 to 284, all within OkLab 0.08 of
    // #c0c0c0 because at L 0.81 the sRGB ceiling is 0.05 to 0.10 and the ball
    // encloses the whole low-chroma neighbourhood.
    const silver = recognizeTagQuery("silver");
    expect(silver.terms[0].family).toBe("neutral");
    // Reported hexes, all inside COLOR_MATCH_MAX of #c0c0c0 and none of them
    // silver: a lilac, a sage and a blue-gray that clear the saturation floor
    // for their own lightness and so are colours, not neutrals.
    for (const hex of ["#bfc0e0", "#b9c3ac", "#bdc7de"]) {
      expect(oklabDistance(labOf(hex), silver.terms[0].lab)).toBeLessThan(COLOR_MATCH_MAX);
      expect(tagQueryMatch(silver, factsOf([hex])).ok).toBe(false);
    }
    // ...and a stop that IS a light neutral still answers. The warm taupes in
    // the same report (#ccbeb2 at chroma 0.023, 23% of its own ceiling) still
    // answer too, and should: by every reading this system has they are light
    // warm grays. The pool the guard removes is the SATURATED half of that
    // neighbourhood — measured on the 867-seed stand-in, `silver` goes from 207
    // palettes to 81.
    expect(tagQueryMatch(silver, factsOf(["#c7c9d8"])).ok).toBe(true);
    expect(tagQueryMatch(silver, factsOf(["#ccbeb2"])).ok).toBe(true);

    // The other direction, and the reported case for it: `dark forest green`
    // has a green anchor, the stop it was naming sits at hue 199, and the page
    // that chip led to was a ramp of pure greens with no teal in it.
    const green = recognizeTagQuery("dark forest green");
    expect(green.terms[0].family).toBe("green");
    expect(oklabDistance(labOf("#002d2f"), green.terms[0].lab)).toBeLessThan(COLOR_MATCH_MAX);
    expect(tagQueryMatch(green, factsOf(["#002d2f"])).ok).toBe(false);
    expect(tagQueryMatch(green, factsOf(["#003716"])).ok).toBe(true);
  });

  it("ranks by the proximity of the stop that answers to the word", () => {
    // Not by the nearest stop outright, which can be a stop the guard rejected,
    // and not by SHARE: ranking by share was measured over 98 colour chips
    // against the 867-seed stand-in and lost on both axes at once (mutual-chip
    // reciprocity 28.5% -> 21.7%, emitter-on-page-1 80.6% -> 65.3%), because a
    // colour chip usually names ONE of a palette's several colours and share
    // hands page 1 to monochromes. Re-measured in QA round 2 with the share
    // used only as a tie-break INSIDE a JND bucket of the distance, which is
    // the version that should have been free: it loses too, on both axes, at
    // every bucket width (mutual-chip@24 15.2% -> 14.8/14.4/14.0% and
    // emitter-on-page-1 94.6% -> 93.4/92.8/92.2% at 0.01/0.02/0.03), for
    // +0.010/+0.020/+0.027 of mean share@24. See termMatch.
    const coral = recognizeTagQuery("coral");
    expect(seedsOf(applyTagFilter(coral, results(CORAL_FAR, CORAL_NEAR), 2))).toEqual([
      CORAL_NEAR,
      CORAL_FAR,
    ]);
  });

  it("gives a compound's halves partial credit, and ranks the backfill (QA round 2)", () => {
    // THE REPORTED DEFECT. `earthy sunset` is satisfied by 3 palettes in a
    // 200-deep stand-in pool, so 9 of the 12 page-1 slots came from the raw
    // semantic order and page 1 held a neon yellow-to-hot-pink ramp at rank 4.
    // An AND filter cannot tell a palette that is earthy but not sunset from
    // one that is neither.
    const compound = recognizeTagQuery("earthy sunset");
    // MUTED_MONOCHROME is earthy+muted+monochrome (not sunset); RAINBOW is
    // neither. Both parts > one part > none, whatever order they arrive in.
    expect(
      seedsOf(applyTagFilter(compound, results(RAINBOW, MUTED_MONOCHROME), 2)),
    ).toEqual([MUTED_MONOCHROME, RAINBOW]);
    expect(tagQueryMatch(compound, factsFor(MUTED_MONOCHROME)).hits).toBe(1);
    expect(tagQueryMatch(compound, factsFor(MUTED_MONOCHROME)).ok).toBe(false);

    // ...and the palettes that satisfy NOTHING are ranked too, when the term
    // grades them. A colour term grades every palette, so on a chip whose page
    // is mostly backfill the backfill opens on the near misses rather than on
    // whatever the index happened to return: CORAL_NEAR is 0.006 from the
    // corpus coral and CORAL_FAR is 0.534, and neither satisfies `dark forest
    // green` — but one of them is much closer to it.
    const green = recognizeTagQuery("dark forest green");
    const page = seedsOf(applyTagFilter(green, results(CORAL_FAR, CORAL_NEAR), 2));
    expect(page).toHaveLength(2);
    expect(tagQueryMatch(green, factsFor(page[0])).distance).toBeLessThan(
      tagQueryMatch(green, factsFor(page[1])).distance,
    );

    // A REGISTRY TERM grades by its own margin and nothing finer, so the
    // palettes that do not satisfy it at all keep the order they arrived in —
    // the degradation D22.B5 asks for, unchanged where there is nothing left to
    // rank by.
    const mono = recognizeTagQuery("monochrome");
    expect(seedsOf(applyTagFilter(mono, results(RAINBOW, GRAYSCALE, MUTED_MONOCHROME), 3))).toEqual([
      MUTED_MONOCHROME,
      RAINBOW,
      GRAYSCALE,
    ]);
  });
});

describe("the registry as the filter's vocabulary (D25.6)", () => {
  // The fixture, classified once — the same corpus the chips were measured over
  // and the stand-in for the live index below.
  const corpus = PROSE_SEEDS.map((seed) => {
    const view = renderPalette(seed, "linearGradient", 7, 90);
    const features = paletteFeatures(view.appliedCoeffs, view.hexColors);
    const base = tagsToArray(analyzeCoefficients(view.appliedCoeffs));
    const journey = base.includes("warming")
      ? "warming"
      : base.includes("cooling")
        ? "cooling"
        : null;
    const ctx = characteristicCtx(features, view.hexColors, { journey });
    return {
      seed,
      steps: 7,
      facts: {
        labs: view.hexColors.map(labOf),
        hexColors: view.hexColors,
        features,
        ctx,
        families: [...ctx.families],
      },
      // The document the LIVE index was embedded from: the stored coefficient
      // vocabulary plus the corpus colour names (see normalizeSemanticQuery's
      // seed branch). Vectorize cannot be called from a test, so the pool is
      // reconstructed lexically from the same text — a stand-in that reproduces
      // the defect under test, since a word the index never saw carries no
      // signal in it either.
      doc: [...base, ...getUniqueColorNames([...view.hexColors], { max: 6 })].join(" "),
    };
  });

  it("filters every term by the registry's own closure, family words included", { timeout: 60000 }, () => {
    for (const c of CHARACTERISTICS) {
      const query = recognizeTagQuery(c.term);
      expect(query, c.term).toBeTruthy();
      for (const palette of corpus) {
        const decided = c.test(palette.facts.features, palette.facts.ctx);
        const filtered = tagQueryMatch(query, palette.facts).ok;
        // The eleven family words resolve to the family branch, whose `ok` is
        // `hits > 0` over the same `gatedFamily` reading — the registry's own
        // family predicate with a share for a rank key. Everything else is the
        // closure itself. Either way the two answers have to be the same one,
        // or a chip and its page disagree about what the word means.
        //
        // A term that is ALSO a corpus colour name is the one deliberate
        // widening: `navy` retrieves the palettes that hold a navy stop as well
        // as the ones a quarter of which is navy, so `filtered` may be true
        // where `decided` is false. Never the other way round.
        expect(filtered || !decided, `${c.term}: ${palette.seed}`).toBe(true);
      }
    }
  });

  it("records precision@24 per term family, and the pool it is bounded by", { timeout: 120000 }, () => {
    const PAGE = 24;
    const trigrams = (text) => {
      const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
      const set = new Map();
      for (let i = 0; i + 3 <= t.length; i++)
        set.set(t.slice(i, i + 3), (set.get(t.slice(i, i + 3)) ?? 0) + 1);
      return set;
    };
    const cosine = (a, b) => {
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (const [k, v] of a) {
        na += v * v;
        const w = b.get(k);
        if (w) dot += v * w;
      }
      for (const v of b.values()) nb += v * v;
      return na && nb ? dot / Math.sqrt(na * nb) : 0;
    };
    const docs = corpus.map((c) => trigrams(c.doc));
    const poolFor = (text) => {
      const q = trigrams(text);
      return corpus
        .map((c, i) => ({ i, s: cosine(q, docs[i]) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, TAG_OVERFETCH_TOPK)
        .map((x) => corpus[x.i]);
    };
    const bySeed = new Map(corpus.map((c) => [c.seed, c]));
    const measure = (label) => {
      const query = recognizeTagQuery(label);
      const seen = new Set();
      const pool = [];
      for (const text of [label, ...query.expansions])
        for (const c of poolFor(text))
          if (!seen.has(c.seed)) {
            seen.add(c.seed);
            pool.push(c);
          }
      const sat = (c) => tagQueryMatch(query, c.facts).ok;
      const before = poolFor(label).slice(0, PAGE).filter(sat).length / PAGE;
      const after =
        applyTagFilter(query, pool.map((c) => ({ seed: c.seed, steps: 7 })), PAGE)
          .filter((r) => sat(bySeed.get(r.seed))).length / PAGE;
      return {
        support: corpus.filter(sat).length,
        before,
        after,
        // What the pool ALLOWS: the filter cannot rank a palette it never saw.
        ceiling: Math.min(1, pool.filter(sat).length / PAGE),
      };
    };

    const rows = CHARACTERISTICS.map((c) => ({ term: c.term, tagOnly: !!c.tagOnly, ...measure(c.term) }));
    // TWO PROPERTIES, and they are the point of the measurement rather than the
    // numbers, which move with the corpus:
    //
    //  - MONOTONE. Filtering never makes a page worse than the raw semantic
    //    order, on any of the 133 terms.
    //  - POOL-BOUND, NOT FILTER-BOUND. `after` equals the ceiling on every one
    //    of them: every satisfying palette the pool holds reaches page 1, so
    //    what is left to win is pool composition — the reindex D7 gates, whose
    //    text now literally contains these words (see composeEmbedText).
    for (const r of rows) {
      expect(r.after, r.term).toBeGreaterThanOrEqual(r.before);
      expect(r.after, r.term).toBeCloseTo(r.ceiling, 10);
    }
    // ...and the terms with no support in this corpus are the rare harmonies,
    // which is D25.4's "absent, not broken": a chip for one can only be emitted
    // by a palette that satisfies it, so its page is never empty of the palette
    // that linked to it. Two of the five left the list in QA round 4, which
    // gave the schemes a second route: `triadic` and `tetradic` now have one
    // supporting palette each, read off the RENDERED stops of a sweep whose
    // dense sample fills every gap (see stopHueGroups). QA round 5 put
    // `tetradic` back on the list — a group must now be at least two swatches,
    // and its two witnesses were four "hue masses" of a continuous sweep, two
    // of them one swatch each (see SCHEME_GROUP_STOPS).
    expect(rows.filter((r) => r.support === 0).map((r) => r.term)).toEqual([
      "split complementary",
      "square",
      "tetradic",
      "discord",
    ]);
    expect(rows.find((r) => r.term === "triadic").support).toBe(1);
    // Mean precision@24 over all 134 terms, before and after the filter.
    // Measured 2026-08-19 (QA round 5, one term added and several predicates
    // tightened): 0.346 -> 0.575 against the OLD indexed vocabulary,
    // which is the ceiling this stand-in allows. Re-measured against the NEW
    // embed text — the document the pending reindex will hold, whose Tags line
    // now carries every firing registry term — the same 133 terms go 0.764 ->
    // 0.870, which is the pool bound moving rather than the filter improving.
    // The per-family table is in the package report; what the suite holds is
    // the aggregate and the two properties above.
    const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    expect(mean((r) => r.before)).toBeCloseTo(0.346, 2);
    // 0.571 before QA round 4. The gain is the round's predicate fixes paying
    // off at the destination: a term that stopped being true of palettes it did
    // not describe (`near-white` on a pale lime, `fade to white` on a cream,
    // `arch` on a valley) has a page that holds fewer of them too.
    expect(mean((r) => r.after)).toBeCloseTo(0.578, 2);
  });
});

describe("the tag route", () => {
  it("over-fetches, filters, and caches under a key that carries the filter version", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = tagEnv();
    const response = await app.request("http://local.test/palettes/muted-duotone", {}, env);
    expect(response.status).toBe(200);

    // Four query vectors from one embedding call: the compound, its halves and
    // the one word those halves imply.
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect(env.AI.run.mock.calls[0][1].text).toEqual([
      "muted duotone",
      "muted",
      "duotone",
      "hue contrast",
    ]);
    expect(env.VECTORIZE.query).toHaveBeenCalledTimes(4);
    for (const call of env.VECTORIZE.query.mock.calls)
      expect(call[1]).toMatchObject({ topK: TAG_OVERFETCH_TOPK, returnMetadata: "all" });

    // The filtered answer is what gets cached, so a hit skips the classify —
    // and it cannot be served out of the plain semantic key.
    expect(env.puts).toHaveLength(1);
    expect(env.puts[0][0]).toBe(`tagsearch:v${TAG_FILTER_VERSION}:${TAG_OVERFETCH_TOPK}:muted duotone:48`);
    expect(JSON.parse(env.puts[0][1])[0].seed).toBe(MUTED_DUOTONE);

    const html = await response.text();
    expect(html).toContain(`href="/${MUTED_DUOTONE}`);
    // Backfill: the rainbow does not satisfy the chip and still renders, so the
    // result count and the page count are what they were.
    expect(html).toContain(`href="/${RAINBOW}`);
    warn.mockRestore();
  });

  it("leaves a query that is not our vocabulary on the old path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = tagEnv();
    const response = await app.request("http://local.test/palettes/moody-nordic-fjord", {}, env);
    expect(response.status).toBe(200);
    expect(env.AI.run.mock.calls[0][1].text).toEqual(["moody nordic fjord"]);
    expect(env.VECTORIZE.query).toHaveBeenCalledTimes(1);
    expect(env.puts[0][0]).toBe("search:moody nordic fjord:48");
    warn.mockRestore();
  });
});
