import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  type Locale,
  localizePath,
  msg,
  translate
} from "@grabient/i18n";
import { replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOffKnown, pausedBy } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import {
  checkLimits,
  knownLimit,
  type LimitResult,
  limiterName
} from "@grabient/server/limits/check.ts";
import { type LimitName, limitOf } from "@grabient/server/limits/config.ts";
import { joined } from "@grabient/server/shared-work.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import type { PaletteOrder } from "../features/collections/address.ts";
import { BUILD } from "../lib/build.ts";
import { NO_STORE } from "../lib/cache.ts";
import { json, redirect, withHeaders } from "../lib/responses.ts";
import { isLinkPreview } from "./crawlers.ts";
import type { App, CeilingReads } from "./pipeline.ts";

/* The site's ceilings on work no cache holds, loaded with the first such work an isolate meets (pipeline.ts). Each page
   drawn, an address no route serves among them, counts against the site's ten minutes, and each read of the lists' and
   searches' data against its own; any other page, a search's picture, and the search's suggestions also against their
   address's minute in this isolate, beside the listings' own. A crawler Cloudflare verifies is drawn and never counted.
   Past the site's ten minutes a reader signed in, a browser on HTTP/3 that names no program and a link preview each
   draw from an allowance of their own, and anyone else gets what stands in: the app's frame, which the browser draws
   the page into, as a 503 a crawler reads as for now; JSON 429 for data; the site's card for a search's share card. An
   address past its minute gets them as a 429. While an admin has draw-past-ceiling on, nothing stands in: every reader
   gets what the site answers without the ceilings, and who a lane would have taken is looked at once the work has
   begun, for the counts.

   No reader waits on the limiter, nor on a read of the flags. What this isolate and its data center already know
   decides, and the count is asked once the answer has begun; until this isolate has read its data center's word on a
   pool, the work is drawn, and counted once the word is read. A limiter that fails or is slow leaves the work drawn,
   and this isolate counts alone for half a minute. Anything that fails here draws the work. */

/** What the pipeline hands over: the request as it arrived, whose place says who asked, and as the site reads it. */
export interface Asked {
  env: Env;
  ctx: ExecutionContext;
  sent: Request;
  request: Request;
  url: URL;
  /** without the language */
  path: string;
  locale: Locale;
  app: App;
  /** the wait, in seconds, of an address past its listings' minute (pipeline.ts) */
  refused?: number;
  /** what the site reads of an address and of a collection, as the pipeline holds it */
  reads: CeilingReads;
}

type What = "page" | "data";
type Lane = "anyone" | "verified" | "signed-in" | "http3" | "preview";
type Answer = "drawn" | "watch" | "stand-in" | "unmetered";
type Check = readonly [identifier: string, name: LimitName];

/** The site's ten minutes, by what is counted. */
const SITE: Record<What, Check> = {
  page: ["page-render", "pageRender"],
  data: ["data-miss", "dataMiss"]
};
/** Every signed-in reader's ten minutes past the site's. */
const SIGNED_IN: Check = ["signed-in", "renderSignedIn"];
/** What this isolate draws alone while the limiter cannot answer: for anyone, and apart for readers signed in. */
const LOCAL: Check = ["isolate", "renderLocal"];
const LOCAL_SIGNED_IN: Check = ["signed-in", "renderLocal"];
/** A request off production with this header set to `spent` meets every ceiling spent, to see what stands in. */
const TEST_HEADER = "X-Grabient-Ceiling";
const STATUS = "X-Grabient-Cache";
const RESET = "X-Reset";
const UNTIL = "X-Until";
/** The frame: Saved's document, drawn in the browser, with nothing of an account in it (as sw/service-worker.ts). */
const FRAME = "/palettes/saved";
/** What the frame's answer names in Server-Timing, which its document reads (features/collections/route.ts). */
const FRAMED = { "Server-Timing": "frame" };
const ASK_MS = 2000;
const DOWN_MS = 30_000;
const MARK_READ_MS = 1000;
/** How long a request waits on its isolate's first read of a pool's word: a Cache API read takes a few milliseconds. */
const MARK_WAIT_MS = 50;
const FRAME_MS = 3_600_000;
/** How long a frame that could not be drawn leaves the page that asks again in its place. */
const UNDRAWN_MS = 60_000;
/** How long the account a session cookie stood for is taken as read, and a read that was late or refused as none. */
const SESSION_MS = 60_000;
const UNREAD_MS = 5000;
const SESSIONS_MAX = 1000;
/** One answer in this many is written to the counts, weighted as many. */
const SAMPLED = 20;

/** Until when this isolate counts alone: a limiter that failed or was slow is left alone for half a minute. */
let downUntil = 0;
/** What this isolate read last of its data center's word on each pool: spent until `reset`, in seconds. */
const marks = new Map<LimitName, { read: number; reset: number }>();
/** The frame in each language this isolate holds, or null for one that could not be drawn, and the one being drawn. */
const frames = new Map<Locale, { html: string | null; until: number }>();
const drawing = new Map<Locale, Promise<string | null>>();
/** The account each session cookie stood for when it was last read here, or null for none, and the read while it is
    out, by a digest of its token: a key cut from the cookie would hold the whole Cookie header in memory, and a
    credential with it. */
const sessions = new Map<string, { account: Promise<string | null>; until: number }>();

const seconds = () => Math.floor(Date.now() / 1000);
const cacheOf = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;
const placeOf = (request: Request) =>
  (request as { cf?: { verifiedBotCategory?: string; httpProtocol?: string } }).cf;

/** What `work` comes to within `ms`, or undefined when it is late or fails. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>(done => {
    timer = setTimeout(() => done(undefined), ms);
  });
  try {
    return await Promise.race([work, late]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** What stands in for this work past the site's ceilings, or null when it is drawn. Never throws. */
export async function ceiling(a: Asked): Promise<Response | null> {
  try {
    return await decide(a);
  } catch {
    return null;
  }
}

/** A page, or a read of the lists' or the searches' data, as paths.ts `ceilingPath` names what is counted. */
const whatOf = (a: Asked): What | null =>
  a.request.method === "GET" || a.request.method === "HEAD"
    ? a.reads.ceilingPath(a.path, a.url.searchParams)
    : null;

/** `answered`: the work is drawn already, and only what it counts against is left to decide. */
async function decide(a: Asked, answered = false): Promise<Response | null> {
  const what = whatOf(a);
  if (!what) return null;
  // read from the request as it arrived: the one without its campaign tags may not carry its place
  if (placeOf(a.sent)?.verifiedBotCategory) {
    if (a.refused === undefined) tally(a, what, "verified", "drawn");
    return null;
  }
  const forced =
    a.env.DEPLOYMENT !== "production" && a.request.headers.get(TEST_HEADER) === "spent";
  // asked only past a ceiling, so work drawn under the ceilings begins no read of the flags
  const enforced = () => !answered && (forced || enforcing(a));
  if (a.refused !== undefined) {
    if (what !== "page" || !enforced()) return null;
    tally(a, what, "anyone", "stand-in");
    return await standIn(a, what, 429, seconds() + a.refused);
  }
  const who = clientAddress(a.request);
  const own: Check | null =
    who && !a.reads.listingPath(a.path)
      ? [`render:${who}`, a.reads.suggestionPath(a.path) ? "suggestMiss" : "renderMiss"]
      : null;
  const minute = own && knownLimit(a.env, own);
  if (minute) return await past(a, what, 429, minute.reset, enforced, null, null);
  const site = SITE[what];
  const known = knownLimit(a.env, site);
  /* no reader waits on an isolate's first read of its data center's word on a pool: the work is drawn, and what it
     counts against is decided once the word is read */
  if (!known && !forced && !marks.has(site[1])) {
    a.ctx.waitUntil(
      readMark(a, site[1])
        .then(() => decide(a, true))
        .catch(() => {})
    );
    return null;
  }
  /* the list API answers what its record holds fresh with no database read, which nothing counts or refuses: the
     record is looked up beside the answer, and waited on only past a ceiling */
  const held =
    a.path === "/api/palettes"
      ? import("./gallery/cache.ts").then(list => list.listHeld(a.url)).catch(() => false)
      : undefined;
  const spent = known ?? (await marked(a, site[1]));
  // while the limiter cannot answer, no lane can be counted against it
  const down = Date.now() < downUntil;
  if (spent || forced) {
    const reset = spent?.reset ?? seconds() + limitOf(site[1]).window;
    return await past(a, what, 503, reset, enforced, down ? "unmetered" : "counted", own, held);
  }
  if (down) {
    const local = knownLimit(a.env, LOCAL);
    if (local) return await past(a, what, 503, local.reset, enforced, "unmetered", own, held);
    // counted in this isolate alone, but a list page its record holds fresh, looked up behind the answer as below
    const alone = async (fresh?: boolean) => {
      if (fresh) return;
      tally(a, what, "anyone", "unmetered");
      await checkLimits(a.env, own ? [own, LOCAL] : [LOCAL]);
    };
    if (held) a.ctx.waitUntil(held.then(alone));
    else await alone();
    return null;
  }
  const checks = own ? [own, site] : [site];
  if (held) a.ctx.waitUntil(held.then(fresh => fresh || drawn(a, what, checks)));
  else drawn(a, what, checks);
  return null;
}

/** Work drawn under the site's ten minutes, counted once its answer has begun. */
function drawn(a: Asked, what: What, checks: readonly Check[]): void {
  count(a, checks);
  tally(a, what, "anyone", "drawn");
}

/** Whether readers past a ceiling get what stands in: an admin has turned draw-past-ceiling off, or every feature, as
    this isolate read the flags last. No request waits on their read. */
const enforcing = (a: Asked) =>
  flagOffKnown(a.env, "draw-past-ceiling", work => a.ctx.waitUntil(work));

/** Past a ceiling: drawn while an admin has draw-past-ceiling on and the request forces nothing, the lanes looked at
    after the work has begun; else drawn for a list page its record holds and for a reader a lane takes, else what
    stands in. Past an address's minute no lane opens, and work a lane takes counts against `own`, the address's minute,
    first; while the limiter cannot answer only a reader signed in is drawn, counted in this isolate alone. */
async function past(
  a: Asked,
  what: What,
  status: 429 | 503,
  reset: number,
  enforced: () => boolean,
  lanes: "counted" | "unmetered" | null,
  own: Check | null,
  held?: Promise<boolean>
): Promise<Response | null> {
  const exempt = async (): Promise<boolean> => {
    if (held && (await held)) return true;
    const lane = lanes && (await laneOf(a, what, lanes === "counted", own));
    if (!lane) return false;
    if (lanes === "counted") count(a, own ? [own, ...lane.checks] : lane.checks);
    tally(a, what, lane.name, lanes === "counted" ? "drawn" : "unmetered");
    return true;
  };
  if (!enforced()) {
    // a turn of the event loop later, once the page's own work has begun
    a.ctx.waitUntil(
      new Promise(done => setTimeout(done))
        .then(exempt)
        .then(taken => taken || tally(a, what, "anyone", "watch"))
        .catch(() => {})
    );
    return null;
  }
  if (await exempt()) return null;
  tally(a, what, "anyone", "stand-in");
  return await standIn(a, what, status, reset);
}

/** The first lane with room that takes this reader: a session's, then HTTP/3's, then a link preview's. A lane is
    looked at only past the site's ten minutes, so it takes nothing from anyone while they last. A session is read
    only while every signed-in reader's ten minutes have room. While the limiter cannot answer, a session's lane is
    counted here in the isolate, the address's minute (`own`) first. */
async function laneOf(
  a: Asked,
  what: What,
  counted: boolean,
  own: Check | null
): Promise<{ name: Lane; checks: readonly Check[] } | null> {
  const token = tokenOf(a.request);
  const account = token && (await open(a, [SIGNED_IN])) ? await accountOf(a, token) : null;
  if (account) {
    const theirs: Check = [`account:${account}`, "renderAccount"];
    if (counted && !knownLimit(a.env, theirs))
      return { name: "signed-in", checks: [theirs, SIGNED_IN] };
    const alone = own ? [own, LOCAL_SIGNED_IN] : [LOCAL_SIGNED_IN];
    if (!counted && (await checkLimits(a.env, alone))?.success)
      return { name: "signed-in", checks: [] };
  }
  if (!counted) return null;
  if (placeOf(a.sent)?.httpProtocol === "HTTP/3") {
    const { automated } = await import("./visits/visits.ts");
    const checks: Check[] = [["http3", "renderHttp3"]];
    if (!automated(a.sent) && (await open(a, checks))) return { name: "http3", checks };
  }
  if (what === "page" && isLinkPreview(a.request)) {
    const checks: Check[] = [["page-preview", "renderPreview"]];
    if (await open(a, checks)) return { name: "preview", checks };
  }
  return null;
}

/** A session cookie's token, whatever prefix the deploy gives its name: the library finds no session without one. */
const tokenOf = (request: Request) =>
  /(?:^|;\s*)[\w.-]*session_token=([^;]+)/.exec(request.headers.get("Cookie") ?? "")?.[1];

/** The account a request's session stands for, or null: a cookie no session stands behind is anyone's, and so is one
    whose read is late or refused, for a few seconds. Each cookie is read here once at a time, the requests that come
    meanwhile take that read, and its answer holds a minute, so these reads spend little of the address's allowance the
    page's own session checks share. It is read as those checks read it, through the app, leaving the session as it
    stands: importing the sign-in library here makes the bundler hoist its runtime helpers into the library's chunk,
    which every isolate then loads at its start. */
async function accountOf(a: Asked, token: string): Promise<string | null> {
  const key = await limiterName(`session:${token}`);
  const known = sessions.get(key);
  if (known && known.until > Date.now()) return known.account;
  const headers = new Headers({
    Cookie: a.request.headers.get("Cookie") ?? "",
    Accept: "application/json"
  });
  const address = a.request.headers.get("CF-Connecting-IP");
  if (address) headers.set("CF-Connecting-IP", address);
  const check = new URL("/api/auth/get-session?disableRefresh=true", a.url.origin);
  const account = within(
    a
      .app(new Request(check, { headers }))
      .then(answer =>
        answer.status === 200
          ? (answer.json() as Promise<{ user?: { id?: unknown } } | null>)
          : undefined
      ),
    ASK_MS
  ).then(read => {
    const kept = sessions.get(key);
    if (read === undefined && kept?.account === account) kept.until = Date.now() + UNREAD_MS;
    return typeof read?.user?.id === "string" ? read.user.id : null;
  });
  sessions.delete(key);
  if (sessions.size >= SESSIONS_MAX) sessions.delete(sessions.keys().next().value!);
  sessions.set(key, { account, until: Date.now() + SESSION_MS });
  return account;
}

/** Whether a lane has room: none of its limits spent as this isolate knows, nor its pool as its data center says. */
async function open(a: Asked, checks: readonly Check[]): Promise<boolean> {
  for (const check of checks) {
    if (knownLimit(a.env, check)) return false;
    if (limitOf(check[1]).site && (await marked(a, check[1]))) return false;
  }
  return true;
}

/** Counts drawn work once its answer has begun. What this isolate holds of a limit is spent now, so two requests never
    spend a unit twice; the limiter is asked beside a timer, and one that fails or is slow leaves this isolate counting
    alone. A pool found spent becomes its data center's word until it resets. */
function count(a: Asked, checks: readonly Check[]): void {
  const counting = checkLimits(a.env, checks);
  a.ctx.waitUntil(settle(a, counting));
}

async function settle(a: Asked, counting: Promise<LimitResult | null>): Promise<void> {
  const result = await within(counting, ASK_MS);
  if (!result) downUntil = Date.now() + DOWN_MS;
  else if (!result.success && result.type && limitOf(result.type).site) {
    /* the object names the second its window ends in, so the word holds a second longer and no request asks in the
       window's last part; a cache that cannot keep the word fails no request */
    await mark(a, result.type, result.reset + 1).catch(() => {});
  }
}

/** The data center's word on a pool: kept in its Cache API until the pool resets, without the build, so a deploy's new
    isolates know it too, but by the pool's size, so a deploy that resizes the pool reads no word of the old one. */
const markKey = (a: Asked, pool: LimitName) =>
  new Request(`${a.url.origin}/.grabient-cache/ceiling/${pool}?requests=${limitOf(pool).requests}`);

async function mark(a: Asked, pool: LimitName, reset: number): Promise<void> {
  marks.set(pool, { read: Date.now(), reset });
  const left = Math.min(limitOf(pool).window, reset - seconds());
  if (left <= 0) return;
  await cacheOf()?.put(
    markKey(a, pool),
    new Response(null, {
      headers: { "Cache-Control": `public, max-age=${left}`, [RESET]: String(reset) }
    })
  );
}

/** The pool's reset while its data center says it is spent. An isolate's first read of it is waited on for a moment,
    so a deploy's new isolates stop without asking, and a read slower than that leaves the work drawn; after that a
    request takes what was read last, and the word is read again behind it at most once a second. */
async function marked(a: Asked, pool: LimitName): Promise<{ reset: number } | null> {
  const now = Date.now();
  const known = marks.get(pool);
  if (!known) {
    const read = readMark(a, pool);
    a.ctx.waitUntil(read);
    await within(read, MARK_WAIT_MS);
  } else if (now - known.read >= MARK_READ_MS) a.ctx.waitUntil(readMark(a, pool));
  const reset = marks.get(pool)?.reset ?? 0;
  return reset * 1000 > now ? { reset } : null;
}

async function readMark(a: Asked, pool: LimitName): Promise<void> {
  const read = Date.now();
  marks.set(pool, { read, reset: marks.get(pool)?.reset ?? 0 });
  let said = 0;
  try {
    said = Number((await cacheOf()?.match(markKey(a, pool)))?.headers.get(RESET)) || 0;
  } catch {
    // a cache that cannot be read says nothing
  }
  // a refusal this isolate learned meanwhile is newer than the read
  marks.set(pool, { read, reset: Math.max(said, marks.get(pool)?.reset ?? 0) });
}

/** What stands in, with when to ask again: JSON for data, the site's card for a search's share card, else the frame,
    or the way to a search for a one-segment address that holds no collection. A one-segment address gets the frame only
    where a public collection lives or the reader holds a session: the browser loads whole an address that holds
    nothing it may read until a page answers it. */
async function standIn(a: Asked, what: What, status: 429 | 503, reset: number): Promise<Response> {
  const wait = Math.max(1, Math.min(600, reset - seconds()));
  const headers = {
    ...NO_STORE,
    "Retry-After": String(wait),
    ...pausedBy("draw-past-ceiling"),
    [STATUS]: "BUSY"
  };
  if (what === "data") {
    // a link to a search still unfurls as Grabient, as a card past its day does (images/serve.ts)
    if (a.path.startsWith("/api/og/"))
      return withHeaders(redirect(new URL("/grabient.png", a.url).toString(), 302), headers);
    const error = a.reads.searchJsonPath(a.path)
      ? msg("Search is busy. Try again later.")
      : msg("Too many requests. Try again later.");
    return json({ error }, { status: 429, headers });
  }
  const page = { ...headers, "Content-Type": "text/html; charset=utf-8" };
  const busy = (after = wait) =>
    new Response(busyPage(a.locale, after), {
      status,
      headers: { ...page, "Retry-After": String(after) }
    });
  const at = collectionAt(a);
  if (at) {
    let visibility: string | null | undefined;
    try {
      visibility = await a.reads.collectionVisibility({ DB: replica(a.env) }, at.slug);
    } catch {
      // a read that fails says nothing of what lives there
    }
    if (visibility === null) {
      const to = localizePath(a.reads.wordsSearch(at.slug, at.order, a.url.search), a.locale);
      return redirect(new URL(to, a.url).toString(), 302);
    }
    /* only a reader signed in may read a collection that is not public, which their browser draws into the frame; anyone
       else's would load the page whole in vain */
    if (visibility !== "public" && !tokenOf(a.request)) return busy();
  }
  const frame = await frameOf(a).catch(() => null);
  if (frame !== null)
    return new Response(frame, { status, headers: { ...page, ...FRAMED, [STATUS]: "SHELL" } });
  // a frame that could not be drawn is drawn again once it has been held a minute, when the page asks again
  const undrawn = frames.get(a.locale);
  const left = undrawn?.html === null ? undrawn.until - Date.now() : 0;
  return busy(Math.min(wait, left > 0 ? Math.ceil(left / 1000) : UNDRAWN_MS / 1000));
}

/** The collection a one-segment address may name, and its order: /{slug} or /{slug}/rising. */
function collectionAt(a: Asked): { slug: string; order: PaletteOrder } | null {
  const [slug = "", order, ...more] = a.path.slice(1).split("/");
  if (more.length || (order !== undefined && order !== "rising")) return null;
  if (slug.startsWith("@") || !a.reads.isCollectionSlug(slug)) return null;
  return { slug, order: order ? "rising" : "popular" };
}

const escaped = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** A page of its own for where the frame cannot stand: it says to try later, and asks again once the wait is over. */
function busyPage(locale: Locale, wait: number): string {
  const { tag, dir } = LOCALE_INFO[locale];
  const words = escaped(translate(locale, msg("Too many requests. Try again later.")));
  return `<!DOCTYPE html><html lang="${tag}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="${wait}"><title>Grabient</title></head><body><p>${words}</p><p><a href="${localizePath("/", locale)}">Grabient</a></p></body></html>`;
}

/** The frame in the request's language. Held for an hour from when it was drawn, in this isolate and by its data center
    per build under a key no request's own can be (`build`, where the edge cache's are `__build`); drawn from a request
    that carries no cookie, one at a time, and held only once its language's words were read, so no language is held in
    English. One that cannot be drawn leaves the page that asks again in its place for a minute, unless the data center
    keeps one another isolate drew. */
async function frameOf(a: Asked): Promise<string | null> {
  const held = frames.get(a.locale);
  if (held && held.html !== null && held.until > Date.now()) return held.html;
  const key = new Request(`${a.url.origin}/.grabient-cache/frame/${a.locale}?build=${BUILD}`);
  const kept = await cacheOf()
    ?.match(key)
    .catch(() => undefined);
  // a copy that cannot be read back is drawn again in its place
  const copy = kept ? await kept.text().catch(() => null) : null;
  if (copy !== null) {
    const until = Number(kept?.headers.get(UNTIL)) || Date.now() + FRAME_MS;
    frames.set(a.locale, { html: copy, until });
    return copy;
  }
  // a draw that ended while the copy was looked for, whether it drew the frame or failed to
  const ended = frames.get(a.locale);
  if (ended && ended.until > Date.now()) return ended.html;
  const begun = drawing.get(a.locale);
  // past the wait the frame is drawn again only if no other request has begun drawing it again already
  return begun
    ? joined(begun, () => (drawing.get(a.locale) === begun ? draw(a, key) : frameOf(a)))
    : draw(a, key);
}

function draw(a: Asked, key: Request): Promise<string | null> {
  const mine = drawFrame(a, key);
  drawing.set(a.locale, mine);
  const done = () => {
    if (drawing.get(a.locale) === mine) drawing.delete(a.locale);
  };
  mine.then(done, done);
  return mine;
}

async function drawFrame(a: Asked, key: Request): Promise<string | null> {
  const address = new URL(localizePath(FRAME, a.locale), a.url.origin);
  const response = await a
    .app(new Request(address, { headers: { Accept: "text/html" } }))
    .catch(() => null);
  // a render that breaks off once it has begun fails as one that throws
  const html = response?.status === 200 ? await response.text().catch(() => null) : null;
  if (html === null) {
    // its own answer passes no count of the pipeline's, so the owner's alert hears of it here, once a minute
    frames.set(a.locale, { html: null, until: Date.now() + UNDRAWN_MS });
    const status = response && response.status !== 200 ? response.status : 500;
    countUsage(a.env, "failure", String(status), "frame");
    return null;
  }
  if (a.locale === DEFAULT_LOCALE || translate(a.locale, "Saved palettes") !== "Saved palettes") {
    const until = Date.now() + FRAME_MS;
    frames.set(a.locale, { html, until });
    const copy = new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${FRAME_MS / 1000}`,
        [UNTIL]: String(until)
      }
    });
    a.ctx.waitUntil(Promise.resolve(cacheOf()?.put(key, copy)).catch(() => {}));
  }
  return html;
}

/** One answer in twenty, weighted twenty, in the site's counts (usage/count.ts `render`): written here, as the shared
    counter weighs every point one. Counting never fails a request. */
function tally(a: Asked, what: What, lane: Lane, answer: Answer): void {
  if (!a.env.USAGE || Math.random() * SAMPLED >= 1) return;
  a.ctx.waitUntil(
    kindOf(a, what)
      .then(kind =>
        a.env.USAGE?.writeDataPoint({
          indexes: ["render"],
          blobs: ["render", what, lane, answer, kind],
          doubles: [SAMPLED]
        })
      )
      .catch(() => {})
  );
}

/** The kind of page (visits.ts) or of data, as the router reads its address, whatever its case: an API by its path, the
    search's JSON at any of its addresses, any of its pictures, and any other address of a list, whose words stay out of
    the counts. */
async function kindOf(a: Asked, what: What): Promise<string> {
  if (what === "data") {
    const path = a.path.toLowerCase();
    if (a.reads.searchJsonPath(path)) return "search";
    if (a.reads.searchPicturePath(path, a.url.searchParams)) return "picture";
    return path.startsWith("/api/") ? path.slice(1) : "list";
  }
  const { pageKind } = await import("./visits/visits.ts");
  return pageKind(a.path, a.url.searchParams);
}
