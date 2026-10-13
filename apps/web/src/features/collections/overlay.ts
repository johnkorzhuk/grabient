import { createSignal } from "solid-js";

/* What this tab deleted, kept as long as a public answer the edge cached before the deletion may still hold it: a list,
   a collection or a tag read within five minutes of it leaves the deleted out. Written only in the browser. */

const KEPT_MS = 300_000;
type Deleted = ReadonlyMap<string, number>;
const [palettes, setPalettes] = createSignal<Deleted>(new Map());
const [collections, setCollections] = createSignal<Deleted>(new Map());

const held = (map: Deleted, key: string) => {
  const at = map.get(key);
  return at !== undefined && Date.now() - at < KEPT_MS;
};
/* the entries still within their time, and the new one */
const kept = (map: Deleted, key: string): Deleted => {
  const now = Date.now();
  const next = new Map([...map].filter(([, at]) => now - at < KEPT_MS));
  next.set(key, now);
  return next;
};

/** A palette an admin deleted everywhere from this tab. */
export const paletteGone = (seed: string): boolean => held(palettes(), seed);
/** A collection deleted from this tab. */
export const collectionGone = (slug: string): boolean => held(collections(), slug);

export const forgetPalette = (seed: string) => setPalettes(map => kept(map, seed));
export const forgetCollection = (slug: string) => setCollections(map => kept(map, slug));
