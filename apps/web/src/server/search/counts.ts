import type { Env } from "@grabient/server/env.ts";

/* A stand-in for the search feature's counts, written to its contract so palette use builds against it: until the
   search's own module is here, no words are counted, so a use is kept with no search. */

/** Where a search is made, and a connected app's search of the palettes. */
export type SearchPage = "palettes" | "home" | "collections" | "mcp";

/** The words a search counts under, as its tag says them, or null. */
export async function countedWords(
  _env: Env,
  _page: SearchPage,
  _raw: string
): Promise<string | null> {
  return null;
}
