import { decodePalette, encodePalette } from "@grabient/engine";
import { alignedLegacySeed, legacyTarget } from "@grabient/engine/legacy.ts";
import { parseView, viewSearch } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import migrated from "../../../data/legacy-k.json" with { type: "json" };
import links from "../../../data/legacy-links.json" with { type: "json" };
import { isCrawler } from "../crawlers.ts";

/* Old grabient.com palette addresses, still in articles and search indexes: `_` seeds, and lz-string ids that
   grabient.com answered with their `_` form. Each is answered with a 301 to the keyframe palette the migration maps
   hold for it, at the link's view: data/legacy-k.json is grabient.com's gallery, data/legacy-links.json every other
   old address an index has shown, fitted offline. An lz-string id the maps lack leads to its `_` form, and an old id
   they lack is its own page, where the reader's browser fits it. A request never fits a palette, fetches the old site
   or writes anything. Server only: neither map reaches the browser. */

const MAPS: readonly Readonly<Record<string, string>>[] = [migrated, links];
const mapped = (id: string) => MAPS.find(map => Object.hasOwn(map, id))?.[id];
/** An old `_` or `~` seed, as grabient.com wrote them. */
const OLD_SEED = /^[_~][A-Za-z0-9_-]{6,}$/;
/** An old palette's address, or its editor's. */
const OLD_PATH = /^\/([^/]+?)(?:\/edit)?$/;

/** The keyframe seed the maps hold for an old id, read as it is or, for an lz-string id, as its `_` form. */
export const legacySeed = (id: string): string | null => legacyTarget(id, mapped)?.seed ?? null;

/** How an old address resolves: `mapped` and `aligned` to a keyframe palette (an lz-string id through its `_` form),
    `fitted` in the reader's browser. */
export type OldVia = "mapped" | "aligned" | "fitted";

/** Where an old palette address ("/{id}" or "/{id}/edit" with its query, without the language) leads and how, or null
    for an address that is no old palette's. `to` is null for an old id no map holds, which stays as it is. */
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
  const aligned = alignedLegacySeed(id);
  if (aligned) return { to: `/${aligned}${viewSearch(view)}`, via: "fitted" };
  return OLD_SEED.test(id) ? { to: null, via: "fitted" } : null;
}

/** The canonical rule for old addresses (server/canonical.ts): the address an old link leads to, or the old address
    itself where the reader's browser fits it, so no other rule reads an old id as words. Null for any other address. */
export const legacyRedirect = (address: string): string | null => {
  const old = oldAddress(address);
  return old ? (old.to ?? address) : null;
};

/** Counts how an old address resolved, by readers and by crawlers: the day few arrive, the maps can go. */
export function countLegacy(env: Pick<Env, "USAGE">, request: Request, address: string): void {
  const old = oldAddress(address);
  if (old) countUsage(env, "legacy", old.via, isCrawler(request) ? "crawler" : "reader");
}
