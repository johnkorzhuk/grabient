import { decodePalette, encodePalette } from "@grabient/engine";
import { isStyle } from "@grabient/engine/view.ts";
import { localizePath } from "@grabient/i18n";
import { batch } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { paletteAddress } from "../../lib/page-meta.ts";
import { collectionLanguages } from "../mcp/admin/translations.ts";
import { oldIds } from "./legacy.ts";
import { indexed, publicOrigin } from "./site.ts";
import { sitemapAddresses } from "./sitemaps.ts";

/* IndexNow (indexnow.org): the site tells the search engines which pages are new or changed, and they read them within
   minutes; a page the sitemaps alone name waits for an engine's next pass. An engine takes a list only with the site's
   key, which the site serves at /{key}.txt. Only production has a key, and only the indexed deploy sends one, so
   staging and the Previews never do.

   An engine that takes a list shares it with the others, Bing among them, so a list goes to one engine at a time until
   one takes it. Microsoft's own two, api.indexnow.org and bing.com, answer every list sent from Cloudflare's network
   with 429 ("you have sent too many requests to us recently"): a Worker sends from addresses Cloudflare's customers
   share, and their lists use up what Microsoft allows each address. They took none of production's lists from the
   switch to 30 Oct 2026, while Yandex, Seznam, Naver, Yep and Amazon took a list from the same address. So a list goes
   to Yandex, then to Seznam, and to Microsoft's api.indexnow.org last.

   The first pass sends every address the sitemaps list and every old grabient.com address the legacy maps lead from,
   so the engines read the site at its new addresses and the old ones' redirects at once, then marks where things
   stand. Marks of an earlier version count as none, so the whole site goes once more: under version 1 every list went
   to Microsoft alone. From then on, every ten minutes, the scheduled job sends the palettes the gallery took, the
   public collections that changed and the collections newly translated since the last list, and keeps in KV how far it
   has sent. A list holds at most 10,000 addresses. One that every engine refused for now (429, or an engine's own
   failure) is sent again next time, a dozen passes running at most; one refused for good (a key the engines cannot
   check, an address they will not take) is not, since sending it again would change nothing: the passes move on, and
   the sitemaps still name every address. A palette is sent at its English address in the view the gallery saved it
   in; a collection that changed at its address in each language its page is indexed in, as the sitemap names them,
   since its palettes show in every one; a translation at its own language's address, where that page is indexed. */

/** The engines a list goes to, in turn, until one takes it. */
const ENGINES = [
  "https://yandex.com/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://api.indexnow.org/indexnow"
] as const;
const MAX_URLS = 10_000;
const KEPT = "indexnow";
/** How many passes running a list refused for now has gone again, kept beside the marks. */
const REFUSED = "indexnow-refused";
/** a list refused for now goes again on this many passes running at most: two hours of them */
const MAX_TRIES = 12;
/** The marks' version; marks of an earlier one send the whole site again. */
const VERSION = 2;

/** How far the lists have reached: the last gallery rowid sent, the last change to a public collection, the last
    translation of one. */
interface Kept {
  version: number;
  palette: number;
  collection: number;
  translation: number;
}
type IndexNowEnv = Pick<Env, "DB" | "ASSETS" | "DEPLOYMENT"> &
  Partial<Pick<Env, "CACHE" | "INDEXNOW_KEY" | "PUBLIC_ORIGIN">>;
/** What each engine that did not take a list answered, by its host. */
type Refusals = Record<string, number>;
/** Who took a list, by host, and who did not. */
interface Delivery {
  status: number;
  engine?: string;
  refused: Refusals;
}
export type IndexNowReport =
  | { sent: number; status: number; engine?: string; refused?: Refusals }
  | { sent: number; marked: Kept; engine?: string; refused?: Refusals }
  | { skipped: string };

/** The site's key where it has one the protocol takes: 8 to 128 letters, digits and dashes. */
export const indexNowKey = (env: Partial<Pick<Env, "INDEXNOW_KEY">>): string | null =>
  env.INDEXNOW_KEY && /^[A-Za-z0-9-]{8,128}$/.test(env.INDEXNOW_KEY) ? env.INDEXNOW_KEY : null;

/** The key file at /{name}.txt, which an engine reads to know a list came from the site; null for any other name. */
export function indexNowKeyFile(
  env: Partial<Pick<Env, "INDEXNOW_KEY">>,
  name: string
): Response | null {
  const key = indexNowKey(env);
  return key && name === key
    ? new Response(key, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        }
      })
    : null;
}

const marked = (kept: Partial<Kept> | null): kept is Kept =>
  !!kept &&
  kept.version === VERSION &&
  [kept.palette, kept.collection, kept.translation].every(Number.isFinite);

/** 200 is taken, 202 taken while the key is checked. */
const taken = (status: number) => status === 200 || status === 202;
/** 429, or the engine's own failure: the same list may be taken later. */
const forNow = (status: number) => status === 429 || status >= 500;

/** A delivery as the log tells it: who took the list, and what the engines before it answered. */
const told = (delivery?: Delivery) => ({
  ...(delivery?.engine ? { engine: delivery.engine } : {}),
  ...(delivery && Object.keys(delivery.refused).length ? { refused: delivery.refused } : {})
});

/** How far a group's mark moves when the list held its first `held` rows, which come in the order of their stamps:
    past every row it held, but short of a stamp a row it left out shares, so that row goes next time. */
function reached<T>(
  rows: readonly T[],
  held: number,
  stamp: (row: T) => number,
  kept: number
): number {
  const next = rows[held];
  let mark = kept;
  for (const row of rows.slice(0, held))
    if (next === undefined || stamp(row) < stamp(next)) mark = stamp(row);
  return mark;
}

/** The scheduled pass: sends what is new since the last list, or on the first pass, everything once. */
export async function sendIndexNow(
  env: IndexNowEnv,
  get: typeof fetch = fetch
): Promise<IndexNowReport> {
  const key = indexNowKey(env);
  if (!key) return { skipped: "no key" };
  if (!indexed(env)) return { skipped: "not indexed" };
  if (!env.CACHE) return { skipped: "no KV" };
  const origin = publicOrigin(env);
  const address = (path: string) => new URL(path, origin).toString();
  /* a list as the protocol takes it, to one engine. No answer at all is the engine's failure for now, as a 503 is */
  const post = async (engine: string, urls: readonly string[]) => {
    try {
      const answer = await get(engine, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          host: new URL(origin).hostname,
          key,
          keyLocation: address(`/${key}.txt`),
          urlList: urls
        })
      });
      await answer.body?.cancel().catch(() => undefined);
      return answer.status;
    } catch {
      return 503;
    }
  };
  /* a list to each engine in turn until one takes it. When none does, a refusal for now from any of them counts over
     one for good, so the list goes again */
  const send = async (urls: readonly string[]): Promise<Delivery> => {
    const refused: Refusals = {};
    for (const engine of ENGINES) {
      const status = await post(engine, urls);
      const host = new URL(engine).hostname;
      if (taken(status)) return { status, engine: host, refused };
      refused[host] = status;
    }
    const statuses = Object.values(refused);
    return { status: statuses.find(forNow) ?? statuses.at(-1) ?? 503, refused };
  };
  const cache = env.CACHE;
  let [kept, tried] = await Promise.all([
    cache.get<Partial<Kept>>(KEPT, "json"),
    cache.get(REFUSED).then(value => Number(value) || 0)
  ]);
  /* marks of an earlier version go, and the tries of the list they held back with them: the next pass is a first one,
     with a dozen tries of its own */
  if (kept && kept.version !== VERSION) {
    await Promise.all([cache.delete(KEPT), cache.delete(REFUSED)]);
    kept = null;
    tried = 0;
  }
  /* whether a refused list goes again next pass: only one refused for now, and only so many passes running */
  const again = async (status: number) => {
    if (!forNow(status) || tried + 1 >= MAX_TRIES) return false;
    await cache.put(REFUSED, String(tried + 1));
    return true;
  };
  /* a list taken, or refused for good, ends the tries of the one before */
  const settled = async () => {
    if (tried) await cache.delete(REFUSED);
  };
  if (!marked(kept)) {
    const [marks, listed] = await Promise.all([
      batch(env.DB, [
        ["SELECT COALESCE(MAX(rowid), 0) AS mark FROM k_palettes"],
        [
          "SELECT COALESCE(MAX(updated_at), 0) AS mark FROM k_collections WHERE visibility = 'public'"
        ],
        [
          "SELECT COALESCE(MAX(updated_at), 0) AS mark FROM k_translations WHERE kind = 'collection'"
        ]
      ]).then((results): Kept => {
        const [palette, collection, translation] = results.map(result =>
          Number((result.results[0] as { mark?: number } | undefined)?.mark ?? 0)
        );
        return { version: VERSION, palette, collection, translation };
      }),
      sitemapAddresses(env, origin)
    ]);
    const urls = [...new Set([...listed, ...(await oldIds()).map(id => address(`/${id}`))])];
    let delivery: Delivery | undefined;
    for (let at = 0; at < urls.length; at += MAX_URLS) {
      delivery = await send(urls.slice(at, at + MAX_URLS));
      if (taken(delivery.status)) continue;
      if (await again(delivery.status))
        return { sent: at, status: delivery.status, ...told(delivery) };
      /* refused for good: what the lists have not told, the sitemaps say */
      await settled();
      await cache.put(KEPT, JSON.stringify(marks));
      return { sent: at, status: delivery.status, ...told(delivery) };
    }
    await settled();
    await cache.put(KEPT, JSON.stringify(marks));
    return { sent: urls.length, marked: marks, ...told(delivery) };
  }
  const [palettes, collections, translations] = await batch(env.DB, [
    [
      "SELECT rowid AS id, seed, style, steps, angle FROM k_palettes WHERE rowid > ? ORDER BY rowid LIMIT ?",
      kept.palette,
      MAX_URLS
    ],
    [
      "SELECT slug, updated_at FROM k_collections WHERE visibility = 'public' AND updated_at > ? ORDER BY updated_at LIMIT ?",
      kept.collection,
      MAX_URLS
    ],
    [
      `SELECT c.slug, t.locale, t.updated_at FROM k_translations t JOIN k_collections c ON c.id = t.key
       WHERE t.kind = 'collection' AND c.visibility = 'public' AND t.updated_at > ? ORDER BY t.updated_at LIMIT ?`,
      kept.translation,
      MAX_URLS
    ]
  ]);
  const made = palettes.results as {
    id: number;
    seed: string;
    style: string;
    steps: number;
    angle: number;
  }[];
  const changed = collections.results as { slug: string; updated_at: number }[];
  const said = translations.results as { slug: string; locale: string; updated_at: number }[];
  if (!made.length && !changed.length && !said.length) return { sent: 0, status: 0 };
  // the languages each collection's page is indexed in, as the sitemap names them
  const languages = changed.length || said.length ? await collectionLanguages(env) : null;
  const indexedIn = (slug: string) => (languages?.get(slug) ?? []).map(language => language.locale);
  const urls = new Set<string>();
  /* a row's addresses join the list when it has room for them all */
  const fits = (addresses: readonly string[]) => {
    const fresh = addresses.filter(url => !urls.has(url));
    if (urls.size + fresh.length > MAX_URLS) return false;
    for (const url of fresh) urls.add(url);
    return true;
  };
  /* the palettes first, then the collections, then the translations, in the room left: what the list cannot hold
     waits for the next pass */
  const held = { palettes: 0, collections: 0, translations: 0 };
  for (const row of made) {
    const palette = decodePalette(row.seed);
    const style = isStyle(row.style) ? row.style : undefined;
    const saved = { style, steps: row.steps, angle: row.angle };
    if (!fits(palette ? [address(paletteAddress(encodePalette(palette), saved))] : [])) break;
    held.palettes++;
  }
  for (const row of changed) {
    const pages = [
      `/${row.slug}`,
      ...indexedIn(row.slug).map(locale => localizePath(`/${row.slug}`, locale))
    ];
    if (!fits(pages.map(address))) break;
    held.collections++;
  }
  for (const row of said) {
    const locale = indexedIn(row.slug).find(indexed => indexed === row.locale);
    if (!fits(locale ? [address(localizePath(`/${row.slug}`, locale))] : [])) break;
    held.translations++;
  }
  let delivery: Delivery | undefined;
  if (urls.size) {
    delivery = await send([...urls]);
    if (!taken(delivery.status) && (await again(delivery.status)))
      return { sent: 0, status: delivery.status, ...told(delivery) };
  }
  await settled();
  const next: Kept = {
    version: VERSION,
    palette: reached(made, held.palettes, row => row.id, kept.palette),
    collection: reached(changed, held.collections, row => row.updated_at, kept.collection),
    translation: reached(said, held.translations, row => row.updated_at, kept.translation)
  };
  await cache.put(KEPT, JSON.stringify(next));
  const status = delivery?.status ?? 0;
  return { sent: taken(status) ? urls.size : 0, status, ...told(delivery) };
}
