import { isPagePath } from "@grabient/i18n";
import { accountPage } from "../lib/links.ts";

/* The Worker's classes of address, by path without the language. A feature adding an address that fits one of them
   adds it here. */

const PRIVATE_API =
  /^\/api\/(auth(\/|$)|settings\/|likes(\/|$)|like-info$|like-counts$|saved$|contact$|me\/|search\/layers$|searched$|used$|client-error$)/;
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Start's server functions, of which the app has none: Start answers any id there with a 500 and a logged error. */
export const serverFunctionPath = (path: string) => within(path, "/_serverFn");

/** One reader's data and pages: answered directly and never kept, framed only by the site itself. */
export const privatePath = (path: string) => PRIVATE_API.test(path) || accountPage(path);

/** The MCP server, the authorization server and the documents apps read to find them: answered directly. */
export const connectPath = (path: string) =>
  path === "/mcp" ||
  path.startsWith("/oauth/") ||
  within(path, "/.well-known/oauth-authorization-server") ||
  within(path, "/.well-known/oauth-protected-resource");

/** Where an app's request is read and answered, and the newsletter's unsubscribe address, which names an account:
    never framed, never kept, never named in a Referer. */
export const consentPath = (path: string) =>
  path === "/connect" || path.startsWith("/oauth/") || within(path, "/unsubscribe");

/** Answered directly, never through the edge cache: the list API reads its own data cache, and the build probe, a
    random palette and the search's status are new on every ask. */
export const uncachedPath = (path: string) =>
  path === "/api/palettes" ||
  path === "/api/build" ||
  path === "/random" ||
  /^\/random\.(svg|png|css|json|tokens\.json|ase|gpl|grd)$/.test(path) ||
  path === "/api/search/status";

/** The search's JSON, at each of its addresses. */
export const searchJsonPath = (path: string) =>
  /^\/(?:api\/search\.json|api\/palettes\/search|(?:search|palettes)\/.+\.json)$/.test(path);

/** The home, the public palette and collections lists, every search, and the answers that hold them: each read the edge
    cache does not hold runs the search or reads the database, so an address may make sixty a minute (pipeline.ts). The
    list API, which the edge never holds, counts every read. A palette's facts read what its page reads, which nothing
    counts, and a reader resting on a list's cards asks for many. */
export const listingPath = (path: string) =>
  /^\/(?:(?:palettes|collections)(?:\/rising(?:\/[^/]+)?)?)?$/.test(path) ||
  path === "/api/hot" ||
  path === "/api/palettes" ||
  path === "/api/collections" ||
  searchJsonPath(path);

/** The search's suggestions of words and of collections, at each of their addresses. */
export const suggestionPath = (path: string) =>
  /^\/api\/(?:search-suggestions|popular-searches|collections\/suggest)$/.test(path);

/** The search's pictures, each of which runs the search: its sheet beside its page, its card and its picture, and the
    collections' card for words. */
export const searchPicturePath = (path: string, params: URLSearchParams) =>
  /^\/(?:(?:search|palettes)\/.+\.(?:png|svg)|api\/(?:og|png)\/query)$/.test(path) ||
  (path === "/api/og/collections" && params.has("q"));

/** What a route serves outside the API that is no page, as the router matches it, whatever the case: a palette's or a
    collection's files, a palette's script for another site's page, an old card, the search's sheets and JSON, the text
    files, the sitemaps, the tab's icons, the documents apps read and the MCP server's card; and the roots of the
    documents' and the authorization server's addresses, which their splat routes answer as they answer what lies under
    them. Start renders its not-found page for any other address. */
const SERVED =
  /^\/(?:[^/]+\.(?:png|svg|css|json|md|ase|gpl|grd|txt|js)|@[^/]+\/[^/]+\.(?:png|svg|css|json|md|ase|gpl|grd)|og\/[^/]+\/[^/]+\.png|(?:search|palettes)\/[^/]+\.(?:png|svg|json)|sitemap(?:-[^/]+)?\.xml|favicon\/[^/]+\.svg|\.well-known(?:\/.*)?|oauth|mcp\/server-card)$/i;

/** What the site's ceilings count where no cache holds it (ceiling.ts), or null: a page, and any address outside the API
    that no route serves, which Start answers with a page; but Random, which only leads elsewhere, and the pages where an
    app's or a newsletter's link is read, which a reader always reaches and which read nothing; and the lists' and the
    searches' data, whatever the case its address is written in, as the router matches it. */
export function ceilingPath(path: string, params: URLSearchParams): "page" | "data" | null {
  if (isPagePath(path)) return path === "/random" || consentPath(path) ? null : "page";
  const lower = path.toLowerCase();
  if (listingPath(lower) || suggestionPath(lower) || searchPicturePath(lower, params))
    return "data";
  return within(path, "/api") || connectPath(path) || SERVED.test(path) ? null : "page";
}

/** Where a route takes another method than GET and HEAD: the API, the MCP and authorization servers, and the documents
    apps read. Start renders a page for any other address whatever the method (pipeline.ts). */
export const methodsPath = (path: string) =>
  within(path, "/api") || connectPath(path) || within(path, "/.well-known");

const PUBLIC_API =
  /^\/api\/(og|png|palette|hot$|search\.json$|search-suggestions$|collections(\/[^/]+)?$)/;

/** A file or an answer any site may fetch from a page of its own (CORS). */
export const publicFile = (path: string) =>
  /\.(png|svg|css|json|md|ase|gpl|grd)$/.test(path) ||
  path === "/mcp/server-card" ||
  PUBLIC_API.test(path);
