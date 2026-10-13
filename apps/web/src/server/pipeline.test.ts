import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => Object.assign(globalThis, { __BUILD_ID__: "b1" }));

import type { Env } from "@grabient/server/env.ts";
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
const env = { DEPLOYMENT: "staging" } as Env;

beforeEach(() => {
  cache = memoryCache();
  vi.stubGlobal("caches", { default: cache });
  asked = [];
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

  test.each(["/ja/api/hot", "/ja/kS7Q8Yy5S_SChv0.png", "/api/hot/"])(
    "%s is 404 JSON",
    async path => {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
    }
  );
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
    await get("/palettes?selection&page=2");
    await get("/ja/palettes?page=2&lock=hue");
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

  test("never holds a private page, which answers no-store", async () => {
    const response = await get("/settings");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(cache.kept.size).toBe(0);
  });
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
  const post = await get("/palettes", { method: "POST" });
  expect(post.status).toBe(405);
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
  const production = await get("/about", {}, undefined, { DEPLOYMENT: "production" } as Env);
  expect(production.headers.has("X-Robots-Tag")).toBe(false);
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
