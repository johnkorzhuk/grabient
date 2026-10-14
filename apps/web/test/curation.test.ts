import type { Env } from "@grabient/server/env.ts";
import { beforeAll, describe, expect, it } from "vitest";
import { collectionItem } from "../src/features/collections/schema.ts";
import { collectionAnswer, createAnswer } from "../src/server/collections/api.ts";
import { mineAt, siteAnswer } from "../src/server/collections/me.ts";
import { likedAnswer, paletteAnswer } from "../src/server/collections/palettes.ts";
import { createCollection } from "../src/server/collections/write.ts";
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

/* Palettes taken out and put back: an owner's of their own collection, an admin's of Grabient's, each checked in the
   write itself; and what the record keeps for the agents. */

const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg",
  "kWs2um4jE-G62O7xwb3bkk-4"
];
/* as a writer sends it, steps raised to the palette's keyframes */
const item = (seed: string, angle = 90) =>
  collectionItem({ seed, style: "linearGradient", steps: 7, angle })!;

function send(method: string, path: string, body: unknown, cookie: string): Request {
  return new Request(new URL(path, ORIGIN), {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Cookie: cookie,
      "CF-Connecting-IP": "2001:db8::9"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const at = (slug: string) => encodeURIComponent(slug);
type Answer = {
  collection: {
    slug: string;
    itemCount: number;
    items: { kseed: string; angle: number; position: number }[];
  };
  restore?: string;
  error?: string;
};

let env: Env;
let owner: Account;
let admin: Account;
beforeAll(async () => {
  env = testEnv();
  owner = await makeAccount(env);
  admin = await makeAdmin(env);
});
const timeOf = (slug: string, seed: string) =>
  count(
    env,
    "SELECT i.created_at AS n FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.slug = ? AND i.seed = ?",
    slug,
    seed
  );

describe("an owner's removal", () => {
  it("takes one palette out of one view, and its token puts it back where it stood", async () => {
    const made = await createAnswer(
      post(
        "/api/collections",
        {
          title: "Owned",
          items: [item(SEEDS[0]!), item(SEEDS[1]!), item(SEEDS[1]!, 45), item(SEEDS[2]!)]
        },
        { cookie: owner.cookie }
      ),
      env
    );
    const slug = (await bodyOf<Answer>(made)).collection.slug;
    const joined = await timeOf(slug, SEEDS[2]!);
    const path = `/api/me/collections/${at(slug)}/items/${SEEDS[1]}?style=linearGradient&steps=${item(SEEDS[1]!).steps}&angle=45`;
    const out = await bodyOf<Answer>(await mineAt(send("DELETE", path, {}, owner.cookie), env));
    expect(out.collection.items.map(i => `${i.kseed}@${i.angle}`)).toEqual([
      `${SEEDS[0]}@90`,
      `${SEEDS[1]}@90`,
      `${SEEDS[2]}@90`
    ]);
    expect(out.collection.itemCount).toBe(3);
    /* the token is this account's, for this collection; a stranger's ask says nothing of it */
    const stranger = await makeAccount(env);
    const theirs = await mineAt(
      send("PUT", path.split("?")[0]!, { restore: out.restore }, stranger.cookie),
      env
    );
    expect([theirs.status, (await bodyOf<Answer>(theirs)).error]).toEqual([
      403,
      "Only admins can change agent collections."
    ]);
    const missing = await mineAt(
      send(
        "PUT",
        `/api/me/collections/${at(`${slug}-nowhere`)}/items/${SEEDS[1]}`,
        { restore: out.restore },
        stranger.cookie
      ),
      env
    );
    expect(missing.status).toBe(403);
    const forged = await mineAt(
      send("PUT", path.split("?")[0]!, { restore: `${out.restore}x` }, owner.cookie),
      env
    );
    expect([forged.status, (await bodyOf<Answer>(forged)).error]).toEqual([
      400,
      "This palette can't be put back."
    ]);
    const back = await bodyOf<Answer>(
      await mineAt(send("PUT", path.split("?")[0]!, { restore: out.restore }, owner.cookie), env)
    );
    expect(back.collection.items.map(i => `${i.kseed}@${i.angle}`)).toEqual([
      `${SEEDS[0]}@90`,
      `${SEEDS[1]}@90`,
      `${SEEDS[1]}@45`,
      `${SEEDS[2]}@90`
    ]);
    /* the rest keep their rows as they were */
    expect(await timeOf(slug, SEEDS[2]!)).toBe(joined);
    /* nothing about an account's own goes on the admins' record */
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_admin_actions WHERE actor_id = ?", owner.id)
    ).toBe(0);
  });

  it("refuses a malformed palette or view", async () => {
    const made = await createAnswer(
      post(
        "/api/collections",
        { title: "Two", items: [item(SEEDS[0]!)] },
        { cookie: owner.cookie }
      ),
      env
    );
    const slug = (await bodyOf<Answer>(made)).collection.slug;
    const bad = await mineAt(
      send("DELETE", `/api/me/collections/${at(slug)}/items/nope`, {}, owner.cookie),
      env
    );
    expect([bad.status, (await bodyOf<Answer>(bad)).error]).toEqual([400, "Invalid palette."]);
    const view = await mineAt(
      send(
        "DELETE",
        `/api/me/collections/${at(slug)}/items/${SEEDS[0]}?style=sparkle`,
        {},
        owner.cookie
      ),
      env
    );
    expect([view.status, (await bodyOf<Answer>(view)).error]).toEqual([
      400,
      "Invalid style, steps or angle."
    ]);
  });
});

describe("an admin's curation of Grabient's collections", () => {
  let slug: string;
  beforeAll(async () => {
    const doc = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Curated"),
        description: "",
        tags: [],
        visibility: "public",
        items: SEEDS.map(seed => item(seed))
      }
    );
    slug = doc.slug;
  });

  it("is an admin's alone", async () => {
    const answer = await mineAt(
      send("DELETE", `/api/me/collections/${at(slug)}/items/${SEEDS[0]}`, {}, owner.cookie),
      env
    );
    expect([answer.status, (await bodyOf<Answer>(answer)).error]).toEqual([
      403,
      "Only admins can change agent collections."
    ]);
  });

  it("puts a removal on the record, and its undo takes it off", async () => {
    const path = `/api/me/collections/${at(slug)}/items/${SEEDS[0]}`;
    const out = await bodyOf<Answer>(
      await mineAt(
        send(
          "DELETE",
          path,
          { reasons: ["muddy", "nonsense"], comment: " too  gray " },
          admin.cookie
        ),
        env
      )
    );
    expect(out.collection.itemCount).toBe(3);
    const kept = await env.DB.prepare(
      "SELECT reasons, comment, before FROM k_admin_actions WHERE actor_id = ? AND action = 'remove'"
    )
      .bind(admin.id)
      .first<{ reasons: string; comment: string; before: string }>();
    expect(kept).toEqual({
      reasons: '["muddy"]',
      comment: "too gray",
      before: JSON.stringify({ style: "linearGradient", steps: 7, angle: 90, position: 0 })
    });
    const back = await bodyOf<Answer>(
      await mineAt(send("PUT", path, { restore: out.restore }, admin.cookie), env)
    );
    expect(back.collection.items.find(i => i.kseed === SEEDS[0])?.position).toBe(0);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_admin_actions WHERE actor_id = ? AND action = 'remove'",
        admin.id
      )
    ).toBe(0);
  });

  it("adds by hand, each view once, and an add's undo takes out only what it made", async () => {
    const extra = "kSyQDAzZa8zgZxS";
    const added = await mineAt(
      send(
        "POST",
        `/api/me/collections/${at(slug)}/items`,
        { items: [item(extra), item(extra), item(SEEDS[1]!)] },
        admin.cookie
      ),
      env
    );
    const made = await bodyOf<{ count: number; added: { seed: string; token: string }[] }>(added);
    expect(made.added.map(a => a.seed)).toEqual([extra]);
    expect(made.count).toBe(5);
    const holding = await bodyOf<{ holding: Record<string, number> }>(
      await siteAnswer(
        send("POST", "/api/me/site-collections/holding", { items: [item(extra)] }, admin.cookie),
        env
      )
    );
    expect(holding.holding).toEqual({ [slug]: 1 });
    const undone = await bodyOf<Answer>(
      await mineAt(
        send(
          "DELETE",
          `/api/me/collections/${at(slug)}/items/${extra}?style=linearGradient&steps=${item(extra).steps}&angle=90`,
          { added: made.added[0]!.token },
          admin.cookie
        ),
        env
      )
    );
    expect(undone.collection.itemCount).toBe(4);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_admin_actions WHERE actor_id = ? AND seed = ?",
        admin.id,
        extra
      )
    ).toBe(0);
  });

  it("draws a palette another way, never one a person liked", async () => {
    const path = `/api/me/collections/${at(slug)}/items/${SEEDS[2]}`;
    const redrawn = await bodyOf<Answer>(
      await mineAt(send("PATCH", path, { angle: 45, reasons: ["form"] }, admin.cookie), env)
    );
    expect(redrawn.collection.items.find(i => i.kseed === SEEDS[2])?.angle).toBe(45);
    const reader = await makeAccount(env);
    await env.DB.prepare(
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 7, 'linearGradient', 90, ?)"
    )
      .bind(reader.id, SEEDS[3], Date.now())
      .run();
    const liked = await mineAt(
      send(
        "PATCH",
        `/api/me/collections/${at(slug)}/items/${SEEDS[3]}`,
        { angle: 10 },
        admin.cookie
      ),
      env
    );
    expect([liked.status, (await bodyOf<Answer>(liked)).error]).toEqual([
      409,
      "Someone liked this palette, so it stays."
    ]);
  });

  it("deletes one of Grabient's with the whole of it on the record, which nobody else may", async () => {
    const doc = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Doomed"),
        description: "",
        tags: [],
        visibility: "public",
        items: [item(SEEDS[0]!)]
      }
    );
    const remove = (who: Account) =>
      collectionAnswer(
        send("DELETE", `/api/collections/${at(doc.slug)}`, { reasons: ["dull"] }, who.cookie),
        env
      );
    expect((await remove(owner)).status).toBe(404);
    expect(await bodyOf(await remove(admin))).toEqual({ deleted: doc.slug });
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_collections WHERE slug = ?", doc.slug)
    ).toBe(0);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_collection_items i WHERE NOT EXISTS (SELECT 1 FROM k_collections c WHERE c.id = i.collection_id)"
      )
    ).toBe(0);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_admin_actions WHERE action = 'collection.delete' AND slug = ?",
        doc.slug
      )
    ).toBe(1);
  });

  it("lists Grabient's collections for an admin's checklist alone", async () => {
    expect(
      (await siteAnswer(get("/api/me/site-collections", { cookie: owner.cookie }), env)).status
    ).toBe(403);
    const list = await bodyOf<{ collections: { slug: string; seeds: string[] }[] }>(
      await siteAnswer(get("/api/me/site-collections", { cookie: admin.cookie }), env)
    );
    expect(list.collections.find(c => c.slug === slug)?.seeds.length).toBeGreaterThan(0);
  });
});

describe("a public collection's likes", () => {
  it("count each palette once, however many views of it the collection holds", async () => {
    const reader = await makeAccount(env);
    await env.DB.prepare(
      "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?) ON CONFLICT DO NOTHING"
    )
      .bind(SEEDS[0], Date.now())
      .run();
    await env.DB.prepare(
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 7, 'linearGradient', 90, ?)"
    )
      .bind(reader.id, SEEDS[0], Date.now())
      .run();
    const doc = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Twice"),
        description: "",
        tags: [],
        visibility: "public",
        items: [item(SEEDS[0]!), item(SEEDS[0]!, 45)]
      }
    );
    const likes = await count(
      env,
      "SELECT likes_count AS n FROM k_palettes WHERE seed = ?",
      SEEDS[0]!
    );
    expect(
      await count(env, "SELECT likes_sum AS n FROM k_collections WHERE slug = ?", doc.slug)
    ).toBe(likes);
  });
});

describe("an admin's curation of the gallery", () => {
  /* a gallery palette held by one of Grabient's collections, each test its own */
  const GALLERY = [
    "kcuYzbUNVAdnPQznJsXe7PJnu2v58qkA_Zc_4",
    "kWQgLgpgm9q-WwC8F0DyY3GQ",
    "kY7xXr748zmabv9fMUJU7O_8rGwW"
  ];
  const held = async (seed: string) => {
    await env.DB.prepare(
      "INSERT INTO k_palettes (seed, style, steps, angle, likes_count, created_at) VALUES (?, 'linearGradient', 7, 90, 0, ?) ON CONFLICT DO NOTHING"
    )
      .bind(seed, Date.now())
      .run();
    const doc = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Gallery held"),
        description: "",
        tags: [],
        visibility: "public",
        items: [item(seed), item(SEEDS[3]!)]
      }
    );
    return doc.slug;
  };
  const palette = (method: string, seed: string, body: unknown, who: Account) =>
    paletteAnswer(send(method, `/api/me/palettes/${seed}`, body, who.cookie), env);

  it("says which palettes a person liked, to an admin alone", async () => {
    const seed = GALLERY[0]!;
    await held(seed);
    const reader = await makeAccount(env);
    await env.DB.prepare(
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 7, 'linearGradient', 90, ?)"
    )
      .bind(reader.id, seed, Date.now())
      .run();
    const ask = (who: Account) =>
      likedAnswer(get(`/api/me/palettes?seeds=${seed},${GALLERY[2]}`, { cookie: who.cookie }), env);
    expect((await ask(owner)).status).toBe(403);
    expect(await bodyOf(await ask(admin))).toEqual({ liked: [seed] });
    const refused = await palette("DELETE", seed, { scope: "everywhere" }, admin);
    expect([refused.status, (await bodyOf<Answer>(refused)).error]).toEqual([
      409,
      "Someone liked this palette, so it stays."
    ]);
  });

  it("tells the editor where a palette stands, in the shape its Save reads", async () => {
    const seed = "kUzkiw66E-e4YQltnUXg";
    const stands = async (who: Account) => {
      const answer = await palette("GET", seed, undefined, who);
      return [answer.status, await bodyOf(answer)];
    };
    expect(await stands(admin)).toEqual([
      200,
      { seed, gallery: null, collections: [], liked: false }
    ]);
    const doc = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Standing"),
        description: "",
        tags: [],
        visibility: "public",
        items: [item(seed)]
      }
    );
    const held = { slug: doc.slug, title: doc.title };
    expect(await stands(admin)).toEqual([
      200,
      { seed, gallery: null, collections: [held], liked: false }
    ]);
    await env.DB.prepare(
      "INSERT INTO k_palettes (seed, style, steps, angle, likes_count, created_at) VALUES (?, 'radialGradient', 9, 45, 0, ?)"
    )
      .bind(seed, Date.now())
      .run();
    const reader = await makeAccount(env);
    await env.DB.prepare(
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 9, 'radialGradient', 45, ?)"
    )
      .bind(reader.id, seed, Date.now())
      .run();
    expect(await stands(admin)).toEqual([
      200,
      {
        seed,
        gallery: { style: "radialGradient", steps: 9, angle: 45, likes: 1 },
        collections: [held],
        liked: true
      }
    ]);
    expect((await stands(owner))[0]).toBe(403);
    expect((await paletteAnswer(get(`/api/me/palettes/${seed}`), env)).status).toBe(401);
  });

  it("deletes a palette everywhere, each membership on the record", async () => {
    const seed = GALLERY[1]!;
    const slug = await held(seed);
    expect((await palette("DELETE", seed, { scope: "everywhere" }, owner)).status).toBe(403);
    expect(
      await bodyOf(await palette("DELETE", seed, { scope: "everywhere", reasons: ["dull"] }, admin))
    ).toEqual({ deleted: seed, gallery: true, collections: [slug] });
    expect(await count(env, "SELECT COUNT(*) AS n FROM k_palettes WHERE seed = ?", seed)).toBe(0);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_collection_items WHERE seed = ?", seed)
    ).toBe(0);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_admin_actions WHERE seed = ? AND action IN ('remove', 'delete')",
        seed
      )
    ).toBe(2);
  });

  it("saves an edit over a palette wherever it stands, and redraws the gallery's", async () => {
    const seed = GALLERY[2]!;
    const slug = await held(seed);
    const redrawn = await palette("PATCH", seed, { angle: 180, reasons: ["form"] }, admin);
    expect(await bodyOf(redrawn)).toMatchObject({ palette: { seed, angle: 180 } });
    const next = SEEDS[2]!;
    const saved = await palette("PUT", seed, { seed: next, reasons: ["ugly"] }, admin);
    expect(await bodyOf(saved)).toEqual({
      palette: { from: seed, seed: next, gallery: true, collections: [slug] }
    });
    expect(await count(env, "SELECT COUNT(*) AS n FROM k_palettes WHERE seed = ?", seed)).toBe(0);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE c.slug = ? AND i.seed = ?",
        slug,
        next
      )
    ).toBe(1);
    expect((await palette("PUT", next, { seed: next }, admin)).status).toBe(400);
  });
});
