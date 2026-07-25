import { paletteCoeffKey } from "./palette";

// One rendered palette can exist under MANY stored seed strings because global
// modifiers may be stored separately or tared into the coefficient rows. The
// globals-free coefficient key is the shared identity across all of them.

/** Map stored seed strings to their coefficient keys, deduped, order kept. */
export function likeCoeffKeys(seeds: string[]): string[] {
  const out = new Set<string>();
  for (const s of seeds) out.add(paletteCoeffKey(s) ?? s);
  return [...out];
}

/**
 * Collapse a user's like rows (ordered most-recent-first) to one per palette:
 * likes of the same palette under different aliases merge into the most
 * recent row, whose stored id + params keep rendering the variant the user
 * actually saved.
 */
export function mergeLikeAliases<T extends { paletteId: string }>(likes: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const like of likes) {
    const key = paletteCoeffKey(like.paletteId) ?? like.paletteId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(like);
  }
  return out;
}
