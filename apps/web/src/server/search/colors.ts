/* A search's colors, as its tag shows them and the tab's icon wears them. Words the vocabulary reads take the dominant
   colors of the twelve nearest palettes; words found in titles or a collection's name take those palettes' colors; a
   palette is its own colors along its curve and hex codes are themselves. Words only the model can read get none, so the
   tab keeps the site's mark. Nothing here asks the model or the database, so the answer is the same for everyone. */
import { decodePalette, sampleHex } from "@grabient/engine";
import { DOMINANT_MAX, DOMINANT_PALETTES, dominantColors } from "@grabient/engine/dominant.ts";
import type { Snapshot } from "@grabient/search/snapshot.ts";
import { listWords } from "../../lib/words.ts";
import { canonicalPaletteSeed } from "../files/resolve.ts";
import { loadVocabulary } from "./files.ts";
import { keep } from "./kept.ts";
import { namedPalettes, snapshotPalettes } from "./rank.ts";
import { hexLiterals, knownQuery, queryWords } from "./read.ts";
import { loadSnapshot, type SnapshotEnv } from "./snapshot.ts";

/** Colors a tab's icon reads along a palette: more than a 32 pixel bar can tell apart. */
const ICON_STOPS = 16;
/** words remembered per snapshot in an isolate: a newer snapshot reads them again */
const KEPT = 512;
const kept = new WeakMap<Snapshot, Map<string, string[]>>();

/** The colors of what answers these words, darker end first; none when nothing free reads them. */
export async function searchColors(env: SnapshotEnv, raw: string): Promise<string[]> {
  const words = listWords(raw);
  if (!words) return [];
  const seed = canonicalPaletteSeed(words);
  const palette = seed && decodePalette(seed);
  if (palette)
    return Array.from({ length: ICON_STOPS }, (_, i) => sampleHex(palette, i / (ICON_STOPS - 1)));
  const hexes = hexLiterals(words);
  if (hexes) return hexes.slice(0, DOMINANT_MAX);
  const [snapshot, vocabulary] = await Promise.all([loadSnapshot(env), loadVocabulary(env)]);
  if (!snapshot || !vocabulary || snapshot.version !== vocabulary.version) return [];
  let mine = kept.get(snapshot);
  if (!mine) {
    mine = new Map();
    kept.set(snapshot, mine);
  }
  const held = mine.get(words);
  if (held) return held;
  const read = knownQuery(vocabulary, words);
  const named = read ? null : namedPalettes(snapshot, queryWords(words));
  const seeds = read
    ? snapshotPalettes(snapshot, read.vector, DOMINANT_PALETTES, { filter: read.filter }).map(
        c => c.seed
      )
    : (named?.rows.slice(0, DOMINANT_PALETTES).map(row => snapshot.seeds[row]) ?? []);
  return keep(mine, words, dominantColors(seeds), KEPT);
}
