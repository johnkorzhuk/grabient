/* The searches people make, counted, and once a day turned into the Popular tags.

   A search counts when a reader presses Enter in a search field: the page sends the words and the page it is on to
   POST /api/searched, which always answers 204. A connected app's search counts under the page `mcp`, which the tags
   leave out, and a tag pressed is a link that never counts, or the tags shown would keep themselves shown. Words the site
   knows go to k_search_counts as the tag would say them; other words go to k_search_unread only when they are letters
   alone, so no number, address, link or code a reader types is kept. A row holds a day, a page, the words and a count,
   with no address, account or cookie, and goes after 90 days. Each address, or an app's account, counts the same words
   on a page once a day and at most 30 searches an hour, and the site at most 20,000 a day. */
import { decodePalette } from "@grabient/engine";
import { readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { all, batch, first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import * as v from "valibot";
import { type SEARCH_PAGES, SearchedBody } from "../../features/search/bodies.ts";
import { listWords } from "../../lib/words.ts";
import { publicCollections, suggestCollections } from "../collections/search.ts";
import { isCrawler } from "../crawlers.ts";
import { countAct } from "../visits/count.ts";
import { loadVocabulary } from "./files.ts";
import { forgetPopular, mixSearches, rankSearches, tagWords } from "./popular.ts";

/** where a search is made, and a connected app's search of the palettes */
export type SearchPage = (typeof SEARCH_PAGES)[number] | "mcp";

const DAY = 86_400_000;
/** the days a count is kept at all */
const KEEP_DAYS = 90;
/** longer words are no phrase a tag says and no collection's title */
const WORDS_MAX = 60;
const NO_STORE = { "Cache-Control": "no-store" };

const fewWords = (words: string) => words.length <= WORDS_MAX && words.split(" ").length <= 6;

/* words that are all in the title of one public collection: the collections' own words */
async function titleWords(env: Pick<Env, "DB">, words: string): Promise<boolean> {
  const wanted = words.split(" ");
  return (await suggestCollections(env, words, 24)).some(hit => {
    const title = hit.title.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    return wanted.every(word => title.includes(word));
  });
}

/** The words a search counts under, or null: a vocabulary phrase or a listed emoji anywhere, as its tag says it, and a
    public collection's title words on the collections list and the home. A palette is no search of words. */
export async function countedWords(
  env: Env,
  page: SearchPage,
  raw: string
): Promise<string | null> {
  const words = listWords(raw);
  if (!words || !fewWords(words) || decodePalette(words)) return null;
  const vocabulary = await loadVocabulary(env);
  const tag = vocabulary && tagWords(vocabulary, words);
  if (tag) return tag;
  return (page === "collections" || page === "home") && (await titleWords(env, words))
    ? words
    : null;
}

/** Words the site does not know, as they are kept: letters, marks, spaces, hyphens and apostrophes alone, six words at
    most. Null for anything else, and while the vocabulary cannot be read to tell. */
export async function unreadWords(env: Env, raw: string): Promise<string | null> {
  const words = listWords(raw);
  return words &&
    fewWords(words) &&
    /^[\p{L}\p{M}' -]+$/u.test(words) &&
    (await loadVocabulary(env))
    ? words
    : null;
}

/** A search counted for `who`, an address or an app's account. Its hourly limit first, in the isolate, since reading the
    words may ask the database; then these words from `who` once a day, and the site's day. A limiter that cannot answer
    counts nothing. It answers whether the search was within its hourly allowance. */
export async function countSearch(
  env: Env,
  page: SearchPage,
  raw: string,
  who: string
): Promise<boolean> {
  const allowed = async (checks: readonly LimitCheck[]) =>
    (await checkLimits(env, checks).catch(() => null))?.success === true;
  if (!(await allowed([[`searched:${who}`, "searchCount"]]))) return false;
  const known = await countedWords(env, page, raw).catch(() => null);
  const words = known ?? (await unreadWords(env, raw).catch(() => null));
  if (!words) return true;
  if (
    !(await allowed([
      [`searched:${who}:${page}:${words}`, "searchCountOnce"],
      ["searched", "searchCountDaily"]
    ]))
  )
    return true;
  await run(
    env.DB,
    `INSERT INTO ${known ? "k_search_counts" : "k_search_unread"} (day, page, words, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, page, words) DO UPDATE SET count = count + 1`,
    Math.floor(Date.now() / DAY),
    page,
    words
  ).catch(error =>
    console.error("searched: the count failed", error instanceof Error ? error.message : error)
  );
  return true;
}

/** `POST /api/searched` with `{ words, page }`: a search a reader made, counted. Always 204, so the page never waits on
    it; ignored from another site, from a crawler, or with a body that is not one. */
export async function searchedResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
  const done = new Response(null, { status: 204, headers: NO_STORE });
  if (!sameOrigin(request) || isCrawler(request)) return done;
  const body = v.safeParse(SearchedBody, await readJson(request, 1024));
  // a search past the address's allowance is no visit either: the visit's point rides on the count's limit
  if (
    body.success &&
    (await countSearch(env, body.output.page, body.output.words, clientAddress(request) ?? "local"))
  )
    await countAct(env, request, "search");
  return done;
}

/** Each day's counts deleted once the day began 90 days ago, so no count is kept past the policy's 90 days. */
export async function pruneSearchCounts(env: Pick<Env, "DB">, now = Date.now()): Promise<number> {
  const before = Math.floor(now / DAY) - KEEP_DAYS;
  const results = await batch(env.DB, [
    ["DELETE FROM k_search_counts WHERE day <= ?", before],
    ["DELETE FROM k_search_unread WHERE day <= ?", before]
  ]);
  return results.reduce((sum, result) => sum + (Number(result.meta?.changes) || 0), 0);
}

/** the days read, and how fast a day's searches fade: a week older weighs half */
const WINDOW_DAYS = 28;
const HALF_LIFE_DAYS = 7;
/** a search counts once it was made this many times in the window */
const AT_LEAST = 3;
/** the searches looked up for the collections' tags, most searched first, and the collections kept */
const COLLECTION_SEARCHES = 96;
const COLLECTIONS_KEPT = 24;
/** A search is rising when made RISING_AT_LEAST times in the last RISING_DAYS at RISING_LIFT times its rate of the weeks
    before or more. One search is counted for those weeks whatever they held, so a search new this week has a rate to
    stand against. */
const RISING_DAYS = 7;
const RISING_AT_LEAST = 3;
const RISING_LIFT = 2;
const RISING_KEPT = 12;

export interface CountRow {
  day: number;
  page: string;
  words: string;
  count: number;
}

/** The window's searches, each day weighted by its age, and only the words made AT_LEAST times in it. */
export function tally(rows: readonly CountRow[], today: number): Map<string, number> {
  const score = new Map<string, number>();
  const made = new Map<string, number>();
  for (const row of rows) {
    const count = Math.max(0, Number(row.count) || 0);
    const age = Math.max(0, today - Number(row.day));
    score.set(row.words, (score.get(row.words) ?? 0) + count * 0.5 ** (age / HALF_LIFE_DAYS));
    made.set(row.words, (made.get(row.words) ?? 0) + count);
  }
  return new Map([...score].filter(([words]) => (made.get(words) ?? 0) >= AT_LEAST));
}

export interface RisingSearch {
  words: string;
  /** searches in the last seven days */
  week: number;
  /** in the three weeks before them */
  before: number;
  /** this week's daily rate over the earlier weeks' */
  lift: number;
}

/** The searches rising this week, most risen first. */
export function risingSearches(rows: readonly CountRow[], today: number): RisingSearch[] {
  const week = new Map<string, number>();
  const before = new Map<string, number>();
  for (const row of rows) {
    const count = Math.max(0, Number(row.count) || 0);
    const age = today - Number(row.day);
    if (age < 0 || age >= WINDOW_DAYS) continue;
    const into = age < RISING_DAYS ? week : before;
    into.set(row.words, (into.get(row.words) ?? 0) + count);
  }
  return [...week]
    .flatMap(([words, n]) => {
      const earlier = before.get(words) ?? 0;
      const lift = n / RISING_DAYS / ((earlier + 1) / (WINDOW_DAYS - RISING_DAYS));
      return n >= RISING_AT_LEAST && lift >= RISING_LIFT
        ? [{ words, week: n, before: earlier, lift: Math.round(lift * 100) / 100 }]
        : [];
    })
    .sort((a, b) => b.lift - a.lift || b.week - a.week || a.words.localeCompare(b.words));
}

/* The collections the searches lead to: for each search, most searched first, the collection its search shows first.
   A collection several searches lead to has all of their scores, and keeps the words searched most. */
async function searchedCollections(
  env: Pick<Env, "DB">,
  searched: ReadonlyMap<string, number>
): Promise<{ slug: string; words: string; score: number }[]> {
  const found = new Map<string, { slug: string; words: string; score: number }>();
  const asked = [...searched]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, COLLECTION_SEARCHES);
  for (const [words, score] of asked) {
    const top = (
      await publicCollections(env, { query: words, sort: "popular", page: 1, limit: 12 }).catch(
        () => null
      )
    )?.items[0];
    if (!top) continue;
    const held = found.get(top.slug);
    if (held) held.score += score;
    else found.set(top.slug, { slug: top.slug, words, score });
  }
  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, COLLECTIONS_KEPT);
}

/** The tags are written again once a day, asked by the six-hourly pass; an hour of slack keeps the pass that falls on
    the day from missing it by the minutes the last one took. */
const POPULAR_EVERY = DAY - 60 * 60_000;

export interface PopularReport {
  ran: boolean;
  at: number;
  counted?: number;
  palettes?: number;
  collections?: number;
  rising?: string[];
  first?: string[];
}

/** Once a day: the last four weeks' searches made into the tags (rising, the most searched, and the collections searched
    for), replacing k_popular_searches in one batch. `force` writes them now whatever the last time. Without the
    vocabulary nothing can be ranked, so the pass fails and the next one tries again. */
export async function refreshPopular(
  env: Env,
  options: { now?: number; force?: boolean } = {}
): Promise<PopularReport> {
  const now = options.now ?? Date.now();
  const today = Math.floor(now / DAY);
  const last =
    Number(
      (
        await first<{ at: number | null }>(
          env.DB,
          "SELECT MAX(computed_at) AS at FROM k_popular_searches"
        )
      )?.at
    ) || 0;
  if (!options.force && last && now - last < POPULAR_EVERY) return { ran: false, at: last };
  const vocabulary = await loadVocabulary(env);
  if (!vocabulary) throw new Error("The search vocabulary is not available");
  const rows = await all<CountRow>(
    env.DB,
    "SELECT day, page, words, count FROM k_search_counts WHERE day > ?",
    today - WINDOW_DAYS
  );
  // the tags are the site's readers' own: an app's searches stay out of them
  const palettes = rows.filter(row => row.page === "palettes" || row.page === "home");
  const ranked = rankSearches(vocabulary, tally(palettes, today));
  const scores = new Map(ranked.map(entry => [entry.words, entry.score]));
  const row = mixSearches(
    vocabulary,
    ranked.map(entry => entry.words)
  );
  // a rising search stands as a tag only in the form a tag says it, each once
  const rising = new Map<string, number>();
  for (const entry of risingSearches(palettes, today)) {
    const words = tagWords(vocabulary, entry.words);
    if (words && !rising.has(words) && rising.size < RISING_KEPT) rising.set(words, entry.lift);
  }
  const collections = await searchedCollections(
    env,
    tally(
      rows.filter(r => r.page === "collections" || r.page === "home"),
      today
    )
  );
  const written = [
    ...[...rising].map(([words, lift], i) => ["rising", i, words, words, lift]),
    ...row.map((words, i) => ["palettes", i, words, words, scores.get(words) ?? 0]),
    ...collections.map((entry, i) => ["collections", i, entry.slug, entry.words, entry.score])
  ];
  // every row in one statement: a pass has a thousand queries, and the hot scores take most of them
  await batch(env.DB, [
    ["DELETE FROM k_popular_searches"],
    [
      `INSERT INTO k_popular_searches (kind, position, value, words, score, computed_at)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
         json_extract(value, '$[3]'), json_extract(value, '$[4]'), ? FROM json_each(?)`,
      now,
      JSON.stringify(written)
    ]
  ]);
  forgetPopular(env);
  return {
    ran: true,
    at: now,
    counted: rows.reduce((sum, r) => sum + Number(r.count), 0),
    palettes: row.length,
    collections: collections.length,
    rising: [...rising.keys()],
    first: row.slice(0, 8)
  };
}
