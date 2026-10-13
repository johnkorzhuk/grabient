import { decodePalette, encodePalette } from "@grabient/engine";
import type { Snapshot } from "@grabient/search/snapshot.ts";
import { harmonyFilter, normalizeQuery } from "@grabient/search/text.ts";
import { seedVector } from "@grabient/search/vectors.ts";
import { paletteId } from "../../lib/words.ts";
import { isCrawler } from "../crawlers.ts";
import { loadModel, loadVocabulary, phraseVector, type Vocabulary } from "../search/files.ts";
import { keep } from "../search/kept.ts";
import { type ModelEnv, modelQuery } from "../search/model.ts";
import { popularLists } from "../search/popular.ts";
import {
  answerBar,
  hexQueryVector,
  paletteScores,
  seedQueryVector,
  snapshotCollections
} from "../search/rank.ts";
import { hexLiterals, knownQuery, titleNames } from "../search/read.ts";
import { type Background, loadSnapshot, type SnapshotEnv } from "../search/snapshot.ts";
import { legacySeed } from "../seo/legacy.ts";
import type { Reading, SearchSpace, Standing } from "./meaning.ts";

/* The seam between the collections and the palette search, whose space they read: the snapshot of every public
   palette and collection, the vocabulary, and the embedding model behind the public search's allowances. Without the
   search files nothing reads what words mean, and the collections answer by their letters alone. */

/** The search's bindings. The database is the primary, whose flags an isolate keeps. */
export type SpaceEnv = SnapshotEnv & ModelEnv;

export interface SpaceOptions {
  /** a search a reader made: words the vocabulary does not know are read by the embedding model, within the public
      search's allowances. Typing in a field asks without it: every pause would be a text of its own to buy. */
  model?: boolean;
  /** the request that asked: its address is what the model's allowance counts, and a HEAD or a crawler is never sold a
      read */
  request?: Request;
  ctx?: Background;
  /** the account a connected app asks for: the model's allowance is then that account's own */
  who?: string;
}

/** A palette named in place of words: its canonical seed, from its seed or an old id the legacy maps hold. */
function paletteSeed(query: string): string | null {
  const palette = decodePalette(legacySeed(query) ?? query);
  return palette ? encodePalette(palette) : null;
}

/* the public collections of a snapshot as the meanings read them, built once per snapshot */
const collectionsBySnapshot = new WeakMap<Snapshot, SearchSpace["collections"]>();
const collectionsOf = (snapshot: Snapshot): SearchSpace["collections"] => {
  let held = collectionsBySnapshot.get(snapshot);
  if (!held) {
    held = snapshot.names.map((name, i) => ({ slug: snapshot.slugs[i]!, ...name }));
    collectionsBySnapshot.set(snapshot, held);
  }
  return held;
};

/* What a title or a tag names is read once per vocabulary: every search reads every public collection's. The bound
   holds every public title and tag with room for the owners' own. */
const NAMES_KEPT = 8192;
const namesByVocabulary = new WeakMap<Vocabulary, Map<string, number[]>>();
function namesIn(vocabulary: Vocabulary, words: string): number[] {
  let kept = namesByVocabulary.get(vocabulary);
  if (!kept) {
    kept = new Map();
    namesByVocabulary.set(vocabulary, kept);
  }
  return kept.get(words) ?? keep(kept, words, titleNames(vocabulary, words), NAMES_KEPT);
}

/** Palettes newer than the snapshot measured in one request, about a millisecond each. */
const MEASURED_NOW = 96;

/** The search's space for one request, or null where its files cannot be read. */
export async function searchSpace(
  env: Partial<SpaceEnv>,
  options: SpaceOptions = {}
): Promise<SearchSpace | null> {
  if (!env.ASSETS || !env.DB) return null;
  const bound = env as SpaceEnv;
  const [snapshot, vocabulary] = await Promise.all([
    loadSnapshot(bound, options.ctx),
    loadVocabulary(bound)
  ]);
  if (!snapshot || !vocabulary || snapshot.version !== vocabulary.version) return null;
  const standingOf = (scores: Float32Array, row: number): Standing => ({
    score: scores[row]!,
    harmony: snapshot.harmonies[snapshot.harmony[row]!]!
  });

  return {
    async read(query) {
      const seed = paletteSeed(query);
      const hexes = seed ? null : hexLiterals(query);
      if (seed || hexes) {
        const vector = seed
          ? await seedQueryVector(bound, snapshot, seed)
          : await hexQueryVector(bound, hexes ?? []);
        return { reading: vector && { vector, names: [], unread: [], filter: null } };
      }
      // an old id no map knows: only the browser can read it, by fitting it
      if (paletteId(query)) return { reading: null };
      const known = knownQuery(vocabulary, query);
      const ofVocabulary = (): Reading | null =>
        known && {
          vector: known.vector,
          names: known.rows.map(row => phraseVector(vocabulary, row)),
          unread: known.unknown,
          filter: known.filter,
          ...(known.whole && known.how !== "words" && known.phrases.length === 1
            ? { phrase: known.phrases[0] }
            : {})
        };
      if (known?.whole || !options.model) return { reading: ofVocabulary() };
      const payer = options.who ? { app: options.who } : undefined;
      const read = await modelQuery(bound, query, {
        request: options.request,
        ctx: options.ctx,
        payer
      });
      if (read && "vector" in read)
        return {
          reading: {
            vector: read.vector,
            names: [read.vector],
            unread: [],
            filter: harmonyFilter(normalizeQuery(query))
          }
        };
      /* an allowance spent, or a crawler, which is never sold the model: a reader would have been given more */
      const unkept = !!read || (!payer && !!options.request && isCrawler(options.request));
      return { reading: ofVocabulary(), ...(unkept ? { unkept: true } : {}) };
    },
    names: words => namesIn(vocabulary, words),
    place: row => phraseVector(vocabulary, row),
    collections: collectionsOf(snapshot),
    standings(vector) {
      const scores = paletteScores(snapshot, vector);
      return { at: row => standingOf(scores, row), bar: answerBar(scores) };
    },
    nearest: (vector, n) => snapshotCollections(snapshot, vector, n),
    async standingsOf(seeds, vector) {
      const scores = paletteScores(snapshot, vector);
      const out = new Map<string, Standing>();
      let measured = 0;
      for (const seed of seeds) {
        const row = snapshot.at.get(seed);
        if (row !== undefined) {
          out.set(seed, standingOf(scores, row));
          continue;
        }
        if (measured++ >= MEASURED_NOW) continue;
        const model = await loadModel(bound);
        const own = model && seedVector(model, seed);
        if (own)
          out.set(seed, {
            score: own.values.reduce((sum, x, j) => sum + x * vector[j]!, 0),
            harmony: own.harmony
          });
      }
      return out;
    }
  };
}

/** The public collections people searched for most, by address, most first: the tags at rest lead with them. */
export async function searchedCollections(env: Pick<SpaceEnv, "DB">): Promise<string[]> {
  return (await popularLists(env)).collections;
}
