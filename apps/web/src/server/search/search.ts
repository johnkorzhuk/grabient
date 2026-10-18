/* The search: answered from the snapshot inside the Worker, free for everyone, by these tiers.
   - similar: palettes near a palette (its seed, an old id the maps know, or a Grabient link to it), led by up to six
     that its public collections hold
   - color: palettes near hex colors, written in the query or asked beside it
   - vocabulary: words the vocabulary reads, in any of its languages, as emoji, or one slip off
   - named: words no color says (a team, a game), found in palette titles and in collections' titles and tags, in one of
     them or across a palette's own
   - model: words new to the vocabulary, read by one embedding within the payer's allowance (model.ts)
   - account: nothing here could read the words; a signed-in account's own allowance may (routes.ts)
   - unavailable: the search files are missing or of two model versions
   D1 is the authority: a palette shows only while D1 says it is public. */
import { decodePalette, K_MAX } from "@grabient/engine";
import type { Style } from "@grabient/engine/view.ts";
import { labOf, sixDigits } from "@grabient/search/colors.ts";
import { harmonyFilter, normalizeQuery, QUERY_MAX } from "@grabient/search/text.ts";
import { queryIntent } from "@grabient/search/words.ts";
import { replica } from "@grabient/server/db/d1.ts";
import { sortSearch } from "../../features/gallery/sort.ts";
import { type ListSort, parseSort, type RisingFrame } from "../../lib/orders.ts";
import { listWords, looksLikeLink, paletteId } from "../../lib/words.ts";
import type { AssetsEnv } from "../assets.ts";
import { isCrawler } from "../crawlers.ts";
import { canonicalPaletteSeed } from "../files/resolve.ts";
import { digest, sharedRead } from "../shared-reads.ts";
import {
  blendOf,
  factsOf,
  holdDistance,
  seedFacts,
  shownDistance,
  strayDistance
} from "./facts.ts";
import { kindAt, loadVocabulary } from "./files.ts";
import { type Item, searchableItems } from "./items.ts";
import { type ModelEnv, modelQuery, type Payer } from "./model.ts";
import {
  answerBar,
  answeringSeeds,
  type Candidate,
  collectionMates,
  hexQueryVector,
  knownScores,
  namedPalettes,
  paletteScores,
  rankedRows,
  rowsVector,
  seedQueryVector,
  subjectMembers,
  titled
} from "./rank.ts";
import {
  excludedWords,
  hexLiterals,
  hexQuery,
  knownQuery,
  plainPhrase,
  queryWords
} from "./read.ts";
import { type Background, loadSnapshot, type SnapshotEnv } from "./snapshot.ts";

export type SearchTier =
  | "similar"
  | "color"
  | "vocabulary"
  | "named"
  | "model"
  | "account"
  | "unavailable";
export interface SearchItem extends Item {
  score: number;
  tags: string[];
}

/** What a search made of its words. */
export interface SearchRead {
  /** the vocabulary's phrases the query holds, and the words titles hold as names */
  phrases: string[];
  /** the words neither the vocabulary nor a title knows: in the model's answer, the ones it guessed at */
  unread: string[];
  /** what follows no, not or without, which the search cannot leave out */
  excluded: string[];
}

export interface SearchResult {
  query: string;
  items: SearchItem[];
  tier: SearchTier;
  indexable: boolean;
  read: SearchRead;
  /** the palettes the answer holds for `offset` to page through: 96 at most, less the ones gone from the site */
  total: number;
  /** the colors asked for that no palette of this page comes within FAR of */
  far?: string[];
  /** a crawler's answer, read without the model a person would have been given: never kept for others */
  unkept?: boolean;
  /** only some of the words were read; an account's search reads them all */
  partial?: boolean;
  limited?: boolean;
  retryAfter?: number;
  /** why the model was refused, a message the page translates */
  message?: string;
}

export interface SearchOptions {
  limit?: number;
  /** how many of the answer's palettes to pass over */
  offset?: number;
  request?: Request;
  ctx?: Background;
  /** who pays for a model read, when not the address asking */
  payer?: Payer;
  /** false leaves a palette out of the answer to itself */
  self?: boolean;
  /** hex colors the palettes come near, alone or beside words or a palette */
  colors?: readonly string[];
}

export type SearchEnv = SnapshotEnv & ModelEnv;

/** How many palettes a search reads as its whole answer: its orders and pages are cut from these. */
export const SEARCH_ANSWER = 96;
/** One read of the database takes this many seeds, and this many candidates past the ones asked for. */
const READ_AT_ONCE = 96;
const SPARE = 8;
/** A name is in a title or three (lakers, dune); a word in more titles is a plain one (night, glow). */
const NAME_ROWS = 3;
/** In OKLab, colors this far apart are other colors. */
const FAR = 0.06;
/** From this many written colors on, they are a palette's, a picture's among them, and the answer keeps its nearest CUT. */
const CUT_FROM = 3;
const CUT = 48;
const NOTHING: SearchRead = { phrases: [], unread: [], excluded: [] };

/** A query as every search takes it: a Grabient link as what it leads to, then NFKC and one space. Null when empty,
    longer than 100 characters, or holding control characters. */
export function normalizeSearchQuery(raw: string): string | null {
  const asked = looksLikeLink(raw) ? listWords(raw) || raw : raw;
  const query = asked.normalize("NFKC").replace(/\s+/gu, " ").trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  return query && query.length <= QUERY_MAX && !/[\u0000-\u001f\u007f]/u.test(query) ? query : null;
}

/** An old palette id no map knows: only the browser can read it, by fitting it, and it is never words for the model. */
export const unreadPalette = (query: string): boolean =>
  paletteId(query) !== null && canonicalPaletteSeed(query) === null;

/** The query of a `/search/{q}.json` or `/palettes/{q}.json` address: a seed as it is, hyphens as spaces. */
export function queryFromParam(param: string): string | null {
  let raw: string;
  try {
    raw = decodeURIComponent(param);
  } catch {
    return null;
  }
  return normalizeSearchQuery(canonicalPaletteSeed(raw) ?? raw.replace(/-/g, " "));
}

/* an empty `limit=` reads as 1, as it always has; anything not finite as the default */
function searchLimit(value?: string | number | null): number {
  const limit = Number(value ?? 48);
  return Number.isFinite(limit) ? Math.max(1, Math.min(SEARCH_ANSWER, Math.floor(limit))) : 48;
}

/** The search JSON's input, as its edge cache key is made too: `query` wins over `q`, else the path's words. */
export function searchRequestInput(request: Request): {
  query: string | null;
  limit: number;
  sort: ListSort;
} {
  const url = new URL(request.url);
  let query = url.searchParams.get("query") ?? url.searchParams.get("q");
  if (query === null) {
    const match = /^\/(?:search|palettes)\/(.+?)(?:\.json)?$/.exec(url.pathname);
    query = match ? queryFromParam(match[1]) : null;
  }
  return {
    query: query === null ? null : normalizeSearchQuery(query),
    limit: searchLimit(url.searchParams.get("limit")),
    sort: parseSort(url.searchParams.get("sort"))
  };
}

/** Candidates as cards: only what D1 shows, each once, drawn as the query asks when it names a form. A public search
    (`shared`) reads them from a replica, as the snapshot they come from trails D1 already, kept five minutes by this
    data center: a crawler asks one search in every language. An account's or an app's, which nothing keeps and which
    may follow its own change, reads the database itself. */
async function present(
  env: SearchEnv,
  candidates: readonly Candidate[],
  query: string,
  tags: readonly string[],
  shared: boolean
): Promise<SearchItem[]> {
  const seeds = candidates.map(c => c.seed);
  const shown = shared
    ? new Map(
        (
          await sharedRead(`search-items/${await digest(seeds.join(" "))}`, 300, async () => [
            ...(await searchableItems({ DB: replica(env) }, seeds)).entries()
          ])
        ).value
      )
    : await searchableItems(env, seeds);
  const intent = queryIntent(query);
  const seen = new Set<string>();
  return candidates.flatMap(candidate => {
    const seed = canonicalPaletteSeed(candidate.seed);
    const item = seed ? shown.get(seed) : undefined;
    if (!item || seen.has(item.kseed)) return [];
    seen.add(item.kseed);
    let style = intent.style ?? item.style;
    if (intent.swatches) style = style.replace("Gradient", "Swatches") as Style;
    const anchors = decodePalette(item.kseed)?.anchors.length ?? 2;
    return [
      {
        ...item,
        style,
        steps: Math.max(anchors, intent.count ?? item.steps, 3),
        score: candidate.score,
        ...(candidate.lead ? { lead: true } : {}),
        tags: [...tags]
      }
    ];
  });
}

/** The public search, and an account's or an app's with a payer. Throws a RangeError for a query it refuses. */
export async function searchPalettes(
  env: SearchEnv,
  rawQuery: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const asked = (options.colors ?? []).map(sixDigits);
  const query = asked.length && !String(rawQuery).trim() ? "" : normalizeSearchQuery(rawQuery);
  if (query === null)
    throw new RangeError(`Search queries must contain 1–${QUERY_MAX} characters.`);
  const limit = searchLimit(options.limit);
  const offset = Math.max(0, Math.min(SEARCH_ANSWER, Math.floor(options.offset || 0)));
  const end = Math.min(SEARCH_ANSWER, offset + limit);
  /* the public search's palettes are the data center's to share; an account's or an app's search (it has a payer)
     reads its own */
  const shared = !options.payer;
  const none = (tier: SearchTier, more: Partial<SearchResult> = {}): SearchResult => ({
    query,
    items: [],
    tier,
    indexable: false,
    read: NOTHING,
    total: 0,
    ...more
  });
  const [snapshot, vocabulary] = await Promise.all([
    loadSnapshot(env, options.ctx),
    loadVocabulary(env)
  ]);
  if (!snapshot || !vocabulary || snapshot.version !== vocabulary.version)
    return none("unavailable");
  const cut = (rows: readonly number[], scores: ArrayLike<number>): Candidate[] =>
    rows.slice(0, SEARCH_ANSWER + SPARE).map(i => ({ seed: snapshot.seeds[i], score: scores[i] }));

  /* The page asked for, of the candidates D1 still shows. One gone since the snapshot was built gives its place to the
     next: a few spare are read with the rest, and more in a second read when those are not enough. With `order` the
     whole answer is read and put in that order before the page is cut. */
  const answer = async (
    tier: SearchTier,
    candidates: readonly Candidate[],
    read: SearchRead = NOTHING,
    tags: readonly string[] = [],
    order?: (items: SearchItem[]) => SearchItem[]
  ): Promise<SearchResult> => {
    const most = order ? SEARCH_ANSWER : end;
    let seen = offset < end ? Math.min(READ_AT_ONCE, most + SPARE, candidates.length) : 0;
    let items = seen ? await present(env, candidates.slice(0, seen), query, tags, shared) : [];
    if (seen && items.length < most && seen < candidates.length) {
      const more = candidates.slice(
        seen,
        seen + Math.min(READ_AT_ONCE, most - items.length + SPARE)
      );
      items = [...items, ...(await present(env, more, query, tags, shared))];
      seen += more.length;
    }
    return {
      query,
      items: (order?.(items) ?? items).slice(offset, end),
      tier,
      indexable: false,
      read,
      total: Math.min(SEARCH_ANSWER, candidates.length - seen + items.length)
    };
  };

  const seed = canonicalPaletteSeed(query);
  const written = seed ? null : hexQuery(query);
  if (!seed && !written && unreadPalette(query)) return none("similar");
  const like = seed ? await seedQueryVector(env, snapshot, seed) : null;
  const self = options.self === false && seed ? snapshot.at.get(seed) : undefined;
  if (seed && !like) return none("unavailable");

  const colors = [...asked, ...(written?.hexes ?? [])].slice(0, K_MAX);
  if (colors.length) {
    /* Words beside colors are read by the vocabulary alone, so colors never buy the model. What it reads, or a palette
       in the words' place, says which palettes may answer, as a search of Saved judges it; the nearest colors lead. */
    const words = written ? written.words : seed ? "" : query;
    const known = words ? knownQuery(vocabulary, words) : null;
    const labs = colors.map(labOf);
    const near = like ? paletteScores(snapshot, like) : known ? knownScores(snapshot, known) : null;
    const bar = near ? answerBar(near, !!known?.each) : 0;
    const may = {
      filter: known?.filter,
      allowed: (i: number) => i !== self && (!near || near[i] >= bar)
    };
    let candidates: Candidate[];
    if (asked.length) {
      // colors asked beside the query are measured against every palette
      const facts = factsOf(snapshot);
      const scores = Float32Array.from(snapshot.seeds, (_, i) => 1 - holdDistance(facts, i, labs));
      candidates = cut(rankedRows(snapshot, scores, may), scores);
    } else {
      /* codes written in the query pick their pool by their own vector, which costs 2 ms where the whole table costs
         a sixth of a second; the spare ones stay last, behind the answer */
      const vector = await hexQueryVector(env, colors);
      if (!vector) return none("unavailable");
      const pool = rankedRows(snapshot, paletteScores(snapshot, vector), may)
        .slice(0, SEARCH_ANSWER + SPARE)
        .map(i => snapshot.seeds[i]);
      const facts = seedFacts(pool);
      const measured = pool.map((kseed, k) => ({
        seed: kseed,
        score: 1 - holdDistance(facts, k, labs)
      }));
      candidates = [
        ...measured.slice(0, SEARCH_ANSWER).sort((a, b) => b.score - a.score),
        ...measured.slice(SEARCH_ANSWER)
      ];
      /* Read by likes, the whole answer is what a reader sees first, and a loose neighbor with many likes would lead it.
         So it keeps the palettes nearest both ways: each asked color near one of the palette's, and the palette's
         curve near the asked colors or the blend through them. */
      if (colors.length >= CUT_FROM) {
        const both = [...labs, ...blendOf(colors)];
        candidates = measured
          .map((m, k) => ({ ...m, apart: 1 - m.score + strayDistance(facts, k, both) }))
          .sort((a, b) => a.apart - b.apart)
          .slice(0, CUT)
          .map(m => ({ seed: m.seed, score: m.score }));
      }
    }
    /* A palette shown as Swatches draws bands, never its curve, and its view is known only once D1 is read: the whole
       answer is read, each palette measured as it is shown, and the page cut from that order. */
    const read = {
      phrases: known?.phrases ?? [],
      unread: known ? known.unknown : queryWords(words),
      excluded: excludedWords(vocabulary, words)
    };
    const result = await answer("color", candidates, read, known?.phrases, items =>
      items
        .map(item => ({ ...item, score: 1 - shownDistance(item, labs) }))
        .sort((a, b) => b.score - a.score)
    );
    const far = [...new Set(colors)].filter(hex =>
      result.items.every(item => shownDistance(item, [labOf(hex)]) >= FAR)
    );
    return far.length && result.items.length ? { ...result, far } : result;
  }

  /* A palette's own collections chose its nearest mates for it: they lead, then its nearest colors from anywhere. */
  if (like) {
    const scores = paletteScores(snapshot, like);
    const row = seed ? snapshot.at.get(seed) : undefined;
    const mates = row === undefined ? [] : collectionMates(snapshot, row, scores);
    const first = new Set(mates);
    return answer(
      "similar",
      [
        ...mates.map(i => ({ seed: snapshot.seeds[i], score: scores[i], lead: true as const })),
        ...cut(rankedRows(snapshot, scores, { allowed: i => i !== self && !first.has(i) }), scores)
      ].slice(0, SEARCH_ANSWER + SPARE)
    );
  }

  // a word one slip from a phrase is taken as written when a title holds it: mist is mint a letter off, and titles 30
  const lettered = knownQuery(vocabulary, query);
  const words = queryWords(query);
  const known = lettered?.how === "typo" && titled(snapshot, words) ? null : lettered;
  const unread = known ? known.unknown : words;
  const scores = known ? knownScores(snapshot, known) : null;
  const read: SearchRead = {
    phrases: known?.phrases ?? [],
    unread,
    excluded: excludedWords(vocabulary, query)
  };

  /* Names. The words the vocabulary did not read are looked for in titles and in collections' titles and tags, and a
     phrase it read whole that is a collection's subject brings that collection's palettes. They lead above every
     neighbor. What the words name heads every order, and so do a collection's own palettes when the vocabulary knows
     its phrase only as that collection's title; a color, mood or scene's palettes go by the order alone. Beside words
     that were read, a word of many titles is a plain word: its palettes lead only where they also answer those words,
     nearest first, and when none does it stays unread. */
  let named = namedPalettes(snapshot, unread);
  if (named && known && scores && named.rows.length > NAME_ROWS) {
    const titles = new Set(named.rows);
    const bar = answerBar(scores, !!known.each);
    const rows = rankedRows(snapshot, scores, {
      filter: known.filter,
      allowed: i => titles.has(i) && scores[i] >= bar
    });
    named = rows.length ? { ...named, rows } : null;
  }
  const subject =
    !named && known?.whole && known.how !== "words"
      ? subjectMembers(snapshot, known.phrases[0])
      : [];
  const lead = named ? named.rows : subject;
  const heads =
    !!named ||
    (!!known && subject.length > 0 && kindAt(vocabulary, known.rows[0]) === "collection");

  /* The model reads what the vocabulary and the names could not. Read whole, the answer is its own; refused or
     unavailable, the part that was read still answers, and words nobody here read wait for an account's search. */
  const buys = !named && !known?.whole;
  const model = buys
    ? await modelQuery(env, query, {
        request: options.request,
        ctx: options.ctx,
        payer: options.payer
      })
    : null;
  if (model && "vector" in model) {
    const meant = paletteScores(snapshot, model.vector);
    const rows = rankedRows(snapshot, meant, { filter: harmonyFilter(normalizeQuery(query)) });
    return answer("model", cut(rows, meant), read);
  }
  // a crawler is never sold the model, so what it gets is not what a person would: its answer is kept for nobody
  const unkept =
    buys && !model && !options.payer && options.request && isCrawler(options.request)
      ? { unkept: true }
      : {};
  const limited = model
    ? { limited: true, retryAfter: model.retryAfter, message: model.message }
    : {};
  if (!known && !named) return none("account", { read, ...unkept, ...limited });
  const near = scores ?? paletteScores(snapshot, rowsVector(snapshot, lead));
  const first = new Set(lead);
  const led = lead.slice(0, SEARCH_ANSWER + SPARE).map((i, k) => ({
    seed: snapshot.seeds[i],
    score: 2 - k / (lead.length + 1),
    ...(heads ? { lead: true as const } : {})
  }));
  const neighbors = cut(
    rankedRows(snapshot, near, { filter: known?.filter, allowed: i => !first.has(i) }),
    near
  );
  const result = await answer(
    named ? "named" : "vocabulary",
    [...led, ...neighbors].slice(0, SEARCH_ANSWER + SPARE),
    named ? { ...read, phrases: [...read.phrases, ...unread], unread: [] } : read,
    [...(named?.names ?? []), ...(known?.phrases ?? [])]
  );
  /* one of grabient.com's indexed searches stays a page of its own wherever a crawler is answered as a person is */
  const kept = OLD_SEARCHES.has(query.toLowerCase()) && result.items.length > 0;
  if (named || !known) return { ...result, indexable: kept };
  return {
    ...result,
    indexable: (plainPhrase(known, query) && result.items.length > 0) || (kept && known.whole),
    ...unkept,
    ...(known.whole ? {} : { partial: true })
  };
}

/** The palettes a search's page shows first, in the page's order: the whole answer sorted as the page sorts it, so a
    search's share card draws the palettes its page leads with. */
export async function searchLeaders(
  env: SearchEnv,
  query: string,
  count: number,
  options: SearchOptions & { sort?: ListSort; frame?: RisingFrame } = {}
): Promise<SearchItem[]> {
  const { sort, frame, ...asked } = options;
  const { items } = await searchPalettes(env, query, { ...asked, limit: SEARCH_ANSWER });
  return sortSearch(items, sort, frame).slice(0, count);
}

/** A list someone holds, searched (an account's Saved palettes): which of these seeds answer the words, best first.
    A seed, hex codes alone, words the vocabulary reads, or the model within its allowances; no names. `account` says
    nothing could be read. */
export async function searchOwnSeeds(
  env: SearchEnv,
  rawQuery: string,
  seeds: readonly string[],
  options: Pick<SearchOptions, "request" | "ctx" | "payer"> = {}
): Promise<{ tier: SearchTier; found: Candidate[] }> {
  const query = normalizeSearchQuery(rawQuery);
  const [snapshot, vocabulary] = query
    ? await Promise.all([loadSnapshot(env, options.ctx), loadVocabulary(env)])
    : [null, null];
  if (!query || !snapshot || !vocabulary || snapshot.version !== vocabulary.version) {
    return { tier: "unavailable", found: [] };
  }
  const seed = canonicalPaletteSeed(query);
  const hexes = seed ? null : hexLiterals(query);
  if (seed || hexes) {
    const vector = seed
      ? await seedQueryVector(env, snapshot, seed)
      : await hexQueryVector(env, hexes ?? []);
    if (!vector) return { tier: "unavailable", found: [] };
    return {
      tier: seed ? "similar" : "color",
      found: await answeringSeeds(env, snapshot, vector, seeds)
    };
  }
  if (unreadPalette(query)) return { tier: "similar", found: [] };
  const known = knownQuery(vocabulary, query);
  if (known) {
    return {
      tier: "vocabulary",
      found: await answeringSeeds(env, snapshot, known.vector, seeds, known.filter, known.each)
    };
  }
  const model = await modelQuery(env, query, options);
  if (model && "vector" in model) {
    const filter = harmonyFilter(normalizeQuery(query));
    return {
      tier: "model",
      found: await answeringSeeds(env, snapshot, model.vector, seeds, filter)
    };
  }
  return { tier: "account", found: [] };
}

/* The searches a sitemap offers crawlers, most supported first: the terms the old corpus tagged most often that the
   free search answers as themselves. */
const SITEMAP_SEARCHES = [
  "warm",
  "cool",
  "blue",
  "multicolor",
  "yellow",
  "analogous",
  "cyan",
  "red",
  "orange",
  "violet",
  "magenta",
  "green",
  "azure",
  "pink",
  "brown",
  "light",
  "monochrome",
  "rose",
  "sunset",
  "dark",
  "sand",
  "muted",
  "earthy",
  "ocean",
  "crimson",
  "dusty",
  "navy",
  "rainbow",
  "coral",
  "pastel",
  "neon",
  "purple",
  "salmon",
  "terracotta",
  "mint",
  "rust",
  "turquoise",
  "ultramarine",
  "amber",
  "complementary",
  "gold",
  "lavender",
  "olive",
  "jewel tones",
  "peach",
  "cerulean",
  "ochre",
  "spring green",
  "chartreuse",
  "maroon",
  "sky",
  "teal",
  "periwinkle",
  "autumn",
  "duotone gradient",
  "mustard",
  "cool gray",
  "warm gray",
  "sepia",
  "triadic"
];

/* The searches grabient.com's sitemap listed, which search indexes hold, as their pages write their words: each stays a
   page of its own while the free search answers it. Two that it cannot answer lead elsewhere (gallery/address.ts). */
const OLD_SEARCHES = new Set([
  "sunset",
  "ocean",
  "forest",
  "pastel",
  "neon",
  "warm",
  "cool",
  "monochrome",
  "tea",
  "blue",
  "purple",
  "cyan",
  "rose",
  "alpine",
  "indigo",
  "charcoal & chocolate",
  "synthwave",
  "teal, azure, navy",
  "glossy",
  "party",
  "lagoon",
  "refined",
  "dark academia",
  "punk",
  "winter",
  "saffron",
  "sandstone",
  "green",
  "pink",
  "red",
  "orange",
  "yellow",
  "black",
  "gold",
  "silver",
  "teal",
  "navy",
  "mint",
  "lavender",
  "beige",
  "cream",
  "sky blue",
  "dark blue",
  "dark purple",
  "sage green",
  "hot pink",
  "blue purple"
]);

/** The word searches worth a crawler's visit: each a page of its own (plainPhrase), then grabient.com's. */
export async function sitemapQueries(env: AssetsEnv, limit = 100): Promise<string[]> {
  const vocabulary = await loadVocabulary(env);
  if (!vocabulary) return [];
  const own = SITEMAP_SEARCHES.filter(term => plainPhrase(knownQuery(vocabulary, term), term));
  return [...new Set([...own, ...OLD_SEARCHES])].slice(0, limit);
}
