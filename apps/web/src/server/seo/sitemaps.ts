import { decodePalette, encodePalette } from "@grabient/engine";
import { drawnView, isStyle } from "@grabient/engine/view.ts";
import { LOCALES, type Locale, localizePath } from "@grabient/i18n";
import { all, first } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import {
  type Alternate,
  alternatesOf,
  collectionCard,
  type PaletteView,
  paletteAddress,
  paletteCard
} from "../../lib/page-meta.ts";
import { collectionSitemapRows } from "../collections/read.ts";
import { collectionLanguages } from "../mcp/admin/translations.ts";
import { sitemapQueries } from "../search/search.ts";
import { isoDay } from "./text.ts";

/* The sitemaps: an index of the others; the site's own pages in every language, each naming the rest; the searches
   worth an engine's visit; every public collection, in each language Grabient's are translated into; and every
   gallery palette, in files of 5,000 by rowid. Each file reads only what it lists, with indexed queries or none, and
   names only canonical addresses, never a redirect.
   The palette files are rowid ranges, which avoids a count and an offset scan: k_palettes stays a rowid table. */

/** Palettes in one file, well under the protocol's 50,000 addresses and 50 MB. */
export const SHARD_SIZE = 5000;
/** The palette files the index may name: 50,000 entries, less the pages, the searches and the collections. */
export const MAX_SHARDS = 49_997;
const MAX_COLLECTIONS = 45_000;
/** The protocol's most addresses in one file. */
const MAX_URLS = 50_000;
const MAX_SEARCHES = 100;
/** The site's own pages, translated and indexed in every language. */
const OWN_PAGES = [
  "/",
  "/palettes",
  "/palettes/rising",
  "/collections",
  "/collections/rising",
  "/about",
  "/bindings",
  "/mcp-server",
  "/contact"
];
/** The pages indexed in English alone, whose words are not translated. */
const ENGLISH_PAGES = ["/privacy", "/terms"];
/** The sitemaps besides the palette files, by the name in their address (/sitemap-{name}.xml). */
const FILES = ["pages", "searches", "collections"] as const;

interface Entry {
  path: string;
  lastmod?: string;
  image?: string;
  alternates?: readonly Alternate[];
}

const escaped = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlFile = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;

function urlset(entries: readonly Entry[], origin: string): string {
  const pictured = entries.some(entry => entry.image);
  const languages = entries.some(entry => entry.alternates);
  const urls = entries.map(entry => {
    const alternates = (entry.alternates ?? [])
      .map(
        alt =>
          `<xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${escaped(alt.href)}"/>`
      )
      .join("");
    return [
      `<url><loc>${escaped(new URL(entry.path, origin).toString())}</loc>`,
      entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "",
      alternates,
      entry.image
        ? `<image:image><image:loc>${escaped(entry.image)}</image:loc></image:image>`
        : "",
      "</url>"
    ].join("");
  });
  return xmlFile(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      pictured ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""
    }${languages ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>${urls.join("")}</urlset>`
  );
}

/** The palette file a sitemap's name says: `palettes` is the first, `palettes-2` the second, up to MAX_SHARDS. */
export function paletteShard(name: string): number | null {
  if (name === "palettes") return 1;
  const shard = Number(/^palettes-([1-9]\d{0,4})$/.exec(name)?.[1] ?? 0);
  return shard >= 2 && shard <= MAX_SHARDS ? shard : null;
}
const shardPath = (shard: number) =>
  shard === 1 ? "/sitemap-palettes.xml" : `/sitemap-palettes-${shard}.xml`;

/** The index: the pages, the searches, the collections, then each palette file. */
export function sitemapIndex(origin: string, shards: number): string {
  if (!Number.isInteger(shards) || shards < 1 || shards > MAX_SHARDS) {
    throw new Error(`${shards} palette sitemaps are past the protocol's limit`);
  }
  const paths = [
    ...FILES.map(name => `/sitemap-${name}.xml`),
    ...Array.from({ length: shards }, (_, i) => shardPath(i + 1))
  ];
  const sitemaps = paths.map(
    path => `<sitemap><loc>${escaped(new URL(path, origin).toString())}</loc></sitemap>`
  );
  return xmlFile(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`
  );
}

/** The site's own pages in every language, each naming the others, then Privacy and Terms and the newsletter once it is
    on, whose issues are English, in English alone. */
export const pagesSitemap = (origin: string, newsletter: boolean): string =>
  urlset(pageEntries(origin, newsletter), origin);
function pageEntries(origin: string, newsletter: boolean): Entry[] {
  const entries: Entry[] = OWN_PAGES.flatMap(page => {
    const alternates = alternatesOf(page, origin);
    return LOCALES.map(locale => ({ path: localizePath(page, locale), alternates }));
  });
  entries.push(...ENGLISH_PAGES.map(path => ({ path })));
  if (newsletter) entries.push({ path: "/newsletter" });
  return entries;
}

/** Words as a search's address writes them: a space between words, lowercase, 100 characters at most. */
const searchWords = (query: string) => {
  const words = query.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
  return words.length <= 100 && !/\p{Cc}/u.test(words) ? words : "";
};
/** A search is its list with the words as q, the address its page names as canonical. */
export const searchesSitemap = (origin: string, queries: readonly string[]): string =>
  urlset(searchEntries(queries), origin);
const searchEntries = (queries: readonly string[]): Entry[] =>
  [...new Set(queries.map(searchWords).filter(Boolean))]
    .slice(0, MAX_SEARCHES)
    .map(query => ({ path: `/palettes?${new URLSearchParams({ q: query })}` }));

/** Every public collection, the latest change first, with its card, then its page in each other language it reads in,
    dated by the later of its change and its translation. */
export const collectionsSitemap = (origin: string, rows: readonly ListedCollection[]): string =>
  urlset(collectionEntries(origin, rows), origin);
interface ListedCollection {
  slug: string;
  updatedAt: number;
  languages?: readonly { locale: Locale; updatedAt: number }[];
}
function collectionEntries(origin: string, rows: readonly ListedCollection[]): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const row of rows.slice(0, MAX_COLLECTIONS)) {
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    const said = (row.languages ?? []).map(({ locale, updatedAt }) => ({
      path: localizePath(`/${row.slug}`, locale),
      lastmod: isoDay(Math.max(row.updatedAt, updatedAt))
    }));
    if (entries.length + 1 + said.length > MAX_URLS) break;
    entries.push(
      {
        path: `/${row.slug}`,
        lastmod: isoDay(row.updatedAt),
        image: collectionCard(row.slug, origin, row.updatedAt)
      },
      ...said
    );
  }
  return entries;
}

/** A file of gallery palettes, each at its own address, in the view it was saved in, with the day it joined and its
    card. A seed that is no palette is left out, and one written two ways is listed once, as its canonical seed. */
export const palettesSitemap = (origin: string, rows: readonly ListedPalette[]): string =>
  urlset(paletteEntries(origin, rows), origin);
interface ListedPalette {
  seed: string;
  view?: PaletteView;
  createdAt?: number | string | null;
  image?: string;
}
function paletteEntries(origin: string, rows: readonly ListedPalette[]): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const row of rows.slice(0, SHARD_SIZE)) {
    const palette = decodePalette(row.seed);
    if (!palette) continue;
    const seed = encodePalette(palette);
    if (seen.has(seed)) continue;
    seen.add(seed);
    entries.push({
      path: paletteAddress(seed, row.view),
      lastmod: isoDay(row.createdAt),
      image: row.image && new URL(row.image, origin).toString()
    });
  }
  return entries;
}

/** How many palette files the index names: the highest rowid's share of SHARD_SIZE, at least one. */
export async function paletteShards(env: Pick<Env, "DB">): Promise<number> {
  const high = await first<{ id: number }>(
    env.DB,
    "SELECT rowid AS id FROM k_palettes ORDER BY rowid DESC LIMIT 1"
  );
  return Math.max(1, Math.ceil((high?.id ?? 0) / SHARD_SIZE));
}

/** One palette file's rows, a rowid range ((shard - 1) * SHARD_SIZE, shard * SHARD_SIZE], each in the view the gallery
    saved it in, with its card in that view, as its page names them. */
export async function paletteRows(env: Pick<Env, "DB">, shard: number) {
  const rows = await all<{
    seed: string;
    style: string;
    steps: number;
    angle: number;
    created_at: number;
  }>(
    env.DB,
    "SELECT seed, style, steps, angle, created_at FROM k_palettes WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT ?",
    (shard - 1) * SHARD_SIZE,
    shard * SHARD_SIZE,
    SHARD_SIZE
  );
  return rows.map(row => {
    const palette = decodePalette(row.seed);
    const seed = palette ? encodePalette(palette) : row.seed;
    const style = isStyle(row.style) ? row.style : undefined;
    const view = palette && drawnView(palette, { style, steps: row.steps, angle: row.angle });
    return {
      seed,
      ...(view ? { view } : {}),
      createdAt: row.created_at,
      image: view ? paletteCard(seed, view) : undefined
    };
  });
}

/** What the sitemap at /sitemap-{name}.xml lists, or null for a name no sitemap has. */
async function entriesOf(
  env: Pick<Env, "DB" | "ASSETS">,
  name: string,
  origin: string
): Promise<Entry[] | null> {
  if (name === "pages") return pageEntries(origin, !(await flagOff(env, "newsletter")));
  if (name === "searches") return searchEntries(await sitemapQueries(env));
  if (name === "collections") {
    const [rows, languages] = await Promise.all([
      collectionSitemapRows(env, MAX_COLLECTIONS),
      collectionLanguages(env)
    ]);
    return collectionEntries(
      origin,
      rows.map(row => ({ ...row, languages: languages.get(row.slug) }))
    );
  }
  const shard = paletteShard(name);
  return shard === null ? null : paletteEntries(origin, await paletteRows(env, shard));
}

/** The sitemap at /sitemap-{name}.xml, or null for a name no sitemap has. */
export async function sitemapFile(
  env: Pick<Env, "DB" | "ASSETS">,
  name: string,
  origin: string
): Promise<string | null> {
  const entries = await entriesOf(env, name, origin);
  return entries && urlset(entries, origin);
}

/** Every address the sitemaps list, the index's files in its order. */
export async function sitemapAddresses(
  env: Pick<Env, "DB" | "ASSETS">,
  origin: string
): Promise<string[]> {
  const shards = Array.from({ length: await paletteShards(env) }, (_, i) =>
    i ? `palettes-${i + 1}` : "palettes"
  );
  const files = await Promise.all([...FILES, ...shards].map(name => entriesOf(env, name, origin)));
  return files.flatMap(entries =>
    (entries ?? []).map(entry => new URL(entry.path, origin).toString())
  );
}

/** A sitemap's headers. What changes as palettes and collections are made (the index, the palette files, the
    collections) is kept five minutes at the edge, so a new one is listed within that; the rest a day. */
export const sitemapHeaders = (name: string) => ({
  "Content-Type": "application/xml; charset=utf-8",
  ...(name === "pages" || name === "searches"
    ? {
        "Cache-Control": "public, max-age=3600",
        "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400"
      }
    : { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "max-age=300" })
});
