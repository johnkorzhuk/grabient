import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { colorFamily, srgbName } from "./colorname.ts";
import { COLOR_NAMES } from "./colornames.data.ts";
import { ENGLISH, type Language } from "./message.ts";
import {
  type PaletteReading,
  paletteTitle,
  readingName,
  readingPhrase,
  readPalette,
  STYLE_TITLE_WORDS,
  seedName,
  seedReading,
  titleFaults,
  titleWords
} from "./name.ts";
import type { Palette } from "./palette.ts";
import { STYLES, type Style } from "./view.ts";

interface Reading extends PaletteReading {
  name: string;
  seedName: string;
  phrase: string;
  title: string;
}
const names = golden<{
  entries: {
    id: string;
    seed: string;
    steps: number;
    readings: Record<Style, Reading>;
    ownTitleFaults: string[];
  }[];
  titleFaults: { text: string; seed: string; faults: string[] }[];
  colorNameGrid: { names: string[] };
}>("names");
const colors = golden<{ colorNames: string[]; families: Record<string, string> }>("colors");

test("a palette that plays an effect is titled as the effect, in its style's place", () => {
  const seed = names.entries[0].seed;
  const r = readPalette(decodePalette(seed) as Palette, "linearGradient", 7);
  const name = readingName(r);
  expect(paletteTitle(r, "linearGradient")).toBe(`${name} gradient`);
  expect(paletteTitle(r, "linearGradient", ENGLISH, "glass")).toBe(`${name} fluted glass gradient`);
  expect(paletteTitle(r, "radialSwatches", ENGLISH, "rosette")).toBe(`${name} rosette gradient`);
  expect(paletteTitle(r, "linearGradient", ENGLISH, null)).toBe(`${name} gradient`);
});

test("a title says a style in the words a palette is searched by, and an effect as the gradient it is", () => {
  /* a blend along a line is the gradient a search means, and bands are its color palette; a ring or a sweep keeps
     the word that tells it apart */
  expect(STYLES.map(style => titleWords(style))).toEqual([
    "gradient",
    "color palette",
    "angular gradient",
    "angular palette",
    "radial gradient",
    "radial palette"
  ]);
  expect(titleWords("linearSwatches", "aurora")).toBe("aurora gradient");
  expect(titleWords("radialGradient", "strata")).toBe("sandstone gradient");
  /* a language says both in its own words, the effect's inside the title's */
  const other: Language = {
    locale: "fr",
    t: (message, params = {}) =>
      message === "{effect} gradient"
        ? `dégradé ${params.effect}`
        : message === "silk"
          ? "soie"
          : message === "gradient"
            ? "dégradé linéaire"
            : message
  };
  expect(titleWords("linearGradient", null, other)).toBe("dégradé linéaire");
  expect(titleWords("linearGradient", "silk", other)).toBe("dégradé soie");
  /* every title leaves its name the room a result's title link has: the words are what the room is measured with */
  for (const e of names.entries.slice(0, 40))
    for (const style of STYLES)
      expect(e.readings[style].title.endsWith(` ${STYLE_TITLE_WORDS[style]}`), e.id).toBe(true);
});

test("every palette's reading, name, phrase and title in every style are as before", () => {
  for (const e of names.entries) {
    const P = decodePalette(e.seed) as Palette;
    for (const [style, want] of Object.entries(e.readings) as [Style, Reading][]) {
      const r = readPalette(P, style, e.steps);
      expect(
        {
          name: readingName(r),
          seedName: seedName(e.seed, style, e.steps),
          phrase: readingPhrase(r),
          title: paletteTitle(r, style),
          ...r
        },
        `${e.id} ${style}`
      ).toEqual(want);
    }
    /* a computed title holds by its own check */
    expect(titleFaults(e.readings.linearGradient.name, P)).toEqual(e.ownTitleFaults);
  }
});

test("written titles: the words the colors contradict", () => {
  for (const c of names.titleFaults)
    expect(titleFaults(c.text, decodePalette(c.seed) as Palette), c.text).toEqual(c.faults);
  /* words that name Object.prototype's keys are no color and no fault */
  expect(
    titleFaults("Constructors of a constructor", decodePalette("kSPTq14zC4voJMs") as Palette)
  ).toEqual([]);
});

test("every sRGB color has a name, and every name a family", () => {
  const grid: string[] = [];
  for (let r = 0; r <= 8; r++)
    for (let g = 0; g <= 8; g++)
      for (let b = 0; b <= 8; b++) grid.push(srgbName([r / 8, g / 8, b / 8]));
  expect(grid).toEqual(names.colorNameGrid.names);
  expect(COLOR_NAMES).toEqual(colors.colorNames);
  expect(Object.fromEntries(COLOR_NAMES.map(n => [n, colorFamily(n)]))).toEqual(colors.families);
});

test("a name is said in the reader's language: the messages translated, the sentence cased in its locale", () => {
  const upper: Language = {
    t: (message, params) => ENGLISH.t(message, params).toUpperCase(),
    locale: "tr"
  };
  const reading = seedReading("kWNS69s7i_sVKwfTx8K6arBQ") as PaletteReading;
  expect(readingName(reading)).toBe("Analogous navy, blue and lavender");
  expect(readingName(reading, upper)).toBe("ANALOGOUS NAVY, BLUE AND LAVENDER");
  expect(
    seedName("kWNS69s7i_sVKwfTx8K6arBQ", "linearGradient", 7, { ...ENGLISH, locale: "tr" })
  ).toBe("Analogous navy, blue and lavender");
  expect(seedName("not a seed")).toBe("");
});
