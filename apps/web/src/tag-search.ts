// Serve-time retrieval filter for the tag chips (D22.B5).
//
// THE PROBLEM. `/palettes/{tag}` is pure semantic search, and the live
// Vectorize index was embedded from the OLD palette-tags vocabulary
// (dominantColor / texture / warmth / journey / contrast — see
// packages/data-ops/src/gradient-gen/palette-tags.ts). Nothing in it has ever
// seen the word `duotone`, `muted`, `earthy` or `monochrome`, so a chip
// reading "muted duotone" links to whatever those two words happen to embed
// near, with no guarantee that a single result IS a muted duotone. The chips
// are now the page's navigation surface, so that guarantee is the product.
//
// THE FIX, WITHOUT A REINDEX. A reindex is not available to us, but the answer
// is computable at serve time: the Vectorize metadata carries `seed`, and a
// seed is the whole palette. So when the query IS one of our vocabulary tags
// we OVER-FETCH, decode each returned seed, run the SAME classifier that
// produced the chip (`paletteFeatures` + the registry's own descriptor tests,
// or the corpus colour distance), and rank the palettes that genuinely satisfy
// the clicked dimension above the ones that do not.
//
// THE VOCABULARY IS NOT RESTATED HERE. Every recognizable term comes from the
// characteristic registry (`CHARACTERISTICS`, 133 terms), the family-word
// partition (`FAMILY_VOCABULARY`) or the colour corpus (`matchColorName`) — the
// same three sources `relatedSearches` draws chip labels from. A word can
// therefore never be filterable-but-unchippable or the reverse, which is the
// only way a chip and its destination can be kept honest as the vocabulary
// grows.
//
// AND IT IS THE SAME CLOSURE, not the same word (D25.6). A registry term
// filters by `Characteristic.test` — the very function that decided the chip —
// so `/palettes/complementary` cannot mean something narrower or wider than the
// chip did. It also ranks by `Characteristic.strong`, the margin the chip was
// gated on, so a term's page opens on the palettes the word is most obviously
// true of. Terms the row never prints (`tagOnly`: the coefficient facts, the
// residual classes, the arc language) are filterable all the same: they are
// reachable by URL and by the sitemap, and a page that renders has to be a page
// that filters.
//
// WHAT THIS FILE DOES NOT DO. It never removes results and never shrinks the
// result count: the page's totals and its pagination are exactly what they
// were, and a page that used to render still renders (see `applyTagFilter`).
// Ranking is the whole mechanism.

import {
  colorFamilies,
  colorNameToHex,
  hexToOkLch,
  hexToRgb,
  matchColorName,
  NAMED_COLORS,
  oklabDistance,
  rgbToOklab,
  type Oklab,
} from "@repo/data-ops/color-utils";
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
  type CosineCoeffs,
} from "@repo/data-ops/gradient-gen/cosine";
import {
  DESCRIPTORS,
  paletteFeatures,
  spokenWord,
  stopHasHue,
  type PaletteFeatures,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import {
  CHARACTERISTIC_BY_TERM,
  CHARACTERISTICS,
  characteristicCtx,
  type Characteristic,
  type CharacteristicCtx,
} from "@repo/data-ops/gradient-gen/palette-characteristics";
import { analyzeCoefficients } from "@repo/data-ops/gradient-gen/palette-tags";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { DEFAULT_STEPS } from "@repo/data-ops/valibot-schema/grabient";
import {
  chipWord,
  COLOR_MATCH_MAX,
  FAMILY_VOCABULARY,
  gatedFamily,
  stopInClass,
} from "./palette-prose";

/**
 * Re-exported: the radius is defined beside the chip rules it constrains (see
 * palette-prose), and every consumer of this file asks for it here.
 */
export { COLOR_MATCH_MAX };

/**
 * The class a corpus entry speaks for, for the term's category guard, and the
 * word for "no colour of its own".
 *
 * The radius COLOR_MATCH_MAX and the class test `stopInClass` both live in
 * palette-prose beside the chip rules that are calibrated against them: the
 * chip row refuses a label whose anchor sits farther than this radius from the
 * stop it names, and refuses two labels whose anchors sit within
 * CHIP_SEPARATION of each other, so the emitter and this filter have to be
 * reading one number. See CHIP_SEPARATION for the measurement.
 */
const NEUTRAL = "neutral";
const CORPUS_FAMILY = new Map(NAMED_COLORS.map((c) => [c.name, c.family] as const));

/**
 * How many decoded palettes one request may classify. Past it the tail keeps
 * its semantic order, unranked.
 *
 * 200 is the widest pool the over-fetch can produce — (1 + MAX_EXPANSIONS)
 * query vectors at TAG_OVERFETCH_TOPK each — so today it never truncates
 * anything; it is the guard that keeps a future wider pool from turning into
 * an unbounded request. Raising it from 120 was worth 1.8 points of
 * precision@24 on compound chips (22.9% -> 24.7%) for 11ms of worst-case CPU.
 *
 * The split is not a guess about cost, it is the cost. Measured over this
 * repo's fixture (median of 5, vitest, this machine): decoding a seed and
 * rendering its stops is 13us, one OkLab pass over 7 stops is 4us, and
 * `paletteFeatures` is 193us on its own — it takes a 48-sample dense pass with
 * a gamut bisection per sample, and `modifierTags` on top of it is 2us. End to
 * end through `applyTagFilter`, re-measured 2026-08-18 after the class guard
 * below joined the colour branch: 18-28us per candidate for a colour chip,
 * 23us for a family chip, 154us for anything that needs the features. A factor
 * of six, which is why `needsFeatures` exists at all.
 *
 * So a full 200-candidate pool costs single-digit milliseconds for a colour or
 * family chip and about 30ms for a tone, structure or compound chip, on a cache
 * MISS only: what SEARCH_CACHE stores is the finished filtered page (see
 * `searchPalettesForQuery`), so a hit pays none of it. Measured directly over
 * this repo's fixture, median of 9 over a 200-deep pool: 7.8ms for
 * "marine blue", 8.6ms for "silver", 5.9ms for "blue", 39.8ms for
 * "monochrome", 30.8ms for "muted duotone", 33.2ms for "earthy sunset".
 *
 * QA round 2 added partial credit and a ranked backfill and changed none of
 * this: the same candidates are decoded and classified either way, and what
 * changed is the comparator the finished list is sorted by. The spread between
 * those numbers and the ones this docstring carried before (3.6-5.6ms and
 * 31ms) is the machine — `paletteFeatures` itself measures 114-300us here
 * depending on JIT warmth against the 193us the split above was measured at.
 *
 * FINAL CONSOLIDATION re-measure (2026-08-18, same method, median of 9 over a
 * 200-deep pool, after D23.1 added the multi-term journey queries):
 *
 *   marine blue 9.9ms · silver 10.1ms · blue 7.8ms   (50, 51, 39us/candidate)
 *   puce to dark navy 16.3ms · cream light salmon fire brick 21.8ms (82, 109)
 *   muted 39.2ms · monochrome 40.2ms · ocean 43.2ms  (196, 201, 216)
 *   muted duotone 49.5ms · earthy sunset 50.7ms      (247, 254)
 *
 * Two things moved and both are the grammar, not a regression: a journey chip
 * runs the colour branch two or three times (once per named colour), and a
 * compound runs two term tests over the same features. The needs-features
 * worst case is therefore ~51ms of CPU rather than ~33ms, still cache-miss
 * only, and still bounded by MAX_CLASSIFY. The pools a real request actually
 * builds are smaller than 200 — measured over the fixture's own chips, 50 for
 * a single-term query with no expansion, 90-163 for a compound or a journey —
 * so the median added CPU per uncached tag request measures 1.5ms (family
 * band), 1.9ms (colour name), 7.0ms (journey), 16.8ms (tone), 21.7ms
 * (structure, compound) and 36.2ms (sunset/ocean/autumn, whose `implies`
 * expansion buys the widest pool).
 */
export const MAX_CLASSIFY = 200;

/**
 * Bumped whenever the recognizer, a threshold or the ranking changes: it is
 * part of the SEARCH_CACHE key, so a behaviour change cannot be served out of
 * a three-day-old cache entry.
 */
export const TAG_FILTER_VERSION = 5;

/** One recognized dimension. A query is one to three of these, never more. */
export type TagTerm =
  | {
      kind: "characteristic";
      label: string;
      /** The registry entries this spelling resolves to — see CHARACTERISTIC_TERMS. */
      terms: Characteristic[];
      /**
       * ...and the corpus reading of the SAME word, where the word is also a
       * colour name (`gold`, `navy`, `salmon`, `mint`: 24 of the 26 extended
       * hue-name terms are corpus entries too).
       *
       * A label is one string and the two vocabularies can both emit it — the
       * hue axis when a quarter of the ramp answers to the name, the colour
       * axis when one stop sits inside COLOR_MATCH_MAX of the anchor — so the
       * term carries both readings and a palette satisfies it under EITHER.
       * Resolving to one of them would make the other emitter's chip a link to
       * a page its own palette can fail, which is the defect this file exists
       * to prevent.
       */
      color?: { lab: Oklab; family: string };
    }
  | { kind: "family"; label: string }
  | { kind: "color"; label: string; lab: Oklab; family: string };

export interface TagQuery {
  /** The normalized query text this was recognized from. */
  label: string;
  terms: TagTerm[];
  /**
   * The query named a JOURNEY: two colours joined by "to", in that order
   * (D23.1's chip shape, and two of the seven colour queries in the GSC pull).
   *
   * The join used to be skipped outright, on the argument that "a gradient from
   * grey to white and one from white to grey hold the same two colours". They
   * do — and a person who typed one of them is not looking at the other. QA
   * round 4 measured the page through the real path: of the 24 results for a
   * directional chip, a median of 1 held both colours IN THE LABELLED ORDER.
   * The order is a rank key here (see tagQueryMatch), never a filter: a reversed
   * palette still holds both colours and still beats one that holds neither.
   */
  directional: boolean;
  /** True when any term needs the full `paletteFeatures` pass to be decided. */
  needsFeatures: boolean;
  /**
   * ...and true when one of them reads the stored temperature journey, which
   * costs a second coefficient analysis per candidate. See JOURNEY_TERMS.
   */
  needsJourney: boolean;
  /**
   * Extra texts to embed and query BESIDE the query itself, whose results join
   * the candidate pool. See `searchPalettesForQuery`: Vectorize caps topK at 50
   * when a query returns full metadata, so a wider pool can only be bought with
   * more query vectors, and the parts of a compound are the only expansion that
   * is derived from our own vocabulary rather than invented.
   */
  expansions: string[];
}

const labOf = (hex: string): Oklab => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
};

/**
 * Every word that names a dimension, mapped to the REGISTRY ENTRIES that decide
 * it. FOUR spellings are keys: the registry term itself (`complementary`,
 * `jewel tones`, `iso-luminant` — what a chip prints and what `/{seed}.json`
 * publishes), and for the entries lifted off a DESCRIPTOR, that descriptor's
 * tag word, its spoken word and its chip word. They are the same dimension
 * asked for in four vocabularies, so all four must retrieve.
 *
 * The alias spellings are why one label can carry TWO entries. `chipWord` maps
 * `complementary` to `duotone` (the plain word D20 uses in the prose), so
 * `/palettes/duotone` answers with duotones AND complementaries — which is what
 * the live links were emitted as before D24.4 put the theory's own word on the
 * chip, and dropping the alias would strand them. A palette satisfies the label
 * when it satisfies EITHER entry.
 *
 * The eleven family words are deliberately NOT here: they resolve one branch
 * down, where the match is graded by the share of the palette that IS the
 * family rather than by a boolean. That is the registry's own family predicate
 * (`familyShare(ctx.families, term) > 0`, the same `gatedFamily` on the same
 * stops) with a finer rank key, and tag-search.test.js asserts the two agree
 * over the whole fixture.
 */
const CHARACTERISTIC_TERMS = new Map<string, Characteristic[]>();
const addTermSpelling = (label: string, c: Characteristic) => {
  const list = CHARACTERISTIC_TERMS.get(label);
  if (list) {
    if (!list.includes(c)) list.push(c);
  } else CHARACTERISTIC_TERMS.set(label, [c]);
};
for (const c of CHARACTERISTICS)
  if (!FAMILY_VOCABULARY.includes(c.term)) addTermSpelling(c.term, c);
for (const descriptor of DESCRIPTORS) {
  const entry = CHARACTERISTIC_BY_TERM.get(descriptor.word);
  if (!entry) continue;
  for (const label of new Set([
    descriptor.word,
    spokenWord(descriptor),
    chipWord(descriptor),
  ]))
    addTermSpelling(label, entry);
}

/**
 * The two entries whose predicate reads the STORED temperature journey, and the
 * only reason a candidate's coefficients are analysed a second time.
 *
 * D25.2 is explicit that the journey is read and never re-derived, so the
 * filter runs the same `analyzeCoefficients` the index was built from rather
 * than a serve-time approximation of it — the chip and the page therefore agree
 * by construction. It is not free (that function scans the 920-entry colour
 * corpus per chromatic sample for tags this branch throws away), so it runs
 * only on these two pages instead of on every query that needs features.
 */
const JOURNEY_TERMS = new Set(["warming", "cooling"]);

/**
 * What else to search for, when the query is one word.
 *
 * A compound expands to its parts, which is obvious. A single word has no
 * parts, and inventing synonyms for it would be exactly the kind of untestable
 * bridge vocabulary this file avoids — but the registry already ships one, in
 * `implies`: the more general facts a descriptor shadows because saying both
 * would spend a word twice. `sunset` implies `warm`, `ocean` implies `cool`,
 * `neon` implies `vivid`, and warm/cool/vivid are words the OLD indexed
 * vocabulary actually contains (palette-tags' warmth and texture scales), so
 * those queries reach a region of the index that the chip's own word cannot.
 *
 * Measured over the 867-seed stand-in corpus: the `ocean` pool goes from 11
 * satisfying palettes in 50 to 32 in 98 and its precision@24 from 45.8% to
 * 100%, `sunset` from 4 in 50 to 19 in 98 (16.7% to 79.2%), `pastel` from 13
 * to 22 (54.2% to 91.7%). It does nothing for a structure word, which implies
 * nothing and which the old vocabulary has no word for at all; that gap needs
 * the reindex.
 */
const impliedTexts = (term: TagTerm): string[] =>
  term.kind === "characteristic"
    ? [...new Set(term.terms.flatMap((c) => c.implies ?? []))]
    : [];

/**
 * At most this many extra query vectors. Each one is a row in the batch
 * embedding (free, it is one AI call either way) and one more parallel
 * Vectorize query, so the cost is bounded by the classify budget it feeds
 * rather than by latency; three keeps the pool under ~200 candidates.
 */
const MAX_EXPANSIONS = 3;

const FAMILY_TERMS = new Set(FAMILY_VOCABULARY);

/**
 * Resolve one span of words into a term, or null.
 *
 * Order matters where the vocabularies overlap, and they overlap on exactly
 * the eleven family words. `blue` is both a family band and a corpus entry
 * whose hex is #0000ff, and the family reading is the one a visitor means: a
 * navy-to-sky ramp is a blue palette, while nothing in it sits within
 * COLOR_MATCH_MAX of pure blue. The corpus reading still applies to every
 * QUALIFIED name (`marine blue`, `dark indigo`), which is where proximity is
 * the right question.
 *
 * The registry is checked first and hyphen-joined as well as space-joined,
 * because the route converts hyphens to spaces (`queryFromParam`) and a good
 * part of the registry is hyphenated (`high-contrast`, `iso-luminant`,
 * `near-white`).
 *
 * WHERE A REGISTRY TERM IS ALSO A CORPUS NAME the two readings are carried
 * together rather than one winning: see TagTerm's `color`.
 */
function resolveTerm(words: string[]): TagTerm | null {
  const spaced = words.join(" ");
  const hyphenated = words.join("-");
  if (FAMILY_TERMS.has(spaced)) return { kind: "family", label: spaced };
  const corpus = corpusReading(words);
  const terms = CHARACTERISTIC_TERMS.get(spaced) ?? CHARACTERISTIC_TERMS.get(hyphenated);
  if (terms)
    return {
      kind: "characteristic",
      label: CHARACTERISTIC_TERMS.has(spaced) ? spaced : hyphenated,
      terms,
      ...(corpus ? { color: { lab: corpus.lab, family: corpus.family } } : {}),
    };
  return corpus;
}

/** The colour corpus's reading of a span, when it has one. */
function corpusReading(words: string[]): Extract<TagTerm, { kind: "color" }> | null {
  const match = matchColorName(words, 0, words.length);
  if (!match || match.length !== words.length) return null;
  const hex = colorNameToHex(match.name);
  if (!hex) return null;
  return {
    kind: "color",
    label: match.name,
    lab: labOf(hex),
    // The class the NAME speaks for, from the corpus's own per-entry reading.
    // See `termMatch`.
    family: CORPUS_FAMILY.get(match.name) ?? NEUTRAL,
  };
}

/**
 * How many words a term may span. Three is the corpus's own longest-match
 * budget ("deep sky blue"), and matchColorName is called with the same number
 * everywhere so a name can never resolve on one surface and not another.
 */
const MAX_TERM_WORDS = 3;

/**
 * The joining word a DIRECTIONAL query carries, and the only non-vocabulary
 * word the parse will step over.
 *
 * "grey to white gradient" and "white to green gradient" are two of the seven
 * colour queries in the peer session's GSC pull, and D23.1 emits the chips that
 * answer them. The word carries no filter of its own — a gradient from grey to
 * white and one from white to grey hold the same two colours — so it is skipped
 * rather than resolved, and the terms on either side do the work.
 */
const JOIN_WORD = "to";

/**
 * How many terms a recognized query may hold, and how many of them may be
 * colours.
 *
 * Two was the limit until QA round 3, with the second bound stated as "one
 * colour term, optionally qualified by one dimension word" — because an AND
 * filter over two colours left single-digit result counts. That argument is
 * spent: since QA round 2 the filter never removes a result and ranks by
 * PARTIAL CREDIT (see `tagQueryMatch` and `applyTagFilter`), so a palette
 * holding two of three named colours sits above one holding one, and the page
 * fills from the ranked backfill instead of a raw semantic tail. D23.1 needs
 * the shape: `/palettes/salmon-teal-turquoise` is the top palette page by
 * impressions in the GSC pull, and until now it was the one chip destination
 * with no filter behind it at all.
 *
 * Three colours, because that is the shape the evidence contains and the chip
 * grammar emits; a fourth is someone describing a palette rather than clicking
 * a dimension, and stays a plain semantic search.
 */
const MAX_TERMS = 3;

/**
 * Is this query one of our vocabulary tags?
 *
 * Longest-match first, at most three terms, and every word must be consumed.
 * "blue purple cyan rose" is four colour words and stays a plain semantic
 * search. "blue purple" is itself one corpus name and resolves as one term,
 * which is why the parse is greedy.
 *
 * CRAWL SAFETY (D18). Everything this can recognize is bounded — the registry,
 * eleven family words, the 920-entry colour corpus, the joining word, or a
 * short list of those — so the filtered path can never be reached by
 * attacker-chosen free text. That matters because filtering changes which
 * results a page shows, and therefore could change `indexableQuery`'s answer
 * for a query; on this bounded vocabulary that is only ever our own pages
 * judging our own corpus.
 */
export function recognizeTagQuery(query: string): TagQuery | null {
  const normalized = query.toLowerCase().replace(/[^a-z0-9'\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const words = normalized.split(" ");
  if (!words.length || words.length > MAX_TERM_WORDS * MAX_TERMS + 1) return null;

  const terms: TagTerm[] = [];
  let joined = 0;
  let i = 0;
  while (i < words.length) {
    if (terms.length >= MAX_TERMS) return null;
    // The join is only a join BETWEEN terms: a leading or trailing "to" is not
    // one of our queries.
    if (words[i] === JOIN_WORD && terms.length && i + 1 < words.length) {
      joined += 1;
      i += 1;
      continue;
    }
    let taken = 0;
    for (let span = Math.min(MAX_TERM_WORDS, words.length - i); span >= 1; span--) {
      const term = resolveTerm(words.slice(i, i + span));
      if (!term) continue;
      terms.push(term);
      taken = span;
      break;
    }
    if (!taken) return null;
    i += taken;
  }
  if (!terms.length) return null;

  // ...and a query is one dimension asked in several words, or a LIST of
  // colours. Three DIMENSION words is not a shape our chips emit and not one
  // the filter can rank honestly, so a three-term query has to be all colour —
  // where "colour" now includes the registry terms that are also corpus names,
  // because `salmon teal turquoise` is the list form D23.1 emits and 24 of the
  // 26 extended hue names are corpus entries. A term with no corpus reading is
  // a pure dimension word and still ends the parse.
  if (terms.length > 2 && terms.some((t) => t.kind === "characteristic" && !t.color))
    return null;

  // Parts first, then what those parts imply: a compound's own halves are the
  // strongest expansion it has, and the budget should never be spent on an
  // implication while a part is still unsearched.
  const expansions = [
    ...(terms.length > 1 ? terms.map((t) => t.label) : []),
    ...terms.flatMap((t) => impliedTexts(t)),
  ];
  return {
    label: normalized,
    terms,
    // One join, two terms, both of them readable as colours — the exact shape
    // `directionalLabels` emits. A three-term list ("salmon teal turquoise")
    // has no direction to read and a dimension word has no stop to be found at.
    directional:
      joined === 1 &&
      terms.length === 2 &&
      terms.every((t) => t.kind === "color" || (t.kind === "characteristic" && !!t.color)),
    needsFeatures: terms.some((t) => t.kind === "characteristic"),
    needsJourney: terms.some(
      (t) => t.kind === "characteristic" && t.terms.some((c) => JOURNEY_TERMS.has(c.term)),
    ),
    expansions: [...new Set(expansions)].filter((t) => t !== normalized).slice(0, MAX_EXPANSIONS),
  };
}

/**
 * What one candidate palette is, at the depth this query actually needs.
 *
 * Exported so the measurement harness and the unit tests can build the facts
 * once per palette and score many queries against them, instead of decoding
 * the same seed once per query.
 */
export interface PaletteFacts {
  labs: Oklab[];
  /** The rendered stops, for the colour term's class guard. */
  hexColors: string[];
  /**
   * The two arguments every registry predicate takes, present only for
   * `needsFeatures` queries — the 7x costlier half.
   */
  features: PaletteFeatures | null;
  ctx: CharacteristicCtx | null;
  families: (string | null)[] | null;
}

/**
 * Decode a result's seed and compute the facts the query asks about.
 *
 * `steps` is the palette's OWN stored step count, which is what the card in
 * the results grid renders and what the palette page's chips were computed
 * from. Classifying at a different resolution would let a chip and its
 * destination disagree about the same palette.
 */
function paletteFacts(seed: string, steps: number, query: TagQuery): PaletteFacts | null {
  let hexColors: string[];
  let applied;
  try {
    const { coeffs, globals } = deserializeCoeffs(seed);
    applied = applyGlobals(coeffs, globals);
    hexColors = cosineGradient(steps, applied).map(([r, g, b]) => rgbToHex(r, g, b));
  } catch {
    return null;
  }
  if (!hexColors.length) return null;

  const needsFamily = query.terms.some((t) => t.kind === "family");
  // The registry's two arguments, built exactly as the chip row builds them:
  // one dense feature pass, then the context object over the SAME rendered
  // stops. `characteristicCtx` derives the per-stop families itself, so a query
  // that needs both gets one reading of `gatedFamily` rather than two.
  const features = query.needsFeatures ? paletteFeatures(applied, hexColors) : null;
  const ctx = features
    ? characteristicCtx(features, hexColors, {
        journey: query.needsJourney ? journeyOf(applied) : null,
      })
    : null;
  return {
    labs: hexColors.map(labOf),
    hexColors,
    features,
    ctx,
    families: !needsFamily
      ? null
      : ctx
        ? [...ctx.families]
        : hexColors.map((hex) => gatedFamily(hexToOkLch(hex))),
  };
}

/**
 * The STORED temperature journey, from the same `analyzeCoefficients` formula
 * the Vectorize index was built with (D25.2: read the tag, never re-derive it).
 */
const journeyOf = (applied: CosineCoeffs): "warming" | "cooling" | null => {
  const { journey } = analyzeCoefficients(applied);
  return journey === "warming" || journey === "cooling" ? journey : null;
};

/**
 * Does this palette satisfy the term, and how well?
 *
 * `distance` is a rank key in [0, 1], lower is better, and it is the reason a
 * colour chip's page opens on the palettes that look most like the word rather
 * than on the first 24 that merely contain it. A registry term grades by its
 * own MARGIN — the `strong` band the chip was gated on — so its page opens on
 * the palettes the word is obviously true of.
 */
function termMatch(
  term: TagTerm,
  facts: PaletteFacts,
): { ok: boolean; distance: number; stop?: number } {
  if (term.kind === "color") {
    // Proximity of the stop that actually ANSWERS to the word, not of whichever
    // stop happens to sit nearest the anchor. The two differ exactly where the
    // class guard does its work, and using the second let an out-of-class stop
    // set the rank for a palette that qualified on a different stop entirely.
    //
    // Ranking by SHARE was tried here and rejected, which is worth recording
    // because it looks obviously right. The reported defect said the ranking key
    // was the problem: a `bluegray` page opened on an emerald ramp whose only
    // qualifying stop was its last, while the emitting palette (4 of 7 stops in
    // the ball) ranked 12th. It was the POOL. With the class guard that emerald
    // ramp is not a bluegray palette at all and the emitter rises to 7th
    // unaided. Measured over 98 colour chips sampled across the 867-seed
    // stand-in, mixing share into the key costs on both measures at once:
    //
    //   ranking                      mutual-chip@24   emitter on page 1
    //   no guard, proximity              27.0%            76.5%
    //   guard, proximity                 28.5%            80.6%
    //   guard, proximity + 0.04 share    27.6%            78.6%
    //   guard, proximity + 0.08 share    26.6%            74.5%
    //   guard, share primary             21.7%            65.3%
    //
    // (mutual-chip@24 = of the 24 results, how many carry this exact chip on
    // their own row — the owner's bar, computed rather than eyeballed.) The
    // reason is in the corpus: a colour chip usually names ONE of a palette's
    // several colours, so the emitter's own share averages 1.5 stops of 7, and
    // ranking by share hands page 1 to monochromes of that colour.
    return colorMatch(term.lab, term.family, facts);
  }
  if (term.kind === "family") {
    const families = facts.families ?? [];
    const hits = families.filter((f) => f === term.label).length;
    // Share of the palette that IS the family, so "blue" opens on the palettes
    // that are mostly blue rather than on the ones with a blue stop in them.
    return { ok: hits > 0, distance: 1 - hits / Math.max(1, families.length) };
  }
  const { features, ctx } = facts;
  if (!features || !ctx) return { ok: false, distance: 1 };
  // THE SAME CLOSURE THE CHIP WAS DECIDED WITH (D25.6), at both of its two
  // bars: `test` decides whether the palette belongs on the page at all, and
  // `strong` — the margin the chip was gated on — decides whether it belongs at
  // the TOP of it. The scale is deliberately coarse because that is all the
  // registry knows: a term is obviously true, true, or not true. It replaces
  // the flat 0 the old modifier branch returned, which left a term's page in
  // whatever order the semantic pool arrived in.
  let distance = 1;
  for (const c of term.terms) {
    if (!c.test(features, ctx)) continue;
    distance = Math.min(distance, !c.strong || c.strong(features, ctx) ? 0 : 0.5);
  }
  // ...AND THE PALETTES THE TERM IS FALSE OF ARE GRADED TOO (QA round 5).
  //
  // THE DEFECT. Everything the term is false of used to tie at 1, so the
  // backfill — which is most of page 1 for any term under about 3% of the
  // corpus — kept the raw semantic order. Measured on `cool gray` (16 of 867,
  // a pool entirely inside the classify budget): 3 genuine matches, then nine
  // palettes with obvious colour in them, including a teal-to-hot-pink ramp and
  // a periwinkle-to-peach one. The chip was true of the palette that emitted
  // it; its destination was not.
  //
  // A registry term has no continuous reading of itself — that is why the
  // matched tier is the coarse 0 / 0.5 above — but it does declare the broader
  // terms it IMPLIES, and those are exactly the "nearly this" claim the tail
  // needs: `cool gray` implies `cool`, `sepia` implies warm, earthy, muted and
  // monochrome. So a palette that satisfies the term's implications sorts above
  // one that satisfies none, and the page degrades through the neighbourhood of
  // the word instead of through whatever the embedding happened to return.
  // 0.75 is the midpoint of the empty half of the scale, so the whole partial
  // tier still sits below every genuine match (0.5) and above the unrelated
  // tail (1).
  // Whether the palette BELONGS on the page is decided here, before the tail
  // grading below can lower the distance: a near miss is a rank, never a match.
  const matched = distance < 1;
  if (!matched) {
    for (const c of term.terms) {
      const implied = c.implies;
      if (!implied?.length) continue;
      const held = implied.filter((word) => {
        const other = CHARACTERISTIC_BY_TERM.get(word);
        return other?.test(features, ctx);
      }).length;
      if (held) distance = Math.min(distance, 1 - 0.25 * (held / implied.length));
    }
  }
  // ...and where the word is ALSO a corpus colour, the nearer of the two
  // readings takes the slot. A colour hit is at most COLOR_MATCH_MAX (0.08), so
  // it outranks a term that is merely true (0.5) and yields to one that is
  // obviously true (0) — which is the order a visitor would put them in: a
  // palette MADE of gold, then one holding a gold stop, then one whose single
  // sample grazes the gold hue window.
  if (term.color) {
    const colour = colorMatch(term.color.lab, term.color.family, facts);
    if (colour.ok) return { ok: true, distance: Math.min(distance, colour.distance), stop: colour.stop };
  }
  return { ok: matched, distance };
}

/**
 * The colour corpus's reading of a palette: is any IN-CLASS stop inside the
 * radius, and how close is the nearest one. Shared by the colour terms and by
 * the registry terms that are also corpus names.
 */
function colorMatch(
  lab: Oklab,
  family: string,
  facts: PaletteFacts,
): { ok: boolean; distance: number; stop: number } {
  let best = Infinity;
  let bestStop = -1;
  let hits = 0;
  for (let i = 0; i < facts.labs.length; i++) {
    if (!stopInClass(facts.hexColors[i]!, family)) continue;
    const d = oklabDistance(facts.labs[i]!, lab);
    if (d < best) {
      best = d;
      bestStop = i;
    }
    if (d <= COLOR_MATCH_MAX) hits++;
  }
  // WHERE the palette answers to the word, for the directional rank key. The
  // nearest in-class stop, which is the same stop the distance above reports —
  // one reading, so the rank and the position can never disagree.
  return { ok: hits > 0, distance: Math.min(1, best), stop: bestStop };
}

/**
 * Both parts, for a compound (D22.B5) — and HOW MANY of them, because a
 * compound's page cannot be filled from the intersection alone.
 *
 * THE DEFECT (QA round 2). `earthy sunset` is satisfied by 3 palettes in a
 * 200-deep pool, so 9 of the 12 page-1 slots came from the raw semantic order
 * and page 1 held a neon yellow-to-hot-pink ramp at rank 4: an AND filter puts
 * a palette that is earthy but not sunset in the same undifferentiated tail as
 * one that is neither. `hits` is the partial credit that fixes it — both parts
 * first, then either part, then the tail — which is the same ranking the AND
 * already expresses, carried one step further down the page.
 *
 * A term that does NOT match contributes 1 to the distance, the maximum a
 * matching term can contribute, so within the one-part tier the palettes are
 * ordered by how well the part they DO satisfy fits. Full matches are
 * unaffected: every term contributes its own distance and none contributes 1.
 */
export function tagQueryMatch(
  query: TagQuery,
  facts: PaletteFacts,
): { ok: boolean; hits: number; distance: number; matched: boolean[] } {
  let hits = 0;
  let distance = 0;
  const matched: boolean[] = [];
  const stops: number[] = [];
  for (const term of query.terms) {
    const m = termMatch(term, facts);
    matched.push(m.ok);
    stops.push(m.stop ?? -1);
    if (m.ok) {
      hits++;
      distance += m.distance;
    } else distance += 1;
  }
  // ...and a JOURNEY runs one way (QA round 4). "{a} to {b}" is a claim about
  // ramp order, and until now the join was dropped and the query was two
  // independent colours: measured over 16 directional chips against the
  // 867-seed stand-in, a page of 24 held both colours 2.3 times and held them
  // in the labelled order 1.3 times, so half the palettes that answered the
  // query answered it backwards. A RANK key rather than a filter, and it only
  // moves palettes inside the both-colours tier: a reversed palette holds the
  // two colours a visitor asked for and still outranks one that holds neither,
  // which is the degradation rule this whole file is built on. The penalty is
  // the maximum a matching term can contribute, so an out-of-order pair sits
  // below every in-order one and above the one-colour tier.
  if (query.directional && hits === 2 && stops[0]! >= stops[1]!) distance += 1;
  return { ok: hits === query.terms.length, hits, distance, matched };
}

/** The minimum a caller needs to be filtered: a seed, its steps, its order. */
export interface FilterableResult {
  seed: string;
  steps: number;
}

/**
 * Rank the palettes that genuinely satisfy the clicked dimension first.
 *
 * DEGRADATION IS THE DEFAULT, NOT A FALLBACK. Nothing is dropped: the
 * satisfying palettes are moved to the front and everything else keeps its
 * semantic order behind them, so the result COUNT, the number of pages and the
 * contents of the last page are exactly what they were before this file
 * existed. A filter that returns two palettes cannot 404 page 2 of a URL
 * someone bookmarked, and a sort=newest visitor still gets every result the
 * index returned, in date order. The filter's effect is entirely in what page
 * 1 opens on, which is the thing the owner is judging.
 *
 * Results past the classify budget are never decoded and stay in the tail in
 * semantic order — a bounded cost, not a bounded correctness.
 */
export function applyTagFilter<T extends FilterableResult>(
  query: TagQuery,
  results: readonly T[],
  limit: number,
): T[] {
  const scored: {
    result: T;
    order: number;
    hits: number;
    distance: number;
    matched: boolean[];
  }[] = [];
  const rest: T[] = [];

  for (let order = 0; order < results.length; order++) {
    const result = results[order]!;
    if (order >= MAX_CLASSIFY) {
      rest.push(result);
      continue;
    }
    const facts = paletteFacts(result.seed, result.steps || DEFAULT_STEPS, query);
    const match = facts ? tagQueryMatch(query, facts) : null;
    // PARTIAL CREDIT (QA round 2). A palette satisfying one half of a compound
    // is not the same as a palette satisfying neither, and on a dimension whose
    // intersection holds 8 of 867 palettes the difference IS page 1. Both
    // parts, then either part, then the ones that satisfy nothing — see
    // tagQueryMatch.
    //
    // ...AND THE BACKFILL IS RANKED TOO, by the same key. A colour term grades
    // every palette, not only the ones inside its radius, so the palettes just
    // outside it are the ones that look most like the word: on a chip like
    // `dark brown`, which only 22 of 867 fixture palettes satisfy, the 24-slot
    // page is mostly backfill and its old order was the raw semantic one (the
    // reported defect). A modifier grades nothing, so its non-matching
    // palettes all carry the same distance and keep the semantic order they
    // arrived in — the degradation D22.B5 asks for, unchanged where there is
    // nothing to rank by.
    if (match)
      scored.push({
        result,
        order,
        hits: match.hits,
        distance: match.distance,
        matched: match.matched,
      });
    else rest.push(result);
  }

  // ...and inside the partial tier, the RARER part wins (QA round 3).
  //
  // THE DEFECT. `dark monochrome` is satisfied by 4 of 24 page-1 results in the
  // 867-seed stand-in, so most of page 1 is the one-part tier — and there the
  // old key was distance, which a modifier does not grade, so the tier kept its
  // semantic order and rank 5 was #d9b3e2 -> #522ca4: a LIGHT vivid lilac
  // monochrome, the literal opposite of the chip's modifier. A palette that
  // satisfies the rare half of a compound looks more like the compound than one
  // satisfying the common half, because the common half is common. Counting
  // over the pool rather than over the corpus is what makes it free: the
  // classification has already been done by the loop above.
  const poolCount = query.terms.map(
    (_, i) => scored.filter((s) => s.matched[i]).length,
  );
  const rarity = (matched: readonly boolean[]) => {
    let best = Infinity;
    for (let i = 0; i < matched.length; i++)
      if (matched[i]) best = Math.min(best, poolCount[i]!);
    return best;
  };
  scored.sort(
    (a, b) =>
      b.hits - a.hits ||
      rarity(a.matched) - rarity(b.matched) ||
      a.distance - b.distance ||
      a.order - b.order,
  );
  return [...scored.map((s) => s.result), ...rest].slice(0, limit);
}
