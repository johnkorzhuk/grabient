/* Stands in for the shell's selection (shellui) until it lands: the palettes chosen for an export, up to a hundred. */

/** Whether a palette is in the selection. */
export const selected = (_seed: string): boolean => false;

/** Adds a palette to the selection, or takes it out. */
export function toggle(_seed: string): void {}
