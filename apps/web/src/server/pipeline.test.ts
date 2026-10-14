import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => Object.assign(globalThis, { __BUILD_ID__: "b1" }));

import { decodePalette, encodePalette } from "@grabient/engine";
import type { Env } from "@grabient/server/env.ts";
import migrated from "../../data/legacy-k.json" with { type: "json" };
import links from "../../data/legacy-links.json" with { type: "json" };
import { PAGE } from "../lib/cache.ts";
import { canonicalRedirect } from "./canonical.ts";
import { handle, misdeployed } from "./pipeline.ts";

/** The Cache API of one data center, in memory. */
function memoryCache() {
  const kept = new Map<string, { body: ArrayBuffer; init: ResponseInit }>();
  return {
    kept,
    async match(request: Request) {
      const hit = kept.get(request.url);
      return hit && new Response(hit.body, hit.init);
    },
    async put(request: Request, response: Response) {
      kept.set(request.url, {
        body: await response.arrayBuffer(),
        init: { status: response.status, headers: response.headers }
      });
    }
  };
}

let cache: ReturnType<typeof memoryCache>;
let asked: Request[];
const waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
/** What the Worker counted, as Analytics Engine would hold it. */
let counted: string[];
const env = {
  DEPLOYMENT: "staging",
  USAGE: {
    writeDataPoint: (point: { blobs: string[] }) => void counted.push(point.blobs.join(" "))
  }
} as unknown as Env;

beforeEach(() => {
  cache = memoryCache();
  vi.stubGlobal("caches", { default: cache });
  asked = [];
  counted = [];
});

const page = (status = 200, headers: Record<string, string> = PAGE) =>
  new Response("<!DOCTYPE html><p>page</p>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });

/** The Worker's answer to `path`, with Start answering `app`'s way. */
async function get(
  path: string,
  init: RequestInit = {},
  app: (request: Request) => Response = () => page(),
  worker: Env = env
) {
  const response = await handle(
    new Request(`https://grabient.test${path}`, init),
    worker,
    ctx,
    async request => {
      asked.push(request);
      return app(request);
    }
  );
  await Promise.all(waits.splice(0));
  return response;
}
const location = (response: Response) =>
  response.headers.get("Location")?.replace("https://grabient.test", "");

test("grabient.com is answered only by the deploy made for it", async () => {
  expect(misdeployed({ DEPLOYMENT: "staging" }, "staging.grabient.com")).toBeNull();
  const production = {
    DEPLOYMENT: "production",
    PUBLIC_ORIGIN: "https://grabient.com",
    BETTER_AUTH_URL: "https://grabient.com"
  } as const;
  expect(misdeployed(production, "grabient.com")).toBeNull();
  expect(misdeployed({ ...production, PUBLIC_ORIGIN: undefined }, "www.grabient.com")).toBe(
    "PUBLIC_ORIGIN is unset, not https://grabient.com"
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await handle(new Request("https://grabient.com/"), env, ctx, async () => page());
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("300");
  expect(await response.text()).toBe(
    'This deploy is not configured for grabient.com: DEPLOYMENT is "staging", not "production". Deploy with `cf deploy --mode production`.\n'
  );
});

describe("the language in the address", () => {
  test.each([
    ["/JA/palettes?page=2", "/ja/palettes?page=2"],
    ["/en/palettes", "/palettes"],
    ["/en", "/"],
    ["/ja/", "/ja"],
    ["/palettes/", "/palettes"],
    ["/about//", "/about"],
    ["/ja/palettes/?q=blue", "/ja/palettes?q=blue"]
  ])("%s is written %s", async (from, to) => {
    const response = await get(from);
    expect([response.status, location(response)]).toEqual([301, to]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(asked).toEqual([]);
  });

  test.each([
    "/ja/api/hot",
    "/ja/kS7Q8Yy5S_SChv0.png",
    "/api/hot/",
    "/ja/e/s/",
    "/_serverFn/abc",
    "/_serverFn/%3Cscript%3E",
    "/ja/_serverFn"
  ])("%s is 404 JSON", async path => {
    const response = await get(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(asked).toEqual([]);
  });

  test("Start's server functions, of which the app has none, are no address for any method", async () => {
    const posted = await get("/_serverFn/eyJ0ZXN0IjoxfQ", { method: "POST", body: "{}" });
    expect([posted.status, asked]).toEqual([404, []]);
  });

  test("the recorder's addresses reach Start as PostHog's library writes them, last slash and all", async () => {
    const recorded = () => new Response(null, { status: 204 });
    const posted = await get("/e/s/?ip=0&ver=1", { method: "POST", body: "{}" }, recorded);
    expect(posted.status).toBe(204);
    await get("/e/static/recorder.js", {}, recorded);
    expect(
      asked.map(request => new URL(request.url).pathname + new URL(request.url).search)
    ).toEqual(["/e/s/?ip=0&ver=1", "/e/static/recorder.js"]);
  });
});

describe("an arrival's language", () => {
  const html = { Accept: "text/html" };
  test("a browser asking for Japanese is sent there, before any cache", async () => {
    const response = await get("/palettes?q=blue", {
      headers: { ...html, "Accept-Language": "ja,en;q=0.8" }
    });
    expect([response.status, location(response)]).toEqual([302, "/ja/palettes?q=blue"]);
    expect(response.headers.get("Vary")).toBe("Accept-Language, Cookie");
    expect(cache.kept.size).toBe(0);
  });
  test("the language chosen in the menu wins over the browser's", async () => {
    const response = await get("/", {
      headers: { ...html, "Accept-Language": "ja", Cookie: "grabient-locale=fr" }
    });
    expect(location(response)).toBe("/fr");
  });
  test.each([
    ["a click inside the site", { "Sec-Fetch-Site": "same-origin" }],
    ["a link from the site without Sec-Fetch-Site", { Referer: "https://grabient.test/about" }],
    ["a crawler", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }],
    ["a reader who chose English", { Cookie: "grabient-locale=en" }]
  ])("%s stays in English", async (_, headers) => {
    const response = await get("/palettes", {
      headers: { ...html, "Accept-Language": "ja", ...headers }
    });
    expect(response.status).toBe(200);
  });
});

test("the canonical rules: the first that knows an address decides, and the same address is no redirect", () => {
  const rules = [
    (address: string) => (address.startsWith("/k") ? address.replace("?steps=7", "") : null),
    () => "/never"
  ];
  expect(canonicalRedirect("/kAbc?steps=7", rules)).toBe("/kAbc");
  expect(canonicalRedirect("/kAbc", rules)).toBeNull();
  expect(canonicalRedirect("/about", rules)).toBe("/never");
  expect(canonicalRedirect("/about")).toBeNull();
});

describe("an old grabient.com link", () => {
  test.each([
    [
      "/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu/edit?steps=9&angle=120",
      "/kY4mpDazO-mUuu_fuLqXU49dvVP6?steps=9&angle=120",
      "mapped"
    ],
    [
      "/LQBgdAjALAHANGAbBECoFZ6kgJldnCAZgRxhOyJwvChH3B3UTmwgE51XwUXt6IQA",
      "/kWiWqwzCq9lYquzeObz4Ma-w",
      "mapped"
    ],
    [
      "/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA?ref=hackernoon.com&page=6&style=linearSwatches",
      "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb?style=linearSwatches&ref=hackernoon.com",
      "fitted"
    ],
    ["/ja/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu", "/ja/kY4mpDazO-mUuu_fuLqXU49dvVP6", "mapped"]
  ])("%s leads to %s", async (from, to, via) => {
    const response = await get(from);
    expect([response.status, location(response)]).toEqual([301, to]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(asked).toEqual([]);
    expect(counted).toEqual([`legacy ${via} reader`]);
  });

  test("every id the maps hold leads to its palette's canonical address", () => {
    const maps: Record<string, string>[] = [migrated, links];
    let checked = 0;
    for (const map of maps) {
      for (const [id, seed] of Object.entries(map)) {
        const palette = decodePalette(seed);
        if (!palette) throw new Error(`${id} is mapped to ${seed}, which is no palette`);
        const steps = palette.anchors.length > 7 ? `?steps=${palette.anchors.length}` : "";
        expect([id, canonicalRedirect(`/${id}`)]).toEqual([
          id,
          `/${encodePalette(palette)}${steps}`
        ]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(6000);
  });

  test("an old id no map holds is its own page, for the reader's browser to fit", async () => {
    const response = await get("/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa");
    expect(response.status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(counted).toEqual(["legacy fitted reader"]);
  });
});

describe("the edge cache", () => {
  test("keeps a public page and answers the next request from it", async () => {
    const first = await get("/about");
    expect(first.headers.get("X-Grabient-Cache")).toBe("MISS");
    const second = await get("/about?x=1&utm_source=news");
    expect(second.headers.get("X-Grabient-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(await second.text()).toBe("<!DOCTYPE html><p>page</p>");
    expect(asked).toHaveLength(1);
    expect([...cache.kept.keys()]).toEqual(["https://grabient.test/about?__build=b1"]);
  });

  test("keys a page by its language and by what the server draws", async () => {
    await get("/palettes?page=2&selection");
    await get("/ja/palettes?page=2&selection");
    expect([...cache.kept.keys()]).toEqual([
      "https://grabient.test/palettes?__build=b1&page=2",
      "https://grabient.test/ja/palettes?__build=b1&page=2"
    ]);
  });

  test("a HEAD reads what a GET kept and keeps nothing itself", async () => {
    const miss = await get("/about", { method: "HEAD" });
    expect(miss.headers.get("X-Grabient-Cache")).toBe("MISS");
    expect(cache.kept.size).toBe(0);
    await get("/about");
    const hit = await get("/about", { method: "HEAD" });
    expect(hit.headers.get("X-Grabient-Cache")).toBe("HIT");
    expect(await hit.text()).toBe("");
  });

  test("answers 304 to a matching If-None-Match", async () => {
    await get("/about", {}, () => page(200, { ...PAGE, ETag: '"v1"' }));
    const response = await get("/about", { headers: { "If-None-Match": '"v1"' } });
    expect(response.status).toBe(304);
  });

  test.each([
    ["an error", () => page(404)],
    ["a cookie", () => page(200, { ...PAGE, "Set-Cookie": "a=1" })],
    ["a Vary", () => page(200, { ...PAGE, Vary: "Cookie" })],
    ["no lifetime", () => page(200, {})],
    ["a private answer", () => page(200, { "Cache-Control": "private, max-age=60" })]
  ])("never keeps %s", async (_, app) => {
    await get("/about", {}, app);
    await get("/about", {}, app);
    expect(cache.kept.size).toBe(0);
    expect(asked).toHaveLength(2);
  });

  test("keeps every address of one file under one key, which no stray parameter enters", async () => {
    const png = () => new Response("png", { headers: { ...PAGE, "Content-Type": "image/png" } });
    await get("/api/png?seed=kS7Q8Yy5S_SChv0&junk=1", {}, png);
    const beside = await get("/kS7Q8Yy5S_SChv0.png?amp;junk=2", {}, png);
    expect(beside.headers.get("X-Grabient-Cache")).toBe("HIT");
    // a picture's key names the card version in place of the build: a deploy does not draw it again
    expect([...cache.kept.keys()]).toEqual([
      "https://grabient.test/kS7Q8Yy5S_SChv0.png?h=630&v=k4&w=1200"
    ]);
    await get("/kS7Q8Yy5S_SChv0.css?steps=7&x=1", {}, png);
    expect([...cache.kept.keys()][1]).toBe("https://grabient.test/kS7Q8Yy5S_SChv0.css?__build=b1");
  });

  test("counts a file fetched before the cache answers it, by its format and who asked", async () => {
    const css = () => new Response("css", { headers: { ...PAGE, "Content-Type": "text/css" } });
    await get("/kS7Q8Yy5S_SChv0.css", { headers: { "Sec-Fetch-Site": "same-origin" } }, css);
    const hit = await get(
      "/kS7Q8Yy5S_SChv0.css",
      { headers: { Referer: "https://example.com/post" } },
      css
    );
    expect(hit.headers.get("X-Grabient-Cache")).toBe("HIT");
    await get("/about");
    expect(counted).toEqual(["file css site reader", "file css other reader"]);
  });

  test("keeps the newsletter's issues by their page and language alone", async () => {
    const issues = () => Response.json({ issues: [] }, { headers: PAGE });
    await get("/api/newsletter?before=2&lang=ja&x=1", {}, issues);
    await get("/api/newsletter?lang=en&before=junk", {}, issues);
    expect([...cache.kept.keys()]).toEqual([
      "https://grabient.test/api/newsletter?__build=b1&before=2&lang=ja",
      "https://grabient.test/api/newsletter?__build=b1"
    ]);
  });

  test("counts every list, search and home it misses against one minute per address", async () => {
    const from = (ip: string) => ({ headers: { "CF-Connecting-IP": ip } });
    // each a canonical address of its own, so none is redirected or kept for another
    const listings = [
      (n: number) => `/palettes?q=w${n}`,
      (n: number) => `/palettes/rising/3m?page=${n + 2}`,
      (n: number) => `/?q=w${n}`,
      (n: number) => `/?page=${n + 2}`,
      (n: number) => `/collections?q=w${n}`,
      (n: number) => `/collections/rising?page=${n + 2}`,
      (n: number) => `/api/hot?q=w${n}`,
      (n: number) => `/api/collections?page=${n + 2}`,
      (n: number) => `/api/search.json?query=w${n}`,
      (n: number) => `/search/w${n}.json`,
      (n: number) => `/api/palettes?page=${n + 100}`
    ];
    for (let n = 0; n < 60; n++) {
      const response = await get(listings[n % listings.length](n), from("203.0.113.7"));
      expect(response.status).toBe(200);
    }
    expect(asked).toHaveLength(60);
    const kept = await get("/palettes?q=w0", from("203.0.113.7"));
    expect(kept.headers.get("X-Grabient-Cache")).toBe("HIT");
    expect((await get("/about", from("203.0.113.7"))).status).toBe(200);
    // the list API, which the edge never holds, counts every read
    for (const listing of ["/collections?q=more", "/api/palettes?page=100"]) {
      const refused = await get(listing, from("203.0.113.7"));
      expect([refused.status, await refused.json()]).toEqual([
        429,
        { error: "Too many requests. Try again later." }
      ]);
      expect(refused.headers.get("Retry-After")).toBe("60");
      expect(refused.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(asked).toHaveLength(61);
    expect(counted).toContain("limit listMiss client");
    expect((await get("/collections?q=more", from("203.0.113.8"))).status).toBe(200);
    // under `vite dev` nothing is counted
    const development = { ...env, DEPLOYMENT: "development" } as Env;
    const dev = await get("/collections?q=more", from("203.0.113.7"), undefined, development);
    expect(dev.status).toBe(200);
  });

  test("never holds a private page, which answers no-store", async () => {
    const response = await get("/settings");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(cache.kept.size).toBe(0);
  });
});

test("the MCP and authorization servers answer their own addresses as they stand, kept by no cache", async () => {
  const metadata = () =>
    Response.json({ issuer: "x" }, { headers: { "Cache-Control": "public, max-age=300" } });
  const first = await get("/.well-known/oauth-authorization-server", {}, metadata);
  await get("/.well-known/oauth-authorization-server", {}, metadata);
  expect(first.headers.get("Cache-Control")).toBe("public, max-age=300");
  expect([asked.length, cache.kept.size]).toEqual([2, 0]);
  const accept = "application/json, text/event-stream";
  await get("/mcp", { method: "POST", headers: { Accept: accept } }, () => Response.json({}));
  expect(asked[2].headers.get("Accept")).toBe(accept);
  const token = await get("/oauth/token", { method: "POST" }, () => Response.json({ a: 1 }));
  expect(token.headers.get("Cache-Control")).toBe("private, no-store");
});

test("campaign tags never reach Start and ride every same-origin redirect", async () => {
  await get("/about?utm_source=news&fbclid=x&q=1");
  expect(asked[0].url).toBe("https://grabient.test/about?q=1");
  const response = await get("/palettes/?utm_source=news", {}, () => page());
  expect(location(response)).toBe("/palettes?utm_source=news");
  const started = await get("/x/edit?gclid=g", {}, () =>
    Response.redirect("https://grabient.test/x", 301)
  );
  expect(location(started)).toBe("/x?gclid=g");
});

test("only a server route takes another method than GET and HEAD", async () => {
  // a page is refused before it renders, so no method makes it draw or search again
  for (const [path, method] of [
    ["/palettes?q=%23a1b2c3", "POST"],
    ["/about", "PUT"],
    ["/kY4mpDazO-mUuu_fuLqXU49dvVP6", "DELETE"],
    ["/ja/settings", "PATCH"],
    ["/unsubscribe/abc", "PUT"]
  ]) {
    const refused = await get(path, { method });
    expect([path, refused.status, refused.headers.get("Allow")]).toEqual([path, 405, "GET, HEAD"]);
    expect(await refused.json()).toEqual({ error: "Method not allowed" });
  }
  expect(asked).toEqual([]);
  // the newsletter's way out takes its press as a POST
  const unsubscribed = await get("/unsubscribe/abc", { method: "POST" }, () => Response.json({}));
  expect([unsubscribed.status, asked.length]).toEqual([200, 1]);
  // a file's route that takes no POST, where Start would render a page instead
  expect((await get("/kS7Q8Yy5S_SChv0.png", { method: "POST" })).status).toBe(405);
  const preflight = await get("/kS7Q8Yy5S_SChv0.json", { method: "OPTIONS" });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
});

test("a page asked for without HTML in Accept is given HTML among what it accepts", async () => {
  await get("/about", { headers: { Accept: "application/json" } });
  expect(asked[0].headers.get("Accept")).toBe("application/json, */*;q=0.1");
});

test("every answer carries the site's headers", async () => {
  const response = await get("/about");
  expect(Object.fromEntries(response.headers)).toMatchObject({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy":
      "frame-ancestors 'self' https://cssgradient.io https://*.cssgradient.io",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-robots-tag": "noindex, nofollow",
    "server-timing": 'build;desc="b1"'
  });
  // production at grabient.com alone is indexed: its files keep the noindex of their own, and its pages carry none
  const production = { DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://grabient.com" } as Env;
  expect((await get("/about", {}, undefined, production)).headers.has("X-Robots-Tag")).toBe(false);
  const data = () => Response.json({}, { headers: { ...PAGE, "X-Robots-Tag": "noindex" } });
  expect((await get("/api/x", {}, data, production)).headers.get("X-Robots-Tag")).toBe("noindex");
  expect((await get("/api/x", {}, data)).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  const elsewhere = { DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://example.com" } as Env;
  expect((await get("/terms", {}, undefined, elsewhere)).headers.get("X-Robots-Tag")).toBe(
    "noindex, nofollow"
  );
  const consent = await get("/unsubscribe/abc");
  expect(Object.fromEntries(consent.headers)).toMatchObject({
    "content-security-policy": "frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cache-control": "private, no-store"
  });
  const file = await get("/kS7Q8Yy5S_SChv0.png", {}, () => new Response("png"));
  expect(file.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test("no browser keeps a redirect, but for the minutes a picture's stand-in names", async () => {
  const to = (headers: Record<string, string>) => () =>
    new Response(null, { status: 302, headers: { Location: "/grabient.png", ...headers } });
  const standIn = await get(
    "/api/og?seed=kS7Q8Yy5S_SChv0",
    {},
    to({ "Cache-Control": "public, max-age=300", "CDN-Cache-Control": "no-store" })
  );
  expect([
    standIn.headers.get("Cache-Control"),
    standIn.headers.get("CDN-Cache-Control"),
    cache.kept.size
  ]).toEqual(["public, max-age=300", "no-store", 0]);
  const others: Record<string, string>[] = [{}, PAGE, { "Cache-Control": "public, max-age=300" }];
  for (const headers of others) {
    expect((await get("/random", {}, to(headers))).headers.get("Cache-Control")).toBe("no-store");
  }
  const moved = () =>
    new Response(null, {
      status: 301,
      headers: {
        Location: "/x",
        "Cache-Control": "public, max-age=300",
        "CDN-Cache-Control": "no-store"
      }
    });
  expect((await get("/api/y", {}, moved)).headers.get("Cache-Control")).toBe("no-store");
});

test("a refusal that names no wait of its own says a minute", async () => {
  // the search's allowance spent: the page renders what it could, and says so with its status
  const limited = await get("/palettes?q=zqxwv", {}, () => page(429, {}));
  expect([limited.status, limited.headers.get("Retry-After")]).toEqual([429, "60"]);
  const waits = () => Response.json({}, { status: 429, headers: { "Retry-After": "7" } });
  expect((await get("/api/me/search?q=x", {}, waits)).headers.get("Retry-After")).toBe("7");
});

test("a failure is a 500 no cache keeps, logged with its stack", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await get("/about", {}, () => {
    throw new Error("boom");
  });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Something went wrong. Try again." });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(log).toHaveBeenCalledWith(
    "Request failed",
    "GET",
    "/about",
    "Error: boom",
    expect.stringContaining("at ")
  );
});
