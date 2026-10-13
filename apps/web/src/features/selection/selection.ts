import { createSignal } from "solid-js";
import type { Drawn } from "../../lib/palette.ts";

/* A stand-in for the frame's selection module, written to its contract so the editor builds against it: the palettes
   chosen for an export, at most a hundred, each in the view it was chosen in. Held in this page's memory here. The
   frame's own module takes its place. */

const MAX = 100;
const [items, setItems] = createSignal<readonly Drawn[]>([]);

/** The palettes chosen, oldest first. */
export const selection = items;
/** Whether a palette is chosen, in any view. */
export const selected = (seed: string): boolean => items().some(item => item.seed === seed);
/** A palette chosen, or let go. A full selection lets its oldest go. */
export function toggle(palette: Drawn): void {
  setItems(list =>
    list.some(item => item.seed === palette.seed)
      ? list.filter(item => item.seed !== palette.seed)
      : [...list, palette].slice(-MAX)
  );
}
