import { afterEach, describe, expect, test, vi } from "vitest";
import { leadName, makeVisitKeys, makeVisitLead } from "./keys.ts";
import {
  actVisit,
  browserOf,
  countVisit,
  deviceOf,
  pageKind,
  pageVisit,
  showsPerson,
  signalsOf,
  systemOf
} from "./visits.ts";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1";
/** What Chrome 155 on Windows sends with a page it navigates to from a search result. */
const browser = {
  "User-Agent": CHROME,
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-CH-UA": '"Chromium";v="155", "Google Chrome";v="155", "Not?A_Brand";v="99"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"',
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Site": "cross-site",
  Referer: "https://www.google.com/"
};
const html = () => new Response("<p>page</p>", { headers: { "Content-Type": "text/html" } });
const arriving = (address: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request(`https://grabient.test${address}`, { method, headers: { ...browser, ...headers } });

describe("a page's kind", () => {
  test.each([
    ["/", "", "home"],
    ["/", "q=sunset", "search"],
    ["/palettes", "", "palettes"],
    ["/palettes", "q=blue", "search"],
    ["/palettes/rising/year", "", "rising"],
    ["/palettes/saved", "", "saved"],
    ["/collections", "", "collections"],
    ["/collections/saved", "", "saved"],
    ["/kS7Q8Yy5S_SChv0", "", "palette"],
    ["/kS7Q8Yy5S_SChv0/edit", "", "editor"],
    ["/ocean-gradients", "", "collection"],
    // a collection whose address is shaped like a seed, which decodes to no palette
    ["/kingfisher-blue", "", "collection"],
    ["/kitchen-garden/rising", "", "collection"],
    ["/ocean-gradients/rising", "", "collection"],
    ["/@ada/warm-tones", "", "collection"],
    ["/about", "", "about"],
    ["/mcp-server", "", "mcp-server"],
    ["/unsubscribe/abc", "", "unsubscribe"],
    ["/Not_A_Page", "", "other"],
    ["/ocean-gradients/x/y", "", "other"]
  ])("%s?%s is %s", (path, query, kind) => {
    expect(pageKind(path, new URLSearchParams(query))).toBe(kind);
  });
});

test("a browser is its name and major version, its system and its device, and nothing else of it", () => {
  const none = new Headers();
  expect([browserOf(CHROME), systemOf(CHROME), deviceOf(new Headers(browser), CHROME)]).toEqual([
    "Chrome 155",
    "Windows",
    "desktop"
  ]);
  expect([browserOf(IPHONE), systemOf(IPHONE), deviceOf(none, IPHONE)]).toEqual([
    "Safari 19",
    "iOS",
    "mobile"
  ]);
  const tablet =
    "Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
  expect(deviceOf(none, tablet)).toBe("tablet");
  const webview =
    "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.0.0 Mobile Safari/537.36 Instagram 400.0";
  expect([browserOf(webview), deviceOf(none, webview)]).toEqual(["WebView 155", "mobile"]);
  expect(
    browserOf(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0"
    )
  ).toBe("Edge 155");
  expect(
    browserOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:146.0) Gecko/20100101 Firefox/146.0")
  ).toBe("Firefox 146");
});

describe("what a request says of itself", () => {
  const said = (headers: Record<string, string | null>) => {
    const sent = new Headers();
    for (const [name, value] of Object.entries({ ...browser, ...headers }))
      if (value !== null) sent.set(name, value);
    return signalsOf(sent, sent.get("User-Agent") ?? "");
  };
  test("a person's Chromium says nothing", () => {
    expect(said({})).toEqual([]);
  });
  test("one that sends no language, or no hints, is a program's", () => {
    expect(said({ "Accept-Language": null })).toEqual(["no-language"]);
    expect(said({ "Sec-CH-UA": null })).toEqual(["no-hints"]);
  });
  test("an old version written over a newer Chromium shows in its hints", () => {
    const old = CHROME.replace("Chrome/155", "Chrome/99");
    expect(said({ "User-Agent": old })).toEqual(["hints-differ"]);
    expect(said({ "Sec-CH-UA-Platform": '"Linux"' })).toEqual(["system-differs"]);
    expect(said({ "Sec-CH-UA": '"HeadlessChrome";v="155", "Chromium";v="155"' })).toEqual([
      "headless"
    ]);
  });
  test("browsers without client hints are taken as they come", () => {
    expect(said({ "User-Agent": IPHONE, "Sec-CH-UA": null, "Sec-CH-UA-Platform": null })).toEqual(
      []
    );
    const desktop =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    // Android's Chrome asking for the desktop site
    expect(said({ "User-Agent": desktop, "Sec-CH-UA-Platform": '"Android"' })).toEqual([]);
  });
});

describe("a page load", () => {
  test("from a search result is a landing, with the site that sent it and the link's tags", () => {
    const request = arriving("/palettes?q=blue&utm_source=newsletter&utm_campaign=october");
    expect(
      pageVisit(request, "/palettes", "ja", html(), "utm_source=newsletter&utm_campaign=october")
    ).toEqual({
      what: "landing",
      page: "search",
      language: "ja",
      path: "/palettes",
      referrer: "www.google.com",
      source: "newsletter",
      medium: "",
      campaign: "october"
    });
    const typed = arriving("/", { "Sec-Fetch-Site": "none", Referer: "" });
    expect(pageVisit(typed, "/", "en", html(), "")).toMatchObject({
      what: "landing",
      referrer: ""
    });
  });
  test("from one of the site's own pages is a load, and in another site's frame it is framed", () => {
    const reload = arriving("/about", {
      "Sec-Fetch-Site": "same-origin",
      Referer: "https://grabient.test/"
    });
    expect(pageVisit(reload, "/about", "en", html(), "utm_source=x")).toEqual({
      what: "load",
      page: "about",
      language: "en",
      path: "/about"
    });
    // a reload keeps the Referer of the page's arrival, and a sign-in comes back from Google: loads, not landings
    const reloaded = arriving("/about", { "Sec-Fetch-Site": "none", "Cache-Control": "max-age=0" });
    expect(pageVisit(reloaded, "/about", "en", html(), "")?.what).toBe("load");
    const signedIn = arriving("/settings", { Referer: "https://accounts.google.com/" });
    expect(pageVisit(signedIn, "/settings", "en", html(), "")?.what).toBe("load");
    const framed = arriving("/", { "Sec-Fetch-Dest": "iframe" });
    expect(pageVisit(framed, "/", "en", html(), "")?.what).toBe("framed");
  });
  test.each([
    ["a crawler", arriving("/", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" })],
    ["a program that names itself", arriving("/", { "User-Agent": "python-requests/2.32" })],
    ["no user agent", arriving("/", { "User-Agent": "" })],
    ["a fetch, not a navigation", arriving("/", { "Sec-Fetch-Mode": "cors" })],
    ["a page asked for with no Sec-Fetch headers", new Request("https://grabient.test/")],
    ["a prefetch", arriving("/", { "Sec-Purpose": "prefetch" })],
    ["a prerender", arriving("/", { "Sec-Purpose": "prefetch;prerender" })],
    ["a picture", arriving("/", { "Sec-Fetch-Dest": "image" })],
    ["a HEAD", arriving("/", {}, "HEAD")]
  ])("by %s is no visit", (_, request) => {
    expect(pageVisit(request, "/", "en", html(), "")).toBeNull();
  });
  test("is a visit only when the site answers with the page", () => {
    const request = arriving("/");
    expect(pageVisit(request, "/", "en", new Response(null, { status: 302 }), "")).toBeNull();
    expect(pageVisit(request, "/", "en", new Response("{}", { status: 404 }), "")).toBeNull();
    expect(pageVisit(request, "/api/palettes", "en", html(), "")).toBeNull();
    expect(pageVisit(request, "/", "en", new Response(null, { status: 304 }), "")).not.toBeNull();
  });
  test("a bot Cloudflare verified is no visit", () => {
    const request = Object.assign(arriving("/"), { cf: { botManagement: { verifiedBot: true } } });
    expect(pageVisit(request, "/", "en", html(), "")).toBeNull();
  });
});

test("a palette used or a search made is a visit to the page it was made on", () => {
  const used = new Request("https://grabient.test/api/used", {
    method: "POST",
    headers: { ...browser, Referer: "https://grabient.test/fr/palettes/rising" }
  });
  expect(actVisit(used, "use")).toEqual({
    what: "use",
    page: "rising",
    language: "fr",
    path: "/fr/palettes/rising"
  });
  const elsewhere = new Request("https://grabient.test/api/searched", {
    method: "POST",
    headers: { ...browser, Referer: "https://example.com/" }
  });
  expect(actVisit(elsewhere, "search")).toEqual({ what: "search", page: "", language: "" });
  const program = new Request("https://grabient.test/api/used", {
    method: "POST",
    headers: { "User-Agent": "curl/8.9" }
  });
  expect(actVisit(program, "use")).toBeNull();
});

/** A KV namespace in memory, recording each value's expiration. */
function memoryKV() {
  const kept = new Map<string, { value: string; expiration?: number }>();
  return {
    kept,
    async get(key: string, as?: string | { type?: string }) {
      const value = kept.get(key)?.value ?? null;
      const json = as === "json" || (typeof as === "object" && as?.type === "json");
      return value !== null && json ? JSON.parse(value) : value;
    },
    async put(key: string, value: string, options: { expiration?: number } = {}) {
      kept.set(key, { value, expiration: options.expiration });
    }
  };
}

/** Points as Analytics Engine would hold them. */
function usage() {
  const points: { index: string; blobs: string[] }[] = [];
  return {
    points,
    writeDataPoint(point: { indexes: string[]; blobs: string[] }) {
      points.push({ index: point.indexes[0]!, blobs: point.blobs });
    }
  };
}

const NOON = Date.parse("2026-10-20T12:00:00Z");
const visit = {
  what: "landing",
  page: "home",
  language: "en",
  referrer: "www.google.com"
} as const;
const from = (address: string, headers: Record<string, string> = {}, country = "US") =>
  Object.assign(arriving("/", { "CF-Connecting-IP": address, ...headers }), {
    cf: { country, asn: 7922 }
  });

describe("the day's key", () => {
  test("is made for today and tomorrow, each deleted ten minutes after its day ends, and never made twice", async () => {
    const CACHE = memoryKV();
    expect(await makeVisitKeys({ CACHE } as never, NOON)).toEqual(["2026-10-20", "2026-10-21"]);
    const today = CACHE.kept.get("visit-key:2026-10-20")!;
    expect(today.value).toMatch(/^[0-9a-f]{64}$/);
    expect(today.expiration).toBe(Date.parse("2026-10-21T00:10:00Z") / 1000);
    expect(CACHE.kept.get("visit-key:2026-10-21")!.expiration).toBe(
      Date.parse("2026-10-22T00:10:00Z") / 1000
    );
    expect(await makeVisitKeys({ CACHE } as never, NOON + 3_600_000)).toEqual([]);
    expect(CACHE.kept.get("visit-key:2026-10-20")).toBe(today);
    expect(await makeVisitKeys({} as never, NOON)).toEqual({ skipped: "no KV" });
  });
});

describe("a visit's point", () => {
  test("counts one browser once a day under its code, and another browser or day apart", async () => {
    const CACHE = memoryKV();
    const USAGE = usage();
    const env = { CACHE, USAGE } as never;
    await makeVisitKeys({ CACHE } as never, NOON);
    await countVisit(env, from("203.0.113.9"), visit, NOON);
    await countVisit(env, from("203.0.113.9"), { ...visit, what: "load" }, NOON + 60_000);
    await countVisit(env, from("198.51.100.4"), visit, NOON);
    const [first, again, other] = USAGE.points;
    expect(first!.index).toMatch(/^[0-9a-f]{16}$/);
    expect(first!.blobs).toEqual([
      "visit",
      "landing",
      "home",
      "en",
      "US",
      "desktop",
      "Chrome 155",
      "Windows",
      "7922",
      "",
      "www.google.com",
      "",
      "",
      "",
      first!.index
    ]);
    expect(again!.index).toBe(first!.index);
    expect(other!.index).not.toBe(first!.index);
    // the next day's key makes another code for the same browser
    const tomorrow = NOON + 86_400_000;
    await countVisit(env, from("203.0.113.9"), visit, tomorrow);
    expect(USAGE.points[3]!.index).toMatch(/^[0-9a-f]{16}$/);
    expect(USAGE.points[3]!.index).not.toBe(first!.index);
    // no address and no code anywhere in it
    expect(JSON.stringify(USAGE.points)).not.toContain("203.0.113");
  });
  test("of China or Vietnam, or without a key, has no code", async () => {
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    for (const country of ["CN", "VN"])
      await countVisit({ CACHE, USAGE } as never, from("203.0.113.9", {}, country), visit, NOON);
    await countVisit({ CACHE: memoryKV(), USAGE } as never, from("203.0.113.9"), visit, NOON);
    expect(USAGE.points.map(point => [point.index, point.blobs[4], point.blobs[14]])).toEqual([
      ["visit", "CN", ""],
      ["visit", "VN", ""],
      ["visit", "US", ""]
    ]);
  });
  test("of a browser that sends Global Privacy Control or Do Not Track says only that it was one", async () => {
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    await countVisit(
      { CACHE, USAGE } as never,
      from("203.0.113.9", { "Sec-GPC": "1" }),
      visit,
      NOON
    );
    await countVisit({ CACHE, USAGE } as never, from("203.0.113.9", { DNT: "1" }), visit, NOON);
    const held = ["visit", "landing", "", "", "", "", "", "", "", "held"];
    expect(USAGE.points).toEqual([
      { index: "visit", blobs: held },
      { index: "visit", blobs: held }
    ]);
  });
  test("is not written where the deploy counts nothing, and a key KV cannot give leaves it uncoded", async () => {
    await expect(
      countVisit({} as never, from("203.0.113.9"), visit, NOON)
    ).resolves.toBeUndefined();
    const USAGE = usage();
    const failing = {
      get: async () => {
        throw new Error("KV is down");
      }
    };
    await countVisit({ CACHE: failing, USAGE } as never, from("203.0.113.9"), visit, NOON);
    expect(USAGE.points.map(point => point.index)).toEqual(["visit"]);
  });
});

describe("a visit sent on to Google Analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const stubFetch = () => {
    sent.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json({ validationMessages: [] });
    });
  };
  test("is a person's alone: production sends to the property, staging to the check, Europe to Google's European endpoint", async () => {
    stubFetch();
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    // the version Chrome's people led with: an isolate reads it once an hour
    await CACHE.put(leadName, JSON.stringify({ day: "2026-10-20", lead: 155 }));
    const env = {
      CACHE,
      USAGE,
      DEPLOYMENT: "production",
      GA4_API_SECRET: "the-secret",
      GA4_MEASUREMENT_ID: "G-TEST"
    };
    await countVisit(
      env as never,
      from("203.0.113.9"),
      { ...visit, path: "/ja/@ada/warm-tones" },
      NOON
    );
    expect(sent.map(hit => hit.url)).toEqual([
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=the-secret"
    ]);
    expect(sent[0]!.body).toMatchObject({
      client_id: USAGE.points[0]!.index,
      non_personalized_ads: true,
      user_location: { country_id: "US" },
      device: {
        category: "desktop",
        language: "en-US",
        operating_system: "Windows",
        browser: "Chrome",
        browser_version: "155"
      },
      events: [
        {
          name: "page_view",
          params: {
            page_location: "https://grabient.com/ja/@/collection",
            page_referrer: "https://www.google.com/",
            engagement_time_msec: 1
          }
        }
      ]
    });
    // the address and the user agent never go
    expect(JSON.stringify(sent[0]!.body)).not.toMatch(/203\.0\.113|Mozilla/);
    // a program's request, China's and a browser that asks not to be followed send nothing
    await countVisit(env as never, from("203.0.113.9", { "Accept-Language": "" }), visit, NOON);
    await countVisit(env as never, from("203.0.113.9", {}, "CN"), visit, NOON);
    await countVisit(env as never, from("203.0.113.9", { "Sec-GPC": "1" }), visit, NOON);
    // nor a Chromium far behind the version its people lead with
    const old = {
      "User-Agent": CHROME.replace("Chrome/155", "Chrome/145"),
      "Sec-CH-UA": '"Chromium";v="145", "Google Chrome";v="145"'
    };
    await countVisit(env as never, from("198.51.100.4", old), visit, NOON);
    expect(sent).toHaveLength(1);
    const german = Object.assign(from("203.0.113.9"), {
      cf: { country: "DE", isEUCountry: "1", asn: 3320 }
    });
    await countVisit({ ...env, DEPLOYMENT: "staging" } as never, german, visit, NOON);
    expect(sent[1]!.url).toMatch(/^https:\/\/region1\.google-analytics\.com\/debug\/mp\/collect\?/);
  });
  test("is a visit that shows a person: a landing from nowhere is counted and goes no further", async () => {
    stubFetch();
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    await CACHE.put(leadName, JSON.stringify({ day: "2026-10-20", lead: 155 }));
    const env = {
      CACHE,
      USAGE,
      DEPLOYMENT: "production",
      GA4_API_SECRET: "the-secret",
      GA4_MEASUREMENT_ID: "G-TEST"
    };
    const nowhere = { what: "landing", page: "home", language: "en" } as const;
    await countVisit(env as never, from("203.0.113.9"), nowhere, NOON);
    expect(USAGE.points).toHaveLength(1);
    expect(sent).toEqual([]);
    const shown = [
      { ...nowhere, campaign: "october" },
      { what: "load", page: "palette", language: "en" },
      { what: "framed", page: "palette", language: "en" },
      { what: "use", page: "palette", language: "en" }
    ] as const;
    for (const visit of shown) await countVisit(env as never, from("203.0.113.9"), visit, NOON);
    expect(sent.map(hit => (hit.body.events as { name: string }[]).at(-1)?.name)).toEqual([
      "page_view",
      "page_view",
      "page_view",
      "use_palette"
    ]);
    expect(showsPerson(nowhere)).toBe(false);
    expect(showsPerson({ ...nowhere, referrer: "news.ycombinator.com" })).toBe(true);
  });
  test("sends nothing while Chrome's stable version is unknown, as programs on old versions would pass", async () => {
    stubFetch();
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    const env = {
      CACHE,
      USAGE,
      DEPLOYMENT: "production",
      GA4_API_SECRET: "the-secret",
      GA4_MEASUREMENT_ID: "G-TEST"
    };
    await countVisit(env as never, from("203.0.113.9"), visit, NOON);
    expect(USAGE.points).toHaveLength(1);
    expect(sent).toEqual([]);
  });
  test("leaves the visit counted when Google cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const CACHE = memoryKV();
    const USAGE = usage();
    await makeVisitKeys({ CACHE } as never, NOON);
    await CACHE.put(leadName, JSON.stringify({ day: "2026-10-20", lead: 155 }));
    const env = {
      CACHE,
      USAGE,
      DEPLOYMENT: "production",
      GA4_API_SECRET: "s",
      GA4_MEASUREMENT_ID: "G-TEST"
    };
    await expect(
      countVisit(env as never, from("203.0.113.9"), visit, NOON)
    ).resolves.toBeUndefined();
    expect(USAGE.points).toHaveLength(1);
  });
});

describe("the day's lead", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  test("is Chrome's stable version as Google's release dashboard gives it, asked once a day", async () => {
    const CACHE = memoryKV();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(String(url));
      return Response.json([{ channel: "Stable", milestone: 156, version: "156.0.8078.48" }]);
    });
    expect(await makeVisitLead({ CACHE } as never, NOON)).toBe(156);
    expect(JSON.parse(CACHE.kept.get(leadName)!.value)).toEqual({ day: "2026-10-20", lead: 156 });
    expect(asked).toEqual([
      "https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1"
    ]);
    expect(await makeVisitLead({ CACHE } as never, NOON + 3_600_000)).toBeNull();
    expect(asked).toHaveLength(1);
  });
  test("is asked again at the next run when the dashboard does not answer, the version before it standing", async () => {
    const CACHE = memoryKV();
    await CACHE.put(leadName, JSON.stringify({ day: "2026-10-19", lead: 155 }));
    for (const answer of [
      async () => {
        throw new Error("offline");
      },
      async () => new Response(null, { status: 503 }),
      async () => Response.json({ error: "moved" }),
      async () => Response.json([{ version: "156.0.8078.48" }])
    ]) {
      vi.stubGlobal("fetch", answer);
      expect(await makeVisitLead({ CACHE } as never, NOON)).toBe("unanswered");
    }
    expect(JSON.parse(CACHE.kept.get(leadName)!.value)).toEqual({ day: "2026-10-19", lead: 155 });
  });
});
