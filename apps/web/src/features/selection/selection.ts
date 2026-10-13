import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { drawnView } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { createSignal } from "solid-js";
import { record } from "../../app/undo.ts";
import type { Drawn } from "../../lib/palette.ts";

/* Stands in for the shell's selection (shellui) until it lands, under its names: up to a hundred palettes gathered for
   an export, each in the view it was chosen in, kept in this tab alone. A change is a step of the page's undo. */

export interface SelectedPalette extends Drawn {
  id: string;
}

export const SELECTION_MAX = 100;
const [items, setItems] = createSignal<readonly SelectedPalette[]>([]);
/** The palettes selected, oldest first. */
export const selection = items;

function selectedPalette(value: Drawn): SelectedPalette | null {
  const palette = decodePalette(value.seed);
  if (!palette) return null;
  const seed = encodePalette(palette);
  const view = drawnView(palette, value);
  return { id: `${seed}:${view.style}:${view.steps}:${view.angle}`, seed, ...view };
}
function change(next: readonly SelectedPalette[]) {
  const before = items();
  setItems(next);
  record({ undo: async () => void setItems(before), redo: async () => void setItems(next) });
}

/** Whether a palette is in the selection: in this view, or a seed in any. */
export function selected(palette: Drawn | string): boolean {
  if (typeof palette === "string") return items().some(entry => entry.seed === palette);
  const id = selectedPalette(palette)?.id;
  return items().some(entry => entry.id === id);
}

/** A card's plus: a palette in the selection comes out, any other goes in, the oldest making room. */
export function toggle(palette: Drawn): "added" | "made room" | "removed" | "invalid" {
  const item = selectedPalette(palette);
  if (!item) return "invalid";
  const now = items();
  if (now.some(entry => entry.id === item.id)) {
    change(now.filter(entry => entry.id !== item.id));
    return "removed";
  }
  const next = [...now, item];
  change(next.slice(-SELECTION_MAX));
  return next.length > SELECTION_MAX ? "made room" : "added";
}

/** The palettes not selected yet, added in order: a collection's Add all. */
export function addAll(palettes: readonly Drawn[]): { added: number; dropped: number } {
  const now = items();
  const fresh = palettes.flatMap(palette => {
    const item = selectedPalette(palette);
    return item && !now.some(entry => entry.id === item.id) ? [item] : [];
  });
  if (!fresh.length) return { added: 0, dropped: 0 };
  const next = [...now, ...fresh];
  change(next.slice(-SELECTION_MAX));
  return {
    added: Math.min(fresh.length, SELECTION_MAX),
    dropped: Math.max(0, next.length - SELECTION_MAX)
  };
}

/** These palettes out in one step. */
export function removeAll(palettes: readonly Drawn[]): void {
  const gone = new Set(palettes.map(palette => selectedPalette(palette)?.id));
  change(items().filter(entry => !gone.has(entry.id)));
}

/** What a page says when the selection made room. */
export const roomNote = (count: number): string =>
  t(
    msg(
      "{count, plural, one {The selection holds up to {max} palettes. The oldest was removed. Undo with {key}.} other {The selection holds up to {max} palettes. The # oldest were removed. Undo with {key}.}}"
    ),
    { count, max: SELECTION_MAX, key: "Ctrl+Z" }
  );
