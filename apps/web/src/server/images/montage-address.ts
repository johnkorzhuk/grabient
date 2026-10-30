import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { isStyle, STEPS_MAX, STEPS_MIN, type View } from "@grabient/engine/view.ts";
import { DEFAULT_FRAME, isFrame, type RisingFrame } from "../../lib/orders.ts";
import { normalizeSearchQuery, queryFromParam } from "../search/search.ts";

/* What a montage's address asks for: its palettes, its order and its words, read alike by its answer (montages.ts)
   and by the edge cache's key, which reads it for every request and so never loads the drawing to do it. */

/** The most palettes a picture shows: its wedges. */
export const MONTAGE_PALETTES = 9;
/** A palette a card's address names, with the view to draw it in where the address gives one. */
export interface MontagePick {
  seed: string;
  view?: Pick<View, "style" | "steps" | "angle">;
}
/** The palettes a collection's card names (`pick`, a newsletter's hand-picked few): each `seed~style~steps~angle` or a
    seed alone, in order, nine at most. One that is no palette or no view is left out. */
export function montagePicks(params: URLSearchParams): MontagePick[] {
  const named = (params.get("pick") ?? "").split(",").filter(Boolean);
  return named.slice(0, MONTAGE_PALETTES).flatMap((entry): MontagePick[] => {
    const [raw = "", style, steps, angle] = entry.split("~");
    const palette = decodePalette(raw);
    if (!palette) return [];
    const seed = encodePalette(palette);
    if (style === undefined) return [{ seed }];
    const n = Number(steps);
    const a = Number(angle);
    if (!isStyle(style) || !Number.isInteger(n) || n < STEPS_MIN || n > STEPS_MAX) return [];
    if (!Number.isInteger(a) || a < 0 || a > 360) return [];
    return [{ seed, view: { style, steps: n, angle: a } }];
  });
}
/** The picks as one word, the same however the address spelled them: the edge's key and the isolate's. */
export const picksKey = (picks: readonly MontagePick[]): string =>
  picks
    .map(({ seed, view }) => (view ? [seed, view.style, view.steps, view.angle].join("~") : seed))
    .join(",");

type MontageSort = "popular" | "rising" | "newest" | "hot";

/** A montage's order as its address says it: Rising, Newest (which links from before Rising still name), the home's
    Hot, or else Popular; a frame other than the week's only with Rising. */
export function montageOrder(params: URLSearchParams): { sort: MontageSort; frame?: RisingFrame } {
  const sort = params.get("sort");
  const frame = params.get("frame");
  if (sort === "rising")
    return isFrame(frame) && frame !== DEFAULT_FRAME ? { sort, frame } : { sort };
  return { sort: sort === "newest" || sort === "hot" ? sort : "popular" };
}

/** The words a search picture's address asks for: `query`, then `q`, then its path's (/palettes/{words}.png or .svg,
    or /search/{words}.png or .svg, a palette's address kept as its seed and hyphens read as spaces), as the search
    reads words; null when they are no search. */
export function pictureWords(path: string, params: URLSearchParams): string | null {
  const asked = params.get("query") ?? params.get("q");
  if (asked !== null) return normalizeSearchQuery(asked);
  const segment = /^\/(?:search|palettes)\/(.+)\.(?:png|svg)$/.exec(path)?.[1];
  return segment ? queryFromParam(segment) : null;
}
