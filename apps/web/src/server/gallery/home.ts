import { waitUntil } from "cloudflare:workers";
import { replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { COLLECTION_LIMIT } from "../../features/collections/params.ts";
import type { CollectionPage } from "../../features/collections/types.ts";
import { HOT_PALETTES, type HomeHead, SEARCH_PALETTES } from "../../features/gallery/schema.ts";
import { sortSearch } from "../../features/gallery/sort.ts";
import { RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";
import { publicCollections } from "../collections/search.ts";
import { localizeCollections, type TranslatedLocale } from "../mcp/admin/translations.ts";
import { listPalettes } from "./list.ts";
import { searchPool } from "./search.ts";

/* The head of the home: the twenty-four hottest palettes, the same on every page of the home, or searched
   (`/?q=words`) the palette list's own search in its Popular order, the best sixty. The collections beneath it are the
   collections list's own pages. So the home costs what the two lists cost, inside the same allowances, and a press on
   either section lands on results the reader has seen the start of. */

export interface HeadAnswer {
  head: HomeHead;
  /** whether others may be given this answer: one the search could not give in full is never kept */
  kept: boolean;
  /** 429 when an allowance ran out, 503 when the search files are missing */
  status: number;
  /** the seconds to wait when an allowance ran out, where the search says */
  retryAfter?: number;
}

export async function homeHead(env: Env, request: Request, words: string): Promise<HeadAnswer> {
  if (!words) {
    const { items } = await listPalettes(env, { sort: "hot", limit: HOT_PALETTES, count: false });
    return { head: { palettes: items, fetchedAt: Date.now() }, kept: true, status: 200 };
  }
  const { retryAfter, ...answer } = await searchPool(env, request, words);
  return {
    head: {
      query: words,
      palettes: sortSearch(answer.items, "popular").slice(0, SEARCH_PALETTES),
      tier: answer.tier,
      ...(answer.partial ? { partial: true } : {}),
      ...(answer.limited ? { limited: true } : {}),
      ...(answer.unkept ? { unkept: true } : {}),
      fetchedAt: Date.now()
    },
    kept: !answer.limited && !answer.unkept && answer.tier !== "unavailable",
    status: answer.limited ? 429 : answer.tier === "unavailable" ? 503 : 200,
    ...(retryAfter ? { retryAfter } : {})
  };
}

/** The collections the home shows on a page, in a language: the hot order, or searched, the popular one. Read after
    the head, so words only the model reads are read by it once. */
export async function homeCollections(
  env: Env,
  request: Request,
  words: string,
  page: number,
  lang: TranslatedLocale | null
): Promise<CollectionPage> {
  const found = await publicCollections(
    env,
    { sort: words ? "popular" : "hot", query: words, page, limit: COLLECTION_LIMIT },
    { model: !!words, request, ctx: { waitUntil } }
  );
  return { ...found, items: await localizeCollections({ DB: replica(env) }, lang, found.items) };
}

/** The Rising frames an admin has left on: the week's always, three months and a year by their flags. */
export async function framesOffered(env: Pick<Env, "DB">): Promise<RisingFrame[]> {
  const [threeMonths, year] = await Promise.all([
    flagOff(env, "rising-3m"),
    flagOff(env, "rising-1y")
  ]);
  return RISING_FRAMES.filter(
    frame => !((frame === "3m" && threeMonths) || (frame === "1y" && year))
  );
}
