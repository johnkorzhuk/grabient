import { DEFAULT_LOCALE, isLocale, type Locale, localizePath } from "@grabient/i18n";
import { homePage } from "../features/gallery/address.ts";
import { BUILD } from "../lib/build.ts";
import { BROWSER_ONLY, FIXED_PAGES } from "../lib/links.ts";
import { listWords } from "../lib/words.ts";
import { collectionKeyRules } from "./collections/routing.ts";
import { fileCacheKey } from "./files/keys.ts";
import { issuesKey } from "./newsletter/page.ts";
import { searchKeyRules } from "./search/routes.ts";

/* What the edge cache keys an answer by: its path in its language, the query that decides what it holds (sorted, the
   rest never enters), and the build. Tracking parameters are gone before this runs.

   An address whose answer reads only some of its query has a rule here, so junk parameters cannot fill the cache with
   copies. A feature adding a public route adds its rule: an API's parameters normalized as its handler reads them. A
   palette's or a collection's file and every picture are keyed by the files themselves (files/keys.ts), which also
   gives every address of one file one path, and keeps a palette's picture across builds so a deploy does not draw
   them all again. */

export interface KeyRule {
  match: (path: string) => boolean;
  /** the query that decides the answer, read with the path where the path holds some of it; the default keeps all */
  query?: (params: URLSearchParams, path: string) => URLSearchParams;
  /** the one path every address of this answer is kept under */
  path?: string;
}

const none = () => new URLSearchParams();
const SITE_FILES = new Set([
  "/robots.txt",
  "/llms.txt",
  "/llms-full.txt",
  "/mcp/server-card",
  "/.well-known/ai-catalog.json",
  "/.well-known/ard.json"
]);

const RULES: readonly KeyRule[] = [
  ...collectionKeyRules,
  {
    match: path =>
      SITE_FILES.has(path) ||
      FIXED_PAGES.has(path) ||
      /^\/sitemap(-[a-z]+)?(-\d+)?\.xml$/.test(path) ||
      path.startsWith("/favicon/"),
    query: none
  },
  // the home as data: its words as the lists write them, or words refused, which nothing is kept under; then its page
  // and the language of its collections, or that it is the palettes alone, the same on every page and in every language
  {
    match: path => path === "/api/hot",
    query: params => {
      const asked = params.get("q") ?? "";
      const q = listWords(asked);
      const lang = params.get("lang");
      return new URLSearchParams({
        ...(q ? { q } : asked.trim() ? { refused: "1" } : {}),
        ...(params.has("head")
          ? { head: "1" }
          : {
              page: String(homePage(params)),
              ...(isLocale(lang) && lang !== DEFAULT_LOCALE ? { lang } : {})
            })
      });
    }
  },
  { match: path => path === "/api/frames", query: none },
  { match: path => path === "/api/newsletter", query: issuesKey },
  ...searchKeyRules,
  {
    match: path => !path.startsWith("/api/"),
    query: params => {
      for (const name of BROWSER_ONLY) params.delete(name);
      return params;
    }
  }
];

/** The edge cache's key for a request to `url` whose path, without the language, is `path`. */
export function cacheKey(url: URL, path: string, locale: Locale, rules = RULES): string {
  const file = fileCacheKey(path, url.searchParams);
  const rule = file ? undefined : rules.find(r => r.match(path));
  // joined as text: resolved against the origin, a path that starts with two slashes would name another host
  const key = new URL(url.origin + (file?.path ?? localizePath(rule?.path ?? path, locale)));
  const query = new URLSearchParams(url.search);
  key.search = (file?.query ?? rule?.query?.(query, path) ?? query).toString();
  if (!file?.acrossBuilds) key.searchParams.set("__build", BUILD);
  key.searchParams.sort();
  return key.toString();
}
