import { decodePalette, encodePalette } from "@grabient/engine";
import { alignedLegacySeed, decodeLegacySeed, legacyTarget } from "@grabient/engine/legacy.ts";
import { parseView, viewSearch } from "@grabient/engine/view.ts";
import { first, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { madeOnce } from "@grabient/server/shared-work.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { paletteAddress } from "../../lib/page-meta.ts";
import { SAVED_TEXT, savedView } from "../collections/files.ts";
import { isCrawler } from "../crawlers.ts";

/* Old grabient.com palette addresses, still in articles and search indexes: `_` seeds, and lz-string ids that
   grabient.com answered with their `_` form. Each is answered with a 301 to the keyframe palette the migration maps
   hold for it, at the link's view, or, for a link that names none, at the palette's own address: data/legacy-k.json is
   grabient.com's gallery, data/legacy-links.json every other old address an index has shown, fitted offline. An
   lz-string id the maps lack leads to its `_` form, and a `_` seed they lack stands at its own address with its view,
   where the Worker fits it (legacy-fit.ts). Resolving an old id never fetches the old site or writes anything. Server
   only: neither map reaches the browser.

   The maps load when first needed, not with the Worker: an isolate that sees no old address never builds their 6,718
   entries. A request whose address may name an old palette readies them before it is answered (pipeline.ts), and so do
   a search and a job that read them; read before they are ready, they hold nothing, and ready themselves for the next
   request. */

type Maps = readonly Readonly<Record<string, string>>[];
const loadMaps = madeOnce(async (): Promise<Maps> => {
  const [migrated, links] = await Promise.all([
    import("../../../data/legacy-k.json", { with: { type: "json" } }),
    import("../../../data/legacy-links.json", { with: { type: "json" } })
  ]);
  return [migrated.default, links.default];
});
let MAPS: Maps | null = null;

/** Readies the old addresses' maps in this isolate; a failure leaves them unready, and the next request tries again. */
export async function readyOldIds(): Promise<void> {
  if (MAPS) return;
  try {
    MAPS = await loadMaps();
  } catch (error) {
    console.error("legacy: the old addresses' maps did not load", String(error));
  }
}

const mapped = (id: string) => {
  if (MAPS) return MAPS.find(map => Object.hasOwn(map, id))?.[id];
  if (mayBeOld(id)) {
    console.warn("legacy: an old id was read before the maps were ready", id);
    void readyOldIds();
  }
  return undefined;
};
/** An old `_` or `~` seed, as grabient.com wrote them. */
const OLD_SEED = /^[_~][A-Za-z0-9_-]{6,}$/;
/** An lz-string id: long, in that encoding's letters, with capitals, never beginning with the k a seed of today does. */
const OLD_TEXT = /^(?!k)(?=[^A-Z]*[A-Z])[A-Za-z0-9+$-]{20,}$/;

/** Whether a name may be an old palette's id, which only the maps lead from. */
export const mayBeOld = (name: string): boolean => OLD_SEED.test(name) || OLD_TEXT.test(name);

/** Whether an address (its path without the language) may name an old palette: any part of its path, a file's
    without its extension, or any value of its query or of a comma-separated list in it (a seed, a search's words, the
    keys a page counts likes for). */
export function mayNameOld(path: string, query: URLSearchParams): boolean {
  const parts = path.split("/").map(part => {
    try {
      return decodeURIComponent(part).replace(/\.[a-z]+(\.json)?$/, "");
    } catch {
      return part;
    }
  });
  const values = [...query.values()].flatMap(value => value.split(","));
  return [...parts, ...values].some(name => mayBeOld(name.trim()));
}
/** An old palette's address, or its editor's. */
const OLD_PATH = /^\/([^/]+?)(?:\/edit)?$/;

/** The keyframe seed the maps hold for an old id, read as it is or, for an lz-string id, as its `_` form. */
export const legacySeed = (id: string): string | null => legacyTarget(id, mapped)?.seed ?? null;

/** How an old address resolves: `mapped` and `aligned` to a keyframe palette (an lz-string id through its `_` form),
    `fitted` to the palette its colors are fitted to, by the Worker or the reader's browser. */
export type OldVia = "mapped" | "aligned" | "fitted";

/** Where an old palette address ("/{id}" or "/{id}/edit" with its query, without the language) leads and how, or null
    for an address that is no old palette's. `to` is null for an old id no map holds and nothing can read, which stays
    as it is. */
export function oldAddress(address: string): { to: string | null; via: OldVia } | null {
  const url = new URL(address, "https://grabient.com");
  const raw = OLD_PATH.exec(url.pathname)?.[1];
  let id: string;
  try {
    id = decodeURIComponent(raw ?? "");
  } catch {
    return null;
  }
  if (!id) return null;
  const view = parseView(url.searchParams);
  const target = legacyTarget(id, mapped);
  const palette = target && decodePalette(target.seed);
  if (target && palette) {
    const steps = Math.max(view.steps, palette.anchors.length);
    return { to: `/${encodePalette(palette)}${viewSearch({ ...view, steps })}`, via: target.via };
  }
  const own = alignedLegacySeed(id) ?? (decodeLegacySeed(id) ? id : null);
  if (own) return { to: `/${own}${viewSearch(view)}`, via: "fitted" };
  return OLD_SEED.test(id) ? { to: null, via: "fitted" } : null;
}

/** The canonical rule for old addresses (server/canonical.ts): the address an old link leads to, or the old address
    itself where nothing can read it, so no other rule reads an old id as words. Null for any other address. */
export const legacyRedirect = (address: string): string | null => {
  const old = oldAddress(address);
  return old ? (old.to ?? address) : null;
};

/** Where an old palette address that names no view lands: its palette's own address, in the view it was saved in,
    which only the database knows, so a link a search index holds leads to the page its written words name. Null for
    an address that names a view or that no map holds, and where the read fails: the canonical rule's address stands. */
export async function legacyLanding(env: Pick<Env, "DB">, address: string): Promise<string | null> {
  await readyOldIds();
  const old = oldAddress(address);
  if (!old?.to || old.via === "fitted") return null;
  const asked = new URL(address, "https://grabient.com").searchParams;
  if (["style", "steps", "angle", "size"].some(name => asked.has(name))) return null;
  const seed = old.to.slice(1).split("?", 1)[0];
  try {
    const row = await first<{ saved: string | null }>(replica(env), SAVED_TEXT, seed);
    return paletteAddress(seed, savedView(row?.saved));
  } catch (error) {
    console.error("Old link's saved view unread", String(error));
    return null;
  }
}

/** Every old palette id the maps lead from. */
export async function oldIds(): Promise<string[]> {
  await readyOldIds();
  return [...new Set((MAPS ?? []).flatMap(map => Object.keys(map)))];
}

/** Counts how an old address resolved, by readers and by crawlers. The maps stay a year at least, while search
    indexes and the sites that link here move to the new addresses; the counts say when few arrive. */
export function countLegacy(env: Pick<Env, "USAGE">, request: Request, address: string): void {
  const old = oldAddress(address);
  if (old) countUsage(env, "legacy", old.via, isCrawler(request) ? "crawler" : "reader");
}
