/* Palettes ranked against a query's vector over the snapshot, inside the Worker: by their rows' scores, by the names
   their titles and collections give them, beside a palette by the collections they share with it, and, for a list
   someone holds, by the bar a palette must clear to answer. */
import type { Harmony } from "@grabient/engine/shape.ts";
import { paletteOf } from "@grabient/search/colors.ts";
import { type Rows, rowOf, type Snapshot } from "@grabient/search/snapshot.ts";
import { nearWord } from "@grabient/search/text.ts";
import { blend, paletteVector, seedVector } from "@grabient/search/vectors.ts";
import type { AssetsEnv } from "../assets.ts";
import { loadModel } from "./files.ts";
import { keep } from "./kept.ts";
import { nameWords } from "./read.ts";

export interface Candidate {
  seed: string;
  score: number;
  /** heads every order: what the words name, or a palette's collection-mate */
  lead?: true;
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

/** Whether these options allow a row. */
function allows(snapshot: Snapshot, options: RankOptions): (row: number) => boolean {
  const wanted = options.filter?.length
    ? new Set(
        options.filter.map(name => snapshot.harmonies.indexOf(name)).filter(code => code >= 0)
      )
    : null;
  return row =>
    (!wanted || wanted.has(snapshot.harmony[row])) && (!options.allowed || options.allowed(row));
}

/** The rows these options allow, best first, ties by row. */
export function rankedRows(
  snapshot: Snapshot,
  scores: Float32Array,
  options: RankOptions = {}
): number[] {
  const allowed = allows(snapshot, options);
  const rows: number[] = [];
  for (let i = 0; i < scores.length; i++) if (allowed(i)) rows.push(i);
  return rows.sort((a, b) => scores[b] - scores[a] || a - b);
}

/** The first `limit` palettes of rankedRows's order. A tag's colors want a dozen, which one pass over the rows finds
    without sorting them all. */
export function snapshotPalettes(
  snapshot: Snapshot,
  vector: readonly number[],
  limit: number,
  options: RankOptions = {}
): Candidate[] {
  const scores = paletteScores(snapshot, vector);
  const allowed = allows(snapshot, options);
  const best: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (!allowed(i)) continue;
    // rows come in order, so a row ties behind every row it ties with
    let at = best.length;
    while (at > 0 && scores[i] > scores[best[at - 1]!]) at--;
    if (at >= limit) continue;
    best.splice(at, 0, i);
    if (best.length > limit) best.pop();
  }
  return best.map(i => ({ seed: snapshot.seeds[i], score: scores[i] }));
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

/* Names no color says (Lakers, Zelda), read whole: the titles a palette is given (Grabient's, and those public
   collections whose words anyone may read give it), each collection's title and tags, and the names those collections'
   descriptions of a palette write. */
interface NameIndex {
  titles: Map<string, number[]>;
  collections: Map<string, number[]>;
  described: Map<string, number[]>;
}
const nameIndexes = new WeakMap<Snapshot, NameIndex>();
function nameIndex(snapshot: Snapshot): NameIndex {
  const held = nameIndexes.get(snapshot);
  if (held) return held;
  const index: NameIndex = { titles: new Map(), collections: new Map(), described: new Map() };
  const add = (map: Map<string, number[]>, words: readonly string[], at: number) => {
    for (const word of new Set(words)) {
      const list = map.get(word);
      if (list) list.push(at);
      else map.set(word, [at]);
    }
  };
  for (const [row, title] of snapshot.titles.entries())
    if (title) add(index.titles, nameWords(title), row);
  for (const [k, name] of snapshot.names.entries())
    add(index.collections, nameWords(name.words), k);
  for (const [row, words] of snapshot.described.entries())
    if (words) add(index.described, words.split(" ").filter(Boolean), row);
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

/* one word in every field: as written wherever it is written, else one slip off in titles and collections; a
   description's names are matched only as written */
function inFields(index: NameIndex, word: string) {
  const titled = index.titles.get(word) ?? [];
  const named = index.collections.get(word) ?? [];
  const told = index.described.get(word) ?? [];
  if (titled.length || named.length || told.length) return { titled, named, told };
  const near = (map: Map<string, number[]>) =>
    [...map].flatMap(([known, rows]) => (nearWord(word, known) ? rows : []));
  return { titled: near(index.titles), named: near(index.collections), told: [] };
}

export interface NamedAnswer {
  /** palette rows: the ones titled with the words in snapshot order, then the members of the collections named with
      them; when no one title or collection holds them all, the palettes whose own fields hold them between them */
  rows: number[];
  /** the subjects of the collections that gave a word, for the cards' tags */
  names: string[];
}

/** Palettes named by these words, or null when no palette holds them all. */
export function namedPalettes(snapshot: Snapshot, words: readonly string[]): NamedAnswer | null {
  if (!words.length || (!snapshot.titles.length && !snapshot.names.length)) return null;
  const index = nameIndex(snapshot);
  const titled = holdingAll(index.titles, words);
  const named = holdingAll(index.collections, words);
  if (titled.length || named.length)
    return {
      rows: [...new Set([...titled, ...named.flatMap(c => snapshot.names[c].members)])],
      names: named.map(c => snapshot.names[c].subject)
    };
  /* no one title and no one collection holds every word: a palette's titles, its collections' words and its
     description's names may hold them between them (nhl nashville) */
  const each = words.map(word => inFields(index, word));
  let found = new Set<number>();
  for (const [k, field] of each.entries()) {
    const rows = new Set([
      ...field.titled,
      ...field.named.flatMap(c => snapshot.names[c].members),
      ...field.told
    ]);
    found = k ? new Set([...found].filter(row => rows.has(row))) : rows;
    if (!found.size) return null;
  }
  const helped = [...new Set(each.flatMap(field => field.named))]
    .sort((a, b) => a - b)
    .filter(c => snapshot.names[c].members.some(row => found.has(row)));
  return {
    rows: [...found].sort((a, b) => a - b),
    names: helped.map(c => snapshot.names[c].subject)
  };
}

/** Whether some palette's titles hold every word as written, the ones public collections give it among them. */
export const titled = (snapshot: Snapshot, words: readonly string[]): boolean =>
  holdingAll(nameIndex(snapshot).titles, words, false).length > 0;

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

/** How many of a palette's collection-mates lead the palettes like it: half the twelve its page shows, so the other
    half stays its nearest colors from anywhere. */
const MATES = 6;

/** The palettes that the public collections holding a row hold beside it and that stand as near as a search of Saved
    asks (answerBar): each collection's nearest in turn, so a palette in a team's collection and a color's shows both,
    at most MATES, nearest first. A collection is public, and so is what it holds. */
export function collectionMates(snapshot: Snapshot, row: number, scores: Float32Array): number[] {
  const bar = answerBar(scores);
  const each = snapshot.names
    .filter(name => name.members.includes(row))
    .map(name =>
      [...new Set(name.members)]
        .filter(i => i !== row && scores[i] >= bar)
        .sort((a, b) => scores[b] - scores[a] || a - b)
    );
  const mates = new Set<number>();
  for (let k = 0; mates.size < MATES && each.some(list => k < list.length); k++)
    for (const list of each) if (k < list.length && mates.size < MATES) mates.add(list[k]);
  return [...mates].sort((a, b) => scores[b] - scores[a] || a - b);
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
