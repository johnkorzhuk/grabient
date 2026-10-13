/* A palette's page address: `/{seed}`, then how it is drawn (style, steps, angle, size), what Random keeps (`lock`,
   `unlock`) and the selection's word. The seed is the palette; the rest is the reader's and never part of its identity.
   The Worker answers any other spelling with a 301 to `seedAddress` (server/canonical.ts), and the editor rewrites its
   entry in place as the palette changes. */
import { decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { LOCKS, type Lock } from "@grabient/engine/edits.ts";
import { type ParamReader, parseView, type View, viewSearch } from "@grabient/engine/view.ts";

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
  return {
    seed: encodePalette(palette),
    palette,
    view: { ...view, steps: Math.max(view.steps, palette.anchors.length) },
    locks: { lock: locksIn(params.get("lock")), unlock: locksIn(params.get("unlock")) },
    selection: params.get("selection") !== null
  };
}

type Addressed = Pick<SeedPage, "seed" | "view"> & Partial<Pick<SeedPage, "locks" | "selection">>;

/** The canonical address: the view's defaults left out and its parts in order, then the locks' words in the order
    lightness, chroma, hue, then the selection's word with no value. */
export function seedAddress(page: Addressed): string {
  const { lock, unlock } = page.locks ?? NO_LOCKS;
  return `/${page.seed}${viewSearch(page.view, [
    lock.length ? `lock=${wordsOf(lock)}` : "",
    unlock.length ? `unlock=${wordsOf(unlock)}` : "",
    page.selection ? "selection" : ""
  ])}`;
}

/** The same address as the router's search object, its keys in the canonical order. The router spells it its own way
    (commas escaped, `selection=`), which reads back the same, so the Worker takes it as canonical too. */
export function seedSearch(page: Addressed): Record<string, string | number> {
  const query = new URLSearchParams(seedAddress(page).split("?")[1] ?? "");
  const out: Record<string, string | number> = {};
  for (const [key, value] of query)
    out[key] = key === "steps" || key === "angle" ? Number(value) : value;
  return out;
}

/** Whether two addresses say the same thing: one path, and the same parameters in the same order once decoded. */
export function sameAddress(a: string, b: string): boolean {
  const [pathA, queryA = ""] = a.split("?");
  const [pathB, queryB = ""] = b.split("?");
  if (pathA !== pathB) return false;
  const left = [...new URLSearchParams(queryA)];
  const right = [...new URLSearchParams(queryB)];
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
