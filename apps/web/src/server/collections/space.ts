import type { Db } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { SearchSpace } from "./meaning.ts";

/* The seam between the collections and the search's space: the snapshot of every public palette and collection, the
   vocabulary, and the embedding model behind the public search's allowances. The search area answers it from
   server/search; where its files are not here, nothing reads what words mean and the collections answer by their
   letters alone. */

export type SpaceEnv = { DB: Db } & Pick<Env, "ASSETS"> &
  Partial<Pick<Env, "AI" | "SEARCH_SNAPSHOTS" | "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">>;

export interface SpaceOptions {
  /** a search a reader made: words the vocabulary does not know are read by the embedding model, within the public
      search's allowances. Typing in a field asks without it: every pause would be a text of its own to buy. */
  model?: boolean;
  /** the request that asked: its address is what the model's allowance counts, and a HEAD or a crawler is never sold a
      read */
  request?: Request;
  ctx?: { waitUntil(work: Promise<unknown>): void };
  /** the account a connected app asks for: the model's allowance is then that account's own */
  who?: string;
}

/** The search's space for one request, or null where it cannot be read. */
export async function searchSpace(
  _env: Partial<SpaceEnv>,
  _options: SpaceOptions = {}
): Promise<SearchSpace | null> {
  return null;
}

/** The public collections people searched for most, by address, most first: the tags at rest lead with them. */
export async function searchedCollections(_env: Partial<SpaceEnv>): Promise<string[]> {
  return [];
}
