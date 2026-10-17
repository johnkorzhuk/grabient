import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import type { ListView } from "../list/appearance.ts";
import type { PaletteOrder } from "./address.ts";
import { frameOf, type ListPlace, listPath, listSearch } from "./params.ts";

/* The collections list the reader came from, kept for the tab: where a collection's page leads back to, with the
   list's words, in the order the reader chose last, there or on the collection's page. Until the page is live it is
   none on both sides, so the server's link and the first render's agree. */

type Came = Pick<ListPlace, "order" | "frame" | "query">;
const KEY = "grabient-collections-list";
const [came, setCame] = createSignal<Came | null>(null);
let live = false;

function keep(next: Came) {
  setCame(next);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* the page still remembers it */
  }
}

/** Reads the tab's memory once the page is live. */
export function recallList(): void {
  if (isServer || live) return;
  live = true;
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Came> | null;
    if (kept?.order === "popular" || kept?.order === "rising" || kept?.order === "saved")
      setCame({
        order: kept.order,
        frame: frameOf(kept.frame),
        query: typeof kept.query === "string" ? kept.query.slice(0, 100) : ""
      });
  } catch {
    /* nothing kept, or storage refused */
  }
}

/** A collections list is on screen: the list a collection opened from here leads back to. */
export function rememberList(place: ListPlace): void {
  if (isServer) return;
  live = true;
  keep({ order: place.order, frame: place.frame, query: place.query });
}

/** The reader chose an order on a collection's page: the list it leads back to is in that order, with its words. */
export function rememberOrder(order: PaletteOrder): void {
  const from = came();
  if (!isServer && live && from) keep({ ...from, order });
}

/** Where a collection's page leads back to, in the page's view: the list the reader came from, else the list in the
    page's own order. */
export function listBack(order: PaletteOrder, view: ListView): string {
  const from = came();
  return (
    listPath(from?.order ?? order, from?.frame) + listSearch({ query: from?.query ?? "", view })
  );
}

/* The collection each palette's page was last opened from in this tab, by the palette: its page names the palette as
   that collection does. A page opened another way names it as the account's latest changed collection does. */
const OPENINGS_KEPT = 64;
const openings = new Map<string, string>();

/** A palette's page is opened from a collection's card. */
export function rememberOpening(seed: string, slug: string): void {
  if (isServer) return;
  openings.delete(seed);
  openings.set(seed, slug);
  if (openings.size > OPENINGS_KEPT) openings.delete(openings.keys().next().value!);
}

/** The collection a palette's page was last opened from in this tab, or null. */
export const openedIn = (seed: string): string | null => openings.get(seed) ?? null;
