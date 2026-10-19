import type { Env } from "@grabient/server/env.ts";
import { GITHUB_REPO } from "../../lib/page-meta.ts";

/* The stars Grabient's code has on GitHub, which the site shows beside its link to the code. GitHub is asked once a
   day by the ten-minute job, and the count is kept in KV. A page reads only what is kept, and an isolate reads KV at
   most once an hour, so no reader waits on GitHub and a busy day asks it no more than a quiet one. A count GitHub
   would not give leaves the kept one as it was.

   Without a token GitHub counts requests by address, 60 an hour, and a Worker shares its address with every other
   Worker, so the repository's own endpoint is often refused. The count is then read from GitHub's repository search,
   whose allowance is counted apart and anew each minute. */

const REPO = new URL(GITHUB_REPO).pathname.slice(1);
const API = `https://api.github.com/repos/${REPO}`;
const SEARCH = `https://api.github.com/search/repositories?per_page=1&q=${encodeURIComponent(`repo:${REPO}`)}`;
const KEY = "github-stars";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

type StarsEnv = Partial<Pick<Env, "CACHE" | "GITHUB_TOKEN">>;
type Store = NonNullable<StarsEnv["CACHE"]>;
/** What is kept: the count, when GitHub gave it, and when it was last asked for without an answer. */
interface Kept {
  stars: number;
  at: number;
  tried?: number;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
async function read(store: Store): Promise<Kept | null> {
  const kept = await store.get<Kept>(KEY, "json");
  return kept && isCount(kept.stars) && Number.isFinite(kept.at) ? kept : null;
}

/* what each isolate last read, by KV binding: an isolate keeps its bindings from request to request. A read answers the
   request that began it alone (@grabient/server/shared-work.ts): while one is out (`asked`), another request keeps
   what the isolate read, and in an isolate that has not read yet, each request reads for itself. */
const known = new WeakMap<Store, { at: number; stars: number | null; asked?: number }>();
// A read that has not come back in this time (its request was cancelled) no longer holds the isolate to what it read.
const READ_OUT = 10_000;

/** The kept count, or null while none is kept. It never asks GitHub; when KV cannot be read, an isolate keeps what it
    knew. A count is read again after an hour, a missing one after a minute, so the first shows soon after it is kept. */
export async function githubStars(env: StarsEnv): Promise<number | null> {
  const store = env.CACHE;
  if (!store) return null;
  const was = known.get(store);
  const now = Date.now();
  if (was && now - was.at < (was.stars === null ? MINUTE : HOUR)) return was.stars;
  if (was && was.at > 0 && was.asked !== undefined && now - was.asked < READ_OUT) return was.stars;
  known.set(store, { at: was?.at ?? 0, stars: was?.stars ?? null, asked: now });
  let stars = was?.stars ?? null;
  try {
    stars = (await read(store))?.stars ?? null;
  } catch {
    // the isolate keeps what it knew
  }
  known.set(store, { at: Date.now(), stars });
  return stars;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The count GitHub gives, from the repository's endpoint or else from its search. */
async function ask(env: StarsEnv, get: typeof fetch): Promise<number> {
  const from = async (url: string, repository: (body: unknown) => unknown): Promise<number> => {
    const response = await get(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        // GitHub refuses a request that names no agent
        "User-Agent": "grabient.com",
        ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {})
      }
    });
    if (!response.ok) {
      // GitHub says why in a sentence; its first words tell a spent allowance from a wrong address
      const why = await response.json().then(
        body => String((body as { message?: unknown } | null)?.message ?? ""),
        () => ""
      );
      throw new Error(`GitHub answered ${response.status}${why ? ` (${why.slice(0, 60)})` : ""}`);
    }
    const stars = (repository(await response.json()) as { stargazers_count?: unknown } | undefined)
      ?.stargazers_count;
    if (!isCount(stars)) throw new Error("GitHub gave no count");
    return stars;
  };
  try {
    return await from(API, body => body);
  } catch (refused) {
    try {
      return await from(SEARCH, body =>
        (body as { items?: { full_name?: unknown }[] } | null)?.items?.find(
          item => String(item.full_name).toLowerCase() === REPO
        )
      );
    } catch (again) {
      throw new Error(`${reason(refused)}; its search: ${reason(again)}`);
    }
  }
}

export interface StarsReport {
  asked: boolean;
  stars?: number;
  error?: string;
}
/** The scheduled pass's part: asks GitHub when the kept count is a day old or none is kept, and keeps the answer. A
    count GitHub would not give is asked for again an hour later, while the kept one stays. */
export async function refreshStars(
  env: StarsEnv,
  options: { now?: number; fetch?: typeof fetch } = {}
): Promise<StarsReport> {
  const store = env.CACHE;
  if (!store) return { asked: false };
  const now = options.now ?? Date.now();
  const was = await read(store);
  if (was && (now - was.at < DAY || (was.tried !== undefined && now - was.tried < HOUR))) {
    return { asked: false };
  }
  try {
    const stars = await ask(env, options.fetch ?? fetch);
    await store.put(KEY, JSON.stringify({ stars, at: now } satisfies Kept));
    known.delete(store);
    return { asked: true, stars };
  } catch (error) {
    if (was)
      await store.put(KEY, JSON.stringify({ ...was, tried: now } satisfies Kept)).catch(() => {});
    return { asked: true, error: reason(error) };
  }
}
