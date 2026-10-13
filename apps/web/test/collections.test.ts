import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { beforeAll, describe, expect, it } from "vitest";
import { collectionAnswer, createAnswer, listAnswer } from "../src/server/collections/api.ts";
import { mineAnswer, mineAt, votesBySlugAnswer } from "../src/server/collections/me.ts";
import { collectionsHolding } from "../src/server/collections/read.ts";
import { moveAccountAddresses } from "../src/server/collections/write.ts";
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

  it("name the public collections that hold a palette, each once", async () => {
    const held = await collectionsHolding(env, SEEDS[0]!);
    expect(new Set(held.map(c => c.slug)).size).toBe(held.length);
    expect(held.every(c => !c.slug.startsWith("@"))).toBe(true);
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
