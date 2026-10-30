import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionSitemapRows } from "../src/server/collections/read.ts";
import { fingerprint } from "../src/server/mcp/admin/translations.ts";
import { indexNowKeyFile, sendIndexNow } from "../src/server/seo/indexnow.ts";
import { legacyLanding } from "../src/server/seo/legacy.ts";
import { markdownFile } from "../src/server/seo/markdown.ts";
import { markdownReads } from "../src/server/seo/markdown-reads.ts";
import { paletteRows, paletteShards, sitemapFile } from "../src/server/seo/sitemaps.ts";
import { githubStars, refreshStars } from "../src/server/seo/stars.ts";
import { testEnv, unique } from "./helpers.ts";

const KEY = "72485ec9cfd023fba2cad980920af669";
/** Production as cloudflare.config.ts sets it, over this test's database and KV. */
const production = (values: Partial<Env> = {}) =>
  testEnv({
    DEPLOYMENT: "production",
    PUBLIC_ORIGIN: "https://grabient.com",
    INDEXNOW_KEY: KEY,
    ...values
  });

/** A gallery palette, saved in the default view unless one is named. */
async function palette(
  env: Env,
  seed: string,
  rowid?: number,
  createdAt = 1_700_000_000_000,
  view: [string, number, number] = ["linearGradient", 7, 90]
) {
  await run(
    env.DB,
    `INSERT INTO k_palettes (${rowid ? "rowid, " : ""}seed, style, steps, angle, created_at)
     VALUES (${rowid ? "?, " : ""}?, ?, ?, ?, ?)`,
    ...(rowid ? [rowid] : []),
    seed,
    ...view,
    createdAt
  );
}
async function collection(env: Env, visibility: "public" | "private", updatedAt: number) {
  const id = unique("c");
  const slug = unique("ocean").toLowerCase();
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
     VALUES (?, ?, 'agent', 'grabient', 'Ocean', ?, ?, ?)`,
    id,
    slug,
    visibility,
    updatedAt,
    updatedAt
  );
  return { id, slug };
}

afterEach(async () => {
  const env = testEnv();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM k_palettes"),
    env.DB.prepare("DELETE FROM k_collections"),
    env.DB.prepare("DELETE FROM k_translations")
  ]);
  await env.CACHE?.delete("indexnow");
  await env.CACHE?.delete("indexnow-refused");
  await env.CACHE?.delete("github-stars");
});

describe("sitemaps", () => {
  it("name one palette file for each 5,000 rowids, the highest deciding, and read only that file's range", async () => {
    const env = testEnv();
    expect(await paletteShards(env)).toBe(1);
    await palette(env, "kS7Q8Yy5S_SChv0", 12_345, 1_700_000_000_000, ["linearSwatches", 9, 45]);
    // the same palette written another way is listed once, as its canonical seed
    await palette(env, "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", 12_000, 1_704_153_600_000);
    await palette(env, "kY4mpDazO-mUuu_fuLqXU49dvVP6", 9_000);
    expect(await paletteShards(env)).toBe(3);
    // each in the view the gallery saved it in, which its page names as canonical, its steps never under its keyframes,
    // with its picture in that view: the PNG under its page's painted picture
    expect(await paletteRows(env, 3)).toEqual([
      {
        seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
        view: { style: "linearGradient", steps: 8, angle: 90 },
        createdAt: 1_704_153_600_000,
        image: "/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ.png?steps=8"
      },
      {
        seed: "kS7Q8Yy5S_SChv0",
        view: { style: "linearSwatches", steps: 9, angle: 45 },
        createdAt: 1_700_000_000_000,
        image: "/kS7Q8Yy5S_SChv0.png?style=linearSwatches&steps=9&angle=45"
      }
    ]);
    const xml = await sitemapFile(env, "palettes-3", "https://grabient.com");
    expect(xml).toContain(
      "<loc>https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?steps=8</loc><lastmod>2024-01-02</lastmod>"
    );
    expect(xml).toContain(
      "<loc>https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&amp;steps=9&amp;angle=45</loc>"
    );
    expect(xml).toContain(
      "<image:loc>https://grabient.com/kS7Q8Yy5S_SChv0.png?style=linearSwatches&amp;steps=9&amp;angle=45</image:loc>"
    );
    expect(xml).not.toContain("kY4mpDazO");
    expect(await sitemapFile(env, "palettes-0", "https://grabient.com")).toBeNull();
  });

  it("list every public collection, the latest change first, and no private one", async () => {
    const env = testEnv();
    const older = await collection(env, "public", 1_000);
    const hidden = await collection(env, "private", 3_000);
    const newer = await collection(env, "public", 2_000);
    const rows = await collectionSitemapRows(env);
    expect(rows).toEqual([
      { slug: newer.slug, updatedAt: 2_000 },
      { slug: older.slug, updatedAt: 1_000 }
    ]);
    expect(await sitemapFile(env, "collections", "https://grabient.com")).not.toContain(
      hidden.slug
    );
  });

  it("list one of Grabient's collections in each language whose translation is of the English it has now", async () => {
    const env = testEnv();
    const current = await collection(env, "public", 1_000);
    const stale = await collection(env, "public", 2_000);
    const translate = (id: string, locale: string, source: string, updatedAt: number) =>
      run(
        env.DB,
        "INSERT INTO k_translations (kind, locale, key, title, source, updated_at) VALUES ('collection', ?, ?, '海', ?, ?)",
        locale,
        id,
        source,
        updatedAt
      );
    await translate(current.id, "ja", fingerprint("Ocean", ""), 1_760_000_000_000);
    await translate(current.id, "de", fingerprint("Ocean, before", ""), 1_760_000_000_000);
    await translate(stale.id, "ja", fingerprint("Ocean, before", ""), 1_760_000_000_000);
    const xml = (await sitemapFile(env, "collections", "https://grabient.com")) ?? "";
    expect(xml).toContain(
      `<url><loc>https://grabient.com/ja/${current.slug}</loc><lastmod>2025-10-09</lastmod><image:image><image:loc>https://grabient.com/${current.slug}.png?t=1000</image:loc></image:image></url>`
    );
    expect(xml).not.toContain(`/de/${current.slug}`);
    expect(xml).not.toContain(`/ja/${stale.slug}`);
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });
});

describe("a palette's Markdown", () => {
  it("names its page at the view the gallery saved it in, with no words written for it", async () => {
    const env = testEnv();
    await palette(env, "kS7Q8Yy5S_SChv0", undefined, 1, ["linearSwatches", 9, 45]);
    const response = await markdownFile(
      "kS7Q8Yy5S_SChv0",
      new Request("https://grabient.com/kS7Q8Yy5S_SChv0.md"),
      "https://grabient.com",
      markdownReads(env)
    );
    expect(response.headers.get("Link")).toBe(
      '<https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45>; rel="alternate"; type="text/html"'
    );
  });
});

type Handler = (context: { request: Request }) => Promise<Response>;
const guides = import.meta.glob<{
  Route: { options: { server: { handlers: { GET: Handler } } } };
}>("../src/routes/llms*.ts");

it("serves the guides for agents to every site and out of search results", async () => {
  expect(Object.keys(guides)).toHaveLength(2);
  for (const [file, load] of Object.entries(guides)) {
    const answer = await (await load()).Route.options.server.handlers.GET({
      request: new Request("https://grabient.com/llms.txt")
    });
    expect([
      file,
      answer.headers.get("X-Robots-Tag"),
      answer.headers.get("Access-Control-Allow-Origin")
    ]).toEqual([file, "noindex", "*"]);
  }
});

describe("an old grabient.com link that names no view", () => {
  it("lands on its palette's own address, the view the gallery saved it in", async () => {
    const env = testEnv();
    const old = "/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu";
    expect(await legacyLanding(env, old)).toBe("/kY4mpDazO-mUuu_fuLqXU49dvVP6");
    await palette(env, "kY4mpDazO-mUuu_fuLqXU49dvVP6", undefined, 1, ["linearGradient", 6, 45]);
    expect(await legacyLanding(env, old)).toBe("/kY4mpDazO-mUuu_fuLqXU49dvVP6?steps=6&angle=45");
  });
});

describe("IndexNow", () => {
  const ENGINES = [
    "https://yandex.com/indexnow",
    "https://search.seznam.cz/indexnow",
    "https://api.indexnow.org/indexnow"
  ];
  const ALL_REFUSED = (status: number) => ({
    "yandex.com": status,
    "search.seznam.cz": status,
    "api.indexnow.org": status
  });
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  /** Engines that answer `status`, or each its own by host (202 where none is named). */
  const engine =
    (status: number | Record<string, number> = 202): typeof fetch =>
    async (input, init) => {
      posts.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      const answer =
        typeof status === "number" ? status : (status[new URL(String(input)).hostname] ?? 202);
      return new Response(null, { status: answer });
    };
  /** A translation of a collection's words, of the English whose fingerprint is `source`. */
  const translation = (env: Env, id: string, locale: string, source: string, updatedAt: number) =>
    run(
      env.DB,
      "INSERT INTO k_translations (kind, locale, key, title, source, updated_at) VALUES ('collection', ?, ?, '海', ?, ?)",
      locale,
      id,
      source,
      updatedAt
    );
  afterEach(() => {
    posts.length = 0;
  });

  it("serves the key at /{key}.txt, and nothing for another name or a key the protocol refuses", async () => {
    const file = indexNowKeyFile({ INDEXNOW_KEY: KEY }, KEY);
    expect(await file?.text()).toBe(KEY);
    expect(file?.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(indexNowKeyFile({ INDEXNOW_KEY: KEY }, "robots")).toBeNull();
    expect(indexNowKeyFile({}, KEY)).toBeNull();
    expect(indexNowKeyFile({ INDEXNOW_KEY: "short" }, "short")).toBeNull();
  });

  it("sends from production alone, and only with its key and KV", async () => {
    expect(await sendIndexNow(production({ INDEXNOW_KEY: undefined }), engine())).toEqual({
      skipped: "no key"
    });
    const staging = testEnv({
      DEPLOYMENT: "staging",
      PUBLIC_ORIGIN: "https://staging.grabient.com",
      INDEXNOW_KEY: KEY
    });
    expect(await sendIndexNow(staging, engine())).toEqual({ skipped: "not indexed" });
    expect(await sendIndexNow(production({ CACHE: undefined }), engine())).toEqual({
      skipped: "no KV"
    });
    expect(posts).toEqual([]);
  });

  it("sends every address the sitemaps list and every old one once, in lists of 10,000 at most, then marks where things stand", async () => {
    const env = production();
    await palette(env, "kS7Q8Yy5S_SChv0", 10, 1, ["linearSwatches", 9, 45]);
    const before = await collection(env, "public", 5_000);
    const first = await sendIndexNow(env, engine());
    expect(first).toMatchObject({
      marked: { version: 2, palette: 10, collection: 5_000, translation: 0 },
      engine: "yandex.com"
    });
    const sent = posts.flatMap(post => post.body.urlList as string[]);
    expect(first).toMatchObject({ sent: sent.length });
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent.length).toBeGreaterThan(6_718);
    for (const post of posts) {
      expect(post.url).toBe("https://yandex.com/indexnow");
      expect((post.body.urlList as string[]).length).toBeLessThanOrEqual(10_000);
    }
    expect(sent).toEqual(
      expect.arrayContaining([
        "https://grabient.com/",
        "https://grabient.com/ja/palettes",
        "https://grabient.com/palettes?q=warm",
        `https://grabient.com/${before.slug}`,
        "https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45",
        "https://grabient.com/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu"
      ])
    );
    posts.length = 0;
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 0, status: 0 });
    expect(posts).toEqual([]);
  });

  it("sends the whole site again over marks of an earlier version, whose lists went to Microsoft alone", async () => {
    const env = production();
    await palette(env, "kS7Q8Yy5S_SChv0", 10);
    // the old marks, and eleven tries of a list they held back
    await env.CACHE?.put(
      "indexnow",
      JSON.stringify({ palette: 10, collection: 0, translation: 0 })
    );
    await env.CACHE?.put("indexnow-refused", "11");
    // that list's tries go with them: a first pass refused for now has a dozen of its own
    expect(await sendIndexNow(env, engine(429))).toMatchObject({ sent: 0, status: 429 });
    expect(await env.CACHE?.get("indexnow")).toBeNull();
    expect(await env.CACHE?.get("indexnow-refused")).toBe("1");
    posts.length = 0;
    expect(await sendIndexNow(env, engine())).toMatchObject({
      marked: { version: 2, palette: 10 },
      engine: "yandex.com"
    });
    expect(posts.flatMap(post => post.body.urlList as string[]).length).toBeGreaterThan(6_718);
    expect(await env.CACHE?.get("indexnow-refused")).toBeNull();
  });

  it("then sends what is new in one ordered list, a changed collection in each language its page is indexed in, and moves its marks on", async () => {
    const env = production();
    await palette(env, "kS7Q8Yy5S_SChv0", 10);
    const before = await collection(env, "public", 5_000);
    const changed = await collection(env, "public", 5_500);
    await translation(env, changed.id, "ja", fingerprint("Ocean", ""), 5_500);
    // a German translation of words the collection no longer has: its German page is not indexed
    await translation(env, changed.id, "de", fingerprint("Ocean, before", ""), 5_500);
    await sendIndexNow(env, engine());
    posts.length = 0;

    await palette(env, "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", 11, 1, ["linearSwatches", 9, 45]);
    await run(env.DB, "UPDATE k_collections SET updated_at = 6000 WHERE id = ?", changed.id);
    await collection(env, "private", 7_000);
    const translated = await collection(env, "public", 4_000);
    await translation(env, translated.id, "fr", fingerprint("Ocean", ""), 8_000);
    await translation(env, translated.id, "ko", fingerprint("Ocean, before", ""), 8_500);
    expect(await sendIndexNow(env, engine())).toEqual({
      sent: 4,
      status: 202,
      engine: "yandex.com"
    });
    expect(posts).toEqual([
      {
        url: "https://yandex.com/indexnow",
        body: {
          host: "grabient.com",
          key: KEY,
          keyLocation: `https://grabient.com/${KEY}.txt`,
          urlList: [
            "https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?style=linearSwatches&steps=9&angle=45",
            `https://grabient.com/${changed.slug}`,
            `https://grabient.com/ja/${changed.slug}`,
            `https://grabient.com/fr/${translated.slug}`
          ]
        }
      }
    ]);
    expect(posts[0].body.urlList).not.toContain(`https://grabient.com/${before.slug}`);
    expect(await env.CACHE?.get("indexnow", "json")).toEqual({
      version: 2,
      palette: 11,
      collection: 6_000,
      translation: 8_500
    });
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 0, status: 0 });
  });

  it("goes on to the next engine when one refuses a list, and says who took it", async () => {
    const env = production();
    await sendIndexNow(env, engine());
    posts.length = 0;
    await palette(env, "kS7Q8Yy5S_SChv0");
    expect(await sendIndexNow(env, engine({ "yandex.com": 429 }))).toEqual({
      sent: 1,
      status: 202,
      engine: "search.seznam.cz",
      refused: { "yandex.com": 429 }
    });
    expect(posts.map(post => post.url)).toEqual(ENGINES.slice(0, 2));
    expect(await env.CACHE?.get("indexnow-refused")).toBeNull();
    // a refusal for good from one engine and for now from the rest: the list goes again
    posts.length = 0;
    await palette(env, "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ");
    const mixed = { "yandex.com": 403, "search.seznam.cz": 429, "api.indexnow.org": 503 };
    expect(await sendIndexNow(env, engine(mixed))).toEqual({
      sent: 0,
      status: 429,
      refused: mixed
    });
    expect(await sendIndexNow(env, engine())).toEqual({
      sent: 1,
      status: 202,
      engine: "yandex.com"
    });
    expect(posts.map(post => post.url)).toEqual([...ENGINES, ENGINES[0]]);
  });

  it("sends a list every engine refused for now again on the next pass", async () => {
    const env = production();
    // a first pass refused marks nothing, and the next sends it all again
    expect(await sendIndexNow(env, engine(429))).toEqual({
      sent: 0,
      status: 429,
      refused: ALL_REFUSED(429)
    });
    expect(posts.map(post => post.url)).toEqual(ENGINES);
    expect(await env.CACHE?.get("indexnow")).toBeNull();
    expect(await sendIndexNow(env, engine())).toMatchObject({ marked: {} });
    expect(posts[3]?.body.urlList).toEqual(posts[0]?.body.urlList);
    posts.length = 0;
    await palette(env, "kS7Q8Yy5S_SChv0");
    expect(await sendIndexNow(env, engine(429))).toMatchObject({ sent: 0, status: 429 });
    expect(await sendIndexNow(env, engine(200))).toEqual({
      sent: 1,
      status: 200,
      engine: "yandex.com"
    });
    expect(posts.map(post => post.body.urlList)).toEqual(
      Array(4).fill(["https://grabient.com/kS7Q8Yy5S_SChv0"])
    );
  });

  it("moves on from a list refused for good at once, and from one refused for now after a dozen passes", async () => {
    const env = production();
    // a key the engines cannot check: sending it again changes nothing, so the first pass marks where things stand
    expect(await sendIndexNow(env, engine(403))).toEqual({
      sent: 0,
      status: 403,
      refused: ALL_REFUSED(403)
    });
    expect(await env.CACHE?.get("indexnow", "json")).toMatchObject({ version: 2, palette: 0 });
    posts.length = 0;
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 0, status: 0 });
    expect(posts).toEqual([]);
    // a list refused for now goes again on the next eleven passes, and the twelfth moves on
    await palette(env, "kS7Q8Yy5S_SChv0");
    for (let pass = 1; pass <= 12; pass++)
      expect(await sendIndexNow(env, engine(503))).toEqual({
        sent: 0,
        status: 503,
        refused: ALL_REFUSED(503)
      });
    expect(posts).toHaveLength(12 * ENGINES.length);
    expect(await env.CACHE?.get("indexnow-refused")).toBeNull();
    posts.length = 0;
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 0, status: 0 });
    expect(posts).toEqual([]);
  });
});

describe("GitHub stars", () => {
  const DAY = 86_400_000;
  const github =
    (answers: Record<string, Response | (() => Response)>, asked: string[] = []): typeof fetch =>
    async input => {
      const url = String(input);
      asked.push(url);
      const answer = answers[url.includes("/search/") ? "search" : "repo"];
      return typeof answer === "function"
        ? answer()
        : (answer?.clone() ?? new Response(null, { status: 500 }));
    };
  const repo = (stars: number) =>
    Response.json({ full_name: "johnkorzhuk/grabient", stargazers_count: stars });

  it("are asked of GitHub once a day and kept, and a page reads only the kept count", async () => {
    const env = testEnv();
    expect(await githubStars(env)).toBeNull();
    const asked: string[] = [];
    const now = Date.now();
    expect(await refreshStars(env, { now, fetch: github({ repo: repo(41) }, asked) })).toEqual({
      asked: true,
      stars: 41
    });
    expect(await githubStars(env)).toBe(41);
    expect(
      await refreshStars(env, { now: now + DAY - 1, fetch: github({ repo: repo(42) }, asked) })
    ).toEqual({
      asked: false
    });
    expect(asked).toHaveLength(1);
  });

  it("are read from GitHub's search when the repository's own endpoint is refused", async () => {
    const env = testEnv();
    const refused = () => Response.json({ message: "API rate limit exceeded" }, { status: 403 });
    const search = Response.json({
      items: [{ full_name: "JohnKorzhuk/Grabient", stargazers_count: 43 }]
    });
    expect(await refreshStars(env, { fetch: github({ repo: refused, search }) })).toEqual({
      asked: true,
      stars: 43
    });
  });

  it("keep the count GitHub gave when it gives none, and ask again an hour later", async () => {
    const env = testEnv();
    const now = Date.now();
    await refreshStars(env, { now: now - 2 * DAY, fetch: github({ repo: repo(40) }) });
    const failing = github({ repo: new Response(null, { status: 502 }) });
    expect(await refreshStars(env, { now, fetch: failing })).toMatchObject({
      asked: true,
      error: expect.stringContaining("GitHub answered 502")
    });
    expect(await refreshStars(env, { now: now + 1_000, fetch: failing })).toEqual({ asked: false });
    expect(
      await refreshStars(env, { now: now + 3_600_000, fetch: github({ repo: repo(44) }) })
    ).toEqual({
      asked: true,
      stars: 44
    });
  });

  it("never wait on a read another request began, which may never come back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const env = testEnv();
      await refreshStars(env, { fetch: github({ repo: repo(45) }) });
      /* another isolate's view of the same KV, whose reads never come back while `stuck`, as one whose request was
         cancelled */
      const isolate = () => {
        const view = { stuck: false };
        const CACHE = new Proxy(env.CACHE!, {
          get(target, key) {
            if (key === "get" && view.stuck) return () => new Promise(() => {});
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          }
        });
        return Object.assign(view, { env: { ...env, CACHE } });
      };
      const reader = isolate();
      expect(await githubStars(reader.env)).toBe(45);
      vi.advanceTimersByTime(3_600_001);
      reader.stuck = true;
      void githubStars(reader.env);
      reader.stuck = false;
      expect(await githubStars(reader.env)).toBe(45);
      const cold = isolate();
      cold.stuck = true;
      void githubStars(cold.env);
      cold.stuck = false;
      expect(await githubStars(cold.env)).toBe(45);
    } finally {
      vi.useRealTimers();
    }
  });
});
