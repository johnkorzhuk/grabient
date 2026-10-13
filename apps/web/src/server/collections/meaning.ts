import { subjectOf } from "./letters.ts";

/* What a collection means to a search. Letters alone miss what a reader plainly asks for: purple finds no collection
   called violet, and sea none called ocean. So beside its letters (letters.ts) a collection answers by what it means,
   read three ways inside the Worker:

   - its name: a word of its title stands where the query does in the search's space (violet for purple, dusk for
     sunset). Each thing the query names must have its like in the title, so blue green wants both. A tag read the same
     way is a mention, as a tag that holds the query's letters is;
   - its palettes: at least half of them are among the palettes nearest the query, the bar a palette clears to answer;
   - itself, for a public collection: its own vector, among the nearest to the query.

   The search's space is the palette search's own (space.ts): a palette's vector for a seed or hex codes, the
   vocabulary's for words it knows, and the embedding model's for other words when a reader's search asks for it. */

/** A title's word means the query from this closeness up: the same thing said another way (violet and purple 0.87, sea
    and ocean 0.87, dusk and sunset 0.78, fall and autumn 0.74), while neighbors fall under it (spring and summer 0.73,
    multicolor and monochrome 0.71). */
export const NAME_FLOOR = 0.74;
/** the title holds the query's own phrase: the same words, another language's, or a letter off */
const SAME_NAME = 0.999;
/** a collection's palettes answer when this share of them do */
export const SHARE_FLOOR = 0.5;
const NEAR_COLLECTIONS = 12;
const NEAR_FLOOR = 0.5;
const NEAR_SPREAD = 0.12;

/** A search as the collections read it. */
export interface Reading {
  /** where the query stands in the search's space */
  vector: readonly number[];
  /** what the query names, each a place of its own; empty for a palette or hex codes, which name nothing */
  names: readonly ArrayLike<number>[];
  /** the words nothing read: a collection must hold them as letters before what it means counts */
  unread: readonly string[];
  /** the relationship the query asks of a palette (complementary, triadic), when it names one */
  filter: readonly string[] | null;
  /** the vocabulary's phrase the query is, when it is one whole phrase (morado is purple) */
  phrase?: string;
}

/** A palette's standing against a reading: its score and its colors' relationship. */
export interface Standing {
  score: number;
  harmony: string;
}

/** What the search's space offers the collections: the search area answers it. */
export interface SearchSpace {
  /** the query read, or a null reading when nothing here reads it; `unkept` when a reader would have been given more
      (an allowance spent, or a crawler asked, which is never sold the model) */
  read(query: string): Promise<{ reading: Reading | null; unkept?: boolean }>;
  /** what words name, as the vocabulary's rows: a title's subject, or a tag */
  names(words: string): readonly number[];
  /** where a row of the vocabulary stands in the space */
  place(row: number): ArrayLike<number>;
  /** every public collection the space holds, in its order */
  collections: readonly {
    slug: string;
    subject: string;
    words: string;
    members: readonly number[];
  }[];
  /** each of the space's palettes against a vector, by row: its standing, and the bar a palette clears to answer */
  standings(vector: readonly number[]): { at(row: number): Standing; bar: number };
  /** the public collections whose own vectors stand nearest a vector, nearest first */
  nearest(vector: readonly number[], n: number): { slug: string; score: number }[];
  /** these palettes against a vector, measured where the space does not hold them */
  standingsOf(seeds: readonly string[], vector: readonly number[]): Promise<Map<string, Standing>>;
}

/** What a collection means to a reading, each from 0 to 1. */
export interface Meaning {
  /** how nearly its title names what the query names: the least of the query's names, each against its nearest */
  name: number;
  /** the same of its tags, for what the title does not already name */
  tagged: number;
  /** the share of its palettes that answer the query */
  share: number;
  /** how near a public collection stands as a whole, when among the nearest; 0 otherwise */
  near: number;
}
const NOTHING: Meaning = { name: 0, tagged: 0, share: 0, near: 0 };

/** Whether a collection answers by what it means. */
export const means = (m: Meaning): boolean =>
  m.name >= NAME_FLOOR || m.share >= SHARE_FLOOR || m.near > 0;
/** Whether a tag means the query: the collection mentions it, as one whose tag holds the letters does. */
export const mentionsMeaning = (m: Meaning): boolean => m.tagged >= NAME_FLOOR;
/** Whether a collection answers by what it means, strongly or as a mention. */
export const answers = (m: Meaning): boolean => means(m) || mentionsMeaning(m);
/** Whether its title holds the query's own phrase: named for the query as surely as by its letters. */
export const namedFor = (m: Meaning): boolean => m.name >= SAME_NAME;
/** How strongly a collection means the query: the share of its palettes that answer, how near it stands, or its name,
    a name at the floor counting as half the palettes answering and the same phrase as all of them. */
export const strength = (m: Meaning): number =>
  Math.max(
    m.share,
    m.near,
    m.name >= NAME_FLOOR
      ? SHARE_FLOOR + ((1 - SHARE_FLOOR) * (m.name - NAME_FLOOR)) / (1 - NAME_FLOOR)
      : 0
  );
/** What one collection means, by the key the meanings were read under. */
export const meaningOf = (meanings: ReadonlyMap<string, Meaning> | null, key: string): Meaning =>
  meanings?.get(key) ?? NOTHING;

/** How nearly rows name what the reading names: for each of the reading's names its nearest, and the least of those. */
function named(
  space: Pick<SearchSpace, "place">,
  reading: Reading,
  rows: readonly number[]
): number {
  if (!rows.length || !reading.names.length) return 0;
  let least = 1;
  for (const name of reading.names) {
    let best = 0;
    for (const row of rows) {
      const place = space.place(row);
      let sum = 0;
      for (let j = 0; j < place.length; j++) sum += place[j]! * name[j]!;
      if (sum > best) best = sum;
    }
    if (best < least) least = best;
  }
  return least;
}
/* what tags name that the title does not */
const beyond = (title: readonly number[], tags: readonly number[]) =>
  [...new Set(tags)].filter(row => !title.includes(row));

/** How nearly a title, and its tags beyond it, name what the reading names. */
export function namesOf(
  space: Pick<SearchSpace, "names" | "place">,
  reading: Reading,
  title: string,
  tags: readonly string[]
): Pick<Meaning, "name" | "tagged"> {
  if (!reading.names.length) return { name: 0, tagged: 0 };
  const inTitle = space.names(subjectOf(title));
  return {
    name: named(space, reading, inTitle),
    tagged: named(
      space,
      reading,
      beyond(
        inTitle,
        tags.flatMap(tag => space.names(tag))
      )
    )
  };
}

/** The share of standings that answer: they clear the bar, in the relationship the query asks for. A palette with no
    standing is left out of the count. */
export function shareOf(
  standings: readonly (Standing | undefined)[],
  bar: number,
  filter: readonly string[] | null
): number {
  const wanted = filter?.length ? new Set(filter) : null;
  let known = 0;
  let answering = 0;
  for (const standing of standings) {
    if (!standing) continue;
    known++;
    if (standing.score >= bar && (!wanted || wanted.has(standing.harmony))) answering++;
  }
  return known ? answering / known : 0;
}

/** What every public collection of the space means to a reading, by slug. */
export function publicMeanings(space: SearchSpace, reading: Reading): Map<string, Meaning> {
  const { at, bar } = space.standings(reading.vector);
  const closest = space.nearest(reading.vector, NEAR_COLLECTIONS);
  const top = closest[0]?.score ?? 0;
  const near = new Map(
    closest
      .filter(c => c.score >= NEAR_FLOOR && c.score >= top - NEAR_SPREAD)
      .map(c => [c.slug, Math.min(1, c.score)])
  );
  return new Map(
    space.collections.map(c => {
      const title = space.names(c.subject);
      return [
        c.slug,
        {
          name: named(space, reading, title),
          tagged: named(space, reading, beyond(title, space.names(c.words))),
          share: shareOf(
            c.members.map(row => at(row)),
            bar,
            reading.filter
          ),
          near: near.get(c.slug) ?? 0
        }
      ];
    })
  );
}

/** What each of an owner's collections means to a reading, by id: its title and tags, and every palette it holds
    stood against the query in one measure. */
export async function ownMeanings(
  space: SearchSpace,
  reading: Reading,
  collections: readonly {
    id: string;
    title: string;
    tags: readonly string[];
    seeds: readonly string[];
  }[]
): Promise<Map<string, Meaning>> {
  const { bar } = space.standings(reading.vector);
  const standings = await space.standingsOf(
    [...new Set(collections.flatMap(c => c.seeds))],
    reading.vector
  );
  return new Map(
    collections.map(c => [
      c.id,
      {
        ...namesOf(space, reading, c.title, c.tags),
        share: shareOf(
          c.seeds.map(seed => standings.get(seed)),
          bar,
          reading.filter
        ),
        near: 0
      }
    ])
  );
}
