/* A search by colors: the hex codes a query holds, and the palettes those colors make. From the codes alone, so the
   Worker and the page read a query alike and the row of made palettes renders the same on both sides of hydration. */
import { canonical, decodePalette, encodePalette, K_MAX, type Palette } from "@grabient/engine";
import { hexToSrgb, srgbToOklab } from "@grabient/engine/color.ts";
import { sampleSrgb } from "@grabient/engine/curve.ts";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import type { Style } from "@grabient/engine/view.ts";

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

/** A hex code as # and six lowercase digits: three are doubled, an alpha after six is dropped. */
export function sixDigits(hex: string): string {
  const h = hex.replace(/^#/, "").toLowerCase();
  return `#${h.length === 3 ? [...h].map(c => c + c).join("") : h.slice(0, 6)}`;
}

/** The hex codes in a query, in its order, however a list of them is written (commas, "and", brackets, quotes). */
export const queryColors = (query: string): string[] => (query.match(HEX) ?? []).map(sixDigits);

/** The query without its hex codes. */
export const withoutColors = (query: string): string =>
  query.replace(HEX, " ").replace(/\s+/g, " ").trim();

/** OKLab of a six-digit hex code. */
export const labOf = (hex: string) => srgbToOklab(...hexToSrgb(hex)!);

/** The palette these colors make in their order, canonical; null for fewer than two or more than eight. */
export function paletteOf(hexes: readonly string[]): Palette | null {
  const made = hexes.length >= 2 ? anchorsFromHexes(hexes) : null;
  return made && canonical(made);
}

/** How far a palette's curve strays, at most, from the straight mix of the two colors either side of it: the color its
    blend shows that neither has, as when it turns through a hue. */
export function invented(palette: Palette, hexes: readonly string[]): number {
  const labs = hexes.map(labOf);
  const gaps = hexes.length - 1;
  let most = 0;
  for (let i = 0; i < gaps; i++) {
    for (const t of [0.25, 0.5, 0.75]) {
      const at = srgbToOklab(...sampleSrgb(palette, (i + t) / gaps));
      const mix = labs[i].map((v, j) => v + (labs[i + 1][j] - v) * t);
      most = Math.max(most, Math.hypot(at[0] - mix[0], at[1] - mix[1], at[2] - mix[2]));
    }
  }
  return most;
}

/** below this chroma a color has no hue that leads a ramp */
const HUED = 0.04;
/** two hues this near are one hue's ramp */
const HUE_NEAR = 35;
/** a ramp spans at least this much lightness, or it is one color twice */
const RAMP_SPAN = 0.15;
/** a blend this far from the straight mix either side shows a color its colors lack */
const INVENTS = 0.09;
export const MADE_MAX = 6;

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/** The palettes a list of colors makes, at most six seeds, each another reading of them: the colors as written, dark to
    light, a ramp for each hue that holds two or more, the darkest with the most colorful and the lightest, the dark
    half, the light half, and the darkest to the lightest. A reading past the first is left out when its blend turns
    through a hue its colors lack (sage to orchid by way of orange): the colors as written are the reader's own. */
export function madePalettes(colors: readonly string[]): string[] {
  const list = colors.slice(0, K_MAX);
  const out: string[] = [];
  const add = (hexes: readonly string[]) => {
    const palette = paletteOf(hexes);
    const seed = palette && encodePalette(palette);
    if (
      seed &&
      !out.includes(seed) &&
      out.length < MADE_MAX &&
      (!out.length || invented(palette, hexes) <= INVENTS)
    ) {
      out.push(seed);
    }
  };
  const read = list.flatMap(hex => {
    const rgb = hexToSrgb(hex);
    if (!rgb) return [];
    const [l, a, b] = srgbToOklab(...rgb);
    return [
      { hex, l, chroma: Math.hypot(a, b), hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
    ];
  });
  type Read = (typeof read)[number];
  const byLight = (set: readonly Read[]) => [...set].sort((p, q) => p.l - q.l).map(c => c.hex);
  add(list);
  add(byLight(read));
  const hues: Read[][] = [];
  for (const color of read.filter(c => c.chroma >= HUED).sort((p, q) => q.chroma - p.chroma)) {
    const home = hues.find(hue => hueGap(hue[0].hue, color.hue) <= HUE_NEAR);
    if (home) home.push(color);
    else hues.push([color]);
  }
  for (const hue of hues) {
    const ramp = [...hue].sort((p, q) => p.l - q.l);
    if (ramp.length >= 2 && Math.abs(ramp[ramp.length - 1].l - ramp[0].l) >= RAMP_SPAN)
      add(ramp.map(c => c.hex));
  }
  const sorted = [...read].sort((p, q) => p.l - q.l);
  if (sorted.length > 3) {
    const ends = [sorted[0], sorted[sorted.length - 1]];
    const vivid = read.filter(c => !ends.includes(c)).sort((p, q) => q.chroma - p.chroma)[0];
    add(byLight([...ends, vivid]));
    add(sorted.slice(0, 3).map(c => c.hex));
    add(sorted.slice(-3).map(c => c.hex));
  }
  if (sorted.length > 2) add([sorted[0].hex, sorted[sorted.length - 1].hex]);
  return out;
}

/* How each made palette is first drawn, by its place in the row: most as swatches of each kind, a band for each color
   read, and two as gradients from many stops. A style the reader chose still draws them all. */
const MADE_STYLES: readonly Style[] = [
  "linearSwatches",
  "linearGradient",
  "radialSwatches",
  "angularSwatches",
  "radialGradient",
  "linearSwatches"
];
/** the stops a made gradient is drawn from, and the bands of two colors' swatches: a dark to a light is a scale of five */
const GRADIENT_STOPS = 48;
const PAIR_BANDS = 5;

export function madeView(
  seed: string,
  place: number
): { style: Style; steps: number; angle: number } {
  const style = MADE_STYLES[place % MADE_STYLES.length];
  const keyframes = decodePalette(seed)?.anchors.length ?? 2;
  return {
    style,
    steps: style.endsWith("Gradient") ? GRADIENT_STOPS : keyframes > 2 ? keyframes : PAIR_BANDS,
    angle: 90
  };
}
