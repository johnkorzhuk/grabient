import { createSignal } from "solid-js";

/* Stands in for the shell's selection (shellui) until it lands: the palettes chosen for an export, by seed, up to a
   hundred, the oldest leaving first. */

const MAX = 100;
const [chosen, setChosen] = createSignal<readonly string[]>([]);

/** Whether a palette is in the selection. */
export const selected = (seed: string): boolean => chosen().includes(seed);

/** Adds a palette to the selection, or takes it out. */
export function toggle(seed: string): void {
  setChosen(list =>
    list.includes(seed) ? list.filter(s => s !== seed) : [...list, seed].slice(-MAX)
  );
}
