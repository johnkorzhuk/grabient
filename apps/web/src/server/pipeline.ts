import { isBands } from "@grabient/engine/bands.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
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
import { PAUSED } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { BUILD } from "../lib/build.ts";
import { NO_STORE } from "../lib/cache.ts";
import { TRACKING_PARAM } from "../lib/links.ts";
import { PRODUCTION_ORIGIN } from "../lib/page-meta.ts";
import { json, redirect, withHeaders } from "../lib/responses.ts";
import { cacheKey } from "./cache-keys.ts";
import { canonicalRedirect } from "./canonical.ts";
import { isCrawler, isLinkPreview } from "./crawlers.ts";
import { edgeCached, keepFor } from "./edge-cache.ts";
import { addressParams } from "./files/address.ts";
import { countFile } from "./files/count.ts";
import { siteCard } from "./images/serve.ts";
import { readyLocale } from "./languages.ts";
import {
  connectPath,
  consentPath,
  listingPath,
  privatePath,
  publicFile,
  serverFunctionPath,
  uncachedPath
} from "./paths.ts";
import { countLegacy, legacyLanding, mayNameOld, readyOldIds } from "./seo/legacy.ts";
import { fitCacheKey, fittedRedirect, oldFit } from "./seo/legacy-fit.ts";
import { indexed, NOINDEX } from "./seo/site.ts";
import { knowSite } from "./shared-reads.ts";
import { countPage } from "./visits/count.ts";

/* The Worker's pipeline around the app, in this order:
   1. grabient.com is answered only by the deploy made for it.
   2. Campaign tags come off the address; every same-origin redirect carries them on.
   3. The language: its prefix written another way (301), a page's trailing slash (301), a prefix on an API or a file
      (404), and an arrival's language (302, before any cache, so the English answer stays shared).
   4. The canonical address, from the rules features add (canonical.ts): 301.
   5. An address of the MCP server or the authorization server is the app's to answer as it stands. A private one is
      answered directly and never kept; every other GET goes through the edge cache. An old link no map holds is
      answered there with its fit (seo/legacy-fit.ts). A list, a search or the home that no cache holds reads the
      database or runs the search: an address may make sixty of those a minute.
   6. The headers every answer carries.
   7. A page a browser loaded for a reader is counted as a visit, after its answer (visits/visits.ts).
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
  const { locale, path } = splitLocale(url.pathname);
  const wrong = misdeployed(env, url.hostname);
  if (wrong) {
    console.error("misdeployed: refusing to serve grabient.com,", wrong);
    const refused = new Response(
      `This deploy is not configured for grabient.com: ${wrong}. Deploy with \`cf deploy --mode production\`.\n`,
      {
        status: 503,
        headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" }
      }
    );
    return counted(env, path, refused);
  }
  knowSite(env);
  // as the browser sent it: its headers and its place (request.cf) say who asked, for the visit's count
  const sent = request;
  const { rest, tracking } = splitTracking(url.search);
  if (tracking) {
    url.search = rest;
    request = new Request(url, request);
  }
  let response: Response;
  try {
    /* what the answer may read that no isolate holds from its start: the request's language, and the old addresses'
       maps where the address may name an old palette or a body may (a connected app's call, a like) */
    const read = request.method === "GET" || request.method === "HEAD";
    await Promise.all([
      readyLocale(env, locale),
      !read || mayNameOld(path, url.searchParams) ? readyOldIds() : undefined
    ]);
    response = await route(request, url, locale, path, env, ctx, app);
  } catch (error) {
    /* the error alone, as Workers Issues reads one: an issue for each error whatever the address, its stack read as
       source, and the request beside it */
    console.error(error);
    response = json({ error: msg("Something went wrong. Try again.") }, { status: 500 });
  }
  const finished = finish(request, url, path, env, response, tracking);
  ctx.waitUntil(countPage(env, sent, path, locale, finished, tracking));
  return counted(env, path, finished);
}

/** The answer, counted when the site could not give it: the owner's alert reads the count (alerts/alerts.ts). A
    feature an admin turned off refuses on purpose, which is no failure. */
function counted(env: Env, path: string, answered: Response): Response {
  if (answered.status >= 500 && !answered.headers.has(PAUSED)) {
    countUsage(env, "failure", String(answered.status), kindOf(path));
  }
  return answered;
}

/** A failed address by its kind, from a few: a page, an API by its name, the MCP server or a file. */
function kindOf(path: string): string {
  if (isPagePath(path)) return "page";
  const api = /^\/api\/([\w-]+)/.exec(path)?.[1];
  return api ? `api/${api}` : connectPath(path) ? "mcp" : "file";
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
  /* The build's files are served before the Worker runs, so one that reaches it is gone: an earlier deploy's chunk that
     a page open across a deploy or a crawler asks for, thousands a day, each of which rendered the not-found page with
     its reads of the database, and a browser that asked for a script was handed a page. */
  if (path.startsWith("/assets/")) return json({ error: msg("Not found") }, { status: 404 });
  const prefix = canonicalLocalePath(url.pathname);
  if (prefix !== null) return redirect(new URL(prefix + url.search, url).toString());
  // a page's address never ends in a slash, which other sites link to both ways; an API keeps its own
  const slashed = path.length > 1 && path.endsWith("/");
  if (read && slashed) {
    const trimmed = path.replace(/\/+$/, "") || "/";
    if (isPagePath(trimmed)) return redirect(at(trimmed + url.search));
  }
  // no API or file has a language or a last slash
  if (!page && (locale !== DEFAULT_LOCALE || slashed)) {
    return json({ error: msg("Not found") }, { status: 404 });
  }

  if (page) countLegacy(env, request, address);
  const canonical = page
    ? ((await legacyLanding(env, address)) ?? canonicalRedirect(address))
    : null;
  // a reader arriving from elsewhere at an English address is sent to the language they chose or their browser asks
  // for; a click inside the site, a crawler and a reader who chose English are taken as they came
  if (read && page && locale === DEFAULT_LOCALE && arriving(request) && !isCrawler(request)) {
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
  // an old page the Worker does not fit is the app's to answer, whose page the reader's browser fits, and an old card
  // is the site's card, never a blank preview; under `vite dev` nothing is kept
  const old = read ? oldFit(path, url.searchParams) : null;
  if (old) {
    let fitted = false;
    const fit = async () => {
      const redirect = await fittedRedirect(env, request, old, at);
      fitted = redirect !== null;
      return redirect ?? (old.card ? siteCard(request) : answer(request, app));
    };
    if (env.DEPLOYMENT === "development") return fit();
    /* a fitted 301 outlives a deploy under the fit's key, so a crawler's walk of old links is fitted once; the page or
       card an unfitted link gets names the build's files and keeps the build's key */
    const key = cacheKey(url, path, locale);
    return edgeCached(
      request,
      fitCacheKey(key),
      ctx,
      () => edgeCached(request, key, ctx, fit, () => !fitted),
      () => fitted
    );
  }
  // under `vite dev` nothing is kept or counted: a page kept from before an edit would hydrate against the edited code
  if (!read || env.DEPLOYMENT === "development") return answer(request, app);
  const render = async () =>
    (listingPath(path) && (await overListing(env, request))) || answer(request, app);
  /* a link preview of an animated SVG, the bands' or an effect's, gets a page of its own (files/preview.ts), which no
     cache keeps or answers */
  const asked = addressParams(url.searchParams);
  const preview =
    isLinkPreview(request) &&
    path.endsWith(".svg") &&
    (isBands(asked) || parseEffect(asked) !== null);
  return uncachedPath(path) || preview
    ? render()
    : edgeCached(request, cacheKey(url, path, locale), ctx, render);
}

/** A query's campaign tags and the rest of it, each pair as it came: a query written again would spell the
    selection's bare word `selection=`, which is another address of the page to its canonical rule. */
function splitTracking(search: string): { rest: string; tracking: string } {
  const rest: string[] = [];
  const tracking: string[] = [];
  for (const pair of search.slice(1).split("&")) {
    if (!pair) continue;
    const name = pair.split("=", 1)[0] ?? "";
    let said = name;
    try {
      said = decodeURIComponent(name.replaceAll("+", " "));
    } catch {
      // a name that is no escape is read as it came
    }
    (TRACKING_PARAM.test(said) ? tracking : rest).push(pair);
  }
  return { rest: rest.length ? `?${rest.join("&")}` : "", tracking: tracking.join("&") };
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

/** A browser's page navigation from outside the site: a search result, another site, a typed address or a bookmark.
    Only a browser says it navigates, so a crawler, which sends no Sec-Fetch headers, is taken as it came. */
const arriving = (request: Request): boolean =>
  request.headers.get("Sec-Fetch-Mode") === "navigate" &&
  request.headers.get("Sec-Fetch-Site") !== "same-origin";

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
  tracking: string
): Response {
  const response = new Response(request.method === "HEAD" ? null : answered.body, answered);
  const headers = response.headers;
  /* Only a 200 may be kept anywhere, and a permanent redirect the edge may keep, which leads to one place for good; a
     304 keeps the policy of what it confirms. A temporary redirect whose handler keeps it from the edge may still name
     minutes for the browser: what stands in for a picture that is not drawn now (images/serve.ts), so a page of them
     does not ask again for each. */
  const forGood = response.status === 301 && keepFor(response) !== null;
  const standIn =
    response.status === 302 &&
    headers.get("CDN-Cache-Control") === "no-store" &&
    /^public, max-age=\d+$/.test(headers.get("Cache-Control") ?? "");
  if (response.status !== 200 && response.status !== 304 && !forGood && !standIn) {
    for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);
  }
  // a refusal that names no wait: the allowances that refuse without one count by the minute
  if (response.status === 429 && !headers.has("Retry-After")) headers.set("Retry-After", "60");
  const location =
    tracking && response.status >= 300 && response.status < 400 ? headers.get("Location") : null;
  if (location) {
    const to = new URL(location, url);
    if (to.origin === url.origin) {
      to.search = to.search ? `${to.search}&${tracking}` : tracking;
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
