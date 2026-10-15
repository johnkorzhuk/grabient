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
/** What changed lately (Rising): a minute at the edge, so a like shows within the minute. */
export const FRESH = { "Cache-Control": REVALIDATE, "CDN-Cache-Control": "max-age=60" } as const;
/** A palette's own file: its address decides every byte, so a browser keeps it a month. */
export const FILE = {
  "Cache-Control": "public, max-age=2592000",
  "CDN-Cache-Control": "max-age=604800"
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
