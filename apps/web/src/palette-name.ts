// Naming a palette, shared by the server render and the editor island.
//
// This lives apart from palette-json.ts so the island can import it without
// dragging in the request-parsing and valibot code that only the Worker needs.
// The editor recomputes the name on every slider tick, so everything here has
// to be a pure function of the coefficients and the rendered colors — no fetch,
// no request context.

import { getUniqueColorNames } from "@repo/data-ops/color-utils";
import {
  classifyStructure,
  modifierTags,
  paletteFeatures,
  selectModifiers,
  spokenWord,
  type PaletteFeatures,
} from "@repo/data-ops/gradient-gen/palette-modifiers";
import type { CosineCoeffs } from "@repo/data-ops/gradient-gen/cosine";
import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";

/**
 * How much room the palette's name gets, per surface.
 *
 * `getUniqueColorNames` self-limits: a stop earns a name only if it is
 * perceptually distant from every name already chosen, so a subtle ramp
 * returns one name and a two-tone returns two no matter how high the ceiling
 * goes (verified across ceilings 3-8 on the live corpus).
 *
 * The name ceilings are now the outer bound rather than the working limit —
 * NAMES_FOR_STRUCTURE below almost always binds first, because how many colors
 * a palette can be described in is a fact about the palette, not about the
 * surface. What is left is the character budget, and the three surfaces
 * genuinely differ.
 *
 * THE HEADING is a line of prose on a wide page and can afford length.
 *
 * THE TITLE has to survive Google truncating around 60 characters, and the
 * suffix below is charged against that. At the previous budget of 44 with a
 * 28-character suffix the average title ran 62.7 characters and 67.9% of the
 * corpus truncated — the wrong side of the limit on the average case, not just
 * the worst one. `TITLE_SUFFIX` explains where the other 17 went; 43 is what is
 * left, and it puts the worst case exactly on 60. `titleSuffix()` now varies
 * the suffix with the URL, but its variants (" Gradient", " Palette") are
 * strictly shorter than the 17-character worst case, so 43 still binds — a
 * style-pinned URL simply yields a shorter title, never a longer one.
 *
 * THE META DESCRIPTION opener used to share the title's budget, which coupled
 * two surfaces that have nothing in common: a description has ~155 characters
 * and the opener is followed by the style, the step count and four hex codes.
 * At 44 the finished sentence measures 136.5 on average and 146 at worst. The
 * two numbers landing one apart is a coincidence of arithmetic, not a shared
 * constraint — they move independently.
 */
export const HEADLINE = { maxChars: 80, maxNames: 6 };
export const TITLE_HEADLINE = { maxChars: 43, maxNames: 4 };
export const META_HEADLINE = { maxChars: 44, maxNames: 4 };

/**
 * What follows the palette's name in `<title>`. Shared by the server render and
 * the editor island so a live edit cannot disagree with what a crawler saw.
 *
 * It used to be " Gradient Palette | Grabient" and the brand cost more than it
 * returned. Every character here is one the palette does not get, and measured
 * across the corpus at the budget each suffix leaves (so that suffix + budget
 * = 60 in every row):
 *
 *   " Gradient Palette | Grabient" (28) → 21.9% of titles keep a modifier, 2.5% collide
 *   " Gradient | Grabient"         (20) → 44.8%, 1.7%
 *   " Gradient Palette"            (17) → 49.7%, 1.7%
 *
 * Dropping the brand wins on every axis, and it keeps the two tokens that the
 * Tier-1 targets in seo-research/demand-longtail.md are built from — the
 * queries are "{color} gradient color palette", not "{color} grabient". A deep
 * palette page does not need to rank for the brand; the homepage does, and
 * Google commonly appends the site name to a SERP title on its own.
 *
 * Since D14 this constant is the style-param-ABSENT case (and the worst case
 * for the budget arithmetic above); `titleSuffix()` below picks the suffix.
 */
export const TITLE_SUFFIX = " Gradient Palette";

/**
 * Where a swatch strip stops reading as separate colours.
 *
 * Below this the blocks are wide and countable, which is what "palette" names;
 * at or above it the strip reads as a stepped gradient and the title says so.
 * 8 is the owner's line, and it sits with the site's own defaults: the seed
 * pages render 7.
 */
const GRADIENT_STEPS = 8;

/**
 * What follows the name in `<title>`, keyed to the URL (owner rule, D14).
 *
 * A clean canonical URL keeps the full " Gradient Palette" — those pages
 * compete for the "{color} gradient color palette" grammar and the two nouns
 * are the demand tokens. A URL that pins a style names only what that view
 * renders: a swatch style is a palette, a gradient style is a gradient, and
 * saying both under a pinned view claims a page it is not.
 *
 * `styleInUrl` is param PRESENCE, not value: canonical URLs strip default
 * params, so the server passes `params.style !== "auto"` and the island
 * mirrors it by parsing the URL it maintains — shared here so the two cannot
 * disagree about the same address.
 *
 * The step count re-qualifies the swatch case (owner rule, 2026-08-18). A
 * swatch view is only "a palette" while its blocks read as discrete colours;
 * past `GRADIENT_STEPS` the strip is fine enough to read as a gradient again,
 * so the full two-noun suffix comes back rather than understating the page.
 * The gradient styles never change: they render a gradient at any step count.
 */
export function titleSuffix(
  style: PaletteStyle,
  styleInUrl: boolean,
  steps: number,
): string {
  if (!styleInUrl) return TITLE_SUFFIX;
  if (!style.includes("Swatches")) return " Gradient";
  return steps < GRADIENT_STEPS ? " Palette" : TITLE_SUFFIX;
}

/**
 * What a set of these views is called, for a list page's visible heading.
 *
 * Same rule as `titleSuffix`, plural and lowercase, so the seed page and the
 * list page can never disagree about what a pinned view is. The unpinned case
 * keeps BOTH nouns: that is the only variant Google indexes (list and seed
 * canonicals both strip `style`/`steps`), and the measured competitor set all
 * carry "gradient" in the title for {color} queries.
 *
 * `steps` may be "auto" on a list page, where each card renders at its own
 * stored count. There is no single strip to judge then, so the style word
 * stands on its own — only an explicitly pinned, finely stepped view is
 * re-qualified.
 */
export function viewNounPlural(
  style: PaletteStyle,
  styleInUrl: boolean,
  steps: number | "auto",
): string {
  if (!styleInUrl) return "gradient palettes";
  if (!style.includes("Swatches")) return "gradients";
  if (steps === "auto") return "swatches";
  return steps < GRADIENT_STEPS ? "swatches" : "gradient palettes";
}

export interface HeadlineOptions {
  maxChars?: number;
  maxNames?: number;
  /**
   * Reuse an analysis instead of redoing it.
   *
   * Naming a palette for two surfaces means two calls, and each one otherwise
   * re-renders 48 dense samples and re-derives every feature. The editor does
   * this on every slider tick, where it is the only part of the update that is
   * not already memoised.
   */
  features?: PaletteFeatures;
}

/**
 * Words that already say what a modifier would say.
 *
 * The 843-name corpus is full of qualified names — "pale blue", "dark magenta",
 * "bright sky blue" — so a modifier bolted on in front regularly stutters:
 * "Pastel pale pink to baby blue", "Dark dark navy". A modifier is only worth a
 * word when the color names have not already spent one on it.
 */
const REDUNDANT_WITH: Record<string, readonly string[]> = {
  pastel: ["pastel", "pale", "light", "baby", "powder", "soft", "faded"],
  neon: ["neon", "bright", "electric", "vivid", "fluorescent"],
  muted: ["muted", "dusty", "dull", "faded", "grey", "gray", "greyish", "grayish"],
  // The corpus is rich in earth pigments, and they are the same claim:
  // "Earthy black to burnt umber" spends a word the colors already spent.
  earthy: ["earth", "earthy", "clay", "terracotta", "umber", "sienna", "ochre", "rust", "mud"],
  vivid: ["vivid", "bright", "electric", "neon"],
  dark: ["dark", "deep", "midnight", "black"],
  light: ["light", "pale", "baby", "powder", "white"],
  grayscale: ["grey", "gray", "greyish", "grayish", "black", "white", "charcoal"],
  // The families overlap the corpus hardest — it is full of colours named
  // after the same things: "Ocean sea blue", "Forest forest green".
  sunset: ["sunset", "sunrise", "dusk", "twilight", "dawn"],
  ocean: ["ocean", "sea", "marine", "aqua", "aquamarine", "lagoon"],
  forest: ["forest", "pine", "moss", "fern", "hunter"],
  autumn: ["autumn", "rust", "umber", "sienna", "ochre", "clay", "pumpkin"],
};

/**
 * Words a modifier must not be said next to.
 *
 * A palette can hold one neon stop and one washed-out one, and both
 * classifications are then true of it — but "Neon warm blue to pale violet red"
 * reads as a contradiction rather than as a range. The aggregate lost an
 * argument with the specific, so the aggregate stays quiet.
 *
 * Exported since D17: the compound chip grammar in palette-prose.ts joins two
 * fired modifier words ("pastel rainbow"), and a compound is exactly a pair of
 * words said next to each other, so it excludes the same pairs this table
 * excludes. One table, two consumers — a new entry here closes the compound as
 * well as the name.
 */
export const CONTRADICTED_BY: Record<string, readonly string[]> = {
  // `pastel` gained the loudness half of its list on 2026-08-18: it carried only
  // value words, so "Pastel bright sky blue" was a name the table permitted.
  pastel: ["dark", "deep", "black", "midnight", "burnt", "rich", "neon", "bright", "electric", "vivid", "fluorescent"],
  // `dull` joined the two loud rows in QA round 6: the corpus holds `dull
  // yellow`, `dull red`, `dull blue` and eleven more, and the link-label repair
  // reaches them - a #dde235 stop measuring C 0.180 lost `sickly yellow` to the
  // unsearchable-word rule and landed on `dull yellow`, twice as far away and
  // contradicting its own stop's chroma.
  neon: ["pale", "faded", "dusty", "muted", "grayish", "greyish", "washed", "dull"],
  muted: ["neon", "bright", "electric", "vivid", "fluorescent"],
  earthy: ["neon", "electric", "vivid", "pastel"],
  dark: ["pale", "light", "baby", "powder", "white", "bright"],
  // `vivid` is spoken:false, so this row is inert for the name and the compound
  // chips and exists for the tone veto below: it is the other pole of `muted`
  // and needs the same list read the other way.
  vivid: ["pastel", "pale", "faded", "dusty", "muted", "washed", "dull"],
};

/** The tone tags whose contradiction with a NAME is worth acting on. */
const TONE_VETO_TAGS = ["vivid", "neon", "pastel", "muted"] as const;

/**
 * The loudness half of CONTRADICTED_BY's rows — BOTH POLES of it.
 *
 * `pastel`'s value half ("dark", "black", …) would rename every dark stop of a
 * pastel palette, which is a different claim and not one the QA round found
 * wrong, so the value words stay out. What was also out, and should not have
 * been, is the QUIET pole: the docstring on `toneNameVeto` says the veto runs
 * "in both directions: a fired vivid/neon rules out pale words, a fired
 * pastel/muted rules out loud ones", and this set held only the loud ones — so
 * `vivid`'s own row (pastel, pale, faded, dusty, muted, washed) was filtered
 * down to two words and a vivid palette could carry `faded`, `dusty`, `muted`,
 * `washed` or `dull` on a stop. QA round 6 filed the last of those: a #dde235
 * stop at C 0.180, well past VIVID_CHROMA, chipped `dull yellow`.
 *
 * A per-STOP gate against the registry thresholds is still not available for
 * the reason `toneNameVeto` records — the corpus entries themselves fail it,
 * `pastel red` measures C 0.165 and `dull yellow` C 0.163 — so the veto stays a
 * palette-level contradiction. Measured over the fixture: 12 -> 18 palettes
 * carry a contradicting name and fall back to the nearest entry left.
 */
export const LOUDNESS_WORDS = new Set([
  "pastel",
  "pale",
  "neon",
  "bright",
  "electric",
  "vivid",
  "fluorescent",
  "faded",
  "dusty",
  "muted",
  "washed",
  "dull",
]);

/**
 * One compiled predicate per tag combination. The veto is consulted once per
 * corpus entry per lookup (920 × the stops), and the editor rebuilds the whole
 * page on every slider tick, so the word list is turned into a single regex once
 * and cached: there are at most 2^4 distinct answers.
 */
const toneVetoCache = new Map<string, ((name: string) => boolean) | undefined>();

/**
 * Tone words a COLOR NAME may not carry on this palette.
 *
 * The corpus is a survey vocabulary and its words are not always measurements:
 * `pastel red` is xkcd's label for #db5856, which measures chroma 0.165 at 75%
 * of its ceiling, and `neon blue` is #04d9ff at 0.145, well under the site's own
 * neon line. D8 restored those words deliberately, so a per-stop gate against
 * the registry thresholds is not available: it would delete both entries from
 * the corpus, since the entries themselves fail it.
 *
 * What IS available is the contradiction. A sunset ramp that fires `vivid`
 * shipped as "A sunset gradient color palette sweeping from sand through pastel
 * red to reddish purple. The colors are strong and clear." — one sentence
 * calling a stop pastel and the next calling the palette strong, with the word
 * also driving the title, the meta description and the top chip, which links to
 * /palettes/pastel-red. The page contradicting itself is the defect, and the
 * measurement is the half of it that is checkable, so the name yields.
 *
 * Only the loudness axis, and only in both directions: a fired `vivid`/`neon`
 * rules out pale words, a fired `pastel`/`muted` rules out loud ones. Value
 * words are already handled per-stop inside the namer (`valueWordFits`), and
 * the rest of CONTRADICTED_BY stays where it was, vetoing MODIFIERS against
 * names rather than names against measurements. Measured over the 867-seed
 * fixture: 12 palettes carry a contradicting name, and each one falls back to
 * the nearest corpus entry that is left.
 */
export function toneNameVeto(
  tags: readonly string[],
): ((name: string) => boolean) | undefined {
  const fired = TONE_VETO_TAGS.filter((t) => tags.includes(t));
  const key = fired.join("+");
  if (toneVetoCache.has(key)) return toneVetoCache.get(key);
  const banned = new Set<string>();
  for (const tag of fired) for (const w of CONTRADICTED_BY[tag] ?? []) banned.add(w);
  const words = [...banned].filter((w) => LOUDNESS_WORDS.has(w)).sort();
  const veto = words.length
    ? (() => {
        const re = new RegExp(`(^|[ -])(${words.join("|")})([ -]|$)`, "i");
        return (name: string) => re.test(name);
      })()
    : undefined;
  toneVetoCache.set(key, veto);
  return veto;
}

function mentions(names: readonly string[], words: readonly string[]): boolean {
  const haystack = ` ${names.join(" ").toLowerCase()} `;
  return words.some((w) => haystack.includes(` ${w} `) || haystack.includes(` ${w}`));
}

function saysItAlready(word: string, names: readonly string[]): boolean {
  const claimed = REDUNDANT_WITH[word];
  if (claimed && mentions(names, claimed)) return true;
  const against = CONTRADICTED_BY[word];
  return !!against && mentions(names, against);
}

/**
 * How many color names each structure can support before it contradicts itself.
 *
 * This is the rule that makes a modifier and its colors tell the same story. A
 * duotone described with five names ("Duotone mocha to grayish teal to sea blue
 * to marine blue to midnight") reads as a mistake, and it is one: those five
 * names are lightness steps within two hues, so naming them all describes the
 * ramp while the modifier describes the palette. Capping to the structure's own
 * hue count makes it "Duotone mocha and midnight" — shorter and truer.
 */
export const NAMES_FOR_STRUCTURE: Record<string, number> = {
  grayscale: 2,
  monochrome: 2,
  duotone: 2,
  complementary: 2,
  analogous: 3,
  multicolor: 3,
  rainbow: 4,
};

/**
 * Adjective slots, in the order English wants them.
 *
 * The selector ranks by information, which is the right order for CHOOSING and
 * the wrong order for SAYING: it will happily hand back ["duotone", "pastel"],
 * and "duotone pastel blush" is not English. Sorting the winners into fixed
 * slots gives "pastel duotone blush and sky blue".
 */
const SLOT: Record<string, number> = {
  temperature: 0,
  tone: 1,
  family: 2,
  contrast: 3,
  structure: 4,
};

/**
 * Whether the colors on screen can back a structural word up.
 *
 * Structure is measured on a dense sample and the names come from the rendered
 * stops, so the two can disagree and the name has to defer to what is visible.
 * The tag still records the measurement either way.
 */
function structureIsSayable(
  word: string,
  names: readonly string[],
  tags: readonly string[],
): boolean {
  switch (word) {
    // Two hues, one name: the second hue is there but too faint to have earned
    // a word, and "Duotone silver" reads as a bug.
    case "duotone":
    case "complementary":
      return names.length === 2;
    // A wide hue sweep held at low chroma is a rainbow on paper that renders as
    // two washed-out names — "Rainbow light sage to light blue gray". The
    // disqualifier is the washing-out, not the name count: with real chroma in
    // it, "Rainbow black to light mustard" is both true and worth the word,
    // which matters most in the title, where "rainbow" is a search term.
    case "rainbow":
      return (
        names.length >= 2 && !tags.includes("pastel") && !tags.includes("muted")
      );
    default:
      return true;
  }
}

/** The structural words whose coherence has to be checked against the names. */
const STRUCTURE_WORDS = new Set([
  "duotone",
  "complementary",
  "rainbow",
  "monochrome",
  "grayscale",
]);

/**
 * Two isolated hues are a pair, not a journey.
 *
 * "Coral and teal" says the palette has two colors in it; "coral to teal" says
 * it passes through everything between them. For a duotone the first is true
 * and the second is not — the hues that would sit between them are exactly the
 * ones the gap in the hue histogram says are missing.
 */
function joinNames(names: readonly string[], structure: string): string {
  const twoHued = structure === "duotone" || structure === "complementary";
  return names.length === 2 && twoHued ? names.join(" and ") : names.join(" to ");
}

export interface NamedPalette {
  /** "Pastel duotone blush and sky blue" — capitalised, ready to render. */
  name: string;
  /** The modifier phrase alone, "" when the palette earned none. */
  modifierPhrase: string;
  /** The color names that survived, in ramp order. */
  colorNames: string[];
  /**
   * The rendered stops the names were read off, ramp order.
   *
   * getUniqueColorNames returns names without saying which stop produced each
   * one, and D18's chip ranking needs that link: a name is ranked by the chroma
   * of the stop it names. Carrying the stops here keeps the answer derivable
   * without a second render, and every caller already had them.
   */
  stops: string[];
  /** Every descriptor that is true, spoken or not — the tag list. */
  tags: string[];
  features: PaletteFeatures;
}

/**
 * The palette's name: modifiers plus the colors that characterise it.
 *
 * Named from the colors AS RENDERED, so it tracks `steps`: the same seed at 3
 * steps and at 13 steps is genuinely a different set of colors, and a cosine
 * palette at high frequency passes through hues a 3-step sample never lands on.
 * The modifiers do not track `steps` — see palette-modifiers.ts for why hue
 * structure has to be read off a dense sample instead.
 *
 * Names are dropped only for length, never padded.
 *
 * Returns the parts as well as the finished string: the editor island needs the
 * tag list beside the name on every slider tick, and analysing the palette once
 * for both is the difference between one dense sample per keystroke and two.
 */
export function describePaletteName(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  options: HeadlineOptions = {},
): NamedPalette {
  const maxChars = options.maxChars ?? HEADLINE.maxChars;
  const maxNames = options.maxNames ?? HEADLINE.maxNames;
  const colors = hexColors.length ? [...hexColors] : ["#000000"];

  const features = options.features ?? paletteFeatures(coeffs, colors);
  const structure = classifyStructure(features);
  const tags = modifierTags(features);
  // A name whose tone word the palette's own measurement contradicts is not
  // available to any surface: title, heading, identity sentence and chip row
  // all read this list. See toneNameVeto.
  const veto = toneNameVeto(tags);

  // The surface's ceiling and the structure's ceiling both apply; the structure
  // is now nearly always the binding one, which is what keeps the name coherent.
  const ceiling = Math.min(maxNames, NAMES_FOR_STRUCTURE[structure] ?? maxNames);

  const phraseFor = (names: readonly string[], room: number): string => {
    const chosen = selectModifiers(features, {
      // The selector knows what is informative; only the prose knows what would
      // stutter next to "pale blue" or contradict "dark magenta".
      vetoes: (word) =>
        saysItAlready(word, names) ||
        (STRUCTURE_WORDS.has(word) && !structureIsSayable(word, names, tags)),
    });
    const words = [...chosen]
      .sort((a, b) => (SLOT[a.axis] ?? 9) - (SLOT[b.axis] ?? 9))
      .map(spokenWord);
    // selectModifiers returned these best-first before the slot sort, but the
    // slot sort is stable and both lists are at most two long, so popping the
    // tail drops the later slot — which is the structural word, the one the
    // colors themselves come closest to conveying.
    while (words.length && words.join(" ").length + 1 > room) words.pop();
    return words.join(" ");
  };

  /**
   * One rung of the ladder: this many color names, with or without a modifier.
   * Returns null when it does not fit.
   *
   * The modifier is capped at half the budget even when it fits, so it can
   * never crowd out the colors it is supposed to be qualifying.
   */
  const rung = (max: number, withPhrase: boolean) => {
    const names = getUniqueColorNames(colors, { max, veto });
    const joined = joinNames(names, structure);
    if (!withPhrase)
      return joined.length <= maxChars ? { names, joined, phrase: "" } : null;
    const phrase = phraseFor(names, Math.floor(maxChars / 2));
    if (!phrase) return null;
    return phrase.length + 1 + joined.length <= maxChars
      ? { names, joined, phrase }
      : null;
  };

  // Shorten the color list to keep the modifier; drop the modifier only when
  // even one color name will not fit beside it.
  //
  // Modifiers are the more valuable half on the tight surfaces, which is where
  // this ladder actually bites. In the `<title>` the modifier is a search term
  // — "monochrome" and "rainbow" have their own demand and their own
  // `/palettes/` pages — while a third color name is a detail. Fitting colors
  // first cost 257 of 866 titles (29.7%) a modifier their heading carried.
  //
  // Nothing here can produce the old failure, where "Complementary light steel
  // blue and blanched almond" overran the budget and shrinking the color list
  // gave "Light steel blue" — a two-color palette described by half of itself.
  // A structural word has to agree with the visible colors to be said at all
  // (`structureIsSayable`), so at one name "duotone" is vetoed, the rung
  // returns null, and the ladder falls through to the colors-only pass that
  // keeps both names.
  // ...but the second color name is never the thing that gets traded. Letting
  // the ladder go to one name to keep an adjective raised title collisions from
  // 2.3% to 6.9% of the corpus — five pages sharing "Earthy charcoal gray" —
  // and duplicate titles are the templated-page signal this all exists to fight.
  const floor = Math.min(2, ceiling);

  let fitted: ReturnType<typeof rung> = null;
  for (let max = ceiling; max >= floor && !fitted; max--) fitted = rung(max, true);
  for (let max = ceiling; max >= 1 && !fitted; max--) fitted = rung(max, false);
  if (!fitted) {
    // Even one color name overruns the budget. Say it anyway — a name that is
    // slightly too long beats no name, and it is never padded.
    const only = getUniqueColorNames(colors, { max: 1, veto });
    fitted = { names: only, joined: only.join(""), phrase: "" };
  }

  const { names, joined, phrase } = fitted;
  const headline = (phrase ? `${phrase} ${joined}` : joined) || "Gradient";
  return {
    name: `${headline.charAt(0).toUpperCase()}${headline.slice(1)}`,
    modifierPhrase: phrase,
    colorNames: names,
    stops: colors,
    tags,
    features,
  };
}

/** The name alone, for the callers that do not need the parts. */
export function paletteName(
  coeffs: CosineCoeffs,
  hexColors: readonly string[],
  options: HeadlineOptions = {},
): string {
  return describePaletteName(coeffs, hexColors, options).name;
}

export type { PaletteFeatures };

const STYLE_LABELS: Record<PaletteStyle, string> = {
  linearGradient: "linear gradient",
  linearSwatches: "linear swatch palette",
  angularGradient: "conic gradient",
  angularSwatches: "conic swatch palette",
  radialGradient: "radial gradient",
  radialSwatches: "radial swatch palette",
};

export function styleLabel(style: PaletteStyle): string {
  return STYLE_LABELS[style] ?? "gradient";
}

// paletteDescription() lived here until 2026-08-17: one formula sentence
// (name + style/steps/angle + hex + tags) rendered sr-only under the heading.
// Retired for palette-prose.ts — the paragraph is visible now, and the
// style/steps/angle facts moved into its R6 view sentence.
