import { isPagePath, type Locale, splitLocale } from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { countUsageUnder } from "@grabient/server/usage/count.ts";
import { isSeed } from "../../features/editor/address.ts";
import { isCrawler } from "../crawlers.ts";
import { type Ga4Hit, sendToGa4 } from "./ga4.ts";
import { dayOf, hex, keyName, leadName } from "./keys.ts";
import { HOSTING, tooOld } from "./rules.ts";

/* Visits, counted by the Worker from what a browser asks for anyway: a page it loads, and the palette uses and searches
   a page already reports (/api/used, /api/searched). Nothing is stored on or read from the reader's device for them and
   no script asks for them, so they need no choice, and no blocker leaves a reader out. Each is a `visit` point in
   Analytics Engine (@grabient/server/usage/count.ts), its labels from the request alone: what it was, the page's kind
   and language, the country Cloudflare places it in, the device, the browser by name and major version, the system,
   the network's number (its ASN), what the request says of itself, and for a landing the site that sent it and the
   link's campaign tags.

   Its visitor is a code: the first 16 hex digits of the SHA-256 of the day's key, the request's address (an IPv6
   address by its /64) and its user agent, so a day's points from one browser count once. The key is random, made a day
   ahead and deleted ten minutes past its day's end (keys.ts): after that no code can be made again or matched to an
   address, and the codes of two days never meet. A browser that sends Global Privacy Control or Do Not Track adds
   one to its day's count and says nothing else. China and Vietnam are counted as everywhere else since 24 Oct 2026,
   on the owner's word: until then no code was made there, as their laws want consent before a person's visits are
   analysed.

   A page counts when a browser navigates to it (Sec-Fetch-Mode navigate, into a document or another site's frame) and
   the site answers with it: never a prefetch, a program that names itself, a crawler crawlers.ts lists or a bot
   Cloudflare verified. What else a request says of itself is kept as its signals, for the reader of the counts to
   weigh (mcp/admin/visits.ts): a browser that sends no language (no-language), a Chromium that sends no client hints
   (no-hints), hints of another version than its user agent (hints-differ) or of another system (system-differs), or
   one a program drives and says so (headless). */

export type VisitKind = "landing" | "load" | "framed" | "use" | "search";

/** Where a visit was made, as the request that made it says. */
export interface Visit {
  what: VisitKind;
  page: string;
  language: string;
  /** the page's path as the browser asked for it, for Google Analytics alone: the counts keep its kind */
  path?: string;
  referrer?: string;
  source?: string;
  medium?: string;
  campaign?: string;
}

const MINUTE = 60_000;

/** A program that names itself in its user agent, as the page's own analytics knows them, and the usual HTTP
    libraries. Cubot is a phone. */
const PROGRAM =
  /(?<!cu)bot|crawl|spider|headless|lighthouse|pagespeed|slurp|preview|python|curl\/|wget|httpclient|okhttp|java\/|go-http|scrapy|axios|node-fetch|undici|libwww|postman|phantomjs|puppeteer|playwright|selenium/i;
const PREFETCH = /prefetch|prerender/i;
/** A browser's reload, which asks again for what it holds. */
const RELOAD = /max-age=0|no-cache/i;
/** Where a sign-in sends the reader back from. */
const SIGN_IN = new Set(["accounts.google.com"]);

/** A program that names itself, a crawler, or a bot Cloudflare verified. */
function automated(request: Request): boolean {
  const agent = request.headers.get("User-Agent") ?? "";
  if (!agent || PROGRAM.test(agent) || isCrawler(request)) return true;
  const cf = (request as { cf?: { botManagement?: { verifiedBot?: unknown } } }).cf;
  return cf?.botManagement?.verifiedBot === true;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The pages named by their first segment. */
const NAMED = new Set([
  "about",
  "bindings",
  "connect",
  "contact",
  "login",
  "mcp-server",
  "newsletter",
  "privacy",
  "settings",
  "terms",
  "unsubscribe"
]);

/** A page by its kind: a list, a search, a palette, a collection, the editor, or a page by its own name. `path` is
    without its language. */
export function pageKind(path: string, query: URLSearchParams): string {
  const [first = "", second = "", ...more] = path.slice(1).split("/");
  const list = !first || first === "palettes" || first === "collections";
  if (list && query.has("q")) return "search";
  if (!first) return "home";
  if (first === "palettes" || first === "collections") {
    if (second === "saved") return "saved";
    if (first === "palettes") return second === "rising" ? "rising" : "palettes";
    return "collections";
  }
  if (NAMED.has(first)) return first;
  if (first.startsWith("@")) return "collection";
  if (more.length) return "other";
  if (second === "edit") return "editor";
  if (second && second !== "rising") return "other";
  // a collection may be named like a seed (/kingfisher-blue): a seed is one that decodes
  return isSeed(first) ? "palette" : SLUG.test(first) ? "collection" : "other";
}

/** The device by the browser's own hint, else its user agent. An iPad that asks for the desktop site is a desktop. */
export function deviceOf(headers: Headers, agent: string): string {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(agent)) return "tablet";
  if (headers.get("Sec-CH-UA-Mobile") === "?1") return "mobile";
  if (/Android/.test(agent) && !/Mobile/.test(agent)) return "tablet";
  return /Mobi|iPhone|iPod|Android|Opera Mini/i.test(agent) ? "mobile" : "desktop";
}

const BROWSERS: readonly [string, RegExp][] = [
  ["WebView", /; wv\).*Chrome\/(\d+)/],
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//]
];

/** The browser's name and major version from its user agent, and nothing else of it. */
export function browserOf(agent: string): string {
  for (const [name, pattern] of BROWSERS) {
    const found = pattern.exec(agent);
    if (found) return `${name} ${found[1]}`;
  }
  return "other";
}

const SYSTEMS: readonly [string, RegExp][] = [
  ["iOS", /iPhone|iPad|iPod/],
  ["Android", /Android/],
  ["ChromeOS", /CrOS/],
  ["Windows", /Windows/],
  ["macOS", /Macintosh|Mac OS X/],
  ["Linux", /Linux|X11/]
];

/** The system the user agent names. */
export function systemOf(agent: string): string {
  return SYSTEMS.find(([, pattern]) => pattern.test(agent))?.[0] ?? "other";
}

/** The system a Chromium's hint names, in the user agent's words. */
const hintedSystem = (hint: string): string => {
  const named = hint.replaceAll('"', "").trim();
  if (named === "Chrome OS" || named === "Chromium OS") return "ChromeOS";
  return named;
};

/** What a browser's request says of itself that a person's browser would not. */
export function signalsOf(headers: Headers, agent: string): string[] {
  const signals: string[] = [];
  if (!headers.get("Accept-Language")) signals.push("no-language");
  // a Chromium, which has sent client hints since version 90 on every secure request; Android's WebView may not
  const chromium = /Chrome\/(\d+)/.exec(agent);
  if (!chromium || /; wv\)/.test(agent) || Number(chromium[1]) < 90) return signals;
  const hints = headers.get("Sec-CH-UA");
  if (!hints) return [...signals, "no-hints"];
  if (/headless/i.test(hints)) signals.push("headless");
  const versions = [...hints.matchAll(/"([^"]*)";\s*v="(\d+)"/g)]
    .filter(([, brand]) => !/not.?a.?brand/i.test(brand ?? ""))
    .map(([, , version]) => version);
  if (!versions.includes(chromium[1])) signals.push("hints-differ");
  const platform = headers.get("Sec-CH-UA-Platform");
  const said = systemOf(agent);
  // Android's Chrome asking for the desktop site says Linux in its user agent
  if (
    platform &&
    hintedSystem(platform) !== said &&
    !(said === "Linux" && /Android/.test(platform))
  )
    signals.push("system-differs");
  return signals;
}

const referrerOf = (value: string | null): URL | null => {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/** A browser navigating to a page for a reader, not a prefetch or a program. */
function navigated(request: Request): boolean {
  const headers = request.headers;
  if (headers.get("Sec-Fetch-Mode") !== "navigate") return false;
  const into = headers.get("Sec-Fetch-Dest");
  if (into !== "document" && into !== "iframe") return false;
  const purpose = `${headers.get("Sec-Purpose") ?? ""} ${headers.get("Purpose") ?? ""} ${headers.get("X-Moz") ?? ""}`;
  return !PREFETCH.test(purpose) && !automated(request);
}

/** The visit a page's answer is, or null. `request` is the one the browser sent, campaign tags and all, `path` the
    page's without its language, and `tracking` the campaign tags the pipeline took off the address. A landing is a
    page reached from elsewhere: another site, a typed address, a bookmark, an app; a load is a page loaded whole from
    one of the site's own, as a reload is. */
export function pageVisit(
  request: Request,
  path: string,
  locale: Locale,
  answered: Response,
  tracking: string
): Visit | null {
  if (request.method !== "GET" || !isPagePath(path)) return null;
  const html = answered.headers.get("Content-Type")?.startsWith("text/html");
  if (!(answered.status === 200 && html) && answered.status !== 304) return null;
  if (!navigated(request)) return null;
  const url = new URL(request.url);
  const page = pageKind(path, url.searchParams);
  const at = { page, language: locale, path: url.pathname };
  if (request.headers.get("Sec-Fetch-Dest") === "iframe") return { what: "framed", ...at };
  const from = referrerOf(request.headers.get("Referer"));
  /* a reload keeps the Referer of the page's arrival, and a sign-in returns with Google's: both are loads, never a
     second landing */
  const inside =
    request.headers.get("Sec-Fetch-Site") === "same-origin" ||
    from?.origin === url.origin ||
    RELOAD.test(request.headers.get("Cache-Control") ?? "") ||
    (!!from && SIGN_IN.has(from.hostname));
  if (inside) return { what: "load", ...at };
  const tags = new URLSearchParams(tracking);
  return {
    what: "landing",
    ...at,
    referrer: from?.hostname ?? "",
    source: tags.get("utm_source") ?? "",
    medium: tags.get("utm_medium") ?? "",
    campaign: tags.get("utm_campaign") ?? ""
  };
}

/** Whether a visit shows a person by what it is: a landing from another site or a campaign's link, a page loaded from
    within the site or in a partner's frame, or something used or searched on a page. A landing that came from nowhere,
    typed, bookmarked or a program's, shows nothing: on 21 Oct 2026 every visit of a scraper passing for browsers on
    residential addresses was one, thousands a minute, with no page after it and nothing used. */
export const showsPerson = (visit: Visit): boolean =>
  visit.what !== "landing" || !!(visit.referrer || visit.source || visit.medium || visit.campaign);

/** A palette used, a collection's page used once the reader is present (features/palette-use/use.ts), or a search
    made, as a visit to the page it was made on, or null for a program's. */
export function actVisit(request: Request, what: "use" | "search"): Visit | null {
  if (automated(request)) return null;
  const from = referrerOf(request.headers.get("Referer"));
  const own = from && from.origin === new URL(request.url).origin ? from : null;
  if (!own) return { what, page: "", language: "" };
  const { locale, path } = splitLocale(own.pathname);
  return { what, page: pageKind(path, own.searchParams), language: locale, path: own.pathname };
}

/* the day's key each isolate read, by KV binding. A key never changes in its day, so one found stands for the day; a
   day with none is read again after a minute. Each request reads for itself until the isolate holds the key, and waits on
   no other's read (@grabient/server/shared-work.ts). */
const keys = new WeakMap<KVNamespace, { day: string; key: string | null; at: number }>();

async function dayKey(store: KVNamespace, day: string): Promise<string | null> {
  const was = keys.get(store);
  if (was?.day === day && (was.key || Date.now() - was.at < MINUTE)) return was.key;
  const key = await store.get(keyName(day), { cacheTtl: 300 });
  keys.set(store, { day, key, at: Date.now() });
  return key;
}

/* Chrome's stable version (keys.ts), read as the key is: again after an hour, or after five minutes while none is
   kept */
const leads = new WeakMap<KVNamespace, { lead: number | null; at: number }>();
const HOUR = 3_600_000;

async function dayLead(store: KVNamespace): Promise<number | null> {
  const was = leads.get(store);
  if (was && Date.now() - was.at < (was.lead ? HOUR : 5 * MINUTE)) return was.lead;
  const kept = await store.get<{ lead?: unknown }>(leadName, { type: "json", cacheTtl: 300 });
  const lead = typeof kept?.lead === "number" ? kept.lead : null;
  leads.set(store, { lead, at: Date.now() });
  return lead;
}

async function visitorOf(key: string, address: string, agent: string): Promise<string> {
  const text = new TextEncoder().encode(`${key}\n${address}\n${agent}`);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", text)).slice(0, 8));
}

/** Counts a visit, after its answer where it can (ctx.waitUntil). It never fails: a key KV cannot give leaves the
    visit without its visitor. */
export async function countVisit(
  env: Pick<Env, "USAGE" | "CACHE" | "DEPLOYMENT" | "GA4_API_SECRET" | "GA4_MEASUREMENT_ID">,
  request: Request,
  visit: Visit,
  now = Date.now()
): Promise<void> {
  if (!env.USAGE) return;
  const headers = request.headers;
  if (headers.get("Sec-GPC") === "1" || headers.get("DNT") === "1") {
    countUsageUnder(env, "visit", "visit", visit.what, "", "", "", "", "", "", "", "held");
    return;
  }
  const agent = headers.get("User-Agent") ?? "";
  const cf = (
    request as {
      cf?: { country?: unknown; asn?: unknown; regionCode?: unknown; isEUCountry?: unknown };
    }
  ).cf;
  const country = typeof cf?.country === "string" ? cf.country : "";
  const address = clientAddress(request);
  let visitor = "";
  if (address && env.CACHE) {
    try {
      const key = await dayKey(env.CACHE, dayOf(now));
      if (key) visitor = await visitorOf(key, address, agent);
    } catch {
      // counted without its visitor
    }
  }
  const device = deviceOf(headers, agent);
  const browser = browserOf(agent);
  const system = systemOf(agent);
  const network = typeof cf?.asn === "number" ? String(cf.asn) : "";
  const signals = signalsOf(headers, agent);
  countUsageUnder(
    env,
    visitor || "visit",
    "visit",
    visit.what,
    visit.page,
    visit.language,
    country,
    device,
    browser,
    system,
    network,
    signals.join(" "),
    visit.referrer ?? "",
    visit.source ?? "",
    visit.medium ?? "",
    visit.campaign ?? "",
    visitor
  );
  /* on to Google Analytics, a person's visit alone: a code, nothing a program's request says, none of the large
     clouds' networks, a browser no more than five versions behind Chrome's stable one, which must be known (until it
     is, nothing is sent, as programs on old versions would pass for people), and a browser that ran the page (below).
     A landing from nowhere (typed, bookmarked, an app's link) goes too once its page has run: until 24 Oct 2026 it
     never went, as the scrapers' visits were all such landings, and Google Analytics left out every person who came
     straight to the site */
  if (!visitor || signals.length || HOSTING.includes(network) || !env.GA4_API_SECRET) return;
  const lead = env.CACHE ? await dayLead(env.CACHE).catch(() => null) : null;
  if (!lead || tooOld(browser, lead)) return;
  const hit: Ga4Hit = {
    visitor,
    what: visit.what,
    path: visit.path ?? "",
    country,
    region: typeof cf?.regionCode === "string" ? cf.regionCode : "",
    european: cf?.isEUCountry === "1" || EUROPE.has(country),
    device,
    browser,
    system,
    language:
      (headers.get("Accept-Language") ?? "").split(",")[0]?.split(";")[0]?.trim().slice(0, 12) ??
      "",
    referrer: visit.referrer ?? "",
    source: visit.source ?? "",
    medium: visit.medium ?? "",
    campaign: visit.campaign ?? "",
    network
  };
  const origin = new URL(request.url).origin;
  if (visit.what === "use" || visit.what === "search") {
    // the page's own script made it: its browser ran the page, whose waiting visit goes first
    if (headers.get("Sec-Fetch-Site") === "same-origin") await ranPage(env, origin, visitor);
    await sendHit(env, hit, now);
  } else await sendOnceRan(env, origin, hit, now);
}

/** Europe beyond the EU, whose visits go to Google's European endpoint too. */
const EUROPE = new Set(["GB", "CH", "NO", "IS", "LI"]);

/* A page goes on to Google Analytics once its browser has run it. Every page's script asks who is signed in (GET
   /api/auth/get-session, features/account/session.ts) right after its first render, from the page's address and
   browser, so under the page's visitor code; a program that fetches pages and runs none of them never asks. Until the
   check comes, the page waits in this data center's cache (the Cache API: never the reader's device) under its
   visitor's code, ten minutes at most and the latest page alone. A visitor whose browser ran a page is taken as one for
   half an hour, and its pages go at once. A palette used or a search made comes from the page's script too.

   On 24 Oct 2026 a scraper on current Chrome versions, from home connections in Brazil, Bangladesh, Iraq and Türkiye,
   sent about 33,000 page loads in two hours with every header a person's click sends (a Referer on the site,
   Sec-Fetch-Site same-origin, Sec-Fetch-User), each from a new address, and made 94 session checks; people's browsers
   made one for about every other page. Google Analytics counted each of its loads as a new person. */
const WAITS_SECONDS = 600;
const RAN_SECONDS = 1800;

const visitCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;
const waitingKey = (origin: string, visitor: string) =>
  new Request(`${origin}/__visits/waiting/${visitor}`);
const ranKey = (origin: string, visitor: string) =>
  new Request(`${origin}/__visits/ran/${visitor}`);
const kept = (body: string, seconds: number) =>
  new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${seconds}` }
  });

type Sends = Pick<Env, "USAGE" | "DEPLOYMENT" | "GA4_API_SECRET" | "GA4_MEASUREMENT_ID">;

/** A hit sent on, and counted (`ga4`, under its visitor) when Google took it. */
async function sendHit(env: Sends, hit: Ga4Hit, at: number): Promise<void> {
  if (await sendToGa4(env, hit, at))
    countUsageUnder(env, hit.visitor, "ga4", hit.what, hit.country, hit.browser, hit.network ?? "");
}

/** A page's hit: sent when its visitor's browser has run a page, else kept until it does. */
async function sendOnceRan(env: Sends, origin: string, hit: Ga4Hit, now: number): Promise<void> {
  const cache = visitCache();
  if (!cache) return;
  try {
    if (await cache.match(ranKey(origin, hit.visitor))) {
      await sendHit(env, hit, now);
      return;
    }
    await cache.put(
      waitingKey(origin, hit.visitor),
      kept(JSON.stringify({ hit, at: now }), WAITS_SECONDS)
    );
    // the page's check may have come between the two
    if (await cache.match(ranKey(origin, hit.visitor)))
      await release(env, cache, origin, hit.visitor);
  } catch {
    // not sent: a cache that cannot be read or written leaves the visit in the counts here alone
  }
}

/** The visitor's browser ran a page: taken as one for half an hour, and its waiting page goes on. */
async function ranPage(env: Sends, origin: string, visitor: string): Promise<void> {
  const cache = visitCache();
  if (!cache) return;
  try {
    await cache.put(ranKey(origin, visitor), kept("1", RAN_SECONDS));
    await release(env, cache, origin, visitor);
  } catch {
    // nothing sent
  }
}

/** The visitor's waiting page, sent once: only the call that deletes it sends it. */
async function release(env: Sends, cache: Cache, origin: string, visitor: string): Promise<void> {
  const waiting = await cache.match(waitingKey(origin, visitor));
  if (!waiting || !(await cache.delete(waitingKey(origin, visitor)))) return;
  const { hit, at } = (await waiting.json()) as { hit: Ga4Hit; at: number };
  await sendHit(env, hit, at);
}

/** The page's own session check (GET /api/auth/get-session), which says its visitor's browser ran the page. */
export async function checkedSession(
  env: Pick<Env, "USAGE" | "CACHE" | "DEPLOYMENT" | "GA4_API_SECRET" | "GA4_MEASUREMENT_ID">,
  request: Request,
  now = Date.now()
): Promise<void> {
  if (!env.USAGE || !env.CACHE || !env.GA4_API_SECRET || request.method !== "GET") return;
  const headers = request.headers;
  if (headers.get("Sec-Fetch-Site") !== "same-origin" || automated(request)) return;
  if (headers.get("Sec-GPC") === "1" || headers.get("DNT") === "1") return;
  const address = clientAddress(request);
  if (!address) return;
  try {
    const key = await dayKey(env.CACHE, dayOf(now));
    if (!key) return;
    const visitor = await visitorOf(key, address, headers.get("User-Agent") ?? "");
    await ranPage(env, new URL(request.url).origin, visitor);
  } catch {
    // nothing sent
  }
}
