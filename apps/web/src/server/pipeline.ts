import {
  canonicalLocalePath,
  DEFAULT_LOCALE,
  isPagePath,
  type Locale,
  localizePath,
  msg,
  preferredLocale,
  splitLocale
} from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { BUILD } from "../lib/build.ts";
import { NO_STORE } from "../lib/cache.ts";
import { TRACKING_PARAM } from "../lib/links.ts";
import { PRODUCTION_ORIGIN } from "../lib/page-meta.ts";
import { json, redirect, withHeaders } from "../lib/responses.ts";
import { cacheKey } from "./cache-keys.ts";
import { canonicalRedirect } from "./canonical.ts";
import { isCrawler } from "./crawlers.ts";
import { edgeCached } from "./edge-cache.ts";
import { countFile } from "./files/count.ts";
import {
  connectPath,
  consentPath,
  listingPath,
  privatePath,
  publicFile,
  recorderPath,
  serverFunctionPath,
  uncachedPath
} from "./paths.ts";
import { countLegacy } from "./seo/legacy.ts";
import { indexed, NOINDEX } from "./seo/site.ts";

/* The Worker's pipeline around the app, in this order:
   1. grabient.com is answered only by the deploy made for it.
   2. Campaign tags come off the address; every same-origin redirect carries them on.
   3. The language: its prefix written another way (301), a page's trailing slash (301), a prefix on an API or a file
      (404), and an arrival's language (302, before any cache, so the English answer stays shared).
   4. The canonical address, from the rules features add (canonical.ts): 301.
   5. An address of the MCP server or the authorization server is the app's to answer as it stands. A private one is
      answered directly and never kept; every other GET goes through the edge cache. A list, a search or the home that
      no cache holds reads the database or runs the search: an address may make sixty of those a minute.
   6. The headers every answer carries.
   Everything after step 3 reads the path without the language, and every address handed out gets it back. */

/** What answers behind the pipeline: Start, and ahead of it the MCP and authorization servers (server.ts). */
export type App = (request: Request) => Promise<Response>;

const PRODUCTION_HOSTS = new Set(["grabient.com", "www.grabient.com"]);
/** The partner that embeds the site may frame its public pages. */
const PARTNERS = "https://cssgradient.io https://*.cssgradient.io";

/** Why this deploy must not answer for `hostname`, or null. A deploy that kept staging's settings under the production
    Worker would serve staging's database on grabient.com and send every sign-in elsewhere: it says so instead. */
export function misdeployed(
  env: Pick<Env, "DEPLOYMENT" | "PUBLIC_ORIGIN" | "BETTER_AUTH_URL">,
  hostname: string
): string | null {
  if (!PRODUCTION_HOSTS.has(hostname)) return null;
  if (env.DEPLOYMENT !== "production") {
    return `DEPLOYMENT is ${env.DEPLOYMENT ? `"${env.DEPLOYMENT}"` : "unset"}, not "production"`;
  }
  for (const [name, value] of [
    ["PUBLIC_ORIGIN", env.PUBLIC_ORIGIN],
    ["BETTER_AUTH_URL", env.BETTER_AUTH_URL]
  ] as const) {
    if (value !== PRODUCTION_ORIGIN)
      return `${name} is ${value ?? "unset"}, not ${PRODUCTION_ORIGIN}`;
  }
  return null;
}

export async function handle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  app: App
): Promise<Response> {
  const url = new URL(request.url);
  const wrong = misdeployed(env, url.hostname);
  if (wrong) {
    console.error("misdeployed: refusing to serve grabient.com,", wrong);
    return new Response(
      `This deploy is not configured for grabient.com: ${wrong}. Deploy with \`cf deploy --mode production\`.\n`,
      {
        status: 503,
        headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" }
      }
    );
  }
  const tracking = new URLSearchParams();
  for (const [name, value] of url.searchParams)
    if (TRACKING_PARAM.test(name)) tracking.append(name, value);
  for (const name of new Set(tracking.keys())) url.searchParams.delete(name);
  if (tracking.size) request = new Request(url, request);
  const { locale, path } = splitLocale(url.pathname);
  let response: Response;
  try {
    response = await route(request, url, locale, path, env, ctx, app);
  } catch (error) {
    // the message and the first lines of the stack, or a production 500 cannot be told from another
    const stack =
      error instanceof Error ? (error.stack ?? "").split("\n").slice(1, 6).join("\n") : "";
    console.error("Request failed", request.method, url.pathname, String(error), stack);
    response = json({ error: msg("Something went wrong. Try again.") }, { status: 500 });
  }
  return finish(request, url, path, env, response, tracking);
}

async function route(
  request: Request,
  url: URL,
  locale: Locale,
  path: string,
  env: Env,
  ctx: ExecutionContext,
  app: App
): Promise<Response> {
  const read = request.method === "GET" || request.method === "HEAD";
  const page = isPagePath(path);
  const address = path + url.search;
  const at = (to: string, language = locale) => new URL(localizePath(to, language), url).toString();

  // an empty first segment is no address of the site's, which a URL reads as another host (//host/path), and the app
  // has no server functions for Start's endpoint to call
  if (path.startsWith("//") || serverFunctionPath(path)) {
    return json({ error: msg("Not found") }, { status: 404 });
  }
  const prefix = canonicalLocalePath(url.pathname);
  if (prefix !== null) return redirect(new URL(prefix + url.search, url).toString());
  // a page's address never ends in a slash, which other sites link to both ways; an API keeps its own
  const slashed = path.length > 1 && path.endsWith("/");
  if (read && slashed) {
    const trimmed = path.replace(/\/+$/, "") || "/";
    if (isPagePath(trimmed)) return redirect(at(trimmed + url.search));
  }
  // no API or file has a language or a last slash, but the recorder's, which PostHog's library writes
  if (!page && (locale !== DEFAULT_LOCALE || (slashed && !recorderPath(path)))) {
    return json({ error: msg("Not found") }, { status: 404 });
  }

  if (page) countLegacy(env, request, address);
  const canonical = page ? canonicalRedirect(address) : null;
  // a reader arriving from elsewhere at an English address is sent to the language they chose or their browser asks
  // for; a click inside the site, a crawler and a reader who chose English are taken as they came
  if (read && page && locale === DEFAULT_LOCALE && arriving(request, url) && !isCrawler(request)) {
    const asked = preferredLocale(request.headers);
    if (asked) {
      const response = redirect(at(canonical ?? address, asked), 302);
      response.headers.set("Vary", "Accept-Language, Cookie");
      return response;
    }
  }
  if (canonical !== null) return redirect(at(canonical));
  // Start renders a page whatever the method, so a page is refused any method but GET and HEAD before it renders. The
  // newsletter's way out takes its press as a POST.
  if (page && !read && !(request.method === "POST" && path.startsWith("/unsubscribe/"))) {
    return notAllowed();
  }

  if (request.method === "OPTIONS" && publicFile(path)) {
    return new Response(null, {
      status: 204,
      headers: {
        ...NO_STORE,
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type, If-None-Match"
      }
    });
  }
  if (connectPath(path)) return app(request);
  if (privatePath(path)) return withHeaders(await answer(request, app), NO_STORE);
  countFile(env, request, path);
  // under `vite dev` nothing is kept or counted: a page kept from before an edit would hydrate against the edited code
  if (!read || env.DEPLOYMENT === "development") return answer(request, app);
  const render = async () =>
    (listingPath(path) && (await overListing(env, request))) || answer(request, app);
  return uncachedPath(path)
    ? render()
    : edgeCached(request, cacheKey(url, path, locale), ctx, render);
}

/** The refusal of a list, a search or the home past the address's sixty reads a minute in this isolate, or null. */
async function overListing(env: Env, request: Request): Promise<Response | null> {
  const counted = await checkLimits(env, [
    [`list-miss:${clientAddress(request) ?? "local"}`, "listMiss"]
  ]);
  return counted?.success
    ? null
    : json({ error: msg("Too many requests. Try again later.") }, { status: 429 });
}

/** A page navigation from outside the site: a search result, another site, a typed address or a bookmark. */
function arriving(request: Request, url: URL): boolean {
  if (!(request.headers.get("Accept") ?? "").includes("text/html")) return false;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site) return site !== "same-origin";
  const referer = request.headers.get("Referer");
  try {
    return !referer || new URL(referer).host !== url.host;
  } catch {
    return true;
  }
}

const notAllowed = () =>
  json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, HEAD" } });

/** Start's answer. Start renders a page for any address no server route takes, whatever the method: only a server
    route takes a method other than GET and HEAD, so such a page is 405. It answers a page asked for without HTML in
    Accept with a 500, so that request is given HTML among what it accepts. */
async function answer(request: Request, app: App): Promise<Response> {
  const accept = request.headers.get("Accept");
  if (accept && !/text\/html|\*\/\*/.test(accept)) {
    const headers = new Headers(request.headers);
    headers.set("Accept", `${accept}, */*;q=0.1`);
    request = new Request(request, { headers });
  }
  const response = await app(request);
  const read = request.method === "GET" || request.method === "HEAD";
  if (!read && response.headers.get("Content-Type")?.startsWith("text/html")) return notAllowed();
  return response;
}

function finish(
  request: Request,
  url: URL,
  path: string,
  env: Env,
  answered: Response,
  tracking: URLSearchParams
): Response {
  const response = new Response(request.method === "HEAD" ? null : answered.body, answered);
  const headers = response.headers;
  /* Only a 200 may be kept anywhere; a 304 keeps the policy of what it confirms. A temporary redirect whose handler
     keeps it from the edge may still name minutes for the browser: what stands in for a picture that is not drawn now
     (images/serve.ts), so a page of them does not ask again for each. */
  const standIn =
    response.status === 302 &&
    headers.get("CDN-Cache-Control") === "no-store" &&
    /^public, max-age=\d+$/.test(headers.get("Cache-Control") ?? "");
  if (response.status !== 200 && response.status !== 304 && !standIn) {
    for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);
  }
  // a refusal that names no wait: the allowances that refuse without one count by the minute
  if (response.status === 429 && !headers.has("Retry-After")) headers.set("Retry-After", "60");
  const location =
    tracking.size && response.status >= 300 && response.status < 400
      ? headers.get("Location")
      : null;
  if (location) {
    const to = new URL(location, url);
    if (to.origin === url.origin) {
      for (const [name, value] of tracking) to.searchParams.append(name, value);
      headers.set("Location", to.toString());
    }
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Content-Security-Policy",
    `frame-ancestors 'self'${privatePath(path) ? "" : ` ${PARTNERS}`}`
  );
  if (consentPath(path)) {
    headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Cache-Control", "private, no-store");
  }
  if (url.protocol === "https:")
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // set over any a file carries of its own: staging and Previews hold copies of the site, which no index may take
  if (!indexed(env)) for (const [name, value] of Object.entries(NOINDEX)) headers.set(name, value);
  if (publicFile(path)) headers.set("Access-Control-Allow-Origin", "*");
  // the build that answered: a tab opened on an older build loads its next page whole
  headers.append("Server-Timing", `build;desc="${BUILD}"`);
  return response;
}
