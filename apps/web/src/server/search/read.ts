/* How a query's words are read, before any palette is scored: the vocabulary's phrases they hold, the words nothing
   reads, the colors written as hex codes, what follows a negation, and whether the words are a page of their own. */
import type { Harmony } from "@grabient/engine/shape.ts";
import { queryColors, withoutColors } from "@grabient/search/colors.ts";
import type { LexiconHit } from "@grabient/search/lexicon.ts";
import {
  americanSpelling,
  harmonyFilter,
  hasPictograph,
  joinTokens,
  normalizeQuery,
  queryTokens,
  textTokens
} from "@grabient/search/text.ts";
import { blend } from "@grabient/search/vectors.ts";
import { FORM_WORDS, FUNCTION_WORDS, padded } from "@grabient/search/words.ts";
import { kindAt, phraseVector, type Vocabulary } from "./files.ts";

export interface KnownQuery {
  vector: number[];
  /** colors named one by one (red and blue): each one's place, then the other words' together */
  each?: number[][];
  /** the words nothing read, when `how` is words */
  unknown: string[];
  /** the vocabulary's phrases that answered */
  phrases: string[];
  /** the same as rows of the vocabulary, each once */
  rows: number[];
  /** exact: the phrase, a translation or the phrase with a form word; typo: one slip off; words: some of its words */
  how: "exact" | "typo" | "words";
  /** every word was read */
  whole: boolean;
  filter: readonly Harmony[] | null;
}

/* English form and padding always; another language's grammar unless the vocabulary knows the word itself */
const setAside = (voc: Vocabulary, word: string) =>
  FORM_WORDS.has(word) || (FUNCTION_WORDS.has(word) && !voc.lexicon.exactHit(word));

const meaningful = (word: string) => !FORM_WORDS.has(word) && !FUNCTION_WORDS.has(word);

/** The words of a query that say what is wanted: normalized, split in every script, without form and grammar. */
export const queryWords = (text: string): string[] => queryTokens(text).filter(meaningful);

/** The same words of a text read to its end: what a title, a collection's title and tags or a description's name call
    a palette. */
export const nameWords = (text: string): string[] => textTokens(text).filter(meaningful);

/** A name is in a title or three (lakers, dune), and a word in more titles is a plain one (night, glow). A description
    names a palette with a word that three palettes' descriptions or fewer use. */
export const NAME_ROWS = 3;

/* what a description writes as names: words capitalized inside a sentence, past its first (Preds, Bridgestone) */
const writtenNames = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+/u).flatMap(sentence =>
    (sentence.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])
      .slice(1)
      .filter(token => /^\p{Lu}/u.test(token))
      .flatMap(nameWords)
  );

/** Each palette's description names, as words a space apart: the names its descriptions write that at most NAME_ROWS
    palettes' descriptions use in any case, never a number. Prose about colors names no palette, and a word many
    descriptions share names none. */
export function describedNames(
  descriptions: ReadonlyMap<string, readonly string[]>
): Map<string, string> {
  const using = new Map<string, number>();
  for (const texts of descriptions.values())
    for (const word of new Set(texts.flatMap(nameWords)))
      using.set(word, (using.get(word) ?? 0) + 1);
  const named = new Map<string, string>();
  for (const [seed, texts] of descriptions) {
    const names = [...new Set(texts.flatMap(writtenNames))]
      .filter(word => (using.get(word) ?? 0) <= NAME_ROWS && !/^\p{N}+$/u.test(word))
      .sort();
    if (names.length) named.set(seed, names.join(" "));
  }
  return named;
}

/* At each word, the longest run of up to `longest` words the vocabulary holds as one phrase (dark blue; 深蓝色 where the
   segmenter gave 深 and 蓝色), else the word itself, a Korean noun without its particle included. */
function longestHits(
  voc: Vocabulary,
  words: readonly string[],
  longest: number,
  each: (hit: LexiconHit | null, at: number, span: number) => void
): void {
  for (let i = 0; i < words.length; ) {
    let span = Math.min(longest, words.length - i);
    let hit: LexiconHit | null = null;
    while (span > 1) {
      hit = voc.lexicon.exactHit(joinTokens(words.slice(i, i + span)));
      if (hit) break;
      span--;
    }
    each(hit, i, span);
    i += span;
  }
}

/** The query as the vocabulary knows it, or null when it knows none of it: the whole text (exactly or one slip off),
    then the text without its form and grammar, then word by word with no forgiveness, since beside known words an
    unknown one is more likely new than misspelled. */
export function knownQuery(voc: Vocabulary, text: string): KnownQuery | null {
  const query = normalizeQuery(text);
  if (!query) return null;
  const found = (
    hits: readonly LexiconHit[],
    unknown: string[],
    how: KnownQuery["how"]
  ): KnownQuery => ({
    vector:
      hits.length === 1
        ? Array.from(phraseVector(voc, hits[0].phrase))
        : blend(hits.map(hit => phraseVector(voc, hit.phrase))),
    unknown,
    phrases: [...new Set(hits.map(hit => voc.phrases[hit.phrase]))],
    rows: [...new Set(hits.map(hit => hit.phrase))],
    how,
    whole: !unknown.length,
    filter: harmonyFilter(
      hits.length === 1 && how !== "words" ? voc.phrases[hits[0].phrase] : query
    )
  });
  const whole = voc.lexicon.lookup(query);
  if (whole) return found([whole], [], whole.how);
  const tokens = queryTokens(query);
  const subject = tokens.filter(word => !setAside(voc, word));
  if (subject.length && subject.length < tokens.length) {
    const hit = voc.lexicon.lookup(joinTokens(subject));
    if (hit) return found([hit], [], hit.how);
  }
  const hits: LexiconHit[] = [];
  const unknown: string[] = [];
  longestHits(voc, tokens, 4, (hit, at) => {
    const read = hit ?? voc.lexicon.word(tokens[at]);
    if (read) hits.push(read);
    else if (!setAside(voc, tokens[at])) unknown.push(tokens[at]);
  });
  if (!hits.length) return null;
  const known = found(hits, unknown, hits.length === 1 && !unknown.length ? "exact" : "words");
  // two colors' sum stands near palettes of one of them, so each keeps a place; a pair of emoji stays one picture
  const colors = hasPictograph(query) ? [] : known.rows.filter(row => kindAt(voc, row) === "color");
  if (colors.length < 2) return known;
  const place = (row: number) => Array.from(phraseVector(voc, row));
  const others = known.rows.filter(row => !colors.includes(row));
  return {
    ...known,
    each: [...colors.map(place), ...(others.length ? [blend(others.map(place))] : [])]
  };
}

/* titleNames reads a title, or a collection's title and tags, to its 80th character: read further, other collections
   answer */
const lineStart = (text: string): string => Array.from(normalizeQuery(text)).slice(0, 80).join("");

/** What a title names, as rows of the vocabulary. A phrase the vocabulary holds only as one collection's title (kind
    `collection`) is read beneath too, so violet rain on sandstone names violet and sandstone; so is each side of a word
    that joins two names (red and black). Words of form and grammar name nothing. */
export function titleNames(voc: Vocabulary, title: string): number[] {
  const tokens = queryTokens(lineStart(title));
  const rows = new Set<number>();
  const read = (words: readonly string[], longest: number): void =>
    longestHits(voc, words, longest, (hit, at, span) => {
      if (hit) {
        rows.add(hit.phrase);
        if (kindAt(voc, hit.phrase) === "collection") read(words.slice(at, at + span), span - 1);
      } else if (!setAside(voc, words[at])) {
        const word = voc.lexicon.word(words[at]);
        if (word) rows.add(word.phrase);
      }
    });
  read(tokens, 4);
  let part: string[] = [];
  for (const word of [...tokens, ""]) {
    if (word && !setAside(voc, word)) {
      part.push(word);
      continue;
    }
    if (part.length && part.length < tokens.length) read(part, 4);
    part = [];
  }
  return [...rows];
}

/* the words that ask for something to be left out, in the languages the grammar lists know */
const NEGATIONS = new Set([
  "no",
  "not",
  "without",
  "ohne",
  "sin",
  "sans",
  "sem",
  "senza",
  "zonder",
  "bez",
  "без",
  "не"
]);

/** What a query asks to leave out: the phrase of two, or the word, read after each no, not or without (past too and
    so). After "no" only an English phrase in its own spelling, since no is "in the" in Portuguese. The search cannot
    leave these out, so it says it read them. */
export function excludedWords(voc: Vocabulary, query: string): string[] {
  const tokens = queryTokens(query);
  const out = new Set<string>();
  tokens.forEach((token, i) => {
    if (!NEGATIONS.has(token)) return;
    const rest = tokens
      .slice(i + 1)
      .filter(word => !FORM_WORDS.has(word) && word !== "too" && word !== "so");
    const two = rest.length > 1 ? voc.lexicon.exactHit(joinTokens(rest.slice(0, 2))) : null;
    const hit = two ?? (rest.length ? voc.lexicon.word(rest[0]) : null);
    if (hit && (token !== "no" || voc.phrases[hit.phrase] === hit.key))
      out.add(joinTokens(rest.slice(0, two ? 2 : 1)));
  });
  return [...out];
}

/** The hex codes in a query and the words beside them, or null when it holds none. Words that say nothing of colors
    (hex, codes) are no words. */
export function hexQuery(query: string): { hexes: string[]; words: string } | null {
  const hexes = queryColors(query);
  if (!hexes.length) return null;
  const rest = withoutColors(query);
  return { hexes, words: queryWords(rest).length ? rest : "" };
}

/** Hex codes and nothing else: the colors themselves are the query. */
export function hexLiterals(query: string): string[] | null {
  const read = hexQuery(query);
  return read && !read.words ? read.hexes : null;
}

/** One indexable page per meaning: the phrase itself, read whole, in its American spelling and plain words. Its
    translations, its British spelling, its misspellings and its padded forms lead to the same palettes unindexed. */
export const plainPhrase = (known: KnownQuery | null, query: string): boolean =>
  !!known &&
  known.whole &&
  known.how !== "words" &&
  known.phrases.length === 1 &&
  americanSpelling(known.phrases[0]) === query.toLowerCase() &&
  !padded(query);
