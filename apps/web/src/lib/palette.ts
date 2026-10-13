import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Style } from "@grabient/engine/view.ts";

/** A palette as a page draws it: its seed in a view. A card, a selected palette and the bar's colors all are one. */
export interface Drawn {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}

/* A page reads the same palettes again and again (a card for its picture and its name, the bar for its colors), and
   each reading samples and fits the whole curve. The readings are kept by seed and steps, the oldest going first. */
const KEPT = 1024;
const kept = new Map<string, readonly string[]>();

/** The palette's colors at its view's steps, never fewer than its keyframes; none for a seed that is no palette. */
export function hexesOf(p: Pick<Drawn, "seed" | "steps">): readonly string[] {
  const key = `${p.seed}:${p.steps}`;
  let hexes = kept.get(key);
  if (!hexes) {
    const palette = decodePalette(p.seed);
    hexes = palette
      ? sampleStops(palette, Math.max(p.steps, palette.anchors.length)).map(stop => stop.hex)
      : [];
    if (kept.size >= KEPT) kept.delete(kept.keys().next().value!);
    kept.set(key, hexes);
  }
  return hexes;
}
