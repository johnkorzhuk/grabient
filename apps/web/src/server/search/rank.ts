/* Palettes ranked against a query's vector over the snapshot, inside the Worker: by their rows' scores, by the names
   their titles and collections give them, and, for a list someone holds, by the bar a palette must clear to answer. */
import type { Harmony } from "@grabient/engine/shape.ts";
import { paletteOf } from "@grabient/search/colors.ts";
import { type Rows, rowOf, type Snapshot } from "@grabient/search/snapshot.ts";
import { nearWord } from "@grabient/search/text.ts";
import { blend, paletteVector, seedVector } from "@grabient/search/vectors.ts";
import type { AssetsEnv } from "../assets.ts";
import { loadModel } from "./files.ts";
import { keep } from "./kept.ts";
import { lineStart, queryWords } from "./read.ts";

export interface Candidate {
  seed: string;
  score: number;
}

function rowScores(table: Rows, d: number, vector: readonly number[]): Float32Array {
  const all = new Float32Array(table.n);
  for (let i = 0; i < table.n; i++) {
    let sum = 0;
    for (let j = 0, at = i * d; j < d; j++) sum += table.q[at + j] * vector[j];
    all[i] = sum * table.scale[i];
  }
  return all;
}

/** How near every palette of the snapshot stands to a vector, by its row. */
export const paletteScores = (snapshot: Snapshot, vector: readonly number[]): Float32Array =>
  rowScores(snapshot.palettes, snapshot.d, vector);

/** How near every palette stands to a query the vocabulary read; with colors named one by one, to the one it is least
    near, so red and blue finds palettes that hold both. */
export function knownScores(
  snapshot: Snapshot,
  known: { vector: readonly number[]; each?: readonly (readonly number[])[] }
): Float32Array {
  const [least, ...rest] = (known.each ?? [known.vector]).map(part =>
    paletteScores(snapshot, part)
  );
  for (const own of rest)
    for (let i = 0; i < least.length; i++) if (own[i] < least[i]) least[i] = own[i];
  return least;
}

export interface RankOptions {
  filter?: readonly Harmony[] | null;
  allowed?: (row: number) => boolean;
}

/** The rows these options allow, best first, ties by row. */
export function rankedRows(
  snapshot: Snapshot,
  scores: Float32Array,
  options: RankOptions = {}
): number[] {
  const wanted = options.filter?.length
    ? new Set(
        options.filter.map(name => snapshot.harmonies.indexOf(name)).filter(code => code >= 0)
      )
    : null;
  const rows: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if ((!wanted || wanted.has(snapshot.harmony[i])) && (!options.allowed || options.allowed(i)))
      rows.push(i);
  }
  return rows.sort((a, b) => scores[b] - scores[a] || a - b);
}

export function snapshotPalettes(
  snapshot: Snapshot,
  vector: readonly number[],
  limit: number,
  options: RankOptions = {}
): Candidate[] {
  const scores = paletteScores(snapshot, vector);
  return rankedRows(snapshot, scores, options)
    .slice(0, limit)
    .map(i => ({ seed: snapshot.seeds[i], score: scores[i] }));
}

export function snapshotCollections(
  snapshot: Snapshot,
  vector: readonly number[],
  limit: number
): { slug: string; score: number }[] {
  const scores = rowScores(snapshot.collections, snapshot.d, vector);
  const rows = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a] || a - b);
  return rows.slice(0, limit).map(i => ({ slug: snapshot.slugs[i], score: scores[i] }));
}

/** Where a set of palettes stands, for what comes after them: their neighbors. */
export const rowsVector = (snapshot: Snapshot, rows: readonly number[]): number[] =>
  blend(rows.slice(0, 50).map(i => rowOf(snapshot.palettes, snapshot.d, i)));

/** A seed's vector: its snapshot row, or measured now when the palette is newer than the snapshot. */
export async function seedQueryVector(
  env: AssetsEnv,
  snapshot: Snapshot,
  seed: string
): Promise<number[] | null> {
  const i = snapshot.at.get(seed);
  if (i !== undefined) return rowOf(snapshot.palettes, snapshot.d, i);
  const model = await loadModel(env);
  return model ? (seedVector(model, seed)?.values ?? null) : null;
}

/** Hex codes as a palette of their own (one code twice): what stands near it holds those colors. */
export async function hexQueryVector(
  env: AssetsEnv,
  hexes: readonly string[]
): Promise<number[] | null> {
  const model = await loadModel(env);
  const palette = paletteOf(hexes.length === 1 ? [hexes[0], hexes[0]] : hexes.slice(0, 8));
  return model && palette ? paletteVector(model, palette).values : null;
}

/* Names no color says (Lakers, Zelda) are found as words in palette titles and in collections' titles and tags. */
interface NameIndex {
  palettes: Map<string, number[]>;
  collections: Map<string, number[]>;
}
const nameIndexes = new WeakMap<Snapshot, NameIndex>();
function nameIndex(snapshot: Snapshot): NameIndex {
  const held = nameIndexes.get(snapshot);
  if (held) return held;
  const index: NameIndex = { palettes: new Map(), collections: new Map() };
  const add = (map: Map<string, number[]>, text: string, row: number) => {
    for (const word of new Set(queryWords(lineStart(text)))) {
      const list = map.get(word);
      if (list) list.push(row);
      else map.set(word, [row]);
    }
  };
  snapshot.titles.forEach((title, i) => {
    if (title) add(index.palettes, title, i);
  });
  snapshot.names.forEach((name, i) => {
    add(index.collections, name.words, i);
  });
  nameIndexes.set(snapshot, index);
  return index;
}

/** The rows that hold every word: the word itself, or, only when no row has it, a word one slip off. */
function holdingAll(map: Map<string, number[]>, words: readonly string[], near = true): number[] {
  let held: Set<number> | null = null;
  for (const word of words) {
    const rows = [...(map.get(word) ?? [])];
    if (!rows.length && near)
      for (const [known, list] of map) if (nearWord(word, known)) rows.push(...list);
    const next: Set<number> = new Set(held ? rows.filter(i => held?.has(i)) : rows);
    if (!next.size) return [];
    held = next;
  }
  return held ? [...held].sort((a, b) => a - b) : [];
}

export interface NamedAnswer {
  /** palette rows: the ones titled with the words in snapshot order, then the members of the collections named with them */
  rows: number[];
  /** the named collections' subjects, for the cards' tags */
  names: string[];
}

/** Palettes named by these words, or null when no title and no collection holds them all. */
export function namedPalettes(snapshot: Snapshot, words: readonly string[]): NamedAnswer | null {
  if (!words.length || (!snapshot.titles.length && !snapshot.names.length)) return null;
  const index = nameIndex(snapshot);
  const titled = holdingAll(index.palettes, words);
  const named = holdingAll(index.collections, words);
  const rows = [...new Set([...titled, ...named.flatMap(c => snapshot.names[c].members)])];
  return rows.length ? { rows, names: named.map(c => snapshot.names[c].subject) } : null;
}

/** Whether some palette's title holds every word as written. */
export const titled = (snapshot: Snapshot, words: readonly string[]): boolean =>
  holdingAll(nameIndex(snapshot).palettes, words, false).length > 0;

/** The members of the collections whose subject is this phrase, in their order. A collection is one search answered on
    purpose, by palettes chosen for its title, so they lead a search for it: NBA team for nba team, Sunset for sunset. */
export const subjectMembers = (snapshot: Snapshot, phrase: string): number[] => [
  ...new Set(snapshot.names.filter(name => name.subject === phrase).flatMap(name => name.members))
];

/* A list someone holds (Saved, an account's collections) is searched against a bar, since every palette has some
   closeness to any words: a palette answers only from the nearest NEAR_SHARE of all palettes, and at NEAR_LEAST at the
   least. About the nearest twelfth still reads as the words; the next twelfth no longer does. */
const NEAR_SHARE = 0.08;
const NEAR_LEAST = 0.2;
/** palettes newer than the snapshot measured in one request, about a millisecond each, and kept in the isolate */
const MEASURED_NOW = 96;
const MEASURED_KEPT = 2048;

/** The score a palette must reach to answer. The least of several places (`each`) runs under NEAR_LEAST, so there the
    share alone sets it. */
export function answerBar(scores: Float32Array, each = false): number {
  const ranked = Float32Array.from(scores).sort();
  const at = Math.max(0, scores.length - 1 - Math.floor(scores.length * NEAR_SHARE));
  return Math.max(each ? -1 : NEAR_LEAST, scores.length ? ranked[at] : NEAR_LEAST);
}

/* a palette's own vector depends on its seed and the model alone, and an isolate holds one model */
const measured = new Map<string, { values: Float32Array; harmony: string }>();

/** The held seeds that answer a vector, best first, ties by seed: each by its snapshot row, or by its own vector when
    it is newer than the snapshot. A palette that could not be measured in this request does not answer. */
export async function answeringSeeds(
  env: AssetsEnv,
  snapshot: Snapshot,
  vector: readonly number[],
  seeds: readonly string[],
  filter?: readonly Harmony[] | null,
  each?: readonly (readonly number[])[]
): Promise<Candidate[]> {
  const scores = knownScores(snapshot, { vector, each });
  const bar = answerBar(scores, !!each);
  const wanted = filter?.length ? new Set<string>(filter) : null;
  const places = each ?? [vector];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  let measuredNow = 0;
  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    seen.add(seed);
    let score: number;
    let harmony: string;
    const i = snapshot.at.get(seed);
    if (i !== undefined) {
      score = scores[i];
      harmony = snapshot.harmonies[snapshot.harmony[i]];
    } else {
      let own = measured.get(seed);
      if (!own) {
        if (measuredNow++ >= MEASURED_NOW) continue;
        const model = await loadModel(env);
        const made = model && seedVector(model, seed);
        if (!made) continue;
        own = keep(
          measured,
          seed,
          { values: Float32Array.from(made.values), harmony: made.harmony },
          MEASURED_KEPT
        );
      }
      const { values } = own;
      score = Math.min(...places.map(to => values.reduce((sum, x, j) => sum + x * to[j], 0)));
      harmony = own.harmony;
    }
    if (score >= bar && (!wanted || wanted.has(harmony))) out.push({ seed, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.seed < b.seed ? -1 : 1));
}
