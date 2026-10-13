/* The tags under a search field, as the page draws them: each a search's words, where a press leads, and the colors of
   what it finds. At rest they are the row (popular.ts); while the field holds words, the vocabulary's phrases that
   answer what is typed; while it holds a palette, the searches that palette answers. Each tag's colors are the dominant
   colors of the twelve nearest palettes, read once per phrase and snapshot in an isolate. Nothing here asks a model. */
import { DOMINANT_PALETTES, dominantColors } from "@grabient/engine/dominant.ts";
import type { Snapshot } from "@grabient/search/snapshot.ts";
import { queryTokens } from "@grabient/search/text.ts";
import { FORM_WORDS } from "@grabient/search/words.ts";
import type { Env } from "../env.ts";
import { loadVocabulary, phraseVector, type Vocabulary } from "./files.ts";
import { keep } from "./kept.ts";
import { kindOf, leadRow, popularLists, repeats, yearRank } from "./popular.ts";
import { seedQueryVector, snapshotPalettes } from "./rank.ts";
import { knownQuery, plainPhrase } from "./read.ts";
import {
  canonicalPaletteSeed,
  normalizeTypedQuery,
  paletteId,
  suggestCollections
} from "./seams.ts";
import { loadSnapshot, type SnapshotEnv } from "./snapshot.ts";

/** A search as a tag: its words as a label, where a press leads, the colors of what answers, and the words. */
export interface SearchTag {
  label: string;
  href: string;
  colors: string[];
  query: string;
}

type TagEnv = SnapshotEnv & Pick<Env, "DB">;
interface Files {
  snapshot: Snapshot;
  vocabulary: Vocabulary;
}

const COLORS_KEPT = 512;
const colorsBySnapshot = new WeakMap<Snapshot, Map<string, string[]>>();
function colorsOf({ snapshot, vocabulary }: Files, words: string): string[] {
  let kept = colorsBySnapshot.get(snapshot);
  if (!kept) {
    kept = new Map();
    colorsBySnapshot.set(snapshot, kept);
  }
  const held = kept.get(words);
  if (held) return held;
  const read = knownQuery(vocabulary, words);
  const seeds = read
    ? snapshotPalettes(snapshot, read.vector, DOMINANT_PALETTES, { filter: read.filter }).map(
        c => c.seed
      )
    : [];
  return keep(kept, words, dominantColors(seeds), COLORS_KEPT);
}

/* a tag leads to the palette list, searched; a page that searches elsewhere writes its own address from `query` */
const tagOf = (files: Files, words: string): SearchTag => ({
  label: words,
  href: `/palettes?${new URLSearchParams({ q: words })}`,
  colors: colorsOf(files, words),
  query: words
});
const bounded = (limit: number, fallback: number) =>
  Math.max(1, Math.min(24, Math.floor(limit) || fallback));

async function searchFiles(env: SnapshotEnv): Promise<Files | null> {
  const [snapshot, vocabulary] = await Promise.all([loadSnapshot(env), loadVocabulary(env)]);
  return snapshot && vocabulary && snapshot.version === vocabulary.version
    ? { snapshot, vocabulary }
    : null;
}

/** The row at rest, as tags; none without the search files, since a tag that finds nothing is no tag. */
export async function popularSearches(env: TagEnv, limit = 24): Promise<SearchTag[]> {
  const files = await searchFiles(env);
  if (!files) return [];
  const row = leadRow(files.vocabulary, await popularLists(env));
  return row.slice(0, bounded(limit, 24)).map(words => tagOf(files, words));
}

/* The vocabulary's phrases that are searches of their own, in its own order, read once per vocabulary. A name written as
   one word beside the same name in two (darkblue, dark blue) is offered once, as the two, and a phrase that only adds a
   word of form to another (green blue gradient) is left out. */
const plainByVocabulary = new WeakMap<Vocabulary, { phrase: string; place: number }[]>();
function plainPhrases(voc: Vocabulary): { phrase: string; place: number }[] {
  let plain = plainByVocabulary.get(voc);
  if (!plain) {
    const spaced = new Set(voc.phrases.filter(p => p.includes(" ")).map(p => p.replace(/ /g, "")));
    plain = voc.phrases
      .map((phrase, place) => ({ phrase, place }))
      .filter(
        ({ phrase }) =>
          !(spaced.has(phrase) && !phrase.includes(" ")) &&
          !queryTokens(phrase).some(word => FORM_WORDS.has(word)) &&
          plainPhrase(knownQuery(voc, phrase), phrase)
      );
    plainByVocabulary.set(voc, plain);
  }
  return plain;
}

/** How many of the phrases nearest a palette are read for its tags: enough that a dozen ideas stand once repeats go. */
const NEAR_PHRASES = 60;
/** How many tags of one kind a palette's row takes before the other kinds have had theirs. */
const OF_A_KIND = 4;

/** The searches a palette answers: the plain phrases nearest it, nearest first, each idea once, and no kind more than
    OF_A_KIND times while another has a phrase to give. */
async function likeSearches(
  env: SnapshotEnv,
  files: Files,
  seed: string,
  limit: number
): Promise<SearchTag[]> {
  const vector = await seedQueryVector(env, files.snapshot, seed);
  if (!vector) return [];
  const { vocabulary } = files;
  const near = (place: number) => {
    const phrase = phraseVector(vocabulary, place);
    let dot = 0;
    for (let k = 0; k < phrase.length; k++) dot += phrase[k] * vector[k];
    return dot;
  };
  const nearest = plainPhrases(vocabulary)
    .map(({ phrase, place }) => ({ phrase, score: near(place) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, NEAR_PHRASES);
  const ideas: string[] = [];
  for (const { phrase } of nearest) if (!repeats(vocabulary, phrase, ideas)) ideas.push(phrase);
  const taken = new Map<string, number>();
  const first: string[] = [];
  const later: string[] = [];
  for (const phrase of ideas) {
    const kind = kindOf(vocabulary, phrase);
    const n = taken.get(kind) ?? 0;
    taken.set(kind, n + 1);
    (n < OF_A_KIND ? first : later).push(phrase);
  }
  const row = new Set([...first, ...later].slice(0, limit));
  return ideas.filter(phrase => row.has(phrase)).map(phrase => tagOf(files, phrase));
}

/** Levenshtein distance, stopped once it passes `limit`. */
function edits(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** How well a phrase answers what is typed: itself, one it starts, one that holds it, one the typed words hold, then
    one letter off. Zero is no answer. */
export function closeness(candidate: string, typed: string): number {
  if (!typed) return 1;
  if (candidate === typed) return 6;
  if (candidate.startsWith(typed)) return 5;
  if (candidate.includes(typed)) return 4;
  if (candidate.length >= 3 && typed.includes(candidate)) return 3;
  if (typed.length >= 4 && edits(candidate, typed, 1) <= 1) return 2;
  return 0;
}

/** The searches that answer what is typed, best first: the phrase the words mean (another language leads to it), then
    the phrases they begin, hold or are a letter from, the most searched first. Nothing typed is the row at rest; a
    palette in the words' place is answered by the searches it answers. */
export async function suggestSearches(env: TagEnv, raw = "", limit = 12): Promise<SearchTag[]> {
  const typed = normalizeTypedQuery(raw);
  if (!typed) return popularSearches(env, limit);
  const files = await searchFiles(env);
  if (!files) return [];
  if (paletteId(typed)) {
    const seed = canonicalPaletteSeed(typed);
    return seed ? likeSearches(env, files, seed, bounded(limit, 12)) : [];
  }
  /* what the words mean, when the vocabulary reads them as one phrase as they stand; a letter off is forgiven below,
     against the phrases alone: forgiven against every language, a word half typed meant something else */
  const read = knownQuery(files.vocabulary, typed);
  const meant =
    read?.whole && read.how === "exact" && read.phrases.length === 1 ? read.phrases[0] : null;
  return plainPhrases(files.vocabulary)
    .map(({ phrase, place }) => ({
      phrase,
      place,
      rank: phrase === meant ? 7 : closeness(phrase, typed)
    }))
    .filter(entry => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || yearRank(a.phrase) - yearRank(b.phrase) || a.place - b.place)
    .slice(0, bounded(limit, 12))
    .map(entry => tagOf(files, entry.phrase));
}

/* the words a tag's label says: lowercase, without the words of form */
const labelWords = (label: string): string[] =>
  label
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word && !FORM_WORDS.has(word));

/** Two kinds of tag in one row, a search and then a collection in turn, each kind in its own order. Given `labelOf`, a
    tag whose label says a word a tag before it said is left out and the next of its kind takes the turn, so Blue
    swatches never stands beside blue. */
export function mixTags<A, B>(
  searches: readonly A[],
  collections: readonly B[],
  limit = 24,
  labelOf?: (tag: A | B) => string
): (A | B)[] {
  const out: (A | B)[] = [];
  const said = new Set<string>();
  const queues: (A | B)[][] = [[...searches], [...collections]];
  const next = (queue: (A | B)[]): A | B | undefined => {
    while (queue.length) {
      const tag = queue.shift() as A | B;
      const words = labelOf ? labelWords(labelOf(tag)) : [];
      if (words.some(word => said.has(word))) continue;
      for (const word of words) said.add(word);
      return tag;
    }
    return undefined;
  };
  while (out.length < limit && queues.some(queue => queue.length)) {
    for (const queue of queues) {
      const tag = out.length < limit ? next(queue) : undefined;
      if (tag !== undefined) out.push(tag);
    }
  }
  return out;
}

/** A tag of the home's row: a search carries its words as `query`, a collection has none. */
export interface HomeTag {
  label: string;
  href: string;
  colors: string[];
  query?: string;
}

/** The home's row: searches and collections in turn. At rest no tag says again a word one before it said; with words,
    the searches and the collections that answer them. */
export async function homeTags(env: TagEnv, words = "", count = 24): Promise<HomeTag[]> {
  const each = Math.ceil(count / 2);
  const [searches, collections] = await Promise.all([
    words ? suggestSearches(env, words, each) : popularSearches(env, each * 2),
    suggestCollections(env, words, words ? each : each * 2)
  ]);
  const asTags = collections.map(c => ({ label: c.title, href: c.href, colors: c.colors }));
  return mixTags<HomeTag, HomeTag>(
    searches,
    asTags,
    each * 2,
    words ? undefined : tag => tag.label
  );
}

/** How long tags are kept: answers to typed words an hour, since the vocabulary gives them; the row at rest five
    minutes, so a search scheduled for now is in it soon after its time. */
export const suggestionsCache = (typed: string): Record<string, string> => ({
  "Cache-Control": `public, max-age=${normalizeTypedQuery(typed) ? 3600 : 300}`
});

/** `GET /api/search-suggestions?q=&limit=` (`both=1`: the home's row): public, the same for everyone. */
export async function searchSuggestionsResponse(request: Request, env: TagEnv): Promise<Response> {
  const url = new URL(request.url);
  const typed = url.searchParams.get("q") ?? "";
  const asked = url.searchParams.get("limit");
  const suggestions =
    !normalizeTypedQuery(typed) && url.searchParams.get("both") === "1"
      ? await homeTags(env, "", Math.max(2, Math.min(24, Math.floor(Number(asked)) || 24)))
      : await suggestSearches(env, typed, Number(asked ?? 12));
  return Response.json({ suggestions }, { headers: suggestionsCache(typed) });
}
