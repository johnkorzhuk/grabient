/* The colors a search by colors measures a palette against: 16 along its curve as it renders, then each keyframe's own
   color as its listed hex reads. They come from the seed, so the snapshot carries none: an isolate measures a snapshot's
   palettes on its first search by asked colors, and a newer snapshot measures only the palettes the last one lacked. */
import { decodePalette, K_MAX, type Palette } from "@grabient/engine";
import { srgbToOklab } from "@grabient/engine/color.ts";
import { sampleSrgb } from "@grabient/engine/curve.ts";
import { paletteOf } from "@grabient/search/colors.ts";
import type { Snapshot } from "@grabient/search/snapshot.ts";

const ALONG = 16;
const ROW = (ALONG + K_MAX) * 3;

/** OKLab L, a, b of the 24 colors each palette holds, a row a palette. */
export type Facts = Float32Array;
type Lab = ArrayLike<number>;

/* one of `count` colors at even places along the curve, as its hex reads, so a color a card lists measures 0 */
function listed(palette: Palette, k: number, count: number) {
  const [r, g, b] = sampleSrgb(palette, k / (count - 1)).map(v => Math.round(v * 255) / 255);
  return srgbToOklab(r, g, b);
}

function measure(facts: Facts, i: number, seed: string): void {
  const palette = decodePalette(seed);
  const from = i * ROW;
  // what is no palette holds no color, and nothing is near it
  if (!palette) {
    facts.fill(Infinity, from, from + ROW);
    return;
  }
  const own = palette.anchors.length;
  for (let k = 0; k < ALONG; k++)
    facts.set(srgbToOklab(...sampleSrgb(palette, k / (ALONG - 1))), from + k * 3);
  for (let k = 0; k < own; k++) facts.set(listed(palette, k, own), from + (ALONG + k) * 3);
  // with fewer than eight keyframes the row ends on colors it already holds
  facts.copyWithin(from + (ALONG + own) * 3, from, from + (K_MAX - own) * 3);
}

/** The colors of these seeds, a row each in their order: for the few palettes a search already holds. */
export function seedFacts(seeds: readonly string[]): Facts {
  const facts = new Float32Array(seeds.length * ROW);
  seeds.forEach((seed, i) => {
    measure(facts, i, seed);
  });
  return facts;
}

const built = new WeakMap<Snapshot, Facts>();
/* the table built last: the next snapshot keeps nearly every palette, so it copies those rows */
let last: { at: ReadonlyMap<string, number>; facts: Facts } | null = null;

/** A snapshot's colors, a row for each of its palettes, kept for as long as the snapshot is. */
export function factsOf(snapshot: Snapshot): Facts {
  const held = built.get(snapshot);
  if (held) return held;
  const facts = new Float32Array(snapshot.seeds.length * ROW);
  const before = last;
  snapshot.seeds.forEach((seed, i) => {
    const j = before?.at.get(seed);
    if (before && j !== undefined)
      facts.set(before.facts.subarray(j * ROW, (j + 1) * ROW), i * ROW);
    else measure(facts, i, seed);
  });
  built.set(snapshot, facts);
  last = { at: snapshot.at, facts };
  return facts;
}

/** How far palette `i` is from holding these colors: for each, the distance to the nearest color it holds, and the
    mean of those. 0.02 is about one step the eye can tell. */
export function holdDistance(facts: Facts, i: number, colors: readonly Lab[], row = ROW): number {
  let sum = 0;
  for (const color of colors) {
    let least = Infinity;
    for (let o = i * row; o < (i + 1) * row; o += 3) {
      const d =
        (facts[o] - color[0]) ** 2 +
        (facts[o + 1] - color[1]) ** 2 +
        (facts[o + 2] - color[2]) ** 2;
      if (d < least) least = d;
    }
    sum += Math.sqrt(least);
  }
  return sum / colors.length;
}

/** How far the colors along palette `i`'s curve stray from these: for each of its 16, the distance to the nearest of
    them, and the mean. Against the asked colors and their blend, it is what the palette holds that nobody asked for. */
export function strayDistance(facts: Facts, i: number, colors: readonly Lab[]): number {
  let sum = 0;
  for (let k = 0; k < ALONG; k++) {
    const o = i * ROW + k * 3;
    let least = Infinity;
    for (const color of colors) {
      const d =
        (facts[o] - color[0]) ** 2 +
        (facts[o + 1] - color[1]) ** 2 +
        (facts[o + 2] - color[2]) ** 2;
      if (d < least) least = d;
    }
    sum += Math.sqrt(least);
  }
  return sum / ALONG;
}

/** The 16 colors along the curve these hex colors make in their order: what blends between them. */
export function blendOf(hexes: readonly string[]): [number, number, number][] {
  const palette = paletteOf(hexes);
  return palette
    ? Array.from({ length: ALONG }, (_, k) => srgbToOklab(...sampleSrgb(palette, k / (ALONG - 1))))
    : [];
}

/** How far a palette as the site shows it is from these colors. A Swatches view draws hard bands and never the curve
    between them, so it is measured against its bands; any other view against its seed's colors. */
export function shownDistance(
  item: { kseed: string; style: string; steps: number },
  colors: readonly Lab[]
): number {
  const palette = item.style.endsWith("Swatches") ? decodePalette(item.kseed) : null;
  if (!palette) return holdDistance(seedFacts([item.kseed]), 0, colors);
  const bands = Array.from({ length: item.steps }, (_, k) => listed(palette, k, item.steps)).flat();
  return holdDistance(Float32Array.from(bands), 0, colors, bands.length);
}
