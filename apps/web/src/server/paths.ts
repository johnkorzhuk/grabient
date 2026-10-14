import { accountPage } from "../lib/links.ts";

/* The Worker's classes of address, by path without the language. A feature adding an address that fits one of them
   adds it here. */

const PRIVATE_API =
  /^\/api\/(auth(\/|$)|settings\/|likes(\/|$)|like-info$|like-counts$|saved$|contact$|geo$|me\/|search\/layers$|searched$|used$|client-error$)/;
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

/** The session recorder's way to PostHog (analytics/replay.ts), whose addresses are PostHog's own: a recording is
    posted to /e/s/, which ends in a slash. */
export const recorderPath = (path: string) => within(path, "/e");

/** Answered directly, never through the edge cache: the list API reads its own data cache, and the build probe, a
    random palette and the search's status are new on every ask. */
export const uncachedPath = (path: string) =>
  path === "/api/palettes" ||
  path === "/api/build" ||
  path === "/random" ||
  path === "/api/search/status";

/** The search's JSON, at each of its addresses. */
export const searchJsonPath = (path: string) =>
  /^\/(?:api\/search\.json|api\/palettes\/search|(?:search|palettes)\/.+\.json)$/.test(path);

/** The home, the public palette and collections lists, every search, and the answers that hold them: each read the
    edge cache does not hold runs the search or reads the database, so an address may make sixty a minute
    (pipeline.ts). The list API, which the edge never holds, counts every read. */
export const listingPath = (path: string) =>
  /^\/(?:(?:palettes|collections)(?:\/rising(?:\/[^/]+)?)?)?$/.test(path) ||
  path === "/api/hot" ||
  path === "/api/palettes" ||
  path === "/api/collections" ||
  searchJsonPath(path);

const PUBLIC_API =
  /^\/api\/(og|png|palette|hot$|search\.json$|search-suggestions$|collections(\/[^/]+)?$)/;

/** A file or an answer any site may fetch from a page of its own (CORS). */
export const publicFile = (path: string) =>
  /\.(png|svg|css|json|md|ase|gpl|grd)$/.test(path) ||
  path === "/mcp/server-card" ||
  PUBLIC_API.test(path);
