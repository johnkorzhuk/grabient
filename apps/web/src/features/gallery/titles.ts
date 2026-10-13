import { decodePalette } from "@grabient/engine";
import { DEFAULT_STEPS, DEFAULT_STYLE } from "@grabient/engine/view.ts";
import type { Page } from "../../lib/page-meta.ts";
import type { GalleryPlace } from "./address.ts";
import { nameOf } from "./drawing.ts";

/* What a gallery page is, as its metadata and its heading read it (lib/page-meta.ts), and what a palette searched by is
   called where the feed's title names it. */

/** What the page's data adds to its metadata: the palettes it lists, and the server's word on a page no index keeps. */
export interface Facts {
  palettes?: readonly string[];
  robots?: string;
}

export function metaPage(place: GalleryPlace, facts: Facts = {}): Page {
  const { words, page, limit, style, steps, angle } = place.params;
  const view = { style, steps, angle };
  const query = words || undefined;
  if (place.kind === "home") return { kind: "home", query, page, view, ...facts };
  if (place.kind === "saved") return { kind: "saved", query, ...facts };
  const { order, frame } = place;
  return words
    ? { kind: "search", query: words, order, frame, page, limit, view, ...facts }
    : { kind: "list", order, frame, page, limit, view, ...facts };
}

/** The palette a search names in place of words, by its name; null for words. */
export function searchedName(words: string): string | null {
  const palette = words.startsWith("k") ? decodePalette(words) : null;
  return palette
    ? nameOf({
        seed: words,
        style: DEFAULT_STYLE,
        steps: Math.max(DEFAULT_STEPS, palette.anchors.length),
        angle: 90
      })
    : null;
}
