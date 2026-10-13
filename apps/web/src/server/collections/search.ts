import { normalizeQuery } from "@grabient/search/text.ts";
import { all, first, replica } from "@grabient/server/db/d1.ts";
import { COLLECTION_LIMIT, frameOf } from "../../features/collections/params.ts";
import { MAX_COLLECTION_ITEMS, MAX_OWN_COLLECTIONS } from "../../features/collections/schema.ts";
import type {
  CollectionHit,
  CollectionPage,
  CollectionSort,
  RisingFrame
} from "../../features/collections/types.ts";
import { listWords } from "../../lib/words.ts";
import {
  folded,
  holds,
  mentions,
  NAMED,
  ownCloseness,
  searchTokens,
  subjectOf,
  titleCloseness,
  wordsOf
} from "./letters.ts";
import {
  answers,
  type Meaning,
  meaningOf,
  means,
  mentionsMeaning,
  namedFor,
  ownMeanings,
  publicMeanings,
  type Reading,
  type SearchSpace,
  strength
} from "./meaning.ts";
import {
  type CollectionOwner,
  type CollectionRow,
  colorsOf,
  LEAD_SEEDS,
  type Previews,
  pageOf,
  type Reader,
  SELECT,
  tagsOf
} from "./read.ts";
import { type SpaceEnv, type SpaceOptions, searchedCollections, searchSpace } from "./space.ts";

/* The lists of collections and their searches. No words is the list itself in its order. Words read letters, then what
   the words mean (meaning.ts), and order the answers as two kinds:
   - named for the words: the title holds them, or holds the phrase they mean (púrpura finds Purple gradients). The one
     whose whole subject is the query leads, then the titles that hold the words best, then the ones with the most
     palettes that answer;
   - every other answer, by how strongly it means the query, a mention counting for a little.
   A query the site has nothing for stays empty. */

/** A search's bindings: the primary database, whose public reads go through a replica session here, and the palette
    search's files where there are any. */
export type SearchEnv = Pick<SpaceEnv, "DB"> & Partial<Omit<SpaceEnv, "DB">>;
export interface SearchOptions extends SpaceOptions {
  /** which palettes each collection comes with; a site's list leaves it to its cards */
  previews?: Previews;
}
export interface ListInput {
  query?: string;
  sort?: CollectionSort;
  /** Rising's frame: 1w, 3m or 1y, anything else the week */
  frame?: string;
  page?: number;
  limit?: number;
}

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value!))) : fallback;

/* The popular order: the collections saved as copies most, then the ones whose palettes are liked most, then the latest
   change; the home's hot order leads with what was liked and saved lately; Rising is the frame's score. Each reads
   through an index of its own. */
const POPULAR = "c.fork_count DESC, c.likes_sum DESC, c.updated_at DESC";
const RISE: Record<RisingFrame, string> = { "1w": "rising", "3m": "rising_3m", "1y": "rising_1y" };
const orderBy = (sort: CollectionSort, frame: RisingFrame = "1w") =>
  sort === "popular"
    ? POPULAR
    : sort === "hot"
      ? `c.hot DESC, ${POPULAR}`
      : sort === "rising"
        ? `c.${RISE[frame]} DESC, c.updated_at DESC`
        : `c.updated_at ${sort === "oldest" ? "ASC" : "DESC"}`;

/* How many collections are public, counted once in five minutes in an isolate. A write in this isolate counts again;
   a count read while a write forgot it is not kept, since it may be the count from before the write. */
const COUNT_TTL = 300_000;
let kept: { at: number; n: number; epoch: number } | null = null;
let epoch = 0;
const heldCount = () =>
  kept && kept.epoch === epoch && Date.now() - kept.at < COUNT_TTL ? kept.n : null;
async function publicCount(env: Reader, again = false): Promise<number> {
  const held = again ? null : heldCount();
  if (held !== null) return held;
  const asked = epoch;
  const at = Date.now();
  const n = Number(
    (
      await first<{ n: number }>(
        env.DB,
        "SELECT COUNT(*) AS n FROM k_collections WHERE visibility = 'public'"
      )
    )?.n ?? 0
  );
  if (asked === epoch) kept = { at, n, epoch: asked };
  return n;
}

/* Every public collection's title and first palettes, kept ten minutes in an isolate, in the popular order: the tags
   at rest are the popular collections, and what is typed in a field is matched against them. */
interface TitleRow {
  slug: string;
  title: string;
  seeds: string | null;
}
const TITLES_TTL = 600_000;
const TITLES_MAX = 2000;
let titles: { at: number; rows: TitleRow[]; epoch: number } | null = null;
async function publicTitles(env: Reader): Promise<TitleRow[]> {
  if (titles && titles.epoch === epoch && Date.now() - titles.at < TITLES_TTL) return titles.rows;
  const asked = epoch;
  const rows = await all<TitleRow>(
    env.DB,
    `SELECT c.slug, c.title, ${LEAD_SEEDS} AS seeds FROM k_collections c WHERE c.visibility = 'public'
     ORDER BY ${POPULAR} LIMIT ?`,
    TITLES_MAX
  );
  if (asked === epoch) titles = { at: Date.now(), rows, epoch: asked };
  return rows;
}
/** A write in this isolate: the lists count again and the tags read the titles again. Called after the write, so a
    read while the write was on its way never keeps what it saw. */
export const forgetTitles = () => {
  epoch++;
};

/** What the words mean is read beside the letters: when reading it fails, the letters still answer. */
async function beside<T>(work: () => Promise<T> | T): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error(
      "collections search: what the words mean was not read",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
async function readMeaning(env: SearchEnv, query: string, options: SpaceOptions) {
  return beside(async () => {
    const space = await searchSpace(env, options);
    return space ? { space, ...(await space.read(query)) } : null;
  });
}

interface Answer {
  row: CollectionRow;
  /** how well its title holds the words; 0 when it is not named for them */
  title: number;
  /** its whole subject is the query */
  subject: boolean;
  share: number;
  relevance: number;
}
/** One collection as an answer. `title` is how its title answers the letters: under NAMED it is a letter off, which
    counts as a mention in the title would. */
function answerOf(
  row: CollectionRow,
  query: string,
  tokens: readonly string[],
  title: number,
  meaning: Meaning,
  phrase?: string
): Answer {
  const named = Math.max(title >= NAMED ? title : 0, namedFor(meaning) ? 6 : 0);
  const subject = normalizeQuery(subjectOf(row.title));
  /* a tag that means the words mentions them as a tag that holds them does */
  const mentioned = Math.max(
    tokens.length ? mentions(row, tokens) / (10 * tokens.length) : 0,
    mentionsMeaning(meaning) ? 0.2 : 0
  );
  return {
    row,
    title: named,
    subject: named > 0 && (subject === normalizeQuery(query) || subject === phrase),
    share: meaning.share,
    relevance: strength(meaning) + mentioned + (title > 0 && !named ? 0.3 : 0)
  };
}
const byAnswer =
  (oldest = false) =>
  (a: Answer, b: Answer): number =>
    Number(b.title > 0) - Number(a.title > 0) ||
    (a.title > 0
      ? Number(b.subject) - Number(a.subject) || b.title - a.title || b.share - a.share
      : 0) ||
    b.relevance - a.relevance ||
    (oldest ? a.row.updated_at - b.row.updated_at : b.row.updated_at - a.row.updated_at) ||
    (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0);

/** Words nothing read are no part of what a query means: what a collection means counts only when it holds them as
    letters. */
const holdsUnread = (row: CollectionRow, reading: Reading | null) =>
  !reading?.unread.length || reading.unread.every(word => wordsOf(row).includes(word));

/* A search ranks at most this many public rows by their letters in the Worker, and this many more that answer by what
   they mean alone: the database never sorts by relevance. */
const SEARCH_CANDIDATES = 96;
const SEARCH_MEANT = 60;

/** A page of the public collections: the list in its order, or with words the ones that answer them. Public rows only,
    and no session is read. */
export async function publicCollections(
  env: SearchEnv,
  input: ListInput = {},
  options: SearchOptions = {}
): Promise<CollectionPage> {
  const query = listWords(input.query);
  const sort: CollectionSort = input.sort ?? "newest";
  const risen = frameOf(input.frame);
  const frame = sort === "rising" && risen !== "1w" ? risen : undefined;
  const page = bounded(input.page, 1, 1, 10_000);
  const limit = bounded(input.limit, COLLECTION_LIMIT, 1, 96);
  const head = { query, sort, ...(frame ? { frame } : {}), page, limit };
  const db: Reader = { DB: replica(env) };
  if (!query) {
    const offset = (page - 1) * limit;
    /* a page past the end as this isolate counted reads nothing: an OFFSET walks every row it skips */
    const held = heldCount();
    if (held !== null && page > 1 && offset >= held)
      return pageOf(db, [], { ...head, total: held });
    const [total, rows] = await Promise.all([
      publicCount(db),
      all<CollectionRow>(
        db.DB,
        `${SELECT} WHERE c.visibility = 'public' ORDER BY ${orderBy(sort, frame)}, c.id LIMIT ? OFFSET ?`,
        limit,
        offset
      )
    ]);
    /* a page holding more than the kept count says: some were made public since, so they are counted again */
    const counted = offset + rows.length > total ? await publicCount(db, true) : total;
    return pageOf(db, rows, { ...head, total: counted }, options.previews ?? "page");
  }
  const tokens = searchTokens(query);
  /* instr, never LIKE: D1 refuses a LIKE pattern over 50 bytes, which one word of seventeen Japanese characters is. A
     common word is in more rows than are read, so the rows named for it are read first; the database finds the
     letters anywhere, and the rows that hold them as words are kept (holds) */
  const where = tokens.map(() => "instr(c.search_text, ?) > 0").join(" AND ");
  const inTitle = tokens.map(() => "instr(lower(c.title), ?) > 0").join(" AND ");
  const [lettered, read] = await Promise.all([
    tokens.length
      ? all<CollectionRow>(
          db.DB,
          `${SELECT} WHERE c.visibility = 'public' AND ${where} ORDER BY (${inTitle}) DESC, c.updated_at DESC, c.id
           LIMIT ?`,
          ...tokens,
          ...tokens,
          SEARCH_CANDIDATES
        ).then(rows => rows.filter(row => tokens.every(token => holds(wordsOf(row), token))))
      : Promise.resolve([]),
    readMeaning(env, query, options)
  ]);
  const reading = read?.reading ?? null;
  const meanings = read && reading ? await beside(() => publicMeanings(read.space, reading)) : null;
  /* the collections that answer by what they mean alone, the strongest first, read by their addresses, so only what is
     public now is shown */
  const held = new Set(lettered.map(row => row.slug));
  const wanted = meanings
    ? [...meanings]
        .filter(([slug, meaning]) => !held.has(slug) && answers(meaning))
        .sort(
          (a, b) => Number(means(b[1])) - Number(means(a[1])) || strength(b[1]) - strength(a[1])
        )
        .slice(0, SEARCH_MEANT)
        .map(([slug]) => slug)
    : [];
  const others = wanted.length
    ? await all<CollectionRow>(
        db.DB,
        `${SELECT} WHERE c.visibility = 'public' AND c.slug IN (SELECT value FROM json_each(?))`,
        JSON.stringify(wanted)
      )
    : [];
  const typed = query.toLowerCase();
  const ranked = [...lettered, ...others.filter(row => holdsUnread(row, reading))]
    .map(row =>
      answerOf(
        row,
        query,
        tokens,
        titleCloseness(folded(row.title), typed),
        meaningOf(meanings, row.slug),
        reading?.phrase
      )
    )
    .sort(byAnswer(sort === "oldest"));
  return pageOf(
    db,
    ranked.slice((page - 1) * limit, page * limit).map(answer => answer.row),
    { ...head, total: ranked.length, ...(read?.unkept ? { unkept: true } : {}) },
    options.previews ?? "page"
  );
}

/** How many of an owner's latest collections a search of them reads: they are ranked whole. */
const OWN_SEARCHED = 500;

/** Everything one owner made, any visibility, the latest changed first; with words the ones that answer them, best
    first, by their letters (a letter off allowed) or by what they mean. Private: the caller has checked the owner. */
export async function ownerCollections(
  env: SearchEnv,
  owner: CollectionOwner,
  input: ListInput = {},
  options: SearchOptions = {}
): Promise<CollectionPage> {
  const page = bounded(input.page, 1, 1, 10_000);
  const limit = bounded(input.limit, COLLECTION_LIMIT, 1, 96);
  const query = listWords(input.query);
  const strip = options.previews ?? "page";
  if (!query) {
    const [count, rows] = await Promise.all([
      first<{ n: number }>(
        env.DB,
        "SELECT COUNT(*) AS n FROM k_collections WHERE owner_kind = ? AND owner_id = ?",
        owner.kind,
        owner.id
      ),
      all<CollectionRow>(
        env.DB,
        `${SELECT} WHERE c.owner_kind = ? AND c.owner_id = ? ORDER BY c.updated_at DESC, c.id LIMIT ? OFFSET ?`,
        owner.kind,
        owner.id,
        limit,
        (page - 1) * limit
      )
    ]);
    return pageOf(
      env,
      rows,
      { query: "", sort: "newest", page, limit, total: Number(count?.n ?? 0) },
      strip
    );
  }
  const [own, read] = await Promise.all([
    all<CollectionRow>(
      env.DB,
      `${SELECT} WHERE c.owner_kind = ? AND c.owner_id = ? ORDER BY c.updated_at DESC, c.id LIMIT ?`,
      owner.kind,
      owner.id,
      OWN_SEARCHED
    ),
    readMeaning(env, query, options)
  ]);
  const reading = read?.reading ?? null;
  const typed = query.toLowerCase();
  const tokens = searchTokens(typed);
  let meanings: Map<string, Meaning> | null = null;
  if (read && reading && own.length) {
    const items = await all<{ collection_id: string; seed: string }>(
      env.DB,
      `SELECT i.collection_id, i.seed FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
       WHERE c.owner_kind = ? AND c.owner_id = ? ORDER BY i.collection_id, i.position LIMIT ?`,
      owner.kind,
      owner.id,
      MAX_OWN_COLLECTIONS * MAX_COLLECTION_ITEMS
    );
    const seeds = new Map<string, string[]>();
    for (const item of items)
      seeds.set(item.collection_id, [...(seeds.get(item.collection_id) ?? []), item.seed]);
    meanings = await beside(() =>
      ownMeanings(
        read.space as SearchSpace,
        reading,
        own.map(row => ({
          id: row.id,
          title: row.title,
          tags: tagsOf(row.tags),
          seeds: seeds.get(row.id) ?? []
        }))
      )
    );
  }
  const ranked = own
    .flatMap(row => {
      const meaning = meaningOf(holdsUnread(row, reading) ? meanings : null, row.id);
      return ownCloseness(row, query) > 0 || answers(meaning)
        ? [
            answerOf(
              row,
              query,
              tokens,
              titleCloseness(folded(row.title), typed),
              meaning,
              reading?.phrase
            )
          ]
        : [];
    })
    .sort(byAnswer());
  return pageOf(
    env,
    ranked.slice((page - 1) * limit, page * limit).map(answer => answer.row),
    {
      query,
      sort: "newest",
      page,
      limit,
      total: ranked.length,
      ...(read?.unkept ? { unkept: true } : {})
    },
    strip
  );
}

const hitOf = (row: TitleRow): CollectionHit => ({
  title: row.title,
  slug: row.slug,
  href: `/${row.slug}`,
  colors: colorsOf(row.seeds)
});

/** The tags under a collections search: the collections whose titles answer what is typed, best first, then the ones
    that mean it (from the vocabulary alone, never the model), then the titles a letter off; with nothing typed, the
    popular ones, the ones people search for leading. Public, and kept at the edge. */
export async function suggestCollections(
  env: SearchEnv,
  raw = "",
  limit = 12
): Promise<CollectionHit[]> {
  const query = listWords(raw);
  const n = Math.max(1, Math.min(24, Math.floor(limit) || 12));
  const rows = await publicTitles({ DB: replica(env) });
  if (!query) {
    const searched = await beside(() => searchedCollections(env));
    if (!searched?.length) return rows.slice(0, n).map(hitOf);
    const place = new Map(searched.map((slug, i) => [slug, i]));
    const at = (row: TitleRow) => place.get(row.slug) ?? searched.length;
    return [...rows]
      .sort((a, b) => at(a) - at(b))
      .slice(0, n)
      .map(hitOf);
  }
  const lettered = rows
    .map(row => ({ row, rank: titleCloseness(folded(row.title), query) }))
    .filter(x => x.rank > 0)
    .sort((a, b) => b.rank - a.rank);
  const titled = lettered
    .filter(x => x.rank >= NAMED)
    .slice(0, n)
    .map(x => x.row);
  if (titled.length < n) {
    const read = await readMeaning(env, query, {});
    const reading = read?.reading;
    const meanings =
      read && reading && !reading.unread.length
        ? await beside(() => publicMeanings(read.space, reading))
        : null;
    if (meanings) {
      const shown = new Set(titled.map(row => row.slug));
      const of = (row: TitleRow) => meaningOf(meanings, row.slug);
      titled.push(
        ...rows
          .filter(row => !shown.has(row.slug) && means(of(row)))
          .sort(
            (a, b) =>
              Number(namedFor(of(b))) - Number(namedFor(of(a))) || strength(of(b)) - strength(of(a))
          )
          .slice(0, n - titled.length)
      );
    }
    const shown = new Set(titled.map(row => row.slug));
    titled.push(
      ...lettered
        .filter(x => x.rank < NAMED && !shown.has(x.row.slug))
        .slice(0, n - titled.length)
        .map(x => x.row)
    );
  }
  return titled.map(hitOf);
}
