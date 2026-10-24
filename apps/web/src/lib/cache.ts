/* How long each kind of answer may be kept: `Cache-Control` for the browser, `CDN-Cache-Control` for the Worker's
   edge cache (server/edge-cache.ts), which keeps only a public 200 or 301 with a positive lifetime. A page or a route
   declares its class with `headers: () => PAGE`; the Worker answers every other status but such a 301, and every
   private address, no-store. */

/** A page links one build's scripts, which the next deploy replaces, so a browser asks again every time. */
const REVALIDATE = "public, max-age=0, must-revalidate";

export const NO_STORE = { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" } as const;
/** A public page: five minutes at the edge. */
export const PAGE = { "Cache-Control": REVALIDATE, "CDN-Cache-Control": "max-age=300" } as const;
/** A palette's page, which only its seed and view decide: a day at the edge. */
export const PALETTE_PAGE = {
  "Cache-Control": REVALIDATE,
  "CDN-Cache-Control": "max-age=86400"
} as const;
/** A public list's page: half an hour at the edge, as the gallery's (features/gallery/load.ts). The app reads the list's
    data apart, which stays fresher. */
export const LIST_PAGE = {
  "Cache-Control": REVALIDATE,
  "CDN-Cache-Control": "max-age=1800"
} as const;
/** A list's page in an order that moves (Rising): ten minutes at the edge. */
export const MOVING_LIST_PAGE = {
  "Cache-Control": REVALIDATE,
  "CDN-Cache-Control": "max-age=600"
} as const;
/** What changed lately (Rising): a minute at the edge, so a like shows within the minute. */
export const FRESH = { "Cache-Control": REVALIDATE, "CDN-Cache-Control": "max-age=60" } as const;
/** Who a palette credits: half a minute at the edge, which a page that reaches the palette again asks again after, so
    a name its account takes back leaves within the minute. */
export const CREDIT_SECONDS = 30;
export const CREDIT = {
  "Cache-Control": REVALIDATE,
  "CDN-Cache-Control": `max-age=${CREDIT_SECONDS}`
} as const;
/** A palette's own file: its address decides every byte, so a browser keeps it a month. */
export const FILE = {
  "Cache-Control": "public, max-age=2592000",
  "CDN-Cache-Control": "max-age=604800"
} as const;
/** Where an old link no map holds leads, which its fit decides for good: a month at the edge, and a day in the
    browser, so a map that comes to hold the link leads there within the day. */
export const FITTED = {
  "Cache-Control": "public, max-age=86400",
  "CDN-Cache-Control": "max-age=2592000"
} as const;
/** Text for agents and crawlers (robots.txt, llms.txt, Markdown). */
export const TEXT = {
  "Cache-Control": "public, max-age=3600",
  "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400"
} as const;

/** A page drawn from data cached apart: kept at the edge only while that data stays fresh, never longer, and by no
    cache at all when it may not be kept (a failed read, a crawler's search). */
export const edgeFor = (seconds: number) =>
  seconds >= 1
    ? { "Cache-Control": REVALIDATE, "CDN-Cache-Control": `max-age=${Math.floor(seconds)}` }
    : NO_STORE;
