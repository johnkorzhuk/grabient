import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { PAUSED, setFlag } from "@grabient/server/flags/flags.ts";
import { afterEach, describe, expect, it } from "vitest";
import { fileAnswer } from "../src/server/files/palette-files.ts";
import {
  cardAnswer,
  collectionPictureAnswer,
  pngAnswer,
  searchPictureAnswer,
  seedPngAnswer
} from "../src/server/images/answers.ts";
import golden from "../src/server/images/fixtures/pictures.json" with { type: "json" };
import { get, testEnv, unique, watchLimits } from "./helpers.ts";
import { decodePng, pixelHash } from "./png.ts";

/* Share cards in workerd: drawn with its CompressionStream, kept in the R2 bucket local development binds, refused by
   the flags in D1 and counted by the RateLimiter object. */

const SEED = golden.defaultSeed;

/** An isolate: a database binding of its own, so it keeps its own copy of the flags, and its waitUntil. */
function isolate(env = testEnv()) {
  const DB = new Proxy(env.DB, {
    get(target, key) {
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const kept: Promise<unknown>[] = [];
  return {
    env: { ...env, DB },
    keep: (work: Promise<unknown>) => void kept.push(work),
    settled: () => Promise.all(kept)
  };
}

/** A view no other test asks for, so its card is drawn here first. */
const fresh = () =>
  `steps=${3 + Math.floor(Math.random() * 97)}&angle=${Math.floor(Math.random() * 361)}`;

afterEach(async () => {
  await testEnv().DB.prepare("DELETE FROM k_flags").run();
});

describe("a collection's sheet", () => {
  /** A collection of Grabient's holding two palettes, at an address of its own. */
  async function stocked(env: Env, visibility: "public" | "private") {
    const id = unique("sheet");
    const slug = id.toLowerCase();
    await run(
      env.DB,
      `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, item_count, created_at, updated_at)
       VALUES (?, ?, 'agent', 'grabient', 'Sheet', ?, 2, 1, 1)`,
      id,
      slug,
      visibility
    );
    await run(
      env.DB,
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
       VALUES (?, 0, ?, 'linearGradient', 7, 90, 1), (?, 1, ?, 'radialSwatches', 5, 90, 1)`,
      id,
      SEED,
      id,
      golden.graySeed
    );
    return slug;
  }

  it("is drawn at the collection's address plus .png, kept in R2 for good, and read from there whatever its t", async () => {
    const env = testEnv();
    const slug = await stocked(env, "public");
    const first = isolate(env);
    const answer = await seedPngAnswer(get(`/${slug}.png?t=1`), first.env, first.keep);
    expect([
      answer.status,
      answer.headers.get("Content-Type"),
      answer.headers.get("X-Cache")
    ]).toEqual([200, "image/png", "MISS"]);
    const sheet = await decodePng(new Uint8Array(await answer.arrayBuffer()));
    expect([sheet.width, sheet.height]).toEqual([1200, 1200]);
    await first.settled();
    // Under sheets/, which the bucket's 30-day rule for cards/ never empties.
    const hash = answer.headers.get("ETag")?.slice('"image:k4:'.length, -1);
    expect([
      !!(await first.env.UPLOADS?.get(`sheets/k4/${hash}.png`)),
      !!(await first.env.UPLOADS?.get(`cards/k4/${hash}.png`))
    ]).toEqual([true, false]);
    const again = isolate(env);
    const read = await seedPngAnswer(get(`/${slug}.png?t=2`), again.env, again.keep);
    expect([read.status, read.headers.get("X-Cache")]).toEqual([200, "HIT"]);
  });

  it("is the same rows as SVG at the collection's address plus .svg, titled, and no file for a private one", async () => {
    const env = testEnv();
    const slug = await stocked(env, "public");
    const { env: bound } = isolate(env);
    const answer = await fileAnswer(get(`/${slug}.svg?t=1`), bound, "svg");
    const svg = await answer.text();
    expect([
      answer.status,
      answer.headers.get("Content-Type"),
      answer.headers.get("X-Robots-Tag")
    ]).toEqual([200, "image/svg+xml; charset=utf-8", "noindex"]);
    expect(
      svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"')
    ).toBe(true);
    expect([svg.includes("<title>Sheet</title>"), svg.match(/<clipPath /g)?.length]).toEqual([
      true,
      2
    ]);
    const hidden = await stocked(env, "private");
    expect((await fileAnswer(get(`/${hidden}.svg`), bound, "svg")).status).toBe(404);
  });

  it("is a search's own picture too, which has none to stand in while drawing is off", async () => {
    const off = isolate();
    await setFlag(off.env, "share-images", false, unique("admin"));
    const sheet = await searchPictureAnswer(get("/palettes/red.png"), off.env, off.keep, false);
    expect([sheet.status, sheet.headers.get(PAUSED)]).toEqual([503, "share-images"]);
  });

  it("is no file for a private collection, nor where no collection lives", async () => {
    const env = testEnv();
    const slug = await stocked(env, "private");
    const { env: bound, keep } = isolate(env);
    expect((await seedPngAnswer(get(`/${slug}.png`), bound, keep)).status).toBe(404);
    expect((await seedPngAnswer(get("/no-collection-lives-here.png"), bound, keep)).status).toBe(
      404
    );
    // a palette's address is still its picture
    expect((await seedPngAnswer(get(`/${SEED}.png?${fresh()}`), bound, keep)).status).toBe(200);
  });

  /** The bindings with each read of a collection's row or its palettes noted. */
  function reading(env: Env) {
    const read: string[] = [];
    const DB = new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (query: string) => {
            if (query.includes("k_collection")) read.push(query);
            return target.prepare(query);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    return { bound: { ...env, DB }, read };
  }

  /** The title and the rows of a collection's sheet as SVG. */
  async function svgSheet(env: Env, slug: string, t: number) {
    const svg = await (await fileAnswer(get(`/${slug}.svg?t=${t}`), env, "svg")).text();
    return [/<title>(.*)<\/title>/.exec(svg)?.[1], svg.match(/<clipPath /g)?.length];
  }

  it("reads its collection once for its SVG, the SVG's title and any card of its palettes, whatever their t or picks", async () => {
    const env = testEnv();
    const slug = await stocked(env, "public");
    const { bound, read } = reading(env);
    for (const t of [1, 2, 3])
      expect((await fileAnswer(get(`/${slug}.svg?t=${t}`), bound, "svg")).status).toBe(200);
    // its row and its palettes, once
    expect(read).toHaveLength(2);
    // a palette it does not hold is no card, and reads nothing more
    for (const pick of [golden.eightSeed, `${golden.eightSeed}~linearSwatches~6~90`]) {
      const card = await collectionPictureAnswer(
        get(`/api/og/collection?slug=${slug}&pick=${pick}`),
        bound,
        () => {},
        true
      );
      expect([pick, card.status]).toEqual([pick, 404]);
    }
    expect(read).toHaveLength(2);
  });

  it("reads its collection again for an address whose t names a change made after the read, and draws the change", async () => {
    const env = testEnv();
    const slug = await stocked(env, "public");
    const { bound, read } = reading(env);
    expect(await svgSheet(bound, slug, 1)).toEqual(["Sheet", 2]);
    // renamed and a palette taken out a moment later, which the collection's page names as its t
    await new Promise(done => setTimeout(done, 5));
    const changed = Date.now();
    await run(
      env.DB,
      "UPDATE k_collections SET title = 'Renamed', item_count = 1, updated_at = ? WHERE slug = ?",
      changed,
      slug
    );
    await run(
      env.DB,
      "DELETE FROM k_collection_items WHERE position = 1 AND collection_id = (SELECT id FROM k_collections WHERE slug = ?)",
      slug
    );
    expect(await svgSheet(bound, slug, changed)).toEqual(["Renamed", 1]);
    expect(read).toHaveLength(4);
    // its card for the same change, and the sheet asked for again, read nothing more
    const card = await collectionPictureAnswer(
      get(`/api/og/collection?slug=${slug}&t=${changed}`),
      bound,
      () => {},
      true
    );
    expect(card.status).toBe(200);
    expect(await svgSheet(bound, slug, changed)).toEqual(["Renamed", 1]);
    expect(read).toHaveLength(4);
  });

  it("holds more collections than are public, so a walk over all of them reads each once", async () => {
    const env = testEnv();
    const stem = unique("walk").toLowerCase();
    // four hundred and twenty public collections of one palette each: the copy of staging's data holds 411
    await run(
      env.DB,
      `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 419)
       INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, item_count, created_at, updated_at)
       SELECT ? || '-' || i, ? || '-' || i, 'agent', 'grabient', 'Walk', 'public', 1, 1, 1 FROM n`,
      stem,
      stem
    );
    await run(
      env.DB,
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
       SELECT id, 0, ?, 'linearGradient', 7, 90, 1 FROM k_collections WHERE id LIKE ? || '-%'`,
      SEED,
      stem
    );
    const { bound, read } = reading(env);
    const slugs = Array.from({ length: 420 }, (_, i) => `${stem}-${i}`);
    for (const slug of slugs) expect(await svgSheet(bound, slug, 0)).toEqual(["Walk", 1]);
    expect(read).toHaveLength(840);
    for (const slug of slugs) expect(await svgSheet(bound, slug, 0)).toEqual(["Walk", 1]);
    expect(read).toHaveLength(840);
  });
});

describe("a share card", () => {
  it("is drawn as the golden card, kept in R2 under its version and key, and read from there", async () => {
    const first = isolate();
    const answer = await cardAnswer(get(`/api/og?seed=${SEED}`), first.env, first.keep);
    const png = new Uint8Array(await answer.arrayBuffer());
    const card = await decodePng(png);
    const want = golden.pictures.find(
      picture => picture.name === "card default (3 keyframe chips)"
    );
    expect(await pixelHash(card.pixels)).toBe(want?.rgbSha256);
    await first.settled();
    const hash = answer.headers.get("ETag")?.slice('"image:k4:'.length, -1);
    const object = await first.env.UPLOADS?.get(`cards/k4/${hash}.png`);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(png);
    const again = isolate();
    const read = await cardAnswer(get(`/api/og?seed=${SEED}&v=k4`), again.env, again.keep);
    expect([read.headers.get("X-Cache"), new Uint8Array(await read.arrayBuffer())]).toEqual([
      "HIT",
      png
    ]);
  });

  it("is the site's card while drawing is off, unless R2 holds it; a palette's picture is its SVG", async () => {
    const view = fresh();
    const on = isolate();
    await cardAnswer(get(`/api/og?seed=${SEED}&${view}`), on.env, on.keep);
    await on.settled();
    const off = isolate();
    await setFlag(off.env, "share-images", false, unique("admin"));
    const kept = await cardAnswer(get(`/api/og?seed=${SEED}&${view}`), off.env, off.keep);
    expect([kept.status, kept.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    const other = await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), off.env, off.keep);
    expect([other.status, other.headers.get("Location")]).toEqual([
      302,
      "https://grabient.test/grabient.png"
    ]);
    const png = await pngAnswer(
      get(`/api/png?seed=${SEED}&style=radialSwatches&steps=5&w=600&h=400`),
      off.env,
      off.keep
    );
    const svg = `https://grabient.test/${SEED}.svg?style=radialSwatches&steps=5&size=600x400`;
    expect([png.status, png.headers.get("Location")]).toEqual([302, svg]);
    expect(png.headers.get("CDN-Cache-Control")).toBe("no-store");
    const drawn = await (await fileAnswer(get(svg), off.env, "svg")).text();
    expect(drawn).toContain('width="600" height="400"');
    // a picture of several palettes has none to stand in
    const several = await searchPictureAnswer(
      get("/api/png/query?query=red"),
      off.env,
      off.keep,
      false
    );
    expect([several.status, await several.text()]).toEqual([503, "Image temporarily unavailable"]);
    expect(several.headers.get(PAUSED)).toBe("share-images");
    await setFlag(off.env, "share-images", true, unique("admin"));
    expect(
      (await pngAnswer(get(`/api/png?seed=${SEED}&${fresh()}`), off.env, off.keep)).status
    ).toBe(200);
  });
});

describe("the allowances", () => {
  it("ask the RateLimiter object for the site's days alone, a large picture's first", async () => {
    const { env, asked } = watchLimits(testEnv());
    const { keep } = isolate(env);
    expect((await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), env, keep)).status).toBe(200);
    expect(asked).toEqual(["imageRenderDaily"]);
    asked.length = 0;
    const large = await pngAnswer(get(`/api/png?seed=${SEED}&${fresh()}&w=2400&h=1260`), env, keep);
    expect([large.status, asked]).toEqual([200, ["largeImageDaily", "imageRenderDaily"]]);
  });

  it("fail closed where production has lost its limiter", async () => {
    const { env, keep } = isolate(testEnv({ DEPLOYMENT: "production", RATE_LIMITER: undefined }));
    const refused = await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), env, keep);
    expect([refused.status, refused.headers.get("Cache-Control")]).toEqual([503, "no-store"]);
    // no switch refused it: a failure the owner's alert counts
    expect(refused.headers.has(PAUSED)).toBe(false);
  });
});
