import type { Style } from "@grabient/engine/view.ts";

/* Stands in for the shell's selection (shellui) until it lands, under its names: the palettes chosen for an export,
   each in the view it was chosen in. */

interface Drawn {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}

/** Whether a palette is in the selection: in this view, or a seed in any. */
export const selected = (_palette: Drawn | string): boolean => false;

/** A card's plus: a palette in the selection comes out, any other goes in. */
export const toggle = (_palette: Drawn): "added" | "made room" | "removed" | "invalid" => "invalid";
