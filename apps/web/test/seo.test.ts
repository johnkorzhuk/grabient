import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { afterEach, describe, expect, it } from "vitest";
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
    // each in the view the gallery saved it in, which its page names as canonical, its steps never under its keyframes
    expect(await paletteRows(env, 3)).toEqual([
      {
        seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
        view: { style: "linearGradient", steps: 8, angle: 90 },
        createdAt: 1_704_153_600_000,
        image: "/api/og?seed=kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ&v=k4&steps=8"
      },
      {
        seed: "kS7Q8Yy5S_SChv0",
        view: { style: "linearSwatches", steps: 9, angle: 45 },
        createdAt: 1_700_000_000_000,
        image: "/api/og?seed=kS7Q8Yy5S_SChv0&v=k4&style=linearSwatches&steps=9&angle=45"
      }
    ]);
    const xml = await sitemapFile(env, "palettes-3", "https://grabient.com");
    expect(xml).toContain(
      "<loc>https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?steps=8</loc><lastmod>2024-01-02</lastmod>"
    );
    expect(xml).toContain(
      "<loc>https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&amp;steps=9&amp;angle=45</loc>"
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
      `<url><loc>https://grabient.com/ja/${current.slug}</loc><lastmod>2025-10-09</lastmod></url>`
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
      '<https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45>; rel="canonical"'
    );
  });
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
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const engine =
    (status = 202): typeof fetch =>
    async (input, init) => {
      posts.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response(null, { status });
    };
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

  it("marks where things stand first, then sends what is new in one ordered list and moves its marks on", async () => {
    const env = production();
    await palette(env, "kS7Q8Yy5S_SChv0", 10);
    const before = await collection(env, "public", 5_000);
    expect(await sendIndexNow(env, engine())).toEqual({
      marked: { palette: 10, collection: 5_000, translation: 0 }
    });
    expect(posts).toEqual([]);

    await palette(env, "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", 11, 1, ["linearSwatches", 9, 45]);
    const changed = await collection(env, "public", 6_000);
    await collection(env, "private", 7_000);
    await run(
      env.DB,
      "INSERT INTO k_translations (kind, locale, key, title, updated_at) VALUES ('collection', 'ja', ?, '海', 8000)",
      changed.id
    );
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 3, status: 202 });
    expect(posts).toEqual([
      {
        url: "https://api.indexnow.org/indexnow",
        body: {
          host: "grabient.com",
          key: KEY,
          keyLocation: `https://grabient.com/${KEY}.txt`,
          urlList: [
            "https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?style=linearSwatches&steps=9&angle=45",
            `https://grabient.com/${changed.slug}`,
            `https://grabient.com/ja/${changed.slug}`
          ]
        }
      }
    ]);
    expect(posts[0].body.urlList).not.toContain(`https://grabient.com/${before.slug}`);
    expect(await env.CACHE?.get("indexnow", "json")).toEqual({
      palette: 11,
      collection: 6_000,
      translation: 8_000
    });
    expect(await sendIndexNow(env, engine())).toEqual({ sent: 0, status: 0 });
  });

  it("sends a refused list again on the next pass", async () => {
    const env = production();
    expect(await sendIndexNow(env, engine())).toMatchObject({ marked: {} });
    await palette(env, "kS7Q8Yy5S_SChv0");
    expect(await sendIndexNow(env, engine(429))).toEqual({ sent: 0, status: 429 });
    expect(await sendIndexNow(env, engine(200))).toEqual({ sent: 1, status: 200 });
    expect(posts.map(post => post.body.urlList)).toEqual([
      ["https://grabient.com/kS7Q8Yy5S_SChv0"],
      ["https://grabient.com/kS7Q8Yy5S_SChv0"]
    ]);
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
});
