import { decodePalette, encodePalette } from "@grabient/engine";
import { LOCALES, localizePath } from "@grabient/i18n";
import {
  type Alternate,
  alternatesOf,
  collectionCard,
  OG_VERSION,
  paletteAddress
} from "../../lib/page-meta.ts";
import { all, first } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { sitemapQueries } from "../search/read.ts";

/* The sitemaps: an index of the others; the site's own pages in every language, each naming the rest; the searches
   worth an engine's visit; every public collection; and every gallery palette, in files of 5,000 by rowid. Each file
   reads only what it lists, with one indexed query or none, and names only canonical addresses, never a redirect.
   The palette files are rowid ranges, which avoids a count and an offset scan: k_palettes stays a rowid table. */

/** Palettes in one file, well under the protocol's 50,000 addresses and 50 MB. */
export const SHARD_SIZE = 5000;
/** The palette files the index may name: 50,000 entries, less the pages, the searches and the collections. */
export const MAX_SHARDS = 49_997;
const MAX_COLLECTIONS = 45_000;
const MAX_SEARCHES = 100;
/** The site's own pages, translated and indexed in every language. */
const OWN_PAGES = [
  "/",
  "/palettes",
  "/palettes/rising",
  "/collections",
  "/collections/rising",
  "/about",
  "/mcp-server",
  "/contact"
];
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
/** A time as the day a sitemap says it changed. */
function day(time: number | string | null | undefined): string | undefined {
  const date = time == null ? null : new Date(time);
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}
const document = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;

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
  return document(
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
  return document(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`
  );
}

/** The site's own pages in every language, each naming the others, and the newsletter, whose issues are English, in
    English alone. */
export function pagesSitemap(origin: string): string {
  const entries: Entry[] = OWN_PAGES.flatMap(page => {
    const alternates = alternatesOf(page, origin);
    return LOCALES.map(locale => ({ path: localizePath(page, locale), alternates }));
  });
  entries.push({ path: "/newsletter" });
  return urlset(entries, origin);
}

/** Words as a search's address writes them: a space between words, lowercase, 100 characters at most. */
const searchWords = (query: string) => {
  const words = query.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
  return words.length <= 100 && !/\p{Cc}/u.test(words) ? words : "";
};
/** A search is its list with the words as q, the address its page names as canonical. */
export function searchesSitemap(origin: string, queries: readonly string[]): string {
  const words = [...new Set(queries.map(searchWords).filter(Boolean))];
  const entries = words.slice(0, MAX_SEARCHES).map(query => ({
    path: `/palettes?${new URLSearchParams({ q: query })}`
  }));
  return urlset(entries, origin);
}

/** Every public collection, the latest change first, with its card. */
export function collectionsSitemap(
  origin: string,
  rows: readonly { slug: string; updatedAt: number }[]
): string {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const row of rows.slice(0, MAX_COLLECTIONS)) {
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    entries.push({
      path: `/${row.slug}`,
      lastmod: day(row.updatedAt),
      image: collectionCard(row.slug, origin, row.updatedAt)
    });
  }
  return urlset(entries, origin);
}

/** A file of gallery palettes, each at its own address with the day it joined and its card. A seed that is no palette
    is left out, and one written two ways is listed once, as its canonical seed. */
export function palettesSitemap(
  origin: string,
  rows: readonly { seed: string; createdAt?: number | string | null; image?: string }[]
): string {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const row of rows.slice(0, SHARD_SIZE)) {
    const palette = decodePalette(row.seed);
    if (!palette) continue;
    const seed = encodePalette(palette);
    if (seen.has(seed)) continue;
    seen.add(seed);
    entries.push({
      path: paletteAddress(seed),
      lastmod: day(row.createdAt),
      image: row.image && new URL(row.image, origin).toString()
    });
  }
  return urlset(entries, origin);
}

/** How many palette files the index names: the highest rowid's share of SHARD_SIZE, at least one. */
export async function paletteShards(env: Pick<Env, "DB">): Promise<number> {
  const high = await first<{ id: number }>(
    env.DB,
    "SELECT rowid AS id FROM k_palettes ORDER BY rowid DESC LIMIT 1"
  );
  return Math.max(1, Math.ceil((high?.id ?? 0) / SHARD_SIZE));
}

/** One palette file's rows, a rowid range ((shard - 1) * SHARD_SIZE, shard * SHARD_SIZE], each with its card. */
export async function paletteRows(env: Pick<Env, "DB">, shard: number) {
  const rows = await all<{ seed: string; created_at: number }>(
    env.DB,
    "SELECT seed, created_at FROM k_palettes WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT ?",
    (shard - 1) * SHARD_SIZE,
    shard * SHARD_SIZE,
    SHARD_SIZE
  );
  return rows.map(row => {
    const palette = decodePalette(row.seed);
    const seed = palette ? encodePalette(palette) : row.seed;
    return { seed, createdAt: row.created_at, image: `/api/og?seed=${seed}&v=${OG_VERSION}` };
  });
}

/** Every public collection's address and its last change, the latest first (k_collections_public_idx). */
export async function collectionRows(env: Pick<Env, "DB">) {
  const rows = await all<{ slug: string; updated_at: number }>(
    env.DB,
    "SELECT slug, updated_at FROM k_collections WHERE visibility = 'public' ORDER BY updated_at DESC, id LIMIT ?",
    MAX_COLLECTIONS
  );
  return rows.map(row => ({ slug: row.slug, updatedAt: Number(row.updated_at) }));
}

/** The sitemap at /sitemap-{name}.xml, or null for a name no sitemap has. */
export async function sitemapFile(
  env: Pick<Env, "DB" | "ASSETS">,
  name: string,
  origin: string
): Promise<string | null> {
  if (name === "pages") return pagesSitemap(origin);
  if (name === "searches") return searchesSitemap(origin, await sitemapQueries(env));
  if (name === "collections") return collectionsSitemap(origin, await collectionRows(env));
  const shard = paletteShard(name);
  return shard === null ? null : palettesSitemap(origin, await paletteRows(env, shard));
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
