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
 * left, and it puts the worst case exactly on 60.
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
 */
export const TITLE_SUFFIX = " Gradient Palette";

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
 */
const CONTRADICTED_BY: Record<string, readonly string[]> = {
  pastel: ["dark", "deep", "black", "midnight", "burnt", "rich"],
  neon: ["pale", "faded", "dusty", "muted", "grayish", "greyish", "washed"],
  muted: ["neon", "bright", "electric", "vivid"],
  earthy: ["neon", "electric", "vivid", "pastel"],
  dark: ["pale", "light", "baby", "powder", "white", "bright"],
};

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
const NAMES_FOR_STRUCTURE: Record<string, number> = {
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
    const names = getUniqueColorNames(colors, { max });
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
    const only = getUniqueColorNames(colors, { max: 1 });
    fitted = { names: only, joined: only.join(""), phrase: "" };
  }

  const { names, joined, phrase } = fitted;
  const headline = (phrase ? `${phrase} ${joined}` : joined) || "Gradient";
  return {
    name: `${headline.charAt(0).toUpperCase()}${headline.slice(1)}`,
    modifierPhrase: phrase,
    colorNames: names,
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

/** The sr-only sentence under the heading, identical on the server and the client. */
export function paletteDescription(
  headline: string,
  style: PaletteStyle,
  steps: number,
  angle: number,
  hexColors: readonly string[],
  tags: readonly string[],
): string {
  return (
    `${headline} gradient palette. ${styleLabel(style)}, ${steps} steps, ${angle} degrees. ` +
    `Hex codes: ${hexColors.join(", ")}. ` +
    `Tagged ${tags.join(", ")}. Available as CSS, SVG and PNG.`
  );
}
