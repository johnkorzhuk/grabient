import type { Env } from "@grabient/server/env.ts";

/* The stars Grabient's code has on GitHub, which the brand pages' navigation and every footer show beside the link to
   it. GitHub is asked once a day by the ten-minute job and the count is kept in KV; a page reads only what is kept, and
   an isolate reads that at most once an hour, so no reader waits on GitHub and a busy day asks it no more than a quiet
   one. A count GitHub would not give leaves the kept one as it was.

   Without a token GitHub counts requests by address, 60 an hour, and a Worker shares its address with other Workers,
   so the repository's own endpoint is often refused; the count is then read from GitHub's repository search, whose
   allowance is counted apart. */

type StarsEnv = Partial<Pick<Env, "CACHE" | "GITHUB_TOKEN">>;
const KEY = "github-stars";
const REPO = "johnkorzhuk/grabient";
const API = `https://api.github.com/repos/${REPO}`;
const SEARCH = `https://api.github.com/search/repositories?per_page=1&q=${encodeURIComponent(`repo:${REPO}`)}`;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** What is kept: the count, when GitHub gave it, and when it was last asked for without an answer. */
interface Kept {
  stars: number;
  at: number;
  tried?: number;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
async function read(store: KVNamespace): Promise<Kept | null> {
  const kept = await store.get<Kept>(KEY, "json");
  return kept && isCount(kept.stars) && Number.isFinite(kept.at) ? kept : null;
}

/* one per KV binding: an isolate keeps its bindings from request to request */
const held = new WeakMap<object, { at: number; stars: number | null; reading?: Promise<void> }>();

/** The kept count, or null where none is kept. It never asks GitHub; when KV cannot be read the isolate keeps what it
    knew. */
export async function githubStars(env: StarsEnv): Promise<number | null> {
  const store = env.CACHE;
  if (!store) return null;
  const known = held.get(store);
  /* a count is read again after an hour, no count after a minute, so the first one shows soon after it is kept */
  if (known && !known.reading && Date.now() - known.at < (known.stars === null ? MINUTE : HOUR))
    return known.stars;
  if (!known?.reading) {
    const reading = read(store)
      .then(
        kept => kept?.stars ?? null,
        () => known?.stars ?? null
      )
      .then(stars => {
        held.set(store, { at: Date.now(), stars });
      });
    held.set(store, { at: known?.at ?? 0, stars: known?.stars ?? null, reading });
  }
  await held.get(store)?.reading;
  return held.get(store)?.stars ?? null;
}

interface Repository {
  full_name?: unknown;
  stargazers_count?: unknown;
}
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function ask(env: StarsEnv, get: typeof fetch): Promise<number> {
  const count = async (url: string, repository: (body: unknown) => Repository | undefined) => {
    const answer = await get(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        /* GitHub refuses a request that names no agent */
        "User-Agent": "grabient.com",
        ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {})
      }
    });
    if (!answer.ok) {
      /* GitHub says why in a sentence; its first words tell an allowance used up from a wrong address */
      const why = await answer.json().then(
        body => String((body as { message?: unknown })?.message ?? ""),
        () => ""
      );
      throw new Error(`GitHub answered ${answer.status}${why ? ` (${why.slice(0, 60)})` : ""}`);
    }
    const stars = repository(await answer.json())?.stargazers_count;
    if (!isCount(stars)) throw new Error("GitHub gave no count");
    return stars;
  };
  try {
    return await count(API, body => body as Repository);
  } catch (refused) {
    try {
      return await count(SEARCH, body =>
        (body as { items?: Repository[] })?.items?.find(
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
/** The ten-minute job's step: asks GitHub when the kept count is a day old or none is kept, and keeps the answer. A
    count GitHub would not give is asked for again an hour later, and the kept one stays. */
export async function refreshStars(
  env: StarsEnv,
  options: { now?: number; fetch?: typeof fetch } = {}
): Promise<StarsReport> {
  const store = env.CACHE;
  if (!store) return { asked: false };
  const now = options.now ?? Date.now();
  const was = await read(store);
  if (was && (now - was.at < DAY || (was.tried !== undefined && now - was.tried < HOUR)))
    return { asked: false };
  try {
    const stars = await ask(env, options.fetch ?? fetch);
    await store.put(KEY, JSON.stringify({ stars, at: now } satisfies Kept));
    held.delete(store);
    return { asked: true, stars };
  } catch (error) {
    if (was)
      await store.put(KEY, JSON.stringify({ ...was, tried: now } satisfies Kept)).catch(() => {});
    return { asked: true, error: reason(error) };
  }
}
