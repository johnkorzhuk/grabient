import { all, first, run } from "@grabient/server/db/d1.ts";
import { beforeEach, describe, expect, it } from "vitest";
import corpus from "../public/corpus-k.json" with { type: "json" };
import golden from "../src/features/gallery/fixtures/list-pages.json" with { type: "json" };
import { likeCounts, likeInput, savedPage, setLike } from "../src/server/gallery/likes.ts";
import { forgetGalleryCount, listPalettes } from "../src/server/gallery/list.ts";
import { rescore } from "../src/server/gallery/rescore.ts";
import { risen } from "../src/server/gallery/scores.ts";
import { bodyOf, get, makeAccount, makeAdmin, ORIGIN, testEnv, unique } from "./helpers.ts";

/* The gallery against D1 with every migration: its lists, likes as the server applies them, and the six-hour pass.
   The list tests read the gallery whole, so each starts from the fifty palettes grabient4's goldens were made with. */

const DAY = 86_400_000;
const FIFTY = corpus.items.slice(0, 50);
const seedAt = (i: number) => FIFTY[i]!.kseed;
const like = (seed: string, liked = true) =>
  likeInput({ seed, liked, style: "linearGradient", steps: 7, angle: 90 })!;
const request = new Request(ORIGIN);

async function fifty() {
  const env = testEnv();
  await run(env.DB, "DELETE FROM k_likes");
  await run(env.DB, "DELETE FROM k_collection_items");
  await run(env.DB, "DELETE FROM k_collections");
  await run(env.DB, "DELETE FROM k_palettes");
  for (const [i, item] of FIFTY.entries()) {
    await run(
      env.DB,
      `INSERT INTO k_palettes (seed, style, steps, angle, likes_count, created_at, hot, rising)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      item.kseed,
      item.style,
      item.steps,
      item.angle,
      i % 7,
      1_600_000_000_000 + i * DAY,
      (i * 37) % 11,
      i % 5 ? 0 : 7000 + i
    );
  }
  forgetGalleryCount();
  return env;
}

const summary = (page: Awaited<ReturnType<typeof listPalettes>>) => ({
  total: page.total,
  page: page.page,
  limit: page.limit,
  totalPages: page.totalPages,
  seeds: page.items.map(item => item.kseed)
});

describe("lists", () => {
  beforeEach(async () => {
    await fifty();
  });

  it("read each order through its index, as grabient4 did", async () => {
    const env = testEnv();
    expect(summary(await listPalettes(env, { sort: "popular", limit: 12 }))).toEqual(
      golden.popular
    );
    expect(summary(await listPalettes(env, { sort: "rising", limit: 12 }))).toEqual(golden.rising);
    expect(summary(await listPalettes(env, { sort: "newest", page: 2, limit: 12 }))).toEqual(
      golden.newest
    );
    const hot = await listPalettes(env, { sort: "hot", limit: 12, count: false });
    expect(hot.items.map(item => item.kseed)).toEqual(golden.hot.seeds);
  });

  it("count the gallery past its end, even before an isolate has counted it", async () => {
    const env = testEnv();
    expect(summary(await listPalettes(env, { page: 99 }))).toMatchObject({
      total: 50,
      totalPages: 3,
      seeds: []
    });
    expect(summary(await listPalettes(env, { page: 99 }))).toEqual(golden.pastEndCounted);
  });

  it("show a palette in its own view, never with fewer steps than its keyframes", async () => {
    const env = testEnv();
    const [first] = (await listPalettes(env, { sort: "rising", limit: 1 })).items;
    const { kseed, style, steps, angle, likes, createdAt } = golden.firstItem;
    expect(first).toEqual({ kseed, style, steps, angle, likes, createdAt });
  });

  it("leave out a row whose seed the codec writes otherwise", async () => {
    const env = testEnv();
    await run(
      env.DB,
      "UPDATE k_palettes SET seed = ? WHERE seed = ?",
      `${seedAt(0)}AAAA`,
      seedAt(0)
    );
    const seeds = (await listPalettes(env, { limit: 96 })).items.map(item => item.kseed);
    expect(seeds).toHaveLength(49);
    expect(seeds).not.toContain(`${seedAt(0)}AAAA`);
  });

  it("count again once the gallery grows past the count kept", async () => {
    const env = testEnv();
    expect((await listPalettes(env, { limit: 24 })).total).toBe(50);
    const account = await makeAccount(env);
    const outside = corpus.items[60]!.kseed;
    expect((await setLike(env, account, like(outside))).joined).toBe(true);
    expect((await listPalettes(env, { limit: 24 })).total).toBe(51);
  });
});

type Handler = (context: { request: Request }) => Promise<Response>;
const hotRoute = import.meta.glob<{
  Route: { options: { server: { handlers: { GET: Handler } } } };
}>("../src/routes/api/hot.ts");

describe("the home as data", () => {
  beforeEach(async () => {
    await fifty();
  });
  const hot = async (query: string) => {
    const { Route } = await hotRoute["../src/routes/api/hot.ts"]!();
    const response = await Route.options.server.handlers.GET({ request: get(`/api/hot${query}`) });
    return { response, body: await bodyOf<{ palettes: { kseed: string }[] }>(response) };
  };

  it("answers its page, its head and the page of collections beneath it, as llms.txt tells agents", async () => {
    const first = await hot("?page=1");
    expect(first.response.headers.get("CDN-Cache-Control")).toBe("max-age=300");
    expect(Object.keys(first.body).sort()).toEqual([
      "collections",
      "fetchedAt",
      "page",
      "palettes"
    ]);
    const head = first.body.palettes;
    expect([head.length, head.slice(0, 12).map(item => item.kseed)]).toEqual([
      24,
      golden.hot.seeds
    ]);
    expect(first.body).toMatchObject({
      page: 1,
      collections: { sort: "hot", page: 1, limit: 24, items: [] }
    });
    const second = await hot("?page=2");
    expect(second.body).toMatchObject({
      page: 2,
      palettes: first.body.palettes,
      collections: { sort: "hot", page: 2 }
    });
    const searched = await hot("?q=Blue&page=1");
    expect(searched.body).toMatchObject({
      page: 1,
      query: "blue",
      collections: { query: "blue", sort: "popular", page: 1 }
    });
    expect(Object.keys(searched.body)).toEqual(expect.arrayContaining(["palettes", "tier"]));
  });
});

describe("likes", () => {
  beforeEach(async () => {
    await fifty();
  });

  it("read a like's request: a palette, yes or no, and its view", () => {
    for (const { body, seed, valid } of [
      {
        body: { liked: true, steps: 7, angle: 90, style: "linearGradient" },
        seed: seedAt(1),
        valid: true
      },
      {
        body: { liked: true, steps: 1, angle: 90, style: "linearGradient" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: true, steps: 101, angle: 90, style: "linearGradient" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: true, steps: 7, angle: 361, style: "linearGradient" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: "yes", steps: 7, angle: 90, style: "linearGradient" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: false, steps: 7, angle: 90, style: "conic" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: false, steps: 7.5, angle: 90, style: "linearGradient" },
        seed: seedAt(1),
        valid: false
      },
      {
        body: { liked: true, steps: 2, angle: 0, style: "radialSwatches" },
        seed: "not a seed",
        valid: false
      }
    ]) {
      expect([body, likeInput({ ...body, seed }) !== null]).toEqual([body, valid]);
    }
  });

  it("add a palette to the gallery with its first like, dated by when the site first held it", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const seed = corpus.items[70]!.kseed;
    const owner = await makeAccount(env);
    const id = unique("collection");
    const heldSince = Date.now() - 30 * DAY;
    await run(
      env.DB,
      `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
       VALUES (?, ?, 'user', ?, 'Old', 'private', ?, ?)`,
      id,
      id,
      owner.id,
      heldSince,
      heldSince
    );
    await run(
      env.DB,
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
       VALUES (?, 0, ?, 'linearGradient', 7, 90, ?)`,
      id,
      seed,
      heldSince
    );
    const outcome = await setLike(env, account, like(seed));
    expect(outcome).toMatchObject({
      liked: true,
      joined: true,
      inGallery: true,
      change: "new",
      likesCount: 1
    });
    const row = await first<{ created_at: number; hot: number; rising: number }>(
      env.DB,
      "SELECT created_at, hot, rising FROM k_palettes WHERE seed = ?",
      seed
    );
    expect(row?.created_at).toBe(heldSince);
    expect(row?.hot).toBeCloseTo(1.5, 9);
    expect(risen(row!.rising, "1w", Date.now())).toBeCloseTo(1, 3);
  });

  it("keep a palette an admin deleted out of the gallery, and save the like", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const seed = corpus.items[71]!.kseed;
    await run(
      env.DB,
      "INSERT INTO k_admin_actions (id, actor_id, action, seed, created_at) VALUES (?, 'admin', 'delete', ?, ?)",
      unique("action"),
      seed,
      Date.now()
    );
    const outcome = await setLike(env, account, like(seed));
    expect(outcome).toMatchObject({ joined: false, inGallery: false, change: "new" });
    expect(
      (await savedPage(env, request, account.id, { page: 1, limit: 24, words: "" })).items[0]?.kseed
    ).toBe(seed);
  });

  it("are desired states: saves sent together move the scores once", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const seed = seedAt(3);
    const read = () =>
      first<{ hot: number; likes_count: number }>(
        env.DB,
        "SELECT hot, likes_count FROM k_palettes WHERE seed = ?",
        seed
      );
    const before = await read();
    await Promise.all([setLike(env, account, like(seed)), setLike(env, account, like(seed))]);
    expect((await setLike(env, account, like(seed))).change).toBe("already saved");
    const after = await read();
    expect(after?.likes_count).toBe(before!.likes_count + 1);
    expect(after?.hot).toBeCloseTo(before!.hot + 1, 9);
    const off = await setLike(env, account, like(seed, false));
    expect(off).toMatchObject({
      change: "removed",
      liked: false,
      was: { style: "linearGradient", steps: 7 }
    });
    expect((await setLike(env, account, like(seed, false))).change).toBe("was not saved");
    const end = await read();
    expect(end?.likes_count).toBe(before!.likes_count);
    expect(end?.hot).toBeCloseTo(before!.hot, 9);
  });

  it("put an undone unsave back at its time, view and title", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const seed = seedAt(4);
    const at = Date.now() - 5 * DAY;
    const named = likeInput({
      seed,
      liked: true,
      style: "radialSwatches",
      steps: 9,
      angle: 45,
      at,
      title: "  Dusk\nwalk "
    })!;
    expect(named).toMatchObject({ at, title: "Dusk walk" });
    const outcome = await setLike(env, account, named);
    expect(outcome).toMatchObject({ at, style: "radialSwatches", steps: 9, angle: 45 });
    const kept = await first<{ title: string; created_at: number }>(
      env.DB,
      "SELECT title, created_at FROM k_likes WHERE user_id = ? AND palette_id = ?",
      account.id,
      seed
    );
    expect(kept).toEqual({ title: "Dusk walk", created_at: at });
    /* a title comes back only with the like it makes again: a plain save names nothing */
    expect(
      likeInput({ seed, liked: true, style: "linearGradient", steps: 7, angle: 90, title: "x" })
        ?.title
    ).toBeUndefined();
  });

  it("keep where an admin pressed, and nothing of where anyone else did", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const reader = await makeAccount(env);
    const seed = seedAt(5);
    const from = {
      seed,
      liked: true,
      style: "linearGradient",
      steps: 7,
      angle: 90,
      from: { q: "  Deep  BLUE " }
    };
    await setLike(env, admin, likeInput(from)!);
    await setLike(env, reader, likeInput(from)!);
    const rows = await all<{ user_id: string; query: string | null }>(
      env.DB,
      "SELECT user_id, query FROM k_likes WHERE palette_id = ?",
      seed
    );
    expect(Object.fromEntries(rows.map(row => [row.user_id, row.query]))).toEqual({
      [admin.id]: "deep blue",
      [reader.id]: null
    });
  });

  it("lift the public collections holding a palette, once", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const seed = seedAt(6);
    const id = unique("collection");
    await run(
      env.DB,
      `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
       VALUES (?, ?, 'agent', 'seeder', 'Blues', 'public', 1, 1)`,
      id,
      id
    );
    await run(
      env.DB,
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle) VALUES (?, 0, ?, 'linearGradient', 7, 90)`,
      id,
      seed
    );
    const rising = async () =>
      (await first<{ rising: number }>(
        env.DB,
        "SELECT rising FROM k_collections WHERE id = ?",
        id
      ))!.rising;
    await setLike(env, account, like(seed));
    const once = await rising();
    await setLike(env, account, like(seed));
    expect(await rising()).toBe(once);
    /* the palette held six likes, so its seventh grew the collection by a seventh */
    expect(risen(once, "1w", Date.now())).toBeCloseTo(1 / 7, 3);
  });

  it("count a page's palettes: none for a palette outside the gallery, nothing for a key that is no seed", async () => {
    const env = testEnv();
    const outside = corpus.items[80]!.kseed;
    expect(await likeCounts(env, [seedAt(7), outside, "nope", seedAt(7)])).toEqual({
      [seedAt(7)]: 0,
      [outside]: 0
    });
    expect(await likeCounts(env, [seedAt(8)])).toEqual({ [seedAt(8)]: 1 });
  });

  it("list an account's saved palettes newest first, drawn as saved", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    for (const [i, seed] of [seedAt(10), seedAt(11), seedAt(12)].entries()) {
      await setLike(
        env,
        account,
        likeInput({
          seed,
          liked: true,
          style: "linearSwatches",
          steps: 5 + i,
          angle: 0,
          at: Date.now() - (3 - i) * DAY
        })!
      );
    }
    const page = await savedPage(env, request, account.id, { page: 1, limit: 2, words: "" });
    expect(page).toMatchObject({ total: 3, page: 1, totalPages: 2 });
    expect(page.items.map(item => [item.kseed, item.style])).toEqual([
      [seedAt(12), "linearSwatches"],
      [seedAt(11), "linearSwatches"]
    ]);
    expect(page.items[1]!.steps).toBeGreaterThanOrEqual(6);
    expect(
      (await savedPage(env, request, account.id, { page: 3, limit: 2, words: "" })).items
    ).toEqual([]);
  });
});

describe("the six-hour pass", () => {
  beforeEach(async () => {
    await fifty();
  });

  it("writes the scores its likes give, and then nothing more", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const now = Date.now();
    await setLike(env, account, likeInput({ ...like(seedAt(20)), at: now - 2 * DAY })!);
    const pass = await rescore(env, now);
    expect(pass.palettes).toBeGreaterThan(0);
    expect(pass.hottest?.seed).toBe(seedAt(20));
    const again = await rescore(env, now);
    expect([again.palettes, again.collections]).toEqual([0, 0]);
    /* nothing liked lately and nothing new: the scores it had from the goldens' rows fade to none */
    const quiet = await first<{ hot: number }>(
      env.DB,
      "SELECT hot FROM k_palettes WHERE seed = ?",
      seedAt(2)
    );
    expect(quiet?.hot).toBe(0);
  });
});
