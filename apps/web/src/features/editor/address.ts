/* A palette's page address: `/{seed}`, then how it is drawn (style, steps, angle, size, or an effect and how it
   plays: engine/effect.ts), what Random keeps (`lock`, `unlock`) and the selection's word. The seed is the palette; the rest is the reader's and never part of its identity.
   The Worker answers any other spelling with a 301 to `seedAddress` (server/canonical.ts), and the editor rewrites its
   entry in place as the palette changes. */
import { decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { LOCKS, type Lock } from "@grabient/engine/edits.ts";
import { blobShapeOf, type Effect, effectParts, parseEffect } from "@grabient/engine/effect.ts";
import {
  DEFAULT_ANGLE,
  type ParamReader,
  parseView,
  type Style,
  type StyleChoice,
  sizeParam,
  type View,
  viewSearch
} from "@grabient/engine/view.ts";
import type { HistoryState } from "@tanstack/solid-router";
import { TRACKING_PARAM } from "../../lib/links.ts";

/** A seed's shape in an address. Whether it decodes is the codec's to say. */
export const SEED_SHAPE = /^k[A-Za-z0-9_-]{8,49}$/;
/** Whether an address's one segment is a palette's seed: a collection's slug can have the shape, and never decodes. */
export const isSeed = (id: string): boolean => SEED_SHAPE.test(id) && decodePalette(id) !== null;

/** What Random keeps (ops.ts): `lock` names the locks closed while no keyframe is held, `unlock` the ones a hold has
    opened, since a hold starts with every lock closed. */
export interface Locks {
  lock: readonly Lock[];
  unlock: readonly Lock[];
}
export const NO_LOCKS: Locks = { lock: [], unlock: [] };

/** Everything a palette's address says. */
export interface SeedPage {
  seed: string;
  palette: Palette;
  view: View;
  /** the effect the picture plays instead of the view's gradient, where the address names one */
  effect?: Effect | null;
  /** whether the address names a style, a gradient's or an effect's: one that names none takes the reader's own */
  styled?: boolean;
  locks: Locks;
  /** the selection of palettes has the stage, with the export column beside it */
  selection: boolean;
}

const WORDS: Readonly<Record<Lock, string>> = { l: "lightness", c: "chroma", h: "hue" };
const locksIn = (raw: string | null): Lock[] => {
  const words = (raw ?? "").split(",");
  return LOCKS.filter(k => words.includes(WORDS[k]));
};
const wordsOf = (list: readonly Lock[]) =>
  LOCKS.filter(k => list.includes(k))
    .map(k => WORDS[k])
    .join(",");

/** The palette page an address names, or null when `id` is no seed. Steps under the palette's keyframes are raised to
    them, since a stop between two keyframes would drop one from the picture. */
export function readSeedPage(id: string, params: ParamReader): SeedPage | null {
  const palette = SEED_SHAPE.test(id) ? decodePalette(id) : null;
  if (!palette) return null;
  const view = parseView(params);
  const seed = encodePalette(palette);
  /* a blob always has a shape: one its address names, else the palette's own suggestion, which the canonical address
     then names */
  const parsed = parseEffect(params);
  const effect =
    parsed?.kind === "blob" && parsed.look.shape === null
      ? { ...parsed, look: { ...parsed.look, shape: blobShapeOf(seed) } }
      : parsed;
  return {
    seed,
    palette,
    view: { ...view, steps: Math.max(view.steps, palette.anchors.length) },
    effect,
    styled: params.get("style") !== null,
    locks: { lock: locksIn(params.get("lock")), unlock: locksIn(params.get("unlock")) },
    selection: params.get("selection") !== null
  };
}

type Addressed = Pick<SeedPage, "seed" | "view"> &
  Partial<Pick<SeedPage, "effect" | "locks" | "selection">>;

/** The canonical address: the view's defaults left out and its parts in order (an effect's style, the angle, the size
    and how it plays, with no steps, while one plays), then the locks' words in the order lightness, chroma, hue, then
    the selection's word with no value. */
export function seedAddress(page: Addressed): string {
  const { lock, unlock } = page.locks ?? NO_LOCKS;
  const extra = [
    lock.length ? `lock=${wordsOf(lock)}` : "",
    unlock.length ? `unlock=${wordsOf(unlock)}` : "",
    page.selection ? "selection" : ""
  ];
  const effect = page.effect;
  if (!effect) return `/${page.seed}${viewSearch(page.view, extra)}`;
  const size = sizeParam(page.view.size);
  const parts = [
    `style=${effect.kind}`,
    page.view.angle !== DEFAULT_ANGLE ? `angle=${page.view.angle}` : "",
    size ? `size=${size}` : "",
    ...effectParts(effect),
    ...extra
  ].filter(Boolean);
  return `/${page.seed}?${parts.join("&")}`;
}

/* the parameters the router keeps as numbers: a number-like string would be written quoted */
const NUMBERS = new Set(["steps", "angle", "speed", "fps", "frost", "shape"]);

/** The same address as the router's search object, its keys in the canonical order. The router spells it its own way
    (commas escaped, `selection=`), which reads back the same, so the Worker takes it as canonical too. */
export function seedSearch(page: Addressed): Record<string, string | number> {
  const query = new URLSearchParams(seedAddress(page).split("?")[1] ?? "");
  const out: Record<string, string | number> = {};
  for (const [key, value] of query) out[key] = NUMBERS.has(key) ? Number(value) : value;
  return out;
}

/** Whether two addresses say the same thing: one path, and the same parameters in the same order once decoded.
    Campaign tags and click ids say where a reader came from, nothing of the page. */
export function sameAddress(a: string, b: string): boolean {
  const [pathA, queryA = ""] = a.split("?");
  const [pathB, queryB = ""] = b.split("?");
  if (pathA !== pathB) return false;
  const said = (query: string) =>
    [...new URLSearchParams(query)].filter(([name]) => !TRACKING_PARAM.test(name));
  const left = said(queryA);
  const right = said(queryB);
  return (
    left.length === right.length &&
    left.every(([k, v], i) => k === right[i][0] && v === right[i][1])
  );
}

/** The canonical form of a page address that is a palette's, or null for any other address. An address that says the
    same as the canonical one in another spelling is left as it is. */
export function canonicalSeedAddress(address: string): string | null {
  const [path, query = ""] = address.split("?");
  if (path.indexOf("/", 1) !== -1) return null;
  const page = readSeedPage(path.slice(1), new URLSearchParams(query));
  if (!page) return null;
  const canonical = seedAddress(page);
  return sameAddress(canonical, address) ? address : canonical;
}

/** What a page opened with, kept in its history entry: the palette's view then, which of its parts the reader has set
    since (As saved in the header's corner reads it, and a set part goes for every palette the page draws), and what
    the tab remembered for each then, which a part let go gives back to it. */
export interface Opened {
  style: Style;
  steps: number;
  angle: number;
  set: { style: boolean; steps: boolean; angle: boolean };
  chosen?: { style: StyleChoice; steps: number | "auto"; angle: number | "auto" };
}

/** What a card hands the editor as it opens a palette in place, the new entry's state (`navigate({ href, state })`):
    the palette's own view, and the parts the page it stood on set over it. Its address already draws it that way;
    this says the parts are the reader's, so the palette's page reads them as set and Reset returns it to its own.
    Nothing where the page set none. */
export function openedFrom(
  own: Pick<View, "style" | "steps" | "angle">,
  view: { style: StyleChoice; steps: number | "auto"; angle: number | "auto" }
): (HistoryState & { opened: Opened }) | undefined {
  const set = {
    style: view.style !== "auto",
    steps: view.steps !== "auto",
    angle: view.angle !== "auto"
  };
  return set.style || set.steps || set.angle
    ? { opened: { style: own.style, steps: own.steps, angle: own.angle, set } }
    : undefined;
}
