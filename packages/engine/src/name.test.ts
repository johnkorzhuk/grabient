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
  titleWords,
  titleWordsFit
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
  expect(paletteTitle(r, "radialSwatches", ENGLISH, "rosette")).toBe(`${name} rosette`);
  expect(paletteTitle(r, "linearGradient", ENGLISH, null)).toBe(`${name} gradient`);
});

test("a title says a style in the words a palette is searched by, and an effect that blends as the gradient it is", () => {
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
  /* the effects that blend the palette's colors are gradients; the ones that draw it as shapes of one color each say
     their own word alone, as they did */
  expect(
    (["glass", "blob", "silk", "aurora"] as const).map(kind => titleWords("linearSwatches", kind))
  ).toEqual(["fluted glass gradient", "blob gradient", "silk gradient", "aurora gradient"]);
  expect(
    (["rosette", "papercut", "strings", "dimple", "strata"] as const).map(kind =>
      titleWords("radialGradient", kind)
    )
  ).toEqual(["rosette", "papercut", "strings", "dimple", "sandstone"]);
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
  expect(titleWords("linearGradient", "rosette", other)).toBe("rosette");
  /* no style's title words are wider in a result's title link than its plain words, which a name's room is measured
     with: so a title in them stays in the link, and every palette is named as it was before its title took them (the
     goldens' names are grabient4's own) */
  for (const style of STYLES) expect(titleWordsFit(style), style).toBe(true);
  for (const e of names.entries.slice(0, 40))
    for (const style of STYLES)
      expect(e.readings[style].title, e.id).toBe(
        `${e.readings[style].name} ${STYLE_TITLE_WORDS[style]}`
      );
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
