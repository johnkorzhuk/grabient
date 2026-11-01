/* A palette as data: its document (spec, view, colors, CSS and the addresses of its files) and its JSON, which adds
   what it is beyond its colors. Read from the seed alone, so the Worker's files and the page that shows them say the
   same; nothing here reads a database. */
import { decodePalette } from "./codec.ts";
import { contrastOf, luminance } from "./color.ts";
import { srgbName } from "./colorname.ts";
import { cssLine, cssWide } from "./css.ts";
import { sampleStops } from "./curve.ts";
import { readingName, seedReading } from "./name.ts";
import type { Palette } from "./palette.ts";
import type { Namer } from "./precise-names.ts";
import { samples, structure } from "./shape.ts";
import { toSpec } from "./spec.ts";
import { asSaved, drawnView, type View, viewSearch } from "./view.ts";

export const PALETTE_MODEL = "oklch-keyframes-v1";

/** A palette's classes as its colors read in the view; the same in every list and file. */
export const paletteClasses = (seed: string, view: Pick<View, "style" | "steps">) =>
  seedReading(seed, view.style, view.steps)?.classes ?? [];

/** The document of a palette (canonical) at a view: what is missing or invalid takes the default, and the steps never
    fall below its keyframes. */
export function paletteDocument(
  seed: string,
  P: Palette,
  origin: string,
  input: Partial<View> = {}
) {
  const view = drawnView(P, input);
  const query = viewSearch(view);
  const base = origin.replace(/\/$/, "");
  const file = (ext: string) => `${base}/${seed}${ext}${query}`;
  const stops = sampleStops(P, view.steps);
  return {
    model: PALETTE_MODEL,
    seed,
    kseed: seed,
    spec: toSpec(P),
    style: view.style,
    steps: view.steps,
    angle: view.angle,
    classes: paletteClasses(seed, view),
    colors: stops.map(s => s.hex),
    css: {
      hex: cssLine(stops, view.style, view.angle, "hex"),
      oklch: cssLine(stops, view.style, view.angle, "oklch")
    },
    url: file(""),
    links: {
      editor: file(""),
      json: file(".json"),
      png: file(".png"),
      svg: file(".svg"),
      css: file(".css"),
      ase: file(".ase"),
      gpl: file(".gpl"),
      grd: file(".grd"),
      tokens: file(".tokens.json"),
      og: `${base}/api/og?seed=${encodeURIComponent(seed)}${query ? `&${query.slice(1)}` : ""}`
    }
  };
}
export type PaletteDocument = ReturnType<typeof paletteDocument>;

const WHITE = [1, 1, 1];
const BLACK = [0, 0, 0];
/* a contrast to one place, never rounded up: 4.47 is 4.4, which does not pass at 4.5 */
const tenths = (ratio: number) => Math.floor(ratio * 10) / 10;

/** A palette's JSON: its document, then its title where one is written for it that its colors bear out and it is
    drawn as it was saved, its name (what its colors call it) and each color's (its precise name where `names` holds
    them, precise-names.ts), its kinds, how its hues relate, the text color that reads on each color with its contrast,
    and whether a wide-gamut screen shows more of it. English. Null for a seed that is no palette. */
export function paletteJson(
  seed: string,
  origin: string,
  input: Partial<View> = {},
  names?: Namer | null,
  written?: { title: string; view: Partial<View> } | null
) {
  const P = decodePalette(seed);
  if (!P) return null;
  const doc = paletteDocument(seed, P, origin, input);
  const reading = seedReading(seed, doc.style, doc.steps);
  if (!reading) return null;
  /* a written title describes the palette in the view it was saved in, and names it there alone */
  const title = written && asSaved(P, doc, written.view) ? written.title : null;
  const stops = sampleStops(P, doc.steps);
  const lums = stops.map(s => luminance(s.rgb));
  const onWhite = lums.map(l => contrastOf(l, luminance(WHITE)));
  const onBlack = lums.map(l => contrastOf(l, luminance(BLACK)));
  const text = stops.map((_, i) => (onWhite[i] >= onBlack[i] ? "#ffffff" : "#000000"));
  /* the darkest and lightest by their contrast with black, which orders them as luminance does */
  const darkest = onBlack.indexOf(Math.min(...onBlack));
  const lightest = onBlack.indexOf(Math.max(...onBlack));
  const { model, kseed, spec, style, steps, angle, classes, colors, css, url, links } = doc;
  return {
    model,
    seed,
    kseed,
    ...(title ? { title } : {}),
    name: readingName(reading),
    spec,
    style,
    steps,
    angle,
    classes,
    kinds: reading.kinds,
    harmony: structure(samples(P)).harmony,
    colors,
    names: stops.map(s => names?.(s.hex) ?? srgbName(s.rgb)),
    contrast: {
      text,
      ratios: stops.map((_, i) => tenths(text[i] === "#ffffff" ? onWhite[i] : onBlack[i])),
      ends: tenths(contrastOf(lums[darkest], lums[lightest]))
    },
    p3: cssWide(stops),
    css,
    url,
    links
  };
}
export type PaletteJson = NonNullable<ReturnType<typeof paletteJson>>;
