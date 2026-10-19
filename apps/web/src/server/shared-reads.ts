import type { Env } from "@grabient/server/env.ts";

/* Reads the database answers alike for every reader, language and isolate, kept by this data center's Cache API for a
   few minutes, so a crawler walking the site in sixteen languages and each new isolate read their rows once a data
   center instead of once a page. On 17 Oct 2026 three such reads (the public collections' titles, a list's strips and
   a search's palettes) were about three quarters of the rows read. Only public reads that may trail a write by as long
   belong here, never an account's or an app's: each comes from a replica already. A copy's age adds to the time the
   edge keeps the page built from it, so a public page may show what D1 held up to about ten minutes before, which the
   deleting tab's overlay covers (features/collections/overlay.ts). Kept only where the site is live (production,
   staging), which the pipeline tells on each request (knowSite): a test's or a dev machine's database must show its
   writes at once, and a unit test's Node has no Cache API. A cache that cannot be read or written is passed by, and a
   read that fails is never kept. A copy is kept a day past its time, for a read that fails: on 19 Oct 2026 a scraper's
   bursts left D1 too busy to answer, and the list pages it had read before failed with a 500 where a copy minutes old
   would have shown them. */

type Site = Pick<Env, "DEPLOYMENT" | "PUBLIC_ORIGIN">;
const LIVE = new Set(["production", "staging"]);
/** How long past its time a copy is kept for a read that fails, in seconds. */
const KEPT_PAST = 86_400;
let site: Site | null = null;

/** The site this isolate answers for: told by the pipeline on each request (pipeline.ts). */
export function knowSite(env: Site): void {
  site = env;
}

const cacheOf = (): Cache | undefined =>
  site && LIVE.has(site.DEPLOYMENT) && site.PUBLIC_ORIGIN
    ? (globalThis as { caches?: { default?: Cache } }).caches?.default
    : undefined;

/* A read's key on the site's own origin, by build (vite's define), as another deploy's code may read its rows otherwise */
const keyOf = (name: string) =>
  new Request(
    `${site?.PUBLIC_ORIGIN}/.grabient-cache/read/${name}?build=${typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : ""}`
  );

/** What a copy holds: the answer, and when its read began. */
export interface Shared<T> {
  value: T;
  at: number;
}

/** `read`'s answer, or this data center's copy of it, made within `seconds` and not before `since` (a write this
    isolate made is never read back older than itself). When the read fails, a copy past its time answers in its
    place, where there is one. The answer must be plain JSON: a Map goes as its entries. */
export async function sharedRead<T>(
  name: string,
  seconds: number,
  read: () => Promise<T>,
  since = 0
): Promise<Shared<T>> {
  const cache = cacheOf();
  if (!cache) return { value: await read(), at: Date.now() };
  const key = keyOf(name);
  let kept: Shared<T> | undefined;
  try {
    const found = (await (await cache.match(key))?.json()) as Shared<T> | undefined;
    if (found && typeof found.at === "number" && found.at >= since && "value" in found)
      kept = found;
  } catch {
    // a copy that cannot be read is passed by
  }
  if (kept && Date.now() - kept.at < seconds * 1000) return kept;
  // stamped when the read begins, so a read under way across a write is older than the write's `since`
  const at = Date.now();
  let value: T;
  try {
    value = await read();
  } catch (error) {
    if (kept) return kept;
    throw error;
  }
  const shared = { value, at };
  try {
    await cache.put(
      key,
      Response.json(shared, {
        headers: { "Cache-Control": `public, max-age=${seconds + KEPT_PAST}` }
      })
    );
  } catch {
    // a copy that cannot be kept is passed by
  }
  return shared;
}

/** Lets go of this data center's copy after a write here; the others keep theirs until it expires. */
export async function forgetShared(name: string): Promise<void> {
  const cache = cacheOf();
  if (cache) await cache.delete(keyOf(name)).catch(() => false);
}

/** A short name for what a read is asked, for its key. */
export async function digest(text: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
  return Array.from(hash.slice(0, 12), byte => byte.toString(16).padStart(2, "0")).join("");
}
