/* The searches people make, as tags: which words a tag may say, the most searched ranked and mixed by kind, and the row
   under the search field at rest. The row has three parts, and after the first no search says again what one before
   it says: the searches an admin's app scheduled for now, then up to four rising this week, then the most searched,
   one kind at a time. The counts (counts.ts) write the last two once a day; until they have counted enough, the row
   stands on a year of grabient.com's searches (searched.data.ts), which the counts take over as they come in.
   Every tag finds palettes: only what the free search answers as one phrase, or a listed emoji, is offered. */
import { americanSpelling } from "@grabient/search/text.ts";
import { FORM_WORDS } from "@grabient/search/words.ts";
import { all } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { kindAt, type Vocabulary } from "./files.ts";
import { knownQuery, plainPhrase } from "./read.ts";
import { EMOJI_PAIRS, EMOJI_SEARCHED, SEARCHED } from "./searched.data.ts";

/** How many searches the row keeps in order: twice the row, so a word a retraining drops leaves it full. */
export const POPULAR_KEPT = 48;
const RANK = new Map<string, number>([
  ...SEARCHED.map((words, i) => [words, i] as const),
  ...EMOJI_SEARCHED.map(([emoji], i) => [emoji, i] as const),
  ...EMOJI_PAIRS.map((pair, i) => [pair, i] as const)
]);
/** where a search stands among the year's, for ties */
export const yearRank = (words: string): number => RANK.get(words) ?? Infinity;

/* an emoji as a search: one, or two, each with or without its presentation selector */
const EMOJI = /^\p{Extended_Pictographic}️?$/u;
const EMOJI_PAIR = /^(?:\p{Extended_Pictographic}️?){2}$/u;
export const isEmoji = (words: string): boolean => EMOJI.test(words) || EMOJI_PAIR.test(words);
const isPair = (words: string) => EMOJI_PAIR.test(words);
/* only the listed emoji and pairs become tags, in their listed form: the lexicon reads some six hundred, and a pair of
   them could say what a tag should not */
const EMOJI_FORM = new Map(
  [...EMOJI_SEARCHED.map(([emoji]) => emoji), ...EMOJI_PAIRS].map(form => [
    form.replace(/️/g, ""),
    form
  ])
);
const listed = (emoji: string) => EMOJI_FORM.get(emoji.replace(/️/g, ""));

/* what an emoji reads as: the one phrase of one emoji, the phrases of a pair, or null when the free search cannot read
   all of it; read once per emoji and vocabulary */
const emojiPhrases = new WeakMap<Vocabulary, Map<string, string[] | null>>();
function emojiPhrase(voc: Vocabulary, emoji: string): string[] | null {
  let read = emojiPhrases.get(voc);
  if (!read) {
    read = new Map();
    emojiPhrases.set(voc, read);
  }
  if (!read.has(emoji)) {
    const known = knownQuery(voc, emoji);
    const enough = isPair(emoji)
      ? known?.whole && known.phrases.length >= 1
      : known?.whole && known.how === "exact" && known.phrases.length === 1;
    read.set(emoji, enough && known ? known.phrases : null);
  }
  return read.get(emoji) ?? null;
}

/** The emoji or pair a search is, as the lists write it, when it is listed and the free search reads all of it. */
const emojiSearch = (voc: Vocabulary, words: string): string | null =>
  isEmoji(words) && listed(words) && emojiPhrase(voc, words) !== null
    ? (listed(words) ?? words)
    : null;

/** A search that can stand as a tag: a phrase of its own, or a listed emoji or pair the free search reads. */
export const searchable = (voc: Vocabulary, words: string): boolean =>
  isEmoji(words) ? emojiSearch(voc, words) !== null : plainPhrase(knownQuery(voc, words), words);

/** The search a reader's words are, as a tag says it: a listed emoji or pair, or the one phrase the words read as, in
    the spelling its page is kept under (a translation is the English phrase). Null for words the free search does not
    answer as one phrase: they count nowhere and stand in no tag. */
export function tagWords(voc: Vocabulary, words: string): string | null {
  const emoji = emojiSearch(voc, words);
  if (emoji) return emoji;
  const read = knownQuery(voc, words);
  if (!read?.whole || read.how === "words" || read.phrases.length !== 1) return null;
  const phrase = americanSpelling(read.phrases[0]);
  return plainPhrase(knownQuery(voc, phrase), phrase) ? phrase : null;
}

/* what a search says, for telling repeats apart: an emoji says its phrase; a pair is its own idea */
const meaningOf = (voc: Vocabulary, words: string) =>
  isEmoji(words) && !isPair(words) ? (emojiPhrase(voc, words)?.[0] ?? words) : words;

/** The kinds the row takes in turn: a place or a thing, an aesthetic, a color, an emoji, a tone, a mood, a pair, a
    season, a collection's subject, a use. A kind not named here takes its turn after them. */
const TURN = [
  "scene",
  "theme",
  "color",
  "emoji",
  "tone",
  "mood",
  "pair",
  "season",
  "collection",
  "use"
];
/** a relationship (rainbow, monochrome) is how colors sit together: it stands with the tones */
const FAMILY: Readonly<Record<string, string>> = { relationship: "tone" };
/** Two searches this close say one thing (gold and golden, luxury and luxurious); aurora beside northern lights and
    sea beside ocean both stand. */
const SAME_MEANING = 0.9;

const places = new WeakMap<Vocabulary, Map<string, number>>();
function placeOf(voc: Vocabulary, phrase: string): number | undefined {
  let place = places.get(voc);
  if (!place) {
    place = new Map(voc.phrases.map((p, i) => [p, i]));
    places.set(voc, place);
  }
  return place.get(phrase);
}

/** A phrase's kind in the row: the vocabulary's own, `emoji`, `pair`, or `other` for a phrase with none. */
export function kindOf(voc: Vocabulary, phrase: string): string {
  if (isEmoji(phrase)) return isPair(phrase) ? "pair" : "emoji";
  const at = placeOf(voc, phrase);
  const kind = at === undefined ? undefined : kindAt(voc, at);
  return kind === undefined ? "other" : (FAMILY[kind] ?? kind);
}

export function sameMeaning(voc: Vocabulary, first: string, second: string): boolean {
  const a = meaningOf(voc, first);
  const b = meaningOf(voc, second);
  const i = placeOf(voc, a);
  const j = placeOf(voc, b);
  if (i === undefined || j === undefined) return a === b;
  let dot = 0;
  for (let k = 0; k < voc.d; k++) dot += voc.vectors[i * voc.d + k] * voc.vectors[j * voc.d + k];
  return dot >= SAME_MEANING;
}

/* the words of a search that say something: without the words of form */
const saying = (voc: Vocabulary, phrase: string) =>
  meaningOf(voc, phrase)
    .split(" ")
    .filter(word => !FORM_WORDS.has(word));

/** Whether a search says again what one of these says: the same meaning (golden beside gold, 🌈 beside rainbow), or a
    word of it (dark blue beside blue, dark beside dark academia). */
export const repeats = (voc: Vocabulary, phrase: string, chosen: readonly string[]): boolean =>
  chosen.some(
    other =>
      sameMeaning(voc, phrase, other) ||
      saying(voc, phrase).some(word => saying(voc, other).includes(word))
  );

/** The searches as a row, from `ranked` (most searched first): the kinds in turn, each kind's most searched first, so no
    kind fills the row. A search that repeats one already there waits until every other has had its turn; what waited
    fills the rest, most searched first, never a second word for one meaning. */
export function mixSearches(
  voc: Vocabulary,
  ranked: readonly string[],
  n = POPULAR_KEPT
): string[] {
  const queues = new Map<string, string[]>();
  for (const phrase of ranked) {
    const kind = kindOf(voc, phrase);
    const queue = queues.get(kind);
    if (queue) queue.push(phrase);
    else queues.set(kind, [phrase]);
  }
  const kinds = [
    ...TURN.filter(kind => queues.has(kind)),
    ...[...queues.keys()].filter(kind => !TURN.includes(kind))
  ];
  const chosen: string[] = [];
  while (chosen.length < n && kinds.some(kind => queues.get(kind)?.length)) {
    for (const kind of kinds) {
      const queue = queues.get(kind) ?? [];
      while (queue.length) {
        const phrase = queue.shift() as string;
        if (!repeats(voc, phrase, chosen)) {
          chosen.push(phrase);
          break;
        }
      }
      if (chosen.length >= n) break;
    }
  }
  for (const phrase of ranked) {
    if (chosen.length >= n) break;
    if (!chosen.includes(phrase) && !chosen.some(other => sameMeaning(voc, phrase, other)))
      chosen.push(phrase);
  }
  return chosen;
}

/** What the year counts for beside the searches counted here: a hundred searches, shared as the year's were. */
const YEAR_WEIGHT = 100;
/* each search's share of the year, from its place in it: GA4's numbers fall about as the place to the power -0.7; an
   emoji's share is its sessions over blue's; a pair, never searched, stands as a middling emoji, each one less */
const YEAR_SHARE = (() => {
  const raw = SEARCHED.map((_, i) => (i + 1) ** -0.7);
  const total = raw.reduce((a, b) => a + b, 0);
  const shares = new Map(SEARCHED.map((words, i) => [words, raw[i] / total]));
  const blue = shares.get("blue") ?? 0;
  for (const [emoji, sessions] of EMOJI_SEARCHED) shares.set(emoji, (blue * sessions) / 1703);
  EMOJI_PAIRS.forEach((pair, i) => {
    shares.set(pair, (blue * (60 - i)) / 1703);
  });
  return shares;
})();

/** The searches ranked for the row: the year's share and what was counted lately, most first. Only what can stand as a
    tag is ranked. */
export function rankSearches(
  voc: Vocabulary,
  counted: ReadonlyMap<string, number> = new Map()
): { words: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const [words, share] of YEAR_SHARE) scores.set(words, share * YEAR_WEIGHT);
  for (const [words, score] of counted) {
    const key = isEmoji(words) ? (listed(words) ?? words) : words;
    scores.set(key, (scores.get(key) ?? 0) + score);
  }
  return [...scores]
    .filter(([words]) => searchable(voc, words))
    .map(([words, score]) => ({ words, score }))
    .sort(
      (a, b) =>
        b.score - a.score || yearRank(a.words) - yearRank(b.words) || a.words.localeCompare(b.words)
    );
}

/* the year alone as a row, read once per vocabulary: what the tags stand on until the schedule has written one */
const yearRows = new WeakMap<Vocabulary, string[]>();
function yearRow(voc: Vocabulary): string[] {
  let row = yearRows.get(voc);
  if (!row) {
    row = mixSearches(
      voc,
      rankSearches(voc).map(entry => entry.words)
    );
    yearRows.set(voc, row);
  }
  return row;
}

/** How many of the searches rising this week stand in the row. */
const RISING_SHOWN = 4;

/** The row at rest: the scheduled searches as their sender ordered them (the same one twice stands once), then up to
    four rising, then the most searched, the row the schedule wrote and the year's behind it. */
export function leadRow(
  voc: Vocabulary,
  lists: Pick<PopularLists, "scheduled" | "rising" | "palettes">
): string[] {
  const row: string[] = [];
  for (const words of lists.scheduled) {
    if (searchable(voc, words) && !row.some(held => sameMeaning(voc, words, held))) row.push(words);
  }
  const take = (words: string) => {
    if (!searchable(voc, words) || repeats(voc, words, row)) return false;
    row.push(words);
    return true;
  };
  let risen = 0;
  for (const words of lists.rising) {
    if (risen >= RISING_SHOWN) break;
    if (take(words)) risen++;
  }
  for (const words of [...lists.palettes, ...yearRow(voc)]) take(words);
  return row;
}

/** What the tags stand on, as the database holds it. */
export interface PopularLists {
  /** the searches scheduled for now, in the order they lead */
  scheduled: string[];
  /** the searches rising this week, most risen first */
  rising: string[];
  /** the most searched, in the order they stand */
  palettes: string[];
  /** collections' slugs, the most searched for first */
  collections: string[];
}

const READ_EVERY = 10 * 60_000;
// A read that has not come back in this time (its request was cancelled) no longer holds the isolate to what it read.
const READ_OUT = 10_000;

interface Held {
  /** when the lists held were read */
  at: number;
  lists?: PopularLists;
  /** when the read that is out began, whichever request began it */
  asked?: number;
  /** how many new lists this isolate was told of: a read begun before the last keeps nothing */
  told: number;
}
// by the database binding: an isolate keeps its bindings from request to request
const lists = new WeakMap<D1Database, Held>();

function heldOf(db: D1Database): Held {
  let held = lists.get(db);
  if (!held) {
    held = { at: 0, told: 0 };
    lists.set(db, held);
  }
  return held;
}

/** The lists, read once every ten minutes per isolate. A missing table or a failed read gives empty lists, and the
    tags stand on the year. A read answers the request that began it alone (@grabient/server/shared-work.ts): while one
    is out, another request takes what the isolate read before, and one with nothing read yet reads for itself. */
export async function popularLists(env: Pick<Env, "DB">, now = Date.now()): Promise<PopularLists> {
  const held = heldOf(env.DB);
  if (held.lists && now - held.at < READ_EVERY) return held.lists;
  if (held.lists && held.asked !== undefined && now - held.asked < READ_OUT) return held.lists;
  held.asked = now;
  const told = held.told;
  const read = await readLists(env, now);
  if (held.told === told) {
    held.at = now;
    held.lists = read;
  }
  held.asked = undefined;
  return read;
}

function readLists(env: Pick<Env, "DB">, now: number): Promise<PopularLists> {
  const counted = all<{ kind: string; value: string }>(
    env.DB,
    "SELECT kind, value FROM k_popular_searches ORDER BY kind, position"
  ).catch(() => []);
  // the batch that began last leads, each in the order it was sent
  const scheduled = all<{ words: string }>(
    env.DB,
    "SELECT words FROM k_scheduled_searches WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC, position, words",
    now,
    now
  ).then(
    rows => [...new Set(rows.map(row => row.words))],
    () => []
  );
  return Promise.all([counted, scheduled]).then(([rows, leading]) => {
    const of = (kind: string) => rows.filter(row => row.kind === kind).map(row => row.value);
    return {
      scheduled: leading,
      rising: of("rising"),
      palettes: of("palettes"),
      collections: of("collections")
    };
  });
}

/** A new list was written: the next read in this isolate takes it. */
export const forgetPopular = (env: Pick<Env, "DB">): void => {
  const held = heldOf(env.DB);
  held.told++;
  held.lists = undefined;
};
