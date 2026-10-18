import { encodePalette } from "@grabient/engine";
import { DOMINANT_PALETTES, dominantColors } from "@grabient/engine/dominant.ts";
import { messageKey } from "@grabient/i18n";
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import * as v from "valibot";
import { beforeAll, describe, expect, it } from "vitest";
import { sortCollectionItems } from "../src/features/collections/address.ts";
import { collectionItem } from "../src/features/collections/schema.ts";
import type {
  CollectionDocument,
  CollectionPage,
  CopyStanding
} from "../src/features/collections/types.ts";
import { SearchAnswer } from "../src/features/gallery/schema.ts";
import { collectionAnswer, createAnswer, listAnswer } from "../src/server/collections/api.ts";
import { mineAnswer, mineAt, votesBySlugAnswer } from "../src/server/collections/me.ts";
import { collectionBySlug, collectionsHolding } from "../src/server/collections/read.ts";
import { publicCollections } from "../src/server/collections/search.ts";
import { createCollection, moveAccountAddresses } from "../src/server/collections/write.ts";
import { keepTranslations } from "../src/server/mcp/admin/translations.ts";
import { suggestionsFor } from "../src/server/search/tags.ts";
import {
  type Account,
  bodyOf,
  count,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  post,
  testEnv,
  unique
} from "./helpers.ts";

/* The collections routes against a real D1 with every migration: who may read and write what, where collections live,
   the lists and their searches, saved copies and fit votes. */

const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg",
  "kWs2um4jE-G62O7xwb3bkk-4",
  "kSyQDAzZa8zgZxS",
  "kUzkiw66E-e4YQltnUXg"
];
const items = (n = 3, from = 0) =>
  SEEDS.slice(from, from + n).map(seed => ({ seed, style: "linearGradient", steps: 7, angle: 90 }));

type Init = { cookie?: string; origin?: string | null };
function send(method: string, path: string, body?: unknown, init: Init = {}): Request {
  const headers = new Headers({
    "CF-Connecting-IP": `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`
  });
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const at = (slug: string) => encodeURIComponent(slug);

interface Doc {
  slug: string;
  title: string;
  visibility: string;
  itemCount: number;
  items: { kseed: string; position: number; style: string; angle: number }[];
}
let env: Env;
let ada: Account;
let admin: Account;
const make = async (who: Account, body: Record<string, unknown>) => {
  const answer = await createAnswer(post("/api/collections", body, { cookie: who.cookie }), env);
  return { status: answer.status, body: await bodyOf<{ collection: Doc; error?: string }>(answer) };
};

beforeAll(async () => {
  env = testEnv();
  ada = await makeAccount(env, { name: "Ada" });
  admin = await makeAdmin(env);
});

describe("writing a collection", () => {
  it("asks for a session, the site's own page and valid words", async () => {
    expect(
      (await createAnswer(post("/api/collections", { title: "x", items: items() }), env)).status
    ).toBe(401);
    const elsewhere = post(
      "/api/collections",
      { title: "x", items: items() },
      { cookie: ada.cookie, origin: "https://evil.test" }
    );
    expect((await createAnswer(elsewhere, env)).status).toBe(403);
    const bad = await make(ada, { title: "", items: items() });
    expect(bad).toEqual({
      status: 400,
      body: {
        error: "Titles are 1 to 80 characters.",
        i18n: { message: "Titles are 1 to {max} characters.", params: { max: "80" } }
      }
    });
  });

  it("keeps an account's collection private, under its owner, numbered by title", async () => {
    const first = await make(ada, { title: "Warm Sunsets", visibility: "public", items: items() });
    expect(first.status).toBe(201);
    expect(first.body.collection.visibility).toBe("private");
    const handle = `_${ada.id.replace(/[^a-z0-9]/g, "").slice(0, 10)}`;
    expect(first.body.collection.slug).toBe(`@${handle}/warm-sunsets`);
    const second = await make(ada, { title: "Warm sunsets!", items: items(2) });
    expect(second.body.collection.slug).toBe(`@${handle}/warm-sunsets-2`);
    /* a top-level word sent as the address is never taken */
    const word = await make(ada, { title: "Red", slug: "red", items: items(1) });
    expect(word.body.collection.slug).toBe(`@${handle}/red`);
  });

  it("keeps a browser's proposed private address, and a resend of it is the same collection", async () => {
    const bob = await makeAccount(env);
    const handle = `_${bob.id.replace(/[^a-z0-9]/g, "").slice(0, 10)}`;
    const body = { title: "Night swim", slug: `@${handle}/night-swim-7`, items: items() };
    const made = await make(bob, body);
    expect([made.status, made.body.collection.slug]).toEqual([201, `@${handle}/night-swim-7`]);
    const again = await make(bob, body);
    expect([again.status, again.body.collection.slug]).toEqual([200, `@${handle}/night-swim-7`]);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_collections WHERE owner_id = ?", bob.id)
    ).toBe(1);
  });

  it("publishes an admin's at its title's address, and moves a renamed private one", async () => {
    const title = unique("Ocean depths");
    const made = await make(admin, { title, visibility: "public", items: items() });
    expect(made.body.collection.slug).toBe(title.toLowerCase().replace(" ", "-"));
    const mine = await make(ada, { title: "Dusk", items: items() });
    const slug = mine.body.collection.slug;
    const renamed = await collectionAnswer(
      send("PATCH", `/api/collections/${at(slug)}`, { title: "Late dusk" }, { cookie: ada.cookie }),
      env
    );
    const moved = await bodyOf<{ collection: Doc; moved: { from: string; to: string } }>(renamed);
    expect(moved.moved).toEqual({ from: slug, to: slug.replace("dusk", "late-dusk") });
    const publish = await collectionAnswer(
      send(
        "PATCH",
        `/api/collections/${at(moved.collection.slug)}`,
        { visibility: "public" },
        { cookie: ada.cookie }
      ),
      env
    );
    expect([publish.status, (await bodyOf<{ error: string }>(publish)).error]).toEqual([
      403,
      "Only admins can change who sees a collection."
    ]);
  });

  it("lets nobody but its owner change it, and nobody read a private one publicly", async () => {
    const mine = await make(ada, { title: "Secret", items: items() });
    const slug = mine.body.collection.slug;
    const stranger = await makeAccount(env);
    expect(
      (
        await collectionAnswer(
          send(
            "PATCH",
            `/api/collections/${at(slug)}`,
            { title: "Mine now" },
            { cookie: stranger.cookie }
          ),
          env
        )
      ).status
    ).toBe(404);
    expect(
      (
        await collectionAnswer(
          send("DELETE", `/api/collections/${at(slug)}`, undefined, { cookie: stranger.cookie }),
          env
        )
      ).status
    ).toBe(404);
    expect(
      (await collectionAnswer(get(`/api/collections/${at(slug)}`, { cookie: ada.cookie }), env))
        .status
    ).toBe(404);
    const own = await mineAt(get(`/api/me/collections/${at(slug)}`, { cookie: ada.cookie }), env);
    expect(await bodyOf(own)).toMatchObject({
      slug,
      owned: true,
      canCurate: false,
      canDelete: true
    });
    expect(
      (await mineAt(get(`/api/me/collections/${at(slug)}`, { cookie: stranger.cookie }), env))
        .status
    ).toBe(404);
    expect(
      (await mineAt(get(`/api/me/collections/${at(slug)}/state`, { cookie: stranger.cookie }), env))
        .status
    ).toBe(404);
    /* nor copy it, nor vote on it */
    expect(
      (
        await collectionAnswer(
          send("POST", `/api/collections/${at(slug)}/copies`, {}, { cookie: stranger.cookie }),
          env
        )
      ).status
    ).toBe(404);
    expect(
      (
        await mineAt(
          send(
            "POST",
            `/api/me/collections/${at(slug)}/votes`,
            { seed: SEEDS[0], vote: "up" },
            { cookie: stranger.cookie }
          ),
          env
        )
      ).status
    ).toBe(404);
  });

  it("replaces the palettes as a difference: a held palette keeps the time it joined", async () => {
    const mine = await make(ada, { title: "Kept times", items: items(3) });
    const slug = mine.body.collection.slug;
    const before = await count(
      env,
      "SELECT MIN(i.created_at) AS n FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.slug = ? AND i.seed = ?",
      slug,
      SEEDS[1]!
    );
    await new Promise(done => setTimeout(done, 5));
    const next = [items(3)[1], items(4)[3]];
    const changed = await collectionAnswer(
      send("PATCH", `/api/collections/${at(slug)}`, { items: next }, { cookie: ada.cookie }),
      env
    );
    const doc = (await bodyOf<{ collection: Doc }>(changed)).collection;
    expect(doc.items.map(item => item.kseed)).toEqual([SEEDS[1], SEEDS[3]]);
    expect(
      await count(
        env,
        "SELECT MIN(i.created_at) AS n FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.slug = ? AND i.seed = ?",
        slug,
        SEEDS[1]!
      )
    ).toBe(before);
  });

  it("keeps each palette's own words through a change that leaves them out, and refuses them past their length", async () => {
    const worded = { ...items(1)[0]!, title: "Peak Foliage", description: "Maples, bark to gold." };
    const mine = await make(ada, { title: unique("Worded"), items: [worded, items(2)[1]] });
    expect(mine.status).toBe(201);
    const slug = mine.body.collection.slug;
    const change = async (body: Record<string, unknown>) => {
      const answer = await collectionAnswer(
        send("PATCH", `/api/collections/${at(slug)}`, body, { cookie: ada.cookie }),
        env
      );
      return {
        status: answer.status,
        body: await bodyOf<{ collection: CollectionDocument }>(answer)
      };
    };
    const words = (doc: CollectionDocument) =>
      doc.items.map(({ kseed, title, description }) => ({ kseed, title, description }));
    expect(words(mine.body.collection as unknown as CollectionDocument)).toEqual([
      { kseed: SEEDS[0], title: "Peak Foliage", description: "Maples, bark to gold." },
      { kseed: SEEDS[1], title: undefined, description: undefined }
    ]);
    const moved = await change({ items: [items(2)[1], items(1)[0]] });
    expect(words(moved.body.collection)).toEqual([
      { kseed: SEEDS[1], title: undefined, description: undefined },
      { kseed: SEEDS[0], title: "Peak Foliage", description: "Maples, bark to gold." }
    ]);
    const renamed = await change({ items: [{ ...items(1)[0], title: "Momiji", description: "" }] });
    expect(words(renamed.body.collection)).toEqual([
      { kseed: SEEDS[0], title: "Momiji", description: undefined }
    ]);
    const long = await change({ items: [{ ...items(1)[0], description: "x".repeat(301) }] });
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({ error: "Palette descriptions are up to 300 characters." });
    // the owner's list shows them on its cards too
    const own = await bodyOf<CollectionPage>(
      await mineAnswer(get("/api/me/collections", { cookie: ada.cookie }), env)
    );
    expect(own.items.find(c => c.slug === slug)?.preview).toEqual([
      expect.objectContaining({ seed: SEEDS[0], title: "Momiji" })
    ]);
  });

  it("show a person's words for their palettes to them alone, and an admin's to everyone", async () => {
    const worded = { ...items(1, 5)[0]!, title: "Ember", description: "Coals at dusk." };
    const theirs = (await make(ada, { title: unique("Their words"), items: [worded] })).body
      .collection;
    const first = async (slug: string, trusted = false) =>
      (await collectionBySlug(env, slug, trusted))!.items[0]!;
    const listed = async (slug: string) =>
      (
        await bodyOf<CollectionPage>(
          await listAnswer(get("/api/collections?sort=newest&page=1&limit=24"), env)
        )
      ).items.find(c => c.slug === slug)!.preview[0]!;
    // public as no write of theirs could make it, so the words alone keep it to them
    const publish = (visibility: string) =>
      env.DB.prepare("UPDATE k_collections SET visibility = ? WHERE slug = ?")
        .bind(visibility, theirs.slug)
        .run();
    await publish("public");
    try {
      const seen = await first(theirs.slug);
      expect([seen.title, seen.description]).toEqual([undefined, undefined]);
      expect((await listed(theirs.slug)).title).toBeUndefined();
      expect(await first(theirs.slug, true)).toMatchObject({
        title: "Ember",
        description: "Coals at dusk."
      });
      const own = await bodyOf<CollectionPage>(
        await mineAnswer(get("/api/me/collections", { cookie: ada.cookie }), env)
      );
      expect(own.items.find(c => c.slug === theirs.slug)?.preview[0]).toMatchObject({
        title: "Ember"
      });
    } finally {
      await publish("private");
    }
    const admins = (
      await make(admin, {
        title: unique("Admin words"),
        visibility: "public",
        items: [worded]
      })
    ).body.collection;
    expect(await first(admins.slug)).toMatchObject({
      title: "Ember",
      description: "Coals at dusk."
    });
    expect((await listed(admins.slug)).title).toBe("Ember");
    // the words follow the owner's role: an account that is no longer an admin keeps them to itself
    const role = (to: string) =>
      env.DB.prepare("UPDATE auth_user SET role = ? WHERE id = ?").bind(to, admin.id).run();
    await role("user");
    try {
      const seen = await first(admins.slug);
      expect([seen.title, seen.description]).toEqual([undefined, undefined]);
      expect((await listed(admins.slug)).title).toBeUndefined();
    } finally {
      await role("admin");
    }
    expect(await first(admins.slug)).toMatchObject({ title: "Ember" });
    expect((await listed(admins.slug)).title).toBe("Ember");
  });

  it("moves an account's private collections when its username changes", async () => {
    const cy = await makeAccount(env);
    const old = `_${cy.id.replace(/[^a-z0-9]/g, "").slice(0, 10)}`;
    const made = await make(cy, { title: "Ferns", items: items() });
    expect(made.body.collection.slug).toBe(`@${old}/ferns`);
    await env.DB.prepare("UPDATE auth_user SET username = ? WHERE id = ?")
      .bind(unique("cy").replace(/-/g, "_").slice(0, 30).toLowerCase(), cy.id)
      .run();
    const name = (await env.DB.prepare("SELECT username FROM auth_user WHERE id = ?")
      .bind(cy.id)
      .first<{ username: string }>())!.username;
    expect(await moveAccountAddresses(env, cy.id, old, name)).toBe(1);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_collections WHERE slug = ?", `@${name}/ferns`)
    ).toBe(1);
  });

  it("waits while an admin has saving off, writing nothing, and the account's own still read", async () => {
    const dee = await makeAccount(env);
    const title = unique("Paused");
    await setFlag(env, "saving", false, unique("admin"));
    try {
      const paused = await createAnswer(
        post("/api/collections", { title, items: items() }, { cookie: dee.cookie }),
        env
      );
      expect([paused.status, paused.headers.get("Retry-After"), await bodyOf(paused)]).toEqual([
        503,
        "300",
        { error: "Couldn't save." }
      ]);
      expect(
        await count(env, "SELECT COUNT(*) AS n FROM k_collections WHERE owner_id = ?", dee.id)
      ).toBe(0);
      const own = await mineAnswer(get("/api/me/collections", { cookie: dee.cookie }), env);
      expect(own.status).toBe(200);
    } finally {
      await setFlag(env, "saving", true, unique("admin"));
    }
    expect((await make(dee, { title, items: items() })).status).toBe(201);
  });
});

describe("the public lists", () => {
  let title: string;
  beforeAll(async () => {
    title = unique("Lagoon gradients");
    await make(admin, { title, visibility: "public", tags: ["teal"], items: items(4) });
  });

  it("answer public collections alone, kept at the edge by their order", async () => {
    const popular = await listAnswer(get("/api/collections?sort=popular&limit=24"), env);
    expect(popular.headers.get("CDN-Cache-Control")).toBe("max-age=300");
    const page = await bodyOf<{ items: Doc[]; total: number }>(popular);
    expect(page.items.every(item => item.visibility === "public")).toBe(true);
    expect(page.items.some(item => item.title === title)).toBe(true);
    const rising = await listAnswer(get("/api/collections?sort=rising"), env);
    expect(rising.headers.get("CDN-Cache-Control")).toBe("max-age=60");
  });

  it("search titles by their letters, a letter off allowed, and never a private one", async () => {
    const word = title.split(" ")[0]!.toLowerCase();
    const found = await bodyOf<{ items: Doc[] }>(
      await listAnswer(get(`/api/collections?q=${encodeURIComponent(word)}`), env)
    );
    expect(found.items.map(item => item.title)).toContain(title);
    await make(ada, { title: `${title} private`, items: items() });
    const again = await bodyOf<{ items: Doc[] }>(
      await listAnswer(get(`/api/collections?q=${encodeURIComponent(word)}`), env)
    );
    expect(again.items.map(item => item.title)).toEqual([title]);
    const suggest = await collectionAnswer(
      get(`/api/collections/suggest?q=${encodeURIComponent(word)}`),
      env
    );
    const hits = await bodyOf<{ items: { title: string; href: string; colors: string[] }[] }>(
      suggest
    );
    expect(hits.items[0]?.title).toBe(title);
    expect(hits.items[0]?.colors.length).toBeGreaterThan(0);
  });

  it("lead with one whose tag is the words, beside the titles named for them", async () => {
    // the first holds the words in more places, the second as one tag
    const scattered = unique("Gulf coast");
    const tagged = unique("Between tides");
    await make(admin, {
      title: scattered,
      visibility: "public",
      description: "Southwest Florida evenings",
      tags: ["southwest", "florida"],
      items: items(2)
    });
    await make(admin, {
      title: tagged,
      visibility: "public",
      tags: ["southwest florida"],
      items: items(2, 2)
    });
    const found = await bodyOf<{ items: Doc[] }>(
      await listAnswer(get("/api/collections?q=southwest%20florida"), env)
    );
    expect(found.items.map(item => item.title)).toEqual([tagged, scattered]);
  });

  it("say which words only the search model read, unless a collection holds them", async () => {
    const AI = {
      run: async (_: string, input: { text: string[] }) => ({
        data: input.text.map(() => Array.from({ length: 768 }, (_, i) => Math.sin(i)))
      })
    } as unknown as Ai;
    const word = "zzqxv";
    await make(admin, { title: unique(`${word} harbor`), visibility: "public", items: items(1) });
    const asked = (query: string) =>
      publicCollections({ ...env, AI }, { query, sort: "popular" }, { model: true, who: ada.id });
    expect((await asked("flurbish")).guessed).toEqual(["flurbish"]);
    expect(await asked(word)).not.toHaveProperty("guessed");
  });

  it("name the public collections that hold a palette, each once, with the colors its page shows", async () => {
    const held = await collectionsHolding(env, SEEDS[0]!);
    expect(new Set(held.map(c => c.slug)).size).toBe(held.length);
    expect(held.every(c => !c.slug.startsWith("@"))).toBe(true);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every(c => c.colors.length > 0)).toBe(true);
    // a palette opened in the browser reads them from the search by its seed
    const answer = { query: SEEDS[0], items: [], tier: "similar", heldBy: held, fetchedAt: 0 };
    expect(v.parse(SearchAnswer, answer).heldBy).toEqual(held);
  });

  it("show each collection's palettes as its page opens from that list, so the cards stay put", async () => {
    // most liked last, rising first: the two orders run opposite ways
    const seeds = [
      "kU8QySbp3AmGrQHSq8Dg",
      "kSjRrX05e_18fP-",
      "kWywugcpY_95QTjl0FBoCvRo",
      "kS7CQ31Do6asvY-",
      "kW7wYSSYW_48Ev_D0D_27Mqo"
    ];
    for (const [i, seed] of seeds.entries()) {
      await run(
        env.DB,
        `INSERT OR REPLACE INTO k_palettes (seed, style, steps, angle, likes_count, created_at, rising)
         VALUES (?, 'linearGradient', 7, 90, ?, 1600000000000, ?)`,
        seed,
        i,
        5 - i
      );
    }
    const named = unique("Risers");
    const made = await make(admin, {
      title: named,
      visibility: "public",
      items: seeds.map(seed => ({ seed, style: "linearGradient", steps: 7, angle: 90 }))
    });
    const slug = made.body.collection.slug;
    const doc = await bodyOf<CollectionDocument>(
      await collectionAnswer(get(`/api/collections/${slug}`), env)
    );
    for (const order of ["popular", "rising"] as const) {
      const list = await bodyOf<CollectionPage>(
        await listAnswer(get(`/api/collections?sort=${order}&q=${encodeURIComponent(named)}`), env)
      );
      const preview = list.items.find(item => item.slug === slug)?.preview ?? [];
      const page = sortCollectionItems(doc.items, order).map(item => item.kseed);
      expect(
        preview.map(item => item.seed),
        order
      ).toEqual(page);
      expect(page[0], order).toBe(order === "rising" ? seeds[0] : seeds[4]);
    }
  });

  it("answer an account's own list to its owner alone", async () => {
    expect((await mineAnswer(get("/api/me/collections"), env)).status).toBe(401);
    const own = await bodyOf<{ items: Doc[] }>(
      await mineAnswer(get("/api/me/collections?limit=96", { cookie: ada.cookie }), env)
    );
    expect(own.items.length).toBeGreaterThan(2);
    expect(own.items.every(item => item.slug.startsWith("@"))).toBe(true);
  });
});

describe("saved copies", () => {
  it("are made once, stand against their source, and take its changes", async () => {
    const source = (
      await make(admin, { title: unique("Sources"), visibility: "public", items: items(3) })
    ).body.collection;
    const reader = await makeAccount(env);
    const save = () =>
      collectionAnswer(
        send("POST", `/api/collections/${at(source.slug)}/copies`, {}, { cookie: reader.cookie }),
        env
      );
    const first = await save();
    const made = await bodyOf<{
      collection: Doc;
      made: boolean;
      copy: { slug: string; behind: boolean; differs: boolean };
    }>(first);
    expect([first.status, made.made, made.collection.visibility]).toEqual([201, true, "private"]);
    expect(made.copy).toMatchObject({ slug: made.collection.slug, behind: false, differs: false });
    const again = await save();
    expect([again.status, (await bodyOf<{ made: boolean }>(again)).made]).toEqual([200, false]);
    expect(
      await count(env, "SELECT fork_count AS n FROM k_collections WHERE slug = ?", source.slug)
    ).toBe(1);
    /* the source gains a palette: the copy is behind, and Update brings it in */
    await collectionAnswer(
      send(
        "PATCH",
        `/api/collections/${at(source.slug)}`,
        { items: items(4) },
        { cookie: admin.cookie }
      ),
      env
    );
    const state = await bodyOf<{ copy: { behind: boolean }; owned: boolean }>(
      await mineAt(
        get(`/api/me/collections/${at(source.slug)}/state`, { cookie: reader.cookie }),
        env
      )
    );
    expect(state).toMatchObject({ owned: false, copy: { behind: true } });
    const update = await mineAt(
      send(
        "POST",
        `/api/me/collections/${at(made.collection.slug)}/update`,
        {},
        { cookie: reader.cookie }
      ),
      env
    );
    const updated = await bodyOf<{ collection: Doc; copy: { behind: boolean; differs: boolean } }>(
      update
    );
    expect(updated.collection.items.map(item => item.kseed)).toEqual(SEEDS.slice(0, 4));
    expect(updated.copy).toMatchObject({ behind: false, differs: false });
    /* the source made private: the copy is its own */
    await env.DB.prepare("UPDATE k_collections SET visibility = 'private' WHERE slug = ?")
      .bind(source.slug)
      .run();
    const gone = await mineAt(
      send(
        "POST",
        `/api/me/collections/${at(made.collection.slug)}/reset`,
        {},
        { cookie: reader.cookie }
      ),
      env
    );
    expect([gone.status, (await bodyOf<{ error: string }>(gone)).error]).toEqual([
      404,
      "The original collection is gone."
    ]);
  });
});

describe("saved copies of a palette's words", () => {
  it("carry them, and Update brings in the ones the source changed", async () => {
    const source = (
      await make(admin, {
        title: unique("Worded sources"),
        visibility: "public",
        items: [{ ...items(1)[0], title: "Ember" }, items(2)[1]]
      })
    ).body.collection;
    const reader = await makeAccount(env);
    const copy = await bodyOf<{ collection: CollectionDocument }>(
      await collectionAnswer(
        send("POST", `/api/collections/${at(source.slug)}/copies`, {}, { cookie: reader.cookie }),
        env
      )
    );
    expect(copy.collection.items[0]).toMatchObject({ kseed: SEEDS[0], title: "Ember" });
    await collectionAnswer(
      send(
        "PATCH",
        `/api/collections/${at(source.slug)}`,
        {
          items: [
            { ...items(1)[0], title: "Embers" },
            { ...items(2)[1], description: "Night." }
          ]
        },
        { cookie: admin.cookie }
      ),
      env
    );
    const update = await bodyOf<{ collection: CollectionDocument; copy: CopyStanding }>(
      await mineAt(
        send(
          "POST",
          `/api/me/collections/${at(copy.collection.slug)}/update`,
          {},
          { cookie: reader.cookie }
        ),
        env
      )
    );
    expect(
      update.collection.items.map(({ title, description }) => ({ title, description }))
    ).toEqual([
      { title: "Embers", description: undefined },
      { title: undefined, description: "Night." }
    ]);
    expect(update.copy).toMatchObject({ behind: false, differs: false });
  });
});

describe("a collection's colors", () => {
  /** one of Grabient's own, public, with these tags */
  const grabients = (tags: string[]) =>
    createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Harbor lights"),
        description: "",
        tags,
        visibility: "public",
        items: items(3).map(item => collectionItem(item)!)
      }
    );
  /** the colors the palettes' search row shows for these words */
  const rowColors = async (words: string) => {
    const [tag] = await suggestionsFor(env, new URLSearchParams({ q: words, limit: "1" }));
    expect(tag?.query).toBe(words);
    return tag!.colors;
  };

  it("come with a page's read for each tag, as the search row shows its words, in the tags' order in any language", async () => {
    const blue = await rowColors("blue");
    expect(blue.length).toBeGreaterThan(0);
    const { slug } = await grabients(["blue", "gradients", "zzqx"]);
    const english = await bodyOf<CollectionDocument>(
      await collectionAnswer(get(`/api/collections/${slug}`), env)
    );
    // a word of form and a word the vocabulary does not read show none, as in the row
    expect([english.tags, english.tagColors]).toEqual([
      ["blue", "gradients", "zzqx"],
      [blue, [], []]
    ]);
    await keepTranslations(env, "es", [], [{ tag: "blue", word: "azul", note: "" }]);
    const spanish = await bodyOf<CollectionDocument>(
      await collectionAnswer(get(`/api/collections/${slug}?lang=es`), env)
    );
    expect([spanish.tags, spanish.tagColors]).toEqual([
      ["azul", "gradients", "zzqx"],
      [blue, [], []]
    ]);
  });

  it("come in the page's language with an admin's state of one of Grabient's, as everyone's read gives them", async () => {
    // a palette no test likes, which an admin may draw another way
    const seed = "kWkEqj3Z87moauRiHzrShc_A";
    const source = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Harbor lights"),
        description: "",
        tags: ["blue", "gradients"],
        visibility: "public",
        items: [collectionItem({ seed, style: "linearGradient", steps: 7, angle: 90 })!]
      }
    );
    const { id } = (await env.DB.prepare("SELECT id FROM k_collections WHERE slug = ?")
      .bind(source.slug)
      .first<{ id: string }>())!;
    await keepTranslations(
      env,
      "uk",
      [
        {
          id,
          slug: source.slug,
          source: messageKey(`${source.title}\n${source.description}`),
          title: "Вогні гавані",
          description: "",
          note: ""
        }
      ],
      [{ tag: "blue", word: "синій", note: "" }]
    );
    const state = async (query: string) =>
      bodyOf<{ canCurate: boolean; collection?: CollectionDocument }>(
        await mineAt(
          get(`/api/me/collections/${at(source.slug)}/state${query}`, { cookie: admin.cookie }),
          env
        )
      );
    // the page's own read in Ukrainian, and the admin's state read beside it, say the same
    const everyone = await bodyOf<CollectionDocument>(
      await collectionAnswer(get(`/api/collections/${source.slug}?lang=uk`), env)
    );
    const uk = await state("?lang=uk");
    expect(uk.canCurate).toBe(true);
    expect([uk.collection?.title, uk.collection?.tags]).toEqual([
      "Вогні гавані",
      ["синій", "gradients"]
    ]);
    expect([uk.collection?.title, uk.collection?.tags, uk.collection?.tagColors]).toEqual([
      everyone.title,
      everyone.tags,
      everyone.tagColors
    ]);
    const english = await state("");
    expect([english.collection?.title, english.collection?.tags]).toEqual([
      source.title,
      ["blue", "gradients"]
    ]);
    // an admin's press answers with the collection in the page's language too, so the page stays in it
    const redrawn = await bodyOf<{ collection: CollectionDocument }>(
      await mineAt(
        send(
          "PATCH",
          `/api/me/collections/${at(source.slug)}/items/${seed}?lang=uk`,
          { angle: 45, reasons: ["form"] },
          { cookie: admin.cookie }
        ),
        env
      )
    );
    expect([redrawn.collection.title, redrawn.collection.items[0]?.angle]).toEqual([
      "Вогні гавані",
      45
    ]);
  });

  it("name a saved copy's source with the colors it shows elsewhere, and the copy's page has its tags' too", async () => {
    const source = await grabients(["blue"]);
    const reader = await makeAccount(env);
    const saved = await bodyOf<{ collection: Doc; copy: CopyStanding }>(
      await collectionAnswer(
        send("POST", `/api/collections/${at(source.slug)}/copies`, {}, { cookie: reader.cookie }),
        env
      )
    );
    // what the source's link shows on the sheet of a palette it holds
    const held = (await collectionsHolding(env, SEEDS[0]!, 24)).find(c => c.slug === source.slug);
    expect(held?.colors.length).toBeGreaterThan(0);
    expect(saved.copy.source).toEqual({
      slug: source.slug,
      title: source.title,
      colors: held!.colors
    });
    // the copy's own page: the account's copy holds no colors, so its read brings them
    const state = await bodyOf<{ copy: CopyStanding; collection: CollectionDocument }>(
      await mineAt(
        get(`/api/me/collections/${at(saved.collection.slug)}/state`, { cookie: reader.cookie }),
        env
      )
    );
    expect(state.copy.source.colors).toEqual(held!.colors);
    expect(state.collection.tagColors).toEqual([await rowColors("blue")]);
  });
});

describe("a collection's colors, read in the order its page opens in", () => {
  it("are the colors of its most liked palettes, the same on a palette's sheet and on a copy saved from it", async () => {
    // twelve quiet blues by position, then a red the most liked of all, which the page opens with
    const blue = (i: number) =>
      encodePalette({
        anchors: [
          { l: 0.3 + i * 0.03, c: 0.08, h: 240 },
          { l: 0.6, c: 0.06, h: 230 + i }
        ]
      });
    const red = encodePalette({
      anchors: [
        { l: 0.55, c: 0.2, h: 25 },
        { l: 0.65, c: 0.19, h: 30 }
      ]
    });
    const seeds = [...Array.from({ length: DOMINANT_PALETTES }, (_, i) => blue(i)), red];
    for (const [i, seed] of seeds.entries()) {
      await run(
        env.DB,
        `INSERT OR REPLACE INTO k_palettes (seed, style, steps, angle, likes_count, created_at, rising)
         VALUES (?, 'linearGradient', 7, 90, ?, 1600000000000, 0)`,
        seed,
        seed === red ? 50 : i
      );
    }
    const made = await make(admin, {
      title: unique("Blues and a red"),
      visibility: "public",
      items: seeds.map(seed => ({ seed, style: "linearGradient", steps: 7, angle: 90 }))
    });
    const slug = made.body.collection.slug;
    const opened = [red, ...seeds.slice(0, DOMINANT_PALETTES).reverse()];
    const colors = dominantColors(opened);
    expect(colors).not.toEqual(dominantColors(seeds));
    const held = (await collectionsHolding(env, red, 24)).find(c => c.slug === slug);
    expect(held?.colors).toEqual(colors);
    const reader = await makeAccount(env);
    const saved = await bodyOf<{ copy: CopyStanding }>(
      await collectionAnswer(
        send("POST", `/api/collections/${at(slug)}/copies`, {}, { cookie: reader.cookie }),
        env
      )
    );
    expect(saved.copy.source.colors).toEqual(colors);
  });
});

describe("the hot and Rising orders", () => {
  it("hold a collection from the request that made it public, and a saved copy lifts it", async () => {
    type Scores = { hot: number; rising: number; rising_3m: number; rising_1y: number };
    const scores = async (slug: string) =>
      (await env.DB.prepare(
        "SELECT hot, rising, rising_3m, rising_1y FROM k_collections WHERE slug = ?"
      )
        .bind(slug)
        .first<Scores>())!;
    const unlisted = (await make(admin, { title: unique("Unlisted"), items: items(3) })).body
      .collection;
    expect(await scores(unlisted.slug)).toEqual({ hot: 0, rising: 0, rising_3m: 0, rising_1y: 0 });
    const published = await bodyOf<{ collection: Doc }>(
      await collectionAnswer(
        send(
          "PATCH",
          `/api/collections/${at(unlisted.slug)}`,
          { visibility: "public" },
          { cookie: admin.cookie }
        ),
        env
      )
    );
    const arrived = await scores(published.collection.slug);
    /* half a like of newness, and its palettes that joined lately */
    expect(arrived.hot).toBeGreaterThanOrEqual(0.5);
    for (const score of [arrived.rising, arrived.rising_3m, arrived.rising_1y])
      expect(score).toBeGreaterThan(0);

    const source = (
      await make(admin, { title: unique("Arrivals"), visibility: "public", items: items(3) })
    ).body.collection;
    const fresh = await scores(source.slug);
    expect(fresh.rising).toBeGreaterThan(0);
    const reader = await makeAccount(env);
    await collectionAnswer(
      send("POST", `/api/collections/${at(source.slug)}/copies`, {}, { cookie: reader.cookie }),
      env
    );
    /* a first copy beside half a like of newness: the faded sum goes from a half to one and a half */
    const lifted = await scores(source.slug);
    expect(lifted.rising - fresh.rising).toBeCloseTo(Math.log(3), 1);
    expect(lifted.rising_1y).toBeGreaterThan(fresh.rising_1y);
  });
});

describe("fit votes", () => {
  it("are one an account a palette, on public collections, and an admin's is a ruling on the record", async () => {
    const collection = (
      await make(admin, { title: unique("Fit"), visibility: "public", items: items(2) })
    ).body.collection;
    const vote = (who: Account, body: unknown) =>
      mineAt(
        send("POST", `/api/me/collections/${at(collection.slug)}/votes`, body, {
          cookie: who.cookie
        }),
        env
      );
    const up = await bodyOf<{ vote: string; fit: { up: number } }>(
      await vote(ada, { seed: SEEDS[0], vote: "up" })
    );
    expect(up).toMatchObject({ vote: "up", fit: { up: 1 } });
    expect((await vote(ada, { seed: SEEDS[5], vote: "up" })).status).toBe(404);
    expect((await vote(ada, { seed: SEEDS[0], vote: "sideways" })).status).toBe(400);
    const ruling = await bodyOf<{ fit: { slated: boolean } }>(
      await vote(admin, { seed: SEEDS[1], vote: "down" })
    );
    expect(ruling.fit.slated).toBe(true);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_admin_actions WHERE action = 'vote' AND actor_id = ?",
        admin.id
      )
    ).toBe(1);
    const mine = await bodyOf<{ votes: Record<string, Record<string, string>> }>(
      await votesBySlugAnswer(
        get(`/api/me/collection-votes?slugs=${collection.slug},not-here`, { cookie: ada.cookie }),
        env
      )
    );
    expect(mine.votes).toEqual({ [collection.slug]: { [SEEDS[0]!]: "up" } });
    const taken = await bodyOf<{ vote: null; fit: { up: number } }>(
      await vote(ada, { seed: SEEDS[0], vote: null })
    );
    expect(taken).toMatchObject({ vote: null, fit: { up: 0 } });
  });
});

describe("notes for the agents", () => {
  it("are an admin's, written over the palettes held then", async () => {
    const collection = (
      await make(admin, { title: unique("Noted"), visibility: "public", items: items(2) })
    ).body.collection;
    const note = (who: Account, text: unknown) =>
      mineAt(
        send(
          "POST",
          `/api/me/collections/${at(collection.slug)}/notes`,
          { text },
          { cookie: who.cookie }
        ),
        env
      );
    expect((await note(ada, "hello")).status).toBe(403);
    expect((await note(admin, "   ")).status).toBe(400);
    const written = await note(admin, "More blues,\r\nfewer greens");
    const { note: kept } = await bodyOf<{ note: { id: string; text: string; heldThen: number } }>(
      written
    );
    expect([written.status, kept.text, kept.heldThen]).toEqual([
      201,
      "More blues,\nfewer greens",
      2
    ]);
    const state = await bodyOf<{ notes: { id: string; addedSince: number }[] }>(
      await mineAt(
        get(`/api/me/collections/${at(collection.slug)}/state`, { cookie: admin.cookie }),
        env
      )
    );
    expect(state.notes.map(n => n.id)).toEqual([kept.id]);
    const removed = await mineAt(
      send("DELETE", `/api/me/collections/${at(collection.slug)}/notes/${kept.id}`, undefined, {
        cookie: admin.cookie
      }),
      env
    );
    expect(await bodyOf(removed)).toEqual({ deleted: kept.id });
  });
});
