import { decodePalette, encodePalette } from "@grabient/engine";
import { isLocale, localizePath } from "@grabient/i18n";
import { batch } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { paletteAddress } from "../../lib/page-meta.ts";
import { indexed, publicOrigin } from "./site.ts";

/* IndexNow (indexnow.org): the site tells Bing, and the engines that share what it is told, which pages are new or
   changed, and they read them within minutes; a page the sitemaps alone name waits for an engine's next pass. An
   engine takes a list only with the site's key, which the site serves at /{key}.txt. Only production has a key, and
   only the indexed deploy sends one, so staging and the Previews never do.

   Every ten minutes the scheduled job sends the palettes the gallery took, the public collections that changed and the
   collections newly translated since the last list, at most 10,000 addresses at once, and keeps in KV how far it has
   sent. A refused list is sent again next time. The first pass only marks where things stand: the sitemaps hold what
   came before. A palette and a collection are sent at their English address, the one their other languages name as
   theirs, and a translation at its language's, where that page is indexed. */

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;
const KEPT = "indexnow";

/** How far the lists have reached: the last gallery rowid sent, the last change to a public collection, the last
    translation of one. */
interface Kept {
  palette: number;
  collection: number;
  translation: number;
}
type IndexNowEnv = Pick<Env, "DB" | "DEPLOYMENT"> &
  Partial<Pick<Env, "CACHE" | "INDEXNOW_KEY" | "PUBLIC_ORIGIN">>;
export type IndexNowReport =
  | { sent: number; status: number }
  | { marked: Kept }
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
  !!kept && [kept.palette, kept.collection, kept.translation].every(Number.isFinite);

/** The scheduled pass: sends what is new since the last list, or marks where things stand on the first. */
export async function sendIndexNow(
  env: IndexNowEnv,
  get: typeof fetch = fetch
): Promise<IndexNowReport> {
  const key = indexNowKey(env);
  if (!key) return { skipped: "no key" };
  if (!indexed(env)) return { skipped: "not indexed" };
  if (!env.CACHE) return { skipped: "no KV" };
  const origin = publicOrigin(env);
  const kept = await env.CACHE.get<Partial<Kept>>(KEPT, "json");
  if (!marked(kept)) {
    const [palette, collection, translation] = (
      await batch(env.DB, [
        ["SELECT COALESCE(MAX(rowid), 0) AS mark FROM k_palettes"],
        [
          "SELECT COALESCE(MAX(updated_at), 0) AS mark FROM k_collections WHERE visibility = 'public'"
        ],
        [
          "SELECT COALESCE(MAX(updated_at), 0) AS mark FROM k_translations WHERE kind = 'collection'"
        ]
      ])
    ).map(result => Number((result.results[0] as { mark?: number } | undefined)?.mark ?? 0));
    const marks = { palette, collection, translation };
    await env.CACHE.put(KEPT, JSON.stringify(marks));
    return { marked: marks };
  }
  const [palettes, collections, translations] = await batch(env.DB, [
    [
      "SELECT rowid AS id, seed FROM k_palettes WHERE rowid > ? ORDER BY rowid LIMIT ?",
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
  /* the palettes first, then the collections, then the translations, in the room left: what the list cannot hold
     waits for the next pass */
  const made = palettes.results as { id: number; seed: string }[];
  const changed = (collections.results as { slug: string; updated_at: number }[]).slice(
    0,
    MAX_URLS - made.length
  );
  const said = (
    translations.results as { slug: string; locale: string; updated_at: number }[]
  ).slice(0, MAX_URLS - made.length - changed.length);
  if (!made.length && !changed.length && !said.length) return { sent: 0, status: 0 };
  const urls = new Set<string>();
  for (const row of made) {
    const palette = decodePalette(row.seed);
    if (palette) urls.add(new URL(paletteAddress(encodePalette(palette)), origin).toString());
  }
  for (const row of changed) urls.add(new URL(`/${row.slug}`, origin).toString());
  for (const row of said) {
    if (isLocale(row.locale))
      urls.add(new URL(localizePath(`/${row.slug}`, row.locale), origin).toString());
  }
  let status = 0;
  if (urls.size) {
    ({ status } = await get(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        host: new URL(origin).hostname,
        key,
        keyLocation: new URL(`/${key}.txt`, origin).toString(),
        urlList: [...urls]
      })
    }));
    /* 200 is taken, 202 taken while the key is checked; anything else is sent again next time */
    if (status !== 200 && status !== 202) return { sent: 0, status };
  }
  const next: Kept = {
    palette: made.at(-1)?.id ?? kept.palette,
    collection: changed.at(-1)?.updated_at ?? kept.collection,
    translation: said.at(-1)?.updated_at ?? kept.translation
  };
  await env.CACHE.put(KEPT, JSON.stringify(next));
  return { sent: urls.size, status };
}
