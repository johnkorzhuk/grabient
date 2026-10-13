import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { drawnView } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { keyRow } from "@grabient/ui/keymap.ts";
import { rowKeys, showKey } from "@grabient/ui/keys.ts";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { record } from "../../app/undo.ts";
import type { Drawn } from "../../lib/palette.ts";
import { trackEvent } from "../analytics/analytics.ts";

/* The selection: up to a hundred palettes a reader gathers from any page to export together, each in the view it was
   chosen in. It is this browser's (`grabient-keyframe-exports`), shared by its tabs, and starts empty on the server and
   in the first render, so a page hydrates as it was sent; a page reads it once it is live (loadSelection). A change is
   a step of the page's undo: Mod+Z takes back what it added and puts back what it let go, each in its place. A full
   selection makes room by letting its oldest palettes go, never one just asked for, and Mod+Z puts them back. */

/** A palette in the selection: the palette in its view, and the id that view makes it. */
export interface SelectedPalette extends Drawn {
  id: string;
}

/** How many palettes the selection holds: room for a large export while the copied image, fitted in 16 megapixels,
    keeps each palette big enough to use. A collection holds as many, so a whole selection can be saved as one. */
export const SELECTION_MAX = 100;
const KEY = "grabient-keyframe-exports";
/* the selection an older grabient.com kept (`_` seeds), adopted once by a browser with none of its own */
const OLD_KEY = "export-list";

const [items, setItems] = createSignal<readonly SelectedPalette[]>([]);
const [read, setRead] = createSignal(false);
/** The palettes selected, oldest first. Empty until the page has read this browser's selection. */
export const selection = items;
/** Whether this browser's selection has been read: until then an empty one only means it is not known yet. */
export const selectionRead = read;
/* the same list, plain: a signal written now reads its old value until the write settles */
let current: readonly SelectedPalette[] = [];

/** A palette as the selection holds it: canonical, in its view, never fewer steps than keyframes; null for none. */
export function selectedPalette(value: unknown): SelectedPalette | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<Drawn>;
  const palette = decodePalette(input.seed);
  if (!palette) return null;
  const seed = encodePalette(palette);
  const view = drawnView(palette, input);
  return { id: `${seed}:${view.style}:${view.steps}:${view.angle}`, seed, ...view };
}

/** A kept selection, read: palettes past the selection's room and repeats left out. */
export function readSelection(raw: string | null): SelectedPalette[] {
  try {
    const data = raw ? JSON.parse(raw) : null;
    if (data?.version !== 1 || !Array.isArray(data.items)) return [];
    const seen = new Set<string>();
    return data.items.slice(0, SELECTION_MAX).flatMap((value: unknown) => {
      const item = selectedPalette(value);
      if (!item || seen.has(item.id)) return [];
      seen.add(item.id);
      return [item];
    });
  } catch {
    return [];
  }
}

function keep(next: readonly SelectedPalette[]) {
  current = next;
  setItems(next);
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, items: next }));
  } catch {
    /* a browser that keeps no site data: the selection lasts as long as the page */
  }
}

/** `list` with `take` out and `give` in, in the order `order` holds them, and what `order` never held after them: what
    a step of the undo puts back beside whatever another tab changed meanwhile. */
function restored(
  list: readonly SelectedPalette[],
  take: readonly SelectedPalette[],
  give: readonly SelectedPalette[],
  order: readonly SelectedPalette[]
): SelectedPalette[] {
  const out = new Set(take.map(entry => entry.id));
  const byId = new Map([...list, ...give].filter(e => !out.has(e.id)).map(e => [e.id, e] as const));
  const placed = order.flatMap(entry => byId.get(entry.id) ?? []);
  const seen = new Set(placed.map(entry => entry.id));
  const next = [...placed, ...list.filter(entry => !out.has(entry.id) && !seen.has(entry.id))];
  return next.slice(Math.max(0, next.length - SELECTION_MAX));
}
function change(next: readonly SelectedPalette[]) {
  const before = current;
  const had = new Set(before.map(entry => entry.id));
  const has = new Set(next.map(entry => entry.id));
  const added = next.filter(entry => !had.has(entry.id));
  const gone = before.filter(entry => !has.has(entry.id));
  if (!added.length && !gone.length) return;
  keep(next);
  record({
    undo: async () => keep(restored(current, added, gone, before)),
    redo: async () => keep(restored(current, gone, added, next))
  });
}
/** `list` with `fresh` after it, at most the selection's room: the oldest go first, those `asked` for again last. */
function withRoom(
  list: readonly SelectedPalette[],
  fresh: readonly SelectedPalette[],
  asked: ReadonlySet<string>
): { next: SelectedPalette[]; dropped: number } {
  const all = [...list, ...fresh];
  let excess = all.length - SELECTION_MAX;
  if (excess <= 0) return { next: all, dropped: 0 };
  const dropped = excess;
  const next = all.filter(entry => (excess > 0 && !asked.has(entry.id) ? (excess--, false) : true));
  return { next: next.slice(Math.max(0, next.length - SELECTION_MAX)), dropped };
}

/** The old site's selection, its palettes fitted to keyframes one at a time in idle moments, then forgotten. */
async function adoptOld() {
  let old: Partial<Drawn>[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(OLD_KEY) ?? "null");
    if (!raw) return;
    if (raw.version === 1 && Array.isArray(raw.items) && !current.length)
      old = raw.items.slice(0, SELECTION_MAX);
  } catch {
    /* unreadable: forgotten below */
  }
  const { likeSeed } = await import("@grabient/engine/legacy-import.ts");
  const idle = (work: () => void) =>
    typeof requestIdleCallback === "function"
      ? requestIdleCallback(work, { timeout: 2000 })
      : setTimeout(work, 50);
  const next = () => {
    const entry = old.shift();
    if (!entry) {
      try {
        localStorage.removeItem(OLD_KEY);
      } catch {
        /* storage refused: nothing was kept */
      }
      return;
    }
    const seed =
      typeof entry.seed === "string" && entry.seed[0] === "_" ? likeSeed(entry.seed) : null;
    const item = seed && selectedPalette({ ...entry, seed });
    if (item && current.length < SELECTION_MAX && !current.some(kept => kept.id === item.id))
      keep([...current, item]);
    idle(next);
  };
  idle(next);
}

let loaded = false;
/** Reads this browser's selection once the page is live, and follows the other tabs' changes from then on. */
export function loadSelection(): void {
  if (loaded || isServer) return;
  loaded = true;
  try {
    current = readSelection(localStorage.getItem(KEY));
  } catch {
    current = [];
  }
  setItems(current);
  setRead(true);
  void adoptOld();
  window.addEventListener("storage", event => {
    if (event.key !== KEY && event.key !== null) return;
    current = readSelection(event.newValue);
    setItems(current);
  });
}

/** Whether a palette is in the selection: in this view, or a seed in any. */
export function selected(palette: Drawn | string): boolean {
  if (typeof palette === "string") return items().some(entry => entry.seed === palette);
  const id = selectedPalette(palette)?.id;
  return items().some(entry => entry.id === id);
}

/** A card's plus: a palette in the selection comes out, any other goes in. A full selection makes room by letting its
    oldest palette go ('made room'), which Mod+Z puts back. */
export function toggle(palette: Drawn): "added" | "made room" | "removed" | "invalid" {
  loadSelection();
  const item = selectedPalette(palette);
  if (!item) return "invalid";
  if (current.some(entry => entry.id === item.id)) {
    change(current.filter(entry => entry.id !== item.id));
    trackEvent("remove_from_export", { count: 1 });
    return "removed";
  }
  const { next, dropped } = withRoom(current, [item], new Set([item.id]));
  change(next);
  trackEvent("add_to_export", { count: 1 });
  return dropped ? "made room" : "added";
}

/** The palettes not selected yet, added in order: a collection's Add all. Says how many came in and how many went to
    make room. */
export function addAll(palettes: readonly Drawn[]): { added: number; dropped: number } {
  loadSelection();
  const asked = new Set<string>();
  const fresh: SelectedPalette[] = [];
  for (const palette of palettes) {
    const item = selectedPalette(palette);
    if (!item || asked.has(item.id)) continue;
    asked.add(item.id);
    if (!current.some(entry => entry.id === item.id)) fresh.push(item);
  }
  if (!fresh.length) return { added: 0, dropped: 0 };
  const added = Math.min(fresh.length, SELECTION_MAX);
  const { next, dropped } = withRoom(current, fresh.slice(0, SELECTION_MAX), asked);
  change(next);
  trackEvent("add_to_export", { count: added });
  return { added, dropped };
}

/** One palette out, by its id: a cell of the export's preview pressed. */
export const removeSelected = (id: string): void =>
  change(current.filter(entry => entry.id !== id));

/** These palettes out in one step, which one undo puts back: a collection's Add all pressed again. */
export function removeAll(palettes: readonly Drawn[]): void {
  const gone = new Set(palettes.map(palette => selectedPalette(palette)?.id));
  change(current.filter(entry => !gone.has(entry.id)));
  trackEvent("remove_from_export", { count: gone.size });
}

/** Every palette out, which one undo puts back. */
export function clearSelection(): void {
  change([]);
  trackEvent("clear_export_list");
}

/** What a page says when the selection made room: how many of its oldest palettes went, and the key that puts them
    back. */
export const roomNote = (count: number): string =>
  t(
    msg(
      "{count, plural, one {The selection holds up to {max} palettes. The oldest was removed. Undo with {key}.} other {The selection holds up to {max} palettes. The # oldest were removed. Undo with {key}.}}"
    ),
    { count, max: SELECTION_MAX, key: showKey(rowKeys(keyRow("undo")!)[0]) }
  );
