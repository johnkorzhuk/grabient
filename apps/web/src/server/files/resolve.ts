/* The palette a name leads to, as its page's address does: an old grabient.com id through the migration maps
   (seo/legacy.ts), then the name itself, decoded and written again canonical. An old palette the maps lack leads
   nowhere here: the Worker fits one at its page's and its share card's address alone (seo/legacy-fit.ts). */
import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { legacySeed } from "../seo/legacy.ts";

export interface Resolved {
  seed: string;
  palette: Palette;
}

/** A palette's canonical seed from its seed or an old id the maps hold; null for anything else. */
export function canonicalPaletteSeed(name: string): string | null {
  const palette = decodePalette(legacySeed(name) ?? name);
  return palette ? encodePalette(palette) : null;
}

export function resolvePalette(name: string): Resolved | null {
  const seed = canonicalPaletteSeed(name);
  const palette = seed === null ? null : decodePalette(seed);
  return seed !== null && palette ? { seed, palette } : null;
}
