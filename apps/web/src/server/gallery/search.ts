import type { Env } from "@grabient/server/env.ts";
import type { SearchAnswer } from "../../features/gallery/schema.ts";
import { SEARCH_ANSWER, searchPalettes } from "../search/search.ts";

/** The public search's whole answer for a list's words, its palettes as lists show them: a list's orders and pages are
    cut from it, and the home keeps its best. */
export async function searchPool(env: Env, request: Request, words: string): Promise<SearchAnswer> {
  const answer = await searchPalettes(env, words, { limit: SEARCH_ANSWER, request });
  return {
    query: answer.query,
    items: answer.items.map(({ tags: _, ...item }) => item),
    tier: answer.tier,
    ...(answer.partial ? { partial: true } : {}),
    ...(answer.limited ? { limited: true } : {}),
    ...(answer.unkept ? { unkept: true } : {}),
    ...(answer.indexable ? { indexable: true } : {}),
    fetchedAt: Date.now()
  };
}
