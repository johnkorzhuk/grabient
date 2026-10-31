import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => Object.assign(globalThis, { __BUILD_ID__: "b1" }));

import type { Env } from "@grabient/server/env.ts";
import { limiterName } from "@grabient/server/limits/check.ts";
import { LIMITS, type LimitName } from "@grabient/server/limits/config.ts";
import { RateLimiter } from "@grabient/server/limits/rate-limiter.ts";
import ja from "../../../../packages/i18n/messages/ja.json" with { type: "json" };
import { NO_STORE, PAGE } from "../lib/cache.ts";
import type { App } from "./pipeline.ts";

/* The site's ceilings on work no cache holds (ceiling.ts), driven through the Worker's pipeline as pipeline.test.ts
   drives it. Each test is a new isolate: its modules load anew, so nothing this one learned carries to the next. */

const NOW = Date.UTC(2026, 9, 30, 12);
const FORCED = { "X-Grabient-Ceiling": "spent" };
const ENFORCED: Rows = { flags: [{ name: "draw-past-ceiling", enabled: 0 }] };
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const OLD = "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa";
const FITTED = "/kYq5wTxGc3MlDuPtT7O58281NAs8";
const frameKey = (locale: string) =>
  `https://grabient.test/.grabient-cache/frame/${locale}?build=b1`;
const markOf = (pool: LimitName, requests: number = LIMITS[pool].requests) =>
  `https://grabient.test/.grabient-cache/ceiling/${pool}?requests=${requests}`;
const MARK = markOf("pageRender");
/** A pool's word as another isolate of the data center left it: spent for the whole window. */
const spentMark = () =>
  new Response(null, {
    headers: { "Cache-Control": "public, max-age=600", "X-Reset": String(NOW / 1000 + 600) }
  });

/** The Cache API of one data center, in memory. */
function memoryCache() {
  const kept = new Map<string, { body: ArrayBuffer; init: { status: number; headers: Headers } }>();
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

/** The RateLimiter objects of one deploy over memory, which every isolate asks, each ask recorded as "limit n". They
    answer as they do, or fail, or answer 500, or never answer; `held` holds every answer until it settles. */
function objects() {
  const stored = new Map<string, Map<string, unknown>>();
  const asks: string[] = [];
  const state: { answer: "as they do" | "failing" | "500" | "never"; held?: Promise<void> } = {
    answer: "as they do"
  };
  const storageOf = (id: string) => {
    const data = stored.get(id) ?? new Map<string, unknown>();
    stored.set(id, data);
    return data;
  };
  const objectOf = (id: string) => {
    const data = storageOf(id);
    const storage = {
      get: async (keys: string[]) =>
        new Map(
          keys.flatMap(key => (data.has(key) ? [[key, structuredClone(data.get(key))]] : []))
        ),
      put: async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) data.set(key, structuredClone(value));
      }
    };
    return new RateLimiter({ storage } as unknown as DurableObjectState);
  };
  /** The binding as one isolate holds it, whose memory of the limits starts empty. */
  const isolate = () =>
    ({
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (url: URL) => {
          asks.push(
            `${url.searchParams.getAll("type").join("+")} ${url.searchParams.get("n") ?? 1}`
          );
          await state.held;
          if (state.answer === "failing") throw new Error("The object is unreachable");
          if (state.answer === "500") return new Response("", { status: 500 });
          if (state.answer === "never") return new Promise<Response>(() => {});
          return objectOf(id).fetch(new Request(url));
        }
      })
    }) as unknown as DurableObjectNamespace;
  /** A limit spent for its window, as other isolates left it. */
  const spend = async (identifier: string, name: LimitName) =>
    storageOf(await limiterName(identifier)).set(name, {
      count: LIMITS[name].requests,
      resetTime: Date.now() + LIMITS[name].window * 1000
    });
  return { asks, state, isolate, spend };
}

interface Rows {
  flags?: { name: string; enabled: number }[];
  /** what lives at a one-segment address */
  visibility?: "public" | "private" | null | "unreadable";
}
/** A database that holds these flags and this collection, and reads nothing else. */
function database(rows: Rows = {}) {
  const statement = (query: string) => {
    const read = {
      bind: () => read,
      all: async () => {
        if (!query.includes("k_flags")) return { results: [] };
        await flagsRead;
        return { results: rows.flags ?? [] };
      },
      first: async () => {
        if (!query.includes("k_collections")) return null;
        if (rows.visibility === "unreadable") throw new Error("D1 is unavailable");
        return rows.visibility ? { visibility: rows.visibility } : null;
      }
    };
    return read;
  };
  const db = { prepare: statement, withSession: () => db };
  return db as unknown as D1Database;
}

let cache: ReturnType<typeof memoryCache>;
let asked: Request[];
/** Whether each page drawn found the newsletter on, as it read the flags. */
let newsletters: boolean[];
let points: string[];
let frameStatus: number;
/** Whether the frame's render breaks off once its answer has begun, as one that throws mid-stream. */
let frameBreaks: boolean;
/** How many of the next draws of the frame never answer, as a draw whose reader hung up. */
let framesStalled: number;
/** What every draw of the frame waits for before it answers, and every read of the flags. */
let frameGate: Promise<void> | undefined;
let flagsRead: Promise<void> | undefined;
const waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
const settled = async () => {
  while (waits.length) await Promise.all(waits.splice(0));
};
/** A body that breaks off before any of it is read. */
const brokenOff = () =>
  new ReadableStream({ start: controller => controller.error(new Error("the stream broke off")) });

/** The accounts a session cookie stands for, each session the ceiling asked the site's own check about, the sessions
    whose check never answers, as a database read that hangs, and those whose check its address's allowance refuses. */
const accounts = {
  byToken: new Map<string, string>(),
  asked: [] as string[],
  stalled: new Set<string>(),
  refused: new Set<string>()
};

/** Start for a deploy: the session check, the frame (Saved's document) in its language, and every other address a
    page, which reads the flags first, as the root's loader does (server/site/facts.ts). */
const appOf =
  (worker: Env): App =>
  async request => {
    asked.push(request);
    const { pathname, search } = new URL(request.url);
    const headers = { "Content-Type": "text/html; charset=utf-8" };
    if (pathname === "/api/auth/get-session") {
      const token = /session_token=([^;]*)/.exec(request.headers.get("Cookie") ?? "")?.[1] ?? "";
      // the session read as it stands: a check that could extend it is no check the ceiling makes
      accounts.asked.push(search === "?disableRefresh=true" ? token : `${token} ${search}`);
      if (accounts.stalled.has(token)) return new Promise<Response>(() => {});
      if (accounts.refused.has(token)) return Response.json({ error: "" }, { status: 429 });
      const id = accounts.byToken.get(token);
      return Response.json(id ? { user: { id, name: "" } } : null, { headers: NO_STORE });
    }
    if (!pathname.startsWith("/api/")) newsletters.push(!(await flagOff(worker, "newsletter")));
    if (pathname.endsWith("/palettes/saved")) {
      if (framesStalled > 0 && framesStalled--) return new Promise<Response>(() => {});
      await frameGate;
      const body = frameBreaks ? brokenOff() : `<!DOCTYPE html><p>the frame at ${pathname}</p>`;
      return new Response(body, { status: frameStatus, headers: { ...NO_STORE, ...headers } });
    }
    // an address no route serves, which Start answers with its not-found page
    if (pathname.endsWith(".php"))
      return new Response("<!DOCTYPE html><p>not found</p>", {
        status: 404,
        headers: { ...NO_STORE, ...headers }
      });
    return new Response("<!DOCTYPE html><p>page</p>", { headers: { ...PAGE, ...headers } });
  };

const envOf = (limiter: DurableObjectNamespace, rows: Rows = {}, values: Partial<Env> = {}) =>
  ({
    DEPLOYMENT: "staging",
    DB: database(rows),
    RATE_LIMITER: limiter,
    USAGE: {
      writeDataPoint: (point: { blobs: string[] }) => void points.push(point.blobs.join(" "))
    },
    ...values
  }) as unknown as Env;

let handle: typeof import("./pipeline.ts").handle;
let flagOff: typeof import("@grabient/server/flags/flags.ts").flagOff;
/** Another isolate: the modules loaded anew, with the Japanese words. */
async function freshIsolate() {
  vi.resetModules();
  const { addCatalog, messageKey } = await import("@grabient/i18n");
  addCatalog(
    "ja",
    Object.fromEntries(
      Object.entries(ja as Record<string, string>).map(([english, words]) => [
        messageKey(english),
        words
      ])
    )
  );
  ({ handle } = await import("./pipeline.ts"));
  ({ flagOff } = await import("@grabient/server/flags/flags.ts"));
}

type Sent = RequestInit & { cf?: Record<string, unknown> };
function requestOf(path: string, init: Sent = {}) {
  const { cf, ...rest } = init;
  const request = new Request(`https://grabient.test${path}`, rest);
  if (cf) Object.defineProperty(request, "cf", { value: cf });
  return request;
}
/** The Worker's answer to `path`, as soon as it is given. */
const answerOf = (path: string, init: Sent | undefined, worker: Env) =>
  handle(requestOf(path, init), worker, ctx, appOf(worker));
/** The Worker's answer to `path`, once the counting after it has settled. */
async function get(path: string, init: Sent, worker: Env) {
  const response = await answerOf(path, init, worker);
  await settled();
  return response;
}
const from = (ip: string, headers: Record<string, string> = {}) => ({
  headers: { "CF-Connecting-IP": ip, ...headers }
});
const signedIn = (token: string, headers: Record<string, string> = {}) => ({
  headers: { Cookie: `__Secure-better-auth.session_token=${token}`, ...headers }
});
const shown = (response: Response) => [response.status, response.headers.get("X-Grabient-Cache")];
const location = (response: Response) =>
  response.headers.get("Location")?.replace("https://grabient.test", "");

beforeEach(async () => {
  cache = memoryCache();
  vi.stubGlobal("caches", { default: cache });
  asked = [];
  newsletters = [];
  points = [];
  frameStatus = 200;
  frameBreaks = false;
  framesStalled = 0;
  frameGate = undefined;
  flagsRead = undefined;
  accounts.byToken.clear();
  accounts.asked = [];
  accounts.stalled.clear();
  accounts.refused.clear();
  // the clock stands still unless a test moves it, so every wait is whole seconds
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // no answer is sampled for the counts unless a test says
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  await freshIsolate();
});

afterEach(async () => {
  await settled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("./ceiling.ts");
});

test("counts each page drawn for a reader as its answer starts, and keeps the page as before", async () => {
  const limits = objects();
  let answer = () => {};
  limits.state.held = new Promise(resolve => (answer = resolve));
  const worker = envOf(limits.isolate());
  const response = await answerOf("/palettes?q=x", {}, worker);
  // answered while the limiter has not
  expect(shown(response)).toEqual([200, "MISS"]);
  await vi.waitFor(() => expect(limits.asks).toEqual(["pageRender 1"]));
  answer();
  await settled();
  const again = await get("/palettes?q=x", {}, worker);
  expect(shown(again)).toEqual([200, "HIT"]);
  expect(limits.asks).toEqual(["pageRender 1"]);
  expect(points).toEqual([]);
});

test("past the ceiling, the frame as a 503 for every reader with no priority, drawn once per build and language", async () => {
  const limits = objects();
  await limits.spend("page-render", "pageRender");
  const worker = envOf(limits.isolate(), ENFORCED);
  // drawn while this isolate has not heard the pool is spent, which its count then says
  expect(shown(await get("/palettes?q=w", {}, worker))).toEqual([200, "MISS"]);
  const reader = signedIn("no-such-session");
  for (const path of ["/palettes?q=x", "/ja/palettes?q=x", "/palettes?q=y", "/ja/palettes?q=y"]) {
    const response = await get(path, reader, worker);
    expect([path, ...shown(response)]).toEqual([path, 503, "SHELL"]);
    expect(await response.text()).toBe(
      `<!DOCTYPE html><p>the frame at ${path.startsWith("/ja") ? "/ja" : ""}/palettes/saved</p>`
    );
    expect([
      response.headers.get("Retry-After"),
      response.headers.get("X-Grabient-Paused"),
      response.headers.get("Cache-Control"),
      response.headers.get("CDN-Cache-Control"),
      response.headers.get("Content-Type")
    ]).toEqual(["600", "draw-past-ceiling", "no-store", "no-store", "text/html; charset=utf-8"]);
  }
  // Saved's document, asked for once in each language, with no cookie of the reader's
  const frames = asked.filter(request => request.url.endsWith("/palettes/saved"));
  expect(frames.map(request => [request.url, request.headers.get("Cookie")])).toEqual([
    ["https://grabient.test/palettes/saved", null],
    ["https://grabient.test/ja/palettes/saved", null]
  ]);
  // kept by its own key in each language, and never under a page's
  expect([...cache.kept.keys()].sort()).toEqual(
    ["https://grabient.test/palettes?__build=b1&q=w", MARK, frameKey("en"), frameKey("ja")].sort()
  );
  expect(cache.kept.get(frameKey("ja"))?.init.headers.get("Cache-Control")).toBe(
    "public, max-age=3600"
  );
  expect(points).not.toContain("failure 503 page");
  expect(limits.asks).toEqual(["pageRender 1"]);
});

test("a frame drawn in a language whose words were not read is shown, and never kept", async () => {
  const limits = objects();
  const worker = envOf(limits.isolate(), ENFORCED);
  for (const path of ["/de/palettes?q=x", "/de/palettes?q=y"])
    expect(shown(await get(path, { headers: FORCED }, worker))).toEqual([503, "SHELL"]);
  expect(asked.filter(request => request.url.endsWith("/palettes/saved"))).toHaveLength(2);
  expect(cache.kept.has(frameKey("de"))).toBe(false);
});

test("a crawler Cloudflare verifies is drawn and never counted, campaign tags or not", async () => {
  const limits = objects();
  await limits.spend("page-render", "pageRender");
  await limits.spend("data-miss", "dataMiss");
  const worker = envOf(limits.isolate(), ENFORCED);
  const crawler = (ip: string) => ({
    ...from(ip, FORCED),
    cf: { verifiedBotCategory: "Search Engine Crawler" }
  });
  for (const path of ["/palettes?q=x&utm_source=y", "/kS7Q8Yy5S_SChv0", "/api/search.json?q=x"])
    expect([path, ...shown(await get(path, crawler("192.0.2.1"), worker))]).toEqual([
      path,
      200,
      "MISS"
    ]);
  expect(limits.asks).toEqual([]);
  // the listings' minute still refuses one as it always has: in JSON, never the frame
  for (let n = 0; n < 60; n++) await get(`/palettes?page=${n + 2}`, crawler("192.0.2.2"), worker);
  const refused = await get("/palettes?page=99", crawler("192.0.2.2"), worker);
  expect([refused.status, await refused.json()]).toEqual([
    429,
    { error: "Too many requests. Try again later." }
  ]);
  expect(limits.asks).toEqual([]);
  /* and at every other place the ceiling stands: a HEAD, a reader's own page, an old link the Worker does not fit, an
     address that may hold a collection, the search's suggestions and its pictures */
  await limits.spend("fit-day", "oldLinkFitDaily");
  for (const [path, init] of [
    ["/palettes?q=z", { method: "HEAD" }],
    ["/settings", {}],
    [OLD, {}],
    ["/blue-sky", {}],
    ["/api/collections/suggest?q=a", {}],
    ["/palettes/blue.png", {}],
    ["/api/og/query?query=blue", {}]
  ] as const) {
    const response = await get(path, { ...crawler("192.0.2.3"), ...init }, worker);
    expect([path, response.status, response.headers.get("X-Grabient-Paused")]).toEqual([
      path,
      200,
      null
    ]);
  }
  // the old link's own fit is all the limiter heard of
  expect(limits.asks.filter(ask => !ask.startsWith("oldLinkFit"))).toEqual([]);
});

describe("a limiter that cannot answer", () => {
  test.each(["failing", "500", "never"] as const)(
    "(%s) leaves every page drawn and no answer waiting, and the isolate counts alone",
    async failure => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const limits = objects();
      limits.state.answer = failure;
      const worker = envOf(limits.isolate(), ENFORCED);
      const at = (n: number) => from(`198.51.${n >> 8}.${n & 255}`);
      const first = await answerOf("/palettes?page=2", at(0), worker);
      expect(shown(first)).toEqual([200, "MISS"]);
      // the ask, made once its object's name is hashed, waits two seconds at most, after the answer
      await vi.waitFor(() => expect(limits.asks).toEqual(["pageRender 1"]));
      await vi.advanceTimersByTimeAsync(2000);
      await settled();
      // for half a minute the isolate asks nothing, and draws three hundred alone
      for (let n = 1; n <= 300; n++)
        expect(shown(await get(`/palettes?page=${n + 2}`, at(n), worker))).toEqual([200, "MISS"]);
      const past = await get("/palettes?page=999", at(999), worker);
      expect(shown(past)).toEqual([503, "SHELL"]);
      expect(limits.asks).toEqual(["pageRender 1"]);
      // then it asks again
      vi.advanceTimersByTime(30_000);
      limits.state.answer = "as they do";
      expect(shown(await get("/palettes?page=1000", at(1000), worker))).toEqual([200, "MISS"]);
      expect(limits.asks).toEqual(["pageRender 1", "pageRender 1"]);
    }
  );

  test("leaves the list API's answer waiting on no look at its record", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const limits = objects();
    limits.state.answer = "failing";
    const worker = envOf(limits.isolate());
    // the ask behind this answer fails, and the isolate counts alone; a read of data has it read the data's word too
    expect(shown(await get("/palettes?page=2", {}, worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/api/search.json?q=a", {}, worker))).toEqual([200, "MISS"]);
    const read = cache.match;
    let release = () => {};
    const looking = new Promise<void>(done => (release = done));
    cache.match = async (request: Request) => {
      if (request.url.includes("/.grabient-cache/list")) await looking;
      return read(request);
    };
    try {
      const answered = answerOf("/api/palettes?page=3", {}, worker).then(
        response => response.status
      );
      const waited = new Promise(done => setTimeout(() => done("waited"), 1000));
      expect(await Promise.race([answered, waited])).toBe(200);
    } finally {
      release();
    }
  });

  test("leaves a reader signed in drawn past the isolate's own count", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    accounts.byToken.set("ada", "user-ada");
    const limits = objects();
    limits.state.answer = "failing";
    const worker = envOf(limits.isolate(), ENFORCED);
    // the first is drawn and its ask fails; the next three hundred are the isolate's own
    for (let n = 0; n <= 300; n++)
      await get(`/palettes?page=${n + 2}`, from(`198.51.${n >> 8}.${n & 255}`), worker);
    const anyone = await get("/palettes?q=after", from("198.51.9.1"), worker);
    expect(shown(anyone)).toEqual([503, "SHELL"]);
    const ada = await get("/palettes?q=hers", signedIn("ada"), worker);
    expect(shown(ada)).toEqual([200, "MISS"]);
    expect(limits.asks).toEqual(["pageRender 1"]);
  });

  test("counts readers signed in apart past the isolate's own count, and past three hundred of theirs gives them the frame", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    accounts.byToken.set("ada", "user-ada");
    const limits = objects();
    limits.state.answer = "failing";
    const worker = envOf(limits.isolate(), ENFORCED);
    const at = (n: number) => `198.51.${n >> 8}.${n & 255}`;
    for (let n = 0; n <= 300; n++) await get(`/palettes?page=${n + 2}`, from(at(n)), worker);
    // one session, from a new address each time
    const ada = (n: number) => signedIn("ada", { "CF-Connecting-IP": at(400 + n) });
    for (let n = 0; n < 300; n++)
      expect(shown(await get(`/palettes?q=a${n}`, ada(n), worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/palettes?q=more", ada(300), worker))).toEqual([503, "SHELL"]);
    expect(limits.asks).toEqual(["pageRender 1"]);
    expect(accounts.asked).toEqual(["ada"]);
  });

  test("past a pool known spent, closes every lane once it fails but readers signed in, counted in the isolate", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    accounts.byToken.set("ada", "user-ada");
    const limits = objects();
    await limits.spend("page-render", "pageRender");
    const worker = envOf(limits.isolate(), ENFORCED);
    const quic = { headers: { "User-Agent": CHROME }, cf: { httpProtocol: "HTTP/3" } };
    // the pool heard spent, and a browser on HTTP/3 drawn from its lane while the limiter answers
    expect(shown(await get("/palettes?q=a", {}, worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/palettes?q=b", quic, worker))).toEqual([200, "MISS"]);
    // the lane's next count fails, and the isolate counts alone
    limits.state.answer = "failing";
    expect(shown(await get("/palettes?q=c", quic, worker))).toEqual([200, "MISS"]);
    const asks = limits.asks.length;
    expect(shown(await get("/palettes?q=d", quic, worker))).toEqual([503, "SHELL"]);
    expect(shown(await get("/palettes?q=e", signedIn("ada"), worker))).toEqual([200, "MISS"]);
    expect(limits.asks).toHaveLength(asks);
  });
});

describe("a one-segment address past the ceiling", () => {
  test.each([
    ["/blue-sky", "/palettes?q=blue+sky"],
    [
      "/blue-sky?style=linearSwatches&steps=6&selection",
      "/palettes?q=blue+sky&style=linearSwatches&steps=6&selection"
    ],
    ["/blue-sky/rising", "/palettes/rising?q=blue+sky"],
    ["/blue-sky?sort=newest", "/palettes/rising?q=blue+sky"],
    ["/ja/blue-sky", "/ja/palettes?q=blue+sky"]
  ])("%s that holds no collection leads to its search, %s, as the page would", async (path, to) => {
    const worker = envOf(objects().isolate(), { ...ENFORCED, visibility: null });
    const response = await get(path, { headers: FORCED }, worker);
    expect([response.status, location(response)]).toEqual([302, to]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(asked).toEqual([]);
  });

  test("that holds a public collection gets the frame, and a private one or a read that fails a page that asks again", async () => {
    const answers: unknown[] = [];
    for (const visibility of ["public", "private", "unreadable"] as const) {
      const worker = envOf(objects().isolate(), { ...ENFORCED, visibility });
      const response = await get("/blue-sky", { headers: FORCED }, worker);
      const body = await response.text();
      answers.push([
        visibility,
        ...shown(response),
        response.headers.get("Retry-After"),
        /<meta http-equiv="refresh" content="(\d+)">/.exec(body)?.[1] ?? null,
        body.includes('<meta name="robots" content="noindex">')
      ]);
    }
    expect(answers).toEqual([
      ["public", 503, "SHELL", "600", null, false],
      ["private", 503, "BUSY", "600", "600", true],
      ["unreadable", 503, "BUSY", "600", "600", true]
    ]);
  });

  test("that holds a collection only a reader signed in may read gets them the frame past every lane, which their browser draws it into", async () => {
    accounts.byToken.set("ada", "user-ada");
    const answers: unknown[] = [];
    for (const visibility of ["private", "unreadable"] as const) {
      const worker = envOf(objects().isolate(), { ...ENFORCED, visibility });
      // every signed-in reader's ten minutes spent as well
      await cache.put(new Request(markOf("renderSignedIn")), spentMark());
      for (const [who, init] of [
        ["anyone", { headers: FORCED }],
        ["ada", signedIn("ada", FORCED)]
      ] as const)
        answers.push([visibility, who, ...shown(await get("/blue-sky", init, worker))]);
    }
    expect(answers).toEqual([
      ["private", "anyone", 503, "BUSY"],
      ["private", "ada", 503, "SHELL"],
      ["unreadable", "anyone", 503, "BUSY"],
      ["unreadable", "ada", 503, "SHELL"]
    ]);
  });

  test("says to try later in the reader's language", async () => {
    const worker = envOf(objects().isolate(), { ...ENFORCED, visibility: "private" });
    const body = await (await get("/ja/blue-sky", { headers: FORCED }, worker)).text();
    expect(body).toContain('<html lang="ja" dir="ltr">');
    expect(body).toContain(
      "<p>リクエストが多すぎます。しばらくしてからもう一度お試しください。</p>"
    );
    expect(body).toContain('<a href="/ja">Grabient</a>');
  });

  test("under an account's handle is the frame, read as the browser reads it", async () => {
    const worker = envOf(objects().isolate(), { ...ENFORCED, visibility: "unreadable" });
    expect(shown(await get("/@ada/warm-sunsets", { headers: FORCED }, worker))).toEqual([
      503,
      "SHELL"
    ]);
  });
});

describe("a reader signed in", () => {
  test("is drawn past the ceiling, a cookie no session stands behind gets the frame, and no session is read under it", async () => {
    accounts.byToken.set("ada", "user-ada");
    accounts.byToken.set("bob", "user-bob");
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    expect(shown(await get("/palettes?q=a", signedIn("ada"), worker))).toEqual([200, "MISS"]);
    expect(accounts.asked).toEqual([]);
    // the site's ten minutes spent, and heard
    await limits.spend("page-render", "pageRender");
    expect(shown(await get("/palettes?q=b", {}, worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/palettes?q=c", {}, worker))).toEqual([503, "SHELL"]);
    const asks = limits.asks.length;
    expect(shown(await get("/palettes?q=d", signedIn("ada"), worker))).toEqual([200, "MISS"]);
    expect(limits.asks.slice(asks).sort()).toEqual(["renderAccount 1", "renderSignedIn 1"]);
    expect(shown(await get("/palettes?q=e", signedIn("forged"), worker))).toEqual([503, "SHELL"]);
    // an account past its 200 gets the frame once its isolate has heard, and another account is drawn
    await limits.spend("account:user-ada", "renderAccount");
    expect(shown(await get("/palettes?q=f", signedIn("ada"), worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/palettes?q=g", signedIn("ada"), worker))).toEqual([503, "SHELL"]);
    expect(shown(await get("/palettes?q=h", signedIn("bob"), worker))).toEqual([200, "MISS"]);
    // each session read once a minute here
    expect(accounts.asked).toEqual(["ada", "forged", "bob"]);
    vi.setSystemTime(NOW + 61_000);
    expect(shown(await get("/palettes?q=i", signedIn("forged"), worker))).toEqual([503, "SHELL"]);
    expect(accounts.asked).toEqual(["ada", "forged", "bob", "forged"]);
  });

  test("is read for no session while every signed-in reader's ten minutes are spent", async () => {
    accounts.byToken.set("ada", "user-ada");
    const worker = envOf(objects().isolate(), ENFORCED);
    await cache.put(new Request(markOf("renderSignedIn")), spentMark());
    for (const token of ["ada", "forged"])
      expect(shown(await get("/palettes?q=a", signedIn(token, FORCED), worker))).toEqual([
        503,
        "SHELL"
      ]);
    expect(accounts.asked).toEqual([]);
  });

  test("is remembered by a digest, so the isolate keeps nothing of a request's cookie past it", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const heap = () => {
      gc();
      return process.memoryUsage().heapUsed;
    };
    await cache.put(new Request(MARK), spentMark());
    const watching = envOf(objects().isolate());
    // each session is read past the site's ten minutes, behind its answer, and its account kept a minute
    const page = (n: number) =>
      get(
        `/notes/${n}`,
        {
          headers: {
            Cookie: `pad=${"x".repeat(100_000)}; __Secure-better-auth.session_token=${n}.${"s".repeat(70)}`,
            "CF-Connecting-IP": `198.51.100.${n}`
          }
        },
        watching
      );
    await page(0);
    asked = [];
    accounts.asked = [];
    const before = heap();
    for (let n = 1; n <= 100; n++) await page(n);
    expect(accounts.asked).toHaveLength(100);
    asked = [];
    accounts.asked = [];
    // a hundred cookies of 100 KB each, none of them held
    expect(heap() - before).toBeLessThan(5_000_000);
  });

  test("whose session's check never answers is drawn at once while it is on, and past two seconds is anyone's", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    accounts.stalled.add("ada");
    const limits = objects();
    await cache.put(new Request(MARK), spentMark());
    const watching = envOf(limits.isolate());
    const drawn = await answerOf("/palettes?q=a", signedIn("ada"), watching);
    expect(shown(drawn)).toEqual([200, "MISS"]);
    // its session is read once the answer has begun, for the counts
    await vi.waitFor(() => expect(accounts.asked).toEqual(["ada"]), { timeout: 10_000 });
    await vi.advanceTimersByTimeAsync(2000);
    await settled();
    /* enforced, the reader waits two seconds at most, for the frame, which draws the page for them: once the isolate has
       read the flags, which it reads behind its first answer */
    await freshIsolate();
    const worker = envOf(limits.isolate(), ENFORCED);
    expect(shown(await answerOf("/palettes?q=b", {}, worker))).toEqual([200, "MISS"]);
    const answer = answerOf("/palettes?q=c", signedIn("ada"), worker);
    await vi.waitFor(() => expect(accounts.asked).toEqual(["ada", "ada"]), { timeout: 10_000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(shown(await answer)).toEqual([503, "SHELL"]);
  });

  test.each(["late", "refused"] as const)(
    "whose session's check is %s is read once for the requests that come meanwhile, and again a few seconds on",
    async check => {
      accounts.byToken.set("ada", "user-ada");
      (check === "late" ? accounts.stalled : accounts.refused).add("ada");
      await cache.put(new Request(MARK), spentMark());
      const watching = envOf(objects().isolate());
      // the pool's word read, and then two pages at once past it, each looked at behind its answer
      expect(shown(await get("/palettes?q=a", {}, watching))).toEqual([200, "MISS"]);
      const pages = await Promise.all(
        ["/palettes?q=b", "/palettes?q=c"].map(path => answerOf(path, signedIn("ada"), watching))
      );
      expect(pages.map(shown)).toEqual([
        [200, "MISS"],
        [200, "MISS"]
      ]);
      // a late check is given up two seconds on
      await settled();
      expect(accounts.asked).toEqual(["ada"]);
      // a check that was late or refused stands for no session a few seconds, and is then read again
      expect(shown(await get("/palettes?q=d", signedIn("ada"), watching))).toEqual([200, "MISS"]);
      expect(accounts.asked).toEqual(["ada"]);
      accounts.stalled.clear();
      accounts.refused.clear();
      vi.setSystemTime(Date.now() + 5000);
      await get("/palettes?q=e", signedIn("ada"), watching);
      expect(accounts.asked).toEqual(["ada", "ada"]);
    }
  );

  test("keeps Settings past the ceiling, which a reader with no session gets as the frame", async () => {
    accounts.byToken.set("ada", "user-ada");
    const worker = envOf(objects().isolate(), ENFORCED);
    const anyone = await get("/settings", { headers: FORCED }, worker);
    expect(shown(anyone)).toEqual([503, "SHELL"]);
    expect(anyone.headers.get("Cache-Control")).toBe("no-store");
    const ada = await get(
      "/settings",
      signedIn("ada", { ...FORCED, "CF-Connecting-IP": "192.0.2.9" }),
      worker
    );
    expect(ada.status).toBe(200);
    expect(await ada.text()).toBe("<!DOCTYPE html><p>page</p>");
    // the session is the site's own check's to read, with the reader's cookie and address and nothing else of theirs
    const check = asked.find(request => new URL(request.url).pathname === "/api/auth/get-session");
    expect(check?.url).toBe("https://grabient.test/api/auth/get-session?disableRefresh=true");
    expect([...(check?.headers.entries() ?? [])].sort()).toEqual([
      ["accept", "application/json"],
      ["cf-connecting-ip", "192.0.2.9"],
      ["cookie", "__Secure-better-auth.session_token=ada"]
    ]);
  });
});

describe("the other lanes past the ceiling", () => {
  test("a browser on HTTP/3 draws from its own, and a program on HTTP/3 does not", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    const quic = (agent: string) => ({
      headers: { ...FORCED, "User-Agent": agent },
      cf: { httpProtocol: "HTTP/3" }
    });
    expect(shown(await get("/palettes?q=a", quic(CHROME), worker))).toEqual([200, "MISS"]);
    expect(limits.asks).toEqual(["renderHttp3 1"]);
    // and its reads of a list's data, past their own ten minutes: the lane's next block
    expect(shown(await get("/api/search.json?q=a", quic(CHROME), worker))).toEqual([200, "MISS"]);
    expect(limits.asks).toEqual(["renderHttp3 1", "renderHttp3 2"]);
    const headless = CHROME.replace("Chrome/", "HeadlessChrome/");
    expect(shown(await get("/palettes?q=b", quic(headless), worker))).toEqual([503, "SHELL"]);
    expect(shown(await get("/palettes?q=c", quic("curl/8.9.1"), worker))).toEqual([503, "SHELL"]);
    expect(
      shown(await get("/palettes?q=d", { headers: { ...FORCED, "User-Agent": CHROME } }, worker))
    ).toEqual([503, "SHELL"]);
    expect(limits.asks).toEqual(["renderHttp3 1", "renderHttp3 2"]);
  });

  test("a link preview draws from its own, and past it gets the frame", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    const discord = {
      headers: {
        ...FORCED,
        "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
      }
    };
    expect(shown(await get("/about", discord, worker))).toEqual([200, "MISS"]);
    expect(limits.asks).toEqual(["renderPreview 1"]);
    // its hundred spent: drawn while its isolate has not heard, then the frame
    await limits.spend("page-preview", "renderPreview");
    expect(shown(await get("/privacy", discord, worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/terms", discord, worker))).toEqual([503, "SHELL"]);
    // data has no preview's lane
    expect((await get("/api/hot?q=a", discord, worker)).status).toBe(429);
  });
});

describe("draw-past-ceiling", () => {
  test("while it is on, every reader is drawn past the ceiling, and the counts say what would have stood in", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const limits = objects();
    await limits.spend("page-render", "pageRender");
    const binding = limits.isolate();
    const watching = envOf(binding);
    expect(shown(await get("/palettes?q=a", {}, watching))).toEqual([200, "MISS"]);
    expect(shown(await get("/palettes?q=b", {}, watching))).toEqual([200, "MISS"]);
    expect(points.filter(point => point.startsWith("render"))).toEqual([
      "render page anyone drawn search",
      "render page anyone watch search"
    ]);
    /* turned off, or with every feature: what stands in, once the isolate has read the flags, which it reads behind the
       first answer it draws without them */
    for (const [n, flags] of [ENFORCED.flags, [{ name: "all", enabled: 0 }]].entries()) {
      const enforced = envOf(binding, { flags });
      expect(shown(await get(`/palettes?q=c${n}`, {}, enforced))).toEqual([200, "MISS"]);
      expect(shown(await get(`/palettes?q=d${n}`, {}, enforced))).toEqual([503, "SHELL"]);
    }
  });

  test("while it is on, no answer past a ceiling waits on a read of the flags", async () => {
    const limits = objects();
    await limits.spend("data-miss", "dataMiss");
    const worker = envOf(limits.isolate());
    // the pool heard spent; then an address spends its listings' minute on pages, which read the flags
    expect(shown(await get("/api/search.json?q=a", {}, worker))).toEqual([200, "MISS"]);
    for (let n = 0; n < 60; n++) await get(`/palettes?q=w${n}`, from("203.0.113.30"), worker);
    // half a minute on, the flags are read again, and the read hangs
    let release = () => {};
    flagsRead = new Promise<void>(done => (release = done));
    vi.setSystemTime(NOW + 31_000);
    try {
      for (const [path, init, status] of [
        ["/api/search.json?q=b", {}, 200],
        ["/collections?q=more", from("203.0.113.30"), 429]
      ] as const) {
        const answered = answerOf(path, init, worker).then(r => r.status);
        const waited = new Promise(done => setTimeout(() => done("waited"), 1000));
        expect([path, await Promise.race([answered, waited])]).toEqual([path, status]);
      }
    } finally {
      release();
    }
  });

  test("under the ceilings, a page reads the flags anew as it does without them", async () => {
    const rows: Rows = {};
    const worker = envOf(objects().isolate(), rows);
    expect(shown(await get("/palettes?q=a", {}, worker))).toEqual([200, "MISS"]);
    // an admin turns the newsletter on; half a minute on, the flags take a moment to read, as the primary's do
    rows.flags = [{ name: "newsletter", enabled: 1 }];
    flagsRead = new Promise<void>(done => setTimeout(done, 50));
    vi.setSystemTime(NOW + 31_000);
    expect(shown(await get("/palettes?q=b", {}, worker))).toEqual([200, "MISS"]);
    expect(newsletters).toEqual([false, true]);
  });

  test("the test header stands in with it on, except on production", async () => {
    const staging = envOf(objects().isolate());
    expect(shown(await get("/palettes?q=a", { headers: FORCED }, staging))).toEqual([503, "SHELL"]);
    const production = envOf(objects().isolate(), {}, { DEPLOYMENT: "production" });
    expect(shown(await get("/palettes?q=a", { headers: FORCED }, production))).toEqual([
      200,
      "MISS"
    ]);
  });

  /** A request past one of the ceilings, as it starts with no row for the flag. */
  interface Past {
    /** what has the request meet its ceiling: the limiter, the data center's word, what was asked before, the rows */
    before: (limits: ReturnType<typeof objects>, worker: Env, rows: Rows) => Promise<unknown>;
    path: string;
    init?: Sent;
    /** the counts' word on it: what, lane and answer */
    point: string;
    /** the sessions read for the counts, after the answer */
    sessions?: string[];
  }
  const said = (pool: LimitName) => () => cache.put(new Request(markOf(pool)), spentMark());
  const at = (n: number) => from(`198.51.${n >> 8}.${n & 255}`);
  const PAST: Record<string, Past> = {
    "a page past the site's ten minutes": {
      before: said("pageRender"),
      path: "/palettes?q=a",
      point: "page anyone watch"
    },
    "a page past its address's minute": {
      before: async (_, worker) => {
        for (let n = 0; n < 60; n++) await get(`/notes/${n}`, from("203.0.113.7"), worker);
      },
      path: "/notes/60",
      init: from("203.0.113.7"),
      point: "page anyone watch"
    },
    "a page while the limiter cannot answer": {
      before: async (limits, worker) => {
        limits.state.answer = "failing";
        await get("/palettes?page=2", at(0), worker);
      },
      path: "/palettes?page=3",
      init: at(1),
      point: "page anyone unmetered"
    },
    "a page past what the isolate draws alone": {
      before: async (limits, worker) => {
        limits.state.answer = "failing";
        for (let n = 0; n <= 300; n++) await get(`/palettes?page=${n + 2}`, at(n), worker);
      },
      path: "/palettes?page=999",
      init: at(999),
      point: "page anyone watch"
    },
    "a search's data past its ten minutes": {
      before: said("dataMiss"),
      path: "/api/search.json?q=x",
      point: "data anyone watch"
    },
    "the list API past its ten minutes": {
      before: said("dataMiss"),
      path: "/api/palettes?page=2",
      point: "data anyone watch"
    },
    "a search's picture past its ten minutes": {
      before: said("dataMiss"),
      path: "/palettes/blue.png",
      point: "data anyone watch"
    },
    "a reader signed in past the site's ten minutes": {
      before: said("pageRender"),
      path: "/palettes?q=a",
      init: signedIn("ada"),
      point: "page signed-in drawn",
      sessions: ["ada"]
    },
    "Settings past the site's ten minutes": {
      before: said("pageRender"),
      path: "/settings",
      point: "page anyone watch"
    },
    "an address no route serves, past the site's ten minutes": {
      before: said("pageRender"),
      path: "/wp-login.php",
      point: "page anyone watch"
    },
    "an old link the Worker does not fit, past the site's ten minutes": {
      before: async limits => {
        await limits.spend("fit-day", "oldLinkFitDaily");
        await said("pageRender")();
      },
      path: OLD,
      point: "page anyone watch"
    },
    "the old analytics beacon's address, which no route serves, past the site's ten minutes": {
      before: said("pageRender"),
      path: "/e/x",
      point: "page anyone watch"
    },
    "a page past the site's ten minutes after a flag changed since the flags were read": {
      before: async (_, worker, rows) => {
        vi.setSystemTime(NOW);
        await said("pageRender")();
        await get("/palettes?q=first", {}, worker);
        rows.flags = [{ name: "newsletter", enabled: 1 }];
        // the flags take a moment to read, as the primary's do
        flagsRead = new Promise<void>(done => setTimeout(done, 50));
        vi.setSystemTime(NOW + 31_000);
      },
      path: "/palettes?q=a",
      point: "page anyone watch"
    }
  };

  /** The answer of a new isolate, with the ceiling or without it, to the request past its ceiling: what the app was
      asked for before it, what the data center keeps after it but the ceiling's own word, and what each page drawn
      read of the flags. */
  async function answered(past: Past, ceiling: boolean) {
    cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });
    asked = [];
    newsletters = [];
    points = [];
    accounts.asked = [];
    if (ceiling) vi.doUnmock("./ceiling.ts");
    else vi.doMock("./ceiling.ts", () => ({ ceiling: async () => null }));
    await freshIsolate();
    const limits = objects();
    const rows: Rows = {};
    const worker = envOf(limits.isolate(), rows);
    await past.before(limits, worker, rows);
    const start = asked.length;
    const response = await answerOf(past.path, past.init, worker);
    const first = asked.slice(start).map(request => new URL(request.url).pathname);
    const body = await response.text();
    await settled();
    return {
      answer: {
        status: response.status,
        headers: [...response.headers].filter(([name]) => name !== "date"),
        body,
        first,
        kept: [...cache.kept]
          .filter(([key]) => !key.includes("/.grabient-cache/ceiling/"))
          .map(([key, copy]) => [key, copy.init.status, new TextDecoder().decode(copy.body)]),
        newsletters
      },
      point: points.filter(point => point.startsWith("render ")).at(-1),
      sessions: accounts.asked
    };
  }

  test.each(Object.entries(PAST))(
    "while it is on, %s gets the answer the Worker gives without the ceiling",
    async (_, past) => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      accounts.byToken.set("ada", "user-ada");
      const watched = await answered(past, true);
      const without = await answered(past, false);
      expect(watched.answer).toEqual(without.answer);
      // the app was asked for the page alone before the answer, and nothing stood in
      expect(watched.answer.first).toHaveLength(1);
      expect(watched.answer.kept.map(([key]) => key)).not.toContain(frameKey("en"));
      expect(watched.point?.split(" ").slice(1, 4).join(" ")).toBe(past.point);
      expect(watched.sessions).toEqual(past.sessions ?? []);
    }
  );
});

describe("an address past its own minute", () => {
  test("gets the frame as a 429 before the site's ceiling is counted, and another address is drawn", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    for (let n = 0; n < 60; n++)
      expect(shown(await get(`/notes/${n}`, from("203.0.113.7"), worker))).toEqual([200, "MISS"]);
    const asks = limits.asks.length;
    const refused = await get("/notes/60", from("203.0.113.7"), worker);
    expect([...shown(refused), refused.headers.get("Retry-After")]).toEqual([429, "SHELL", "60"]);
    expect(limits.asks).toHaveLength(asks);
    expect(shown(await get("/notes/61", from("203.0.113.8"), worker))).toEqual([200, "MISS"]);
  });

  test("past its listings' minute gets a page's frame as a 429, and data's JSON as before", async () => {
    const worker = envOf(objects().isolate(), ENFORCED);
    for (let n = 0; n < 60; n++)
      expect((await get(`/palettes?q=w${n}`, from("203.0.113.9"), worker)).status).toBe(200);
    const page = await get("/collections?q=more", from("203.0.113.9"), worker);
    expect([...shown(page), page.headers.get("Retry-After")]).toEqual([429, "SHELL", "60"]);
    const data = await get("/api/palettes?page=100", from("203.0.113.9"), worker);
    expect([data.status, await data.json(), data.headers.get("Retry-After")]).toEqual([
      429,
      { error: "Too many requests. Try again later." },
      "60"
    ]);
    // while it is on, the frame waits as before: the listings' JSON
    const watching = envOf(objects().isolate());
    for (let n = 0; n < 60; n++) await get(`/palettes?q=v${n}`, from("203.0.113.10"), watching);
    const json = await get("/collections?q=more", from("203.0.113.10"), watching);
    expect([json.status, json.headers.get("Content-Type")]).toEqual([429, "application/json"]);
  });

  test("of the search's suggestions is its own, which a reader typing never meets before a page's", async () => {
    const worker = envOf(objects().isolate(), ENFORCED);
    const reader = from("203.0.113.20");
    for (let n = 0; n < 240; n++)
      expect((await get(`/api/search-suggestions?q=s${n}`, reader, worker)).status).toBe(200);
    expect(shown(await get("/notes/1", reader, worker))).toEqual([200, "MISS"]);
    const refused = await get("/api/popular-searches?q=s240", reader, worker);
    expect([refused.status, await refused.json(), refused.headers.get("Retry-After")]).toEqual([
      429,
      { error: "Too many requests. Try again later." },
      "60"
    ]);
  });

  test("holds past a pool spent, so one address never takes a lane's whole allowance", async () => {
    accounts.byToken.set("ada", "user-ada");
    const limits = objects();
    await limits.spend("page-render", "pageRender");
    const worker = envOf(limits.isolate(), ENFORCED);
    // the pool heard spent
    expect(shown(await get("/palettes?q=a", from("203.0.113.49"), worker))).toEqual([200, "MISS"]);
    const readers = {
      quic: {
        headers: { "User-Agent": CHROME, "CF-Connecting-IP": "203.0.113.50" },
        cf: { httpProtocol: "HTTP/3" }
      },
      ada: signedIn("ada", { "CF-Connecting-IP": "203.0.113.51" })
    };
    for (const [name, reader] of Object.entries(readers)) {
      for (let n = 0; n < 60; n++)
        expect(shown(await get(`/notes/${name}${n}`, reader, worker))).toEqual([200, "MISS"]);
      const refused = await get(`/notes/${name}60`, reader, worker);
      expect([name, ...shown(refused), refused.headers.get("Retry-After")]).toEqual([
        name,
        429,
        "SHELL",
        "60"
      ]);
    }
  });

  test("holds for a reader signed in while the limiter cannot answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    accounts.byToken.set("ada", "user-ada");
    const limits = objects();
    limits.state.answer = "failing";
    const worker = envOf(limits.isolate(), ENFORCED);
    // the first is drawn and its ask fails; the next three hundred are the isolate's own
    for (let n = 0; n <= 300; n++)
      await get(`/palettes?page=${n + 2}`, from(`198.51.${n >> 8}.${n & 255}`), worker);
    const ada = signedIn("ada", { "CF-Connecting-IP": "203.0.113.52" });
    for (let n = 0; n < 60; n++)
      expect(shown(await get(`/notes/${n}`, ada, worker))).toEqual([200, "MISS"]);
    expect(shown(await get("/notes/60", ada, worker))).toEqual([429, "SHELL"]);
  });
});

describe("data past the ceiling", () => {
  test("is JSON 429 with when to try again, and the search says it is busy", async () => {
    const worker = envOf(objects().isolate(), ENFORCED);
    const search = await get("/api/search.json?q=x", { headers: FORCED }, worker);
    expect([
      ...shown(search),
      search.headers.get("Retry-After"),
      search.headers.get("X-Grabient-Paused"),
      await search.json()
    ]).toEqual([
      429,
      "BUSY",
      "600",
      "draw-past-ceiling",
      { error: "Search is busy. Try again later." }
    ]);
    for (const path of [
      "/api/collections",
      "/api/palettes",
      "/api/hot",
      "/api/collections/suggest?q=a",
      "/api/search-suggestions",
      "/api/popular-searches",
      "/search/blue.json"
    ]) {
      const refused = await get(path, { headers: FORCED }, worker);
      expect([path, refused.status, await refused.json()]).toEqual([
        path,
        429,
        {
          error: path.endsWith(".json")
            ? "Search is busy. Try again later."
            : "Too many requests. Try again later."
        }
      ]);
    }
  });

  test("never meets the ceiling where nothing is counted", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    for (const path of [
      "/api/palette-facts?seed=kS7Q8Yy5S_SChv0",
      "/api/palette-credit?seed=kS7Q8Yy5S_SChv0",
      "/api/collections/some-slug",
      "/random",
      "/kS7Q8Yy5S_SChv0.png",
      "/api/auth/get-session",
      "/mcp",
      "/oauth/token",
      "/connect",
      "/unsubscribe/t"
    ])
      expect([path, (await get(path, { headers: FORCED }, worker)).status]).toEqual([path, 200]);
    expect(limits.asks).toEqual([]);
  });

  test("of the search's pictures counts as the search's, and past it a share card is the site's and any other refused", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    expect(shown(await get("/palettes/blue.png", from("192.0.2.40"), worker))).toEqual([
      200,
      "MISS"
    ]);
    expect(limits.asks).toEqual(["dataMiss 1"]);
    for (const path of ["/api/og/query?query=blue", "/api/og/collections?q=blue"]) {
      const card = await get(path, { headers: FORCED }, worker);
      expect([path, card.status, location(card), card.headers.get("X-Grabient-Paused")]).toEqual([
        path,
        302,
        "/grabient.png",
        "draw-past-ceiling"
      ]);
    }
    for (const path of ["/api/png/query?query=blue", "/palettes/blue.svg", "/search/green.png"]) {
      const refused = await get(path, { headers: FORCED }, worker);
      expect([
        path,
        ...shown(refused),
        refused.headers.get("Retry-After"),
        refused.headers.get("Access-Control-Allow-Origin"),
        await refused.json()
      ]).toEqual([path, 429, "BUSY", "600", "*", { error: "Too many requests. Try again later." }]);
    }
    // the collections' card with no words shows their list, which runs no search
    expect((await get("/api/og/collections", { headers: FORCED }, worker)).status).toBe(200);
    expect(limits.asks).toEqual(["dataMiss 1"]);
  });

  test("of the list API counts only a page its record does not hold fresh, and past it draws the ones it does", async () => {
    const limits = objects();
    const worker = envOf(limits.isolate(), ENFORCED);
    /* a page of Popular as the record cache keeps it (gallery/cache.ts), read from the database `age` ago: Popular is
       fresh five minutes */
    const record = (page: number, age: number) =>
      cache.put(
        new Request(
          `https://grabient.test/.grabient-cache/list?build=b1&sort=popular&page=${page}&limit=24`
        ),
        Response.json({ items: [], total: 0, page, limit: 24, totalPages: 0, fetchedAt: NOW - age })
      );
    await record(1, 1000);
    await record(2, 301_000);
    expect((await get("/api/palettes?sort=popular&page=1", {}, worker)).status).toBe(200);
    expect(limits.asks).toEqual([]);
    expect((await get("/api/palettes?page=2", {}, worker)).status).toBe(200);
    expect(limits.asks).toEqual(["dataMiss 1"]);
    expect((await get("/api/palettes", { headers: FORCED }, worker)).status).toBe(200);
    for (const path of ["/api/palettes?page=2", "/api/palettes?page=3"]) {
      const refused = await get(path, { headers: FORCED }, worker);
      expect([path, refused.status, await refused.json()]).toEqual([
        path,
        429,
        { error: "Too many requests. Try again later." }
      ]);
    }
    expect(limits.asks).toEqual(["dataMiss 1"]);
  });
});

test("loads only for work it counts", async () => {
  const met: string[] = [];
  vi.doMock("./ceiling.ts", () => ({
    ceiling: async ({ path }: { path: string }) => {
      met.push(path);
      return null;
    }
  }));
  await freshIsolate();
  const worker = envOf(objects().isolate(), ENFORCED);
  for (const path of [
    "/kS7Q8Yy5S_SChv0.png",
    "/kS7Q8Yy5S_SChv0.svg",
    "/llms.txt",
    "/sitemap.xml",
    "/api/palette-facts?seed=kS7Q8Yy5S_SChv0",
    "/api/build",
    "/random",
    "/connect",
    "/api/og/collections",
    "/.well-known/ai-catalog.json",
    "/favicon/2026-w44.svg",
    "/@ada/warm-sunsets.css",
    "/api/no-such-thing",
    "/api/og/COLLECTIONS",
    // a reader's own data
    "/api/auth/get-session",
    "/api/likes",
    // the roots of the documents apps read and of the authorization server, which their routes answer
    "/.well-known",
    "/oauth"
  ])
    await get(path, {}, worker);
  expect(met).toEqual([]);
  for (const path of [
    "/about",
    "/api/hot",
    "/api/popular-searches",
    "/palettes/blue.svg",
    "/api/og/collections?q=blue",
    "/wp-login.php",
    "/a/b.c",
    // the old analytics beacon's address, which no route serves
    "/e",
    "/e/x",
    // the same work in other cases, which the router hands the same routes
    "/api/SEARCH.JSON?q=x",
    "/api/HOT",
    "/search/x.SVG?q=blue",
    "/api/og/QUERY?query=blue"
  ])
    await get(path, {}, worker);
  expect(met).toEqual([
    "/about",
    "/api/hot",
    "/api/popular-searches",
    "/palettes/blue.svg",
    "/api/og/collections",
    "/wp-login.php",
    "/a/b.c",
    "/e",
    "/e/x",
    "/api/SEARCH.JSON",
    "/api/HOT",
    "/search/x.SVG",
    "/api/og/QUERY"
  ]);
});

test("counts the lists' and the searches' data in any case under the kind its own address has", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const worker = envOf(objects().isolate(), ENFORCED);
  for (const path of [
    "/api/HOT",
    "/api/Palettes?page=2",
    "/api/SEARCH.JSON?q=x",
    "/search/x.SVG?q=blue",
    "/collections/rising/x.CSS"
  ])
    await get(path, {}, worker);
  expect(points.filter(point => point.startsWith("render"))).toEqual([
    "render data anyone drawn api/hot",
    "render data anyone drawn api/palettes",
    "render data anyone drawn search",
    "render data anyone drawn picture",
    "render data anyone drawn list"
  ]);
});

test("an address no route serves is a page to the ceiling, the frame past it, and a crawler Cloudflare verifies gets its 404", async () => {
  const limits = objects();
  const worker = envOf(limits.isolate(), ENFORCED);
  // Start's not-found page, counted as any page drawn
  expect(shown(await get("/wp-login.php", from("192.0.2.60"), worker))).toEqual([404, "MISS"]);
  expect(limits.asks).toEqual(["pageRender 1"]);
  for (const [path, method] of [
    ["/wp-login.php", "GET"],
    ["/.env", "GET"],
    ["/x.xml", "GET"],
    ["/og/x", "GET"],
    ["/fonts/x.woff2", "GET"],
    ["/e/static/array.js", "GET"],
    ["/x-1.y", "HEAD"]
  ] as const) {
    const response = await get(path, { method, headers: FORCED }, worker);
    expect([path, ...shown(response)]).toEqual([path, 503, "SHELL"]);
  }
  const crawler = await get(
    "/wp-login.php",
    { headers: FORCED, cf: { verifiedBotCategory: "Search Engine Crawler" } },
    worker
  );
  expect([...shown(crawler), await crawler.text()]).toEqual([
    404,
    "MISS",
    "<!DOCTYPE html><p>not found</p>"
  ]);
  expect(limits.asks).toEqual(["pageRender 1"]);
});

test("a HEAD past the ceiling gets the stand-in's headers and no body", async () => {
  const worker = envOf(objects().isolate(), ENFORCED);
  const response = await get("/palettes?q=x", { method: "HEAD", headers: FORCED }, worker);
  expect([...shown(response), response.headers.get("Content-Type")]).toEqual([
    503,
    "SHELL",
    "text/html; charset=utf-8"
  ]);
  expect(await response.text()).toBe("");
});

test("a frame that cannot be drawn is the page that asks again once it may be drawn, never a 500, and Start is asked again a minute on", async () => {
  frameStatus = 500;
  const worker = envOf(objects().isolate(), ENFORCED);
  const busy = async (path: string) => {
    const response = await get(path, { headers: FORCED }, worker);
    const refresh = /<meta http-equiv="refresh" content="(\d+)">/.exec(await response.text());
    return [...shown(response), response.headers.get("Retry-After"), refresh?.[1]];
  };
  // the pool's ten minutes are left, and the frame is held a minute
  expect(await busy("/palettes?q=x")).toEqual([503, "BUSY", "60", "60"]);
  vi.setSystemTime(NOW + 45_000);
  expect(await busy("/palettes?q=y")).toEqual([503, "BUSY", "15", "15"]);
  // the owner's alert hears of the frame once, and of no stand-in
  expect(points.filter(point => point.startsWith("failure"))).toEqual(["failure 500 frame"]);
  const drawn = () => asked.filter(request => request.url.endsWith("/palettes/saved")).length;
  expect(drawn()).toBe(1);
  frameStatus = 200;
  vi.setSystemTime(NOW + 60_000);
  expect(shown(await get("/palettes?q=z", { headers: FORCED }, worker))).toEqual([503, "SHELL"]);
  expect(drawn()).toBe(2);
});

test("a frame its data center keeps stands in while this isolate holds its own as undrawn", async () => {
  frameStatus = 500;
  const worker = envOf(objects().isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=x", { headers: FORCED }, worker))).toEqual([503, "BUSY"]);
  // another isolate drew it, and kept it
  await cache.put(
    new Request(frameKey("en")),
    new Response("<!DOCTYPE html><p>the frame another drew</p>", {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  );
  const kept = await get("/palettes?q=y", { headers: FORCED }, worker);
  expect([...shown(kept), await kept.text()]).toEqual([
    503,
    "SHELL",
    "<!DOCTYPE html><p>the frame another drew</p>"
  ]);
  expect(asked.filter(request => request.url.endsWith("/palettes/saved"))).toHaveLength(1);
});

test("a frame whose render breaks off once begun is held a minute as one that could not be drawn, and heard of", async () => {
  frameBreaks = true;
  const worker = envOf(objects().isolate(), ENFORCED);
  for (const words of ["x", "y", "z"])
    expect(shown(await get(`/palettes?q=${words}`, { headers: FORCED }, worker))).toEqual([
      503,
      "BUSY"
    ]);
  expect(asked.filter(request => request.url.endsWith("/palettes/saved"))).toHaveLength(1);
  expect(points.filter(point => point.startsWith("failure"))).toEqual(["failure 500 frame"]);
});

test("a frame its data center keeps but cannot read back is drawn in its place", async () => {
  const worker = envOf(objects().isolate(), ENFORCED);
  const read = cache.match;
  cache.match = async (request: Request) =>
    request.url === frameKey("en") ? new Response(brokenOff()) : read(request);
  for (const words of ["x", "y"])
    expect(shown(await get(`/palettes?q=${words}`, { headers: FORCED }, worker))).toEqual([
      503,
      "SHELL"
    ]);
  expect(asked.filter(request => request.url.endsWith("/palettes/saved"))).toHaveLength(1);
});

test.each([
  [500, "BUSY"],
  [200, "SHELL"]
] as const)(
  "a frame drawn with the answer %i serves the requests that looked for a kept copy while it was drawn",
  async (status, answer) => {
    frameStatus = status;
    const worker = envOf(objects().isolate(), ENFORCED);
    const page = (words: string) => answerOf(`/palettes?q=${words}`, { headers: FORCED }, worker);
    const drawn = () => asked.filter(request => request.url.endsWith("/palettes/saved")).length;
    let draw = () => {};
    frameGate = new Promise(done => (draw = done));
    // the second look for a kept copy comes back once the first request's draw has ended, and nothing is kept meanwhile
    const read = cache.match;
    let lookedBack = () => {};
    const looking = new Promise<void>(done => (lookedBack = done));
    let looks = 0;
    cache.match = async (request: Request) => {
      if (request.url === frameKey("en") && ++looks === 2) await looking;
      return read(request);
    };
    cache.put = async () => {};
    const first = page("a");
    await vi.waitFor(() => expect(drawn()).toBe(1), { timeout: 10_000 });
    const second = page("b");
    await vi.waitFor(() => expect(looks).toBe(2), { timeout: 10_000 });
    draw();
    const firstShown = shown(await first);
    lookedBack();
    expect([firstShown, shown(await second)]).toEqual([
      [503, answer],
      [503, answer]
    ]);
    expect(drawn()).toBe(1);
  }
);

test("a frame whose draw never answers is drawn again past the wait by one request alone", async () => {
  framesStalled = 1;
  const worker = envOf(objects().isolate(), ENFORCED);
  const page = (words: string) => answerOf(`/palettes?q=${words}`, { headers: FORCED }, worker);
  const drawn = () => asked.filter(request => request.url.endsWith("/palettes/saved")).length;
  // the first draw's reader hung up
  void page("a");
  await vi.waitFor(() => expect(drawn()).toBe(1), { timeout: 10_000 });
  // two more join it and wait their five seconds, whichever comes first: the one past its wait first draws for both
  const answers = await Promise.all([page("b"), page("c")]);
  expect(answers.map(shown)).toEqual([
    [503, "SHELL"],
    [503, "SHELL"]
  ]);
  expect(drawn()).toBe(2);
});

test("a frame its data center keeps is held only for what is left of the hour since it was drawn", async () => {
  const drawn = () => asked.filter(request => request.url.endsWith("/palettes/saved")).length;
  expect(
    shown(await get("/palettes?q=x", { headers: FORCED }, envOf(objects().isolate(), ENFORCED)))
  ).toEqual([503, "SHELL"]);
  // another isolate of the data center takes its copy near the end of its hour
  await freshIsolate();
  const other = envOf(objects().isolate(), ENFORCED);
  vi.setSystemTime(NOW + 59 * 60_000);
  expect(shown(await get("/palettes?q=y", { headers: FORCED }, other))).toEqual([503, "SHELL"]);
  expect(drawn()).toBe(1);
  // the hour over, the data center keeps it no longer, and the frame is drawn anew
  vi.setSystemTime(NOW + 60 * 60_000 + 1000);
  cache.kept.delete(frameKey("en"));
  expect(shown(await get("/palettes?q=z", { headers: FORCED }, other))).toEqual([503, "SHELL"]);
  expect(drawn()).toBe(2);
});

test("the frame is kept under a key no address's own can be", async () => {
  const worker = envOf(objects().isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=x", { headers: FORCED }, worker))).toEqual([503, "SHELL"]);
  expect(cache.kept.has(frameKey("en"))).toBe(true);
  // the frame's own address is one no route takes, which Start answers as it does any such
  const there = await get("/.grabient-cache/frame/en", {}, worker);
  expect([...shown(there), await there.text()]).toEqual([
    200,
    "MISS",
    "<!DOCTYPE html><p>page</p>"
  ]);
});

test("an isolate waits on its data center's word only the first time it reads it", async () => {
  const worker = envOf(objects().isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=a", {}, worker))).toEqual([200, "MISS"]);
  // a second on, the word is read again behind the answer, which waits on no read that hangs
  const read = cache.match;
  let release = () => {};
  const hung = new Promise<void>(done => {
    release = done;
  });
  cache.match = async (request: Request) => {
    if (request.url !== MARK) return read(request);
    await hung;
    return undefined;
  };
  vi.setSystemTime(NOW + 1500);
  try {
    const answered = answerOf("/palettes?q=b", {}, worker).then(shown);
    const waited = new Promise(done => setTimeout(() => done("waited"), 1000));
    expect(await Promise.race([answered, waited])).toEqual([200, "MISS"]);
  } finally {
    release();
  }
});

test("an isolate's first read of its data center's word holds no answer past a moment", async () => {
  const worker = envOf(objects().isolate());
  const read = cache.match;
  let release = () => {};
  const hung = new Promise<void>(done => {
    release = done;
  });
  cache.match = async (request: Request) => {
    if (!request.url.includes("/.grabient-cache/ceiling/")) return read(request);
    await hung;
    return undefined;
  };
  try {
    // the first page and the first read of data, each the first of its pool's word
    for (const path of ["/palettes?q=a", "/api/search.json?q=a"]) {
      const answered = answerOf(path, {}, worker).then(shown);
      const waited = new Promise(done => setTimeout(() => done("waited"), 1000));
      expect([path, await Promise.race([answered, waited])]).toEqual([path, [200, "MISS"]]);
    }
  } finally {
    release();
  }
});

test.each([
  ["/palettes?q=a", MARK, "page"],
  ["/api/search.json?q=a", markOf("dataMiss"), "data"]
] as const)(
  "while it is on, %s waits on no timer for its isolate's first read of its pool's word, which then decides what it counts against",
  async (path, mark, what) => {
    // no timer runs unless the test moves it on: a wait of any length on the word holds the answer
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const limits = objects();
    await cache.put(new Request(mark), spentMark());
    const worker = envOf(limits.isolate());
    const read = cache.match;
    let release = () => {};
    const slow = new Promise<void>(done => (release = done));
    cache.match = async (request: Request) => {
      if (request.url === mark) await slow;
      return read(request);
    };
    let answered: unknown = "waiting";
    try {
      void answerOf(path, {}, worker).then(response => (answered = shown(response)));
      const until = performance.now() + 5000;
      while (answered === "waiting" && performance.now() < until)
        await new Promise(done => setImmediate(done));
      expect(answered).toEqual([200, "MISS"]);
    } finally {
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
      release();
    }
    // the word, read once the answer has gone, says the pool is spent: no ask, and the counts say what would stand in
    await settled();
    expect(limits.asks).toEqual([]);
    expect(points.filter(point => point.startsWith("render"))).toEqual([
      `render ${what} anyone watch search`
    ]);
  }
);

test.each([
  [
    "throws",
    () => () => {
      throw new Error("broken");
    }
  ],
  [
    "rejects",
    () => async () => {
      throw new Error("broken");
    }
  ],
  [
    "cannot load",
    () => {
      throw new Error("the chunk is gone");
    }
  ]
])("a ceiling that %s draws the page", async (_, ceiling) => {
  vi.doMock("./ceiling.ts", () => ({ ceiling: ceiling() }));
  await freshIsolate();
  const worker = envOf(objects().isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=x", { headers: FORCED }, worker))).toEqual([200, "MISS"]);
});

test("a pool one isolate found spent is its data center's word, until it resets", async () => {
  const limits = objects();
  await limits.spend("page-render", "pageRender");
  const first = envOf(limits.isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=a", {}, first))).toEqual([200, "MISS"]);
  // kept to a second past the one the object names, in which its window may still run
  expect(
    ["Cache-Control", "X-Reset"].map(name => cache.kept.get(MARK)?.init.headers.get(name))
  ).toEqual(["public, max-age=600", String(NOW / 1000 + 601)]);
  /* another isolate of the data center, which has asked nothing: drawn while it has not read the flags, which it
     reads behind that answer, and then the frame */
  await freshIsolate();
  const other = envOf(limits.isolate(), ENFORCED);
  const asks = limits.asks.length;
  expect(shown(await get("/palettes?q=b", {}, other))).toEqual([200, "MISS"]);
  expect(shown(await get("/palettes?q=c", {}, other))).toEqual([503, "SHELL"]);
  expect(limits.asks).toHaveLength(asks);
  vi.setSystemTime(NOW + 601_000);
  expect(shown(await get("/palettes?q=d", {}, other))).toEqual([200, "MISS"]);
  expect(limits.asks).toHaveLength(asks + 1);
});

test("a pool's word is kept by its size, so a deploy that resizes the pool reads no word of the old size", async () => {
  const limits = objects();
  await limits.spend("page-render", "pageRender");
  // an isolate learns the pool of three thousand is spent, and says so to its data center
  expect(shown(await get("/palettes?q=a", {}, envOf(limits.isolate(), ENFORCED)))).toEqual([
    200,
    "MISS"
  ]);
  expect(cache.kept.has(MARK)).toBe(true);
  // a deploy doubles it, for the Worker and the object alike
  await freshIsolate();
  const deployed = await import("@grabient/server/limits/config.ts");
  const sizes = [LIMITS.pageRender, deployed.LIMITS.pageRender];
  for (const size of sizes) Object.assign(size, { requests: 6000 });
  try {
    const worker = envOf(limits.isolate(), ENFORCED);
    const asks = limits.asks.length;
    for (const words of ["b", "c"])
      expect(shown(await get(`/palettes?q=${words}`, {}, worker))).toEqual([200, "MISS"]);
    expect(limits.asks.length).toBeGreaterThan(asks);
  } finally {
    for (const size of sizes) Object.assign(size, { requests: 3000 });
  }
});

test("a pool's word holds through the second its window ends in, so no isolate asks while the window runs", async () => {
  const limits = objects();
  // spent for a window that ends part of the way into a second
  vi.setSystemTime(NOW + 500);
  await limits.spend("page-render", "pageRender");
  vi.setSystemTime(NOW);
  const worker = envOf(limits.isolate(), ENFORCED);
  expect(shown(await get("/palettes?q=a", {}, worker))).toEqual([200, "MISS"]);
  const asks = limits.asks.length;
  // the second the object names has begun, and its window still runs
  vi.setSystemTime(NOW + 600_200);
  expect(shown(await get("/palettes?q=b", {}, worker))).toEqual([503, "SHELL"]);
  expect(limits.asks).toHaveLength(asks);
  vi.setSystemTime(NOW + 601_000);
  expect(shown(await get("/palettes?q=c", {}, worker))).toEqual([200, "MISS"]);
  expect(limits.asks).toHaveLength(asks + 1);
});

test("an old link the Worker does not fit gets the frame past the ceiling, and a fitted one its 301", async () => {
  const limits = objects();
  await limits.spend("fit-day", "oldLinkFitDaily");
  const worker = envOf(limits.isolate(), ENFORCED);
  const unfitted = await get(OLD, { headers: FORCED }, worker);
  expect(shown(unfitted)).toEqual([503, "SHELL"]);
  expect([...cache.kept.keys()]).toEqual([frameKey("en")]);
  const fits = envOf(objects().isolate(), ENFORCED);
  const fitted = await get(OLD, { headers: FORCED }, fits);
  expect([fitted.status, location(fitted)]).toEqual([301, FITTED]);
});
