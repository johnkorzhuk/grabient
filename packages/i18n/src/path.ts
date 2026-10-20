import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES, type Locale } from "./locales.ts";

/* A language is the first segment of a page's address: /ja/palettes is /palettes in Japanese and /ja the home page.
   English keeps the unprefixed addresses. The app routes, remembers and caches by the address without the language;
   the language is added where an address leaves the app (a link, the address bar, a redirect, a canonical) and taken
   off where one comes in (a request, a click, a popped entry). */

const BY_SEGMENT = new Map<string, Locale>(
  LOCALES.filter(l => LOCALE_INFO[l].segment).map(l => [LOCALE_INFO[l].segment, l])
);
const PREFIX = /^\/([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)(?=\/|$)/;
/* first segments that are never pages: data, the old analytics beacon's address, the MCP and authorization endpoints,
   and the roots of the build's files, which are files only beneath them */
const NOT_PAGES = new Set(["api", "e", "mcp", "oauth", ".well-known", "cdn-cgi"]);
const FILE_ROOTS = new Set(["assets", "og", "fonts", "i18n"]);

export interface LocalePath {
  locale: Locale;
  /** the pathname without the language, always starting with / */
  path: string;
  /** the segment as the address wrote it, when it names a language: /JA is Japanese written the wrong way */
  segment?: string;
}

/** The language a pathname is in, and the pathname without it: `/ja` is Japanese and `/`. */
export function splitLocale(pathname: string): LocalePath {
  const match = PREFIX.exec(pathname);
  const locale = match ? BY_SEGMENT.get(match[1].toLowerCase()) : undefined;
  if (!match || !locale) return { locale: DEFAULT_LOCALE, path: pathname || "/" };
  return { locale, path: pathname.slice(match[0].length) || "/", segment: match[1] };
}

/** Whether an address is a page, with a version in every language. APIs, files and names with an extension are not. */
export function isPagePath(pathAndSearch: string): boolean {
  if (!pathAndSearch.startsWith("/") || pathAndSearch.startsWith("//")) return false;
  const path = pathAndSearch.replace(/[?#].*$/s, "");
  const [first, ...rest] = path.slice(1).split("/");
  if (NOT_PAGES.has(first) || (FILE_ROOTS.has(first) && rest.length > 0)) return false;
  // a backslash or a control character is no address a page links to
  if ([...path].some(c => c === "\\" || c < " ")) return false;
  return !/\.[A-Za-z0-9]+$/.test(path);
}

/** A page's address in a language: `/palettes?q=red` is `/ja/palettes?q=red` and `/` is `/ja`. English, APIs, files
    and other sites come back as they were. */
export function localizePath(pathAndSearch: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !isPagePath(pathAndSearch)) return pathAndSearch;
  const rest = pathAndSearch.slice(1);
  const joined = rest === "" || rest[0] === "?" || rest[0] === "#" ? rest : `/${rest}`;
  return `/${LOCALE_INFO[locale].segment}${joined}`;
}

/** An address as the app reads it: the language taken off a page's address, anything else as it was. */
export function delocalizePath(pathAndSearch: string): { locale: Locale; path: string } {
  if (!pathAndSearch.startsWith("/") || pathAndSearch.startsWith("//")) {
    return { locale: DEFAULT_LOCALE, path: pathAndSearch };
  }
  const cut = pathAndSearch.search(/[?#]/);
  const pathname = cut < 0 ? pathAndSearch : pathAndSearch.slice(0, cut);
  const { locale, path } = splitLocale(pathname);
  return { locale, path: path + (cut < 0 ? "" : pathAndSearch.slice(cut)) };
}

/** How a language prefix should be written, or null when it already is: /JA/x is /ja/x, /ja/ is /ja, and English,
    which has no prefix, /en/x is /x. Only a page has a language, so a prefix on an API or a file gets null here and a
    404 from the Worker. */
export function canonicalLocalePath(pathname: string): string | null {
  if (/^\/en(?=\/|$)/i.test(pathname)) {
    const rest = pathname.slice(3) || "/";
    return isPagePath(rest) ? rest : null;
  }
  const { locale, path, segment } = splitLocale(pathname);
  if (!segment || !isPagePath(path)) return null;
  const canonical = localizePath(path, locale);
  return canonical === pathname ? null : canonical;
}
