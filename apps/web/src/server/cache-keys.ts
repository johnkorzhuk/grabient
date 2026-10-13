import { type Locale, localizePath } from "@grabient/i18n";
import { BUILD } from "../lib/build.ts";
import { BROWSER_ONLY, FIXED_PAGES } from "../lib/links.ts";
import { listWords } from "../lib/words.ts";
import { searchKeyRules } from "./search/routes.ts";

/* What the edge cache keys an answer by: its path in its language, the query that decides what it holds (sorted, the
   rest never enters), and the build. Tracking parameters are gone before this runs.

   An address whose answer reads only some of its query has a rule here, so junk parameters cannot fill the cache with
   copies. A feature adding a public route adds its rule: an API's parameters normalized as its handler reads them, a
   file's view. Files whose bytes no build changes (a palette's PNG, SVG or JSON, which carry a format version of their
   own) set `acrossBuilds`, so a deploy does not draw them all again. */

export interface KeyRule {
  match: (path: string) => boolean;
  /** the query that decides the answer; the default keeps all of it */
  query?: (params: URLSearchParams) => URLSearchParams;
  acrossBuilds?: boolean;
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
  {
    match: path =>
      SITE_FILES.has(path) ||
      FIXED_PAGES.has(path) ||
      /^\/sitemap(-[a-z]+)?(-\d+)?\.xml$/.test(path) ||
      path.startsWith("/favicon/"),
    query: none
  },
  // the home's head reads its words alone, as the lists write them
  {
    match: path => path === "/api/hot",
    query: params => new URLSearchParams({ q: listWords(params.get("q")) })
  },
  { match: path => path === "/api/frames", query: none },
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
  const rule = rules.find(r => r.match(path));
  const key = new URL(localizePath(path, locale), url.origin);
  key.search = (
    rule?.query?.(new URLSearchParams(url.search)) ?? new URLSearchParams(url.search)
  ).toString();
  if (!rule?.acrossBuilds) key.searchParams.set("__build", BUILD);
  key.searchParams.sort();
  return key.toString();
}
