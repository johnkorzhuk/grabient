/* Palettes and collections as vectors of the search space. A palette's vector comes from its seed alone, so it is the
   same wherever it is measured; a collection's mixes what its words say with where its palettes stand. */
import { decodePalette, type Palette } from "@grabient/engine";
import type { Harmony } from "@grabient/engine/shape.ts";
import { paletteFeatures } from "./features.ts";
import { paletteSide, type Tower } from "./tower.ts";

export interface PaletteVector {
  values: number[];
  /** the color relationship, kept beside the vector for searches that name one */
  harmony: Harmony;
}

export function paletteVector(model: Tower, palette: Palette): PaletteVector {
  const { vector, structure } = paletteFeatures(palette);
  return { values: Array.from(paletteSide(model, vector)), harmony: structure.harmony };
}

export function seedVector(model: Tower, seed: string): PaletteVector | null {
  const palette = decodePalette(seed);
  return palette ? paletteVector(model, palette) : null;
}

/** The weighted sum, rescaled to unit length: the words of a query together, or a collection's two halves. */
export function blend(
  vectors: readonly ArrayLike<number>[],
  weights?: readonly number[]
): number[] {
  const d = vectors[0]?.length ?? 0;
  const out = new Array<number>(d).fill(0);
  vectors.forEach((v, k) => {
    const w = weights?.[k] ?? 1;
    for (let j = 0; j < d; j++) out[j] += w * v[j];
  });
  const n = Math.hypot(...out) || 1;
  return out.map(x => x / n);
}

/** What a collection says of itself, as one text for the embedder. */
export const collectionText = (
  title: string,
  description: string,
  tags: readonly string[]
): string =>
  [title, description, tags.join(", ")]
    .map(part => part.trim())
    .filter(Boolean)
    .join(". ");

/** A collection's place: half its text's vector (the text side already applied), half the mean of its palettes. Measured
    against either half alone, the even mix found the right collections most often. Without a text the palettes stand
    alone. */
export function collectionVectorFrom(
  words: ArrayLike<number> | null,
  members: readonly ArrayLike<number>[]
): number[] {
  if (!words) return blend(members);
  return members.length ? blend([words, blend(members)], [0.5, 0.5]) : Array.from(words);
}
