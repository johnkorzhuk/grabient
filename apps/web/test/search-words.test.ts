import { run } from "@grabient/server/db/d1.ts";
import { describe, expect, it } from "vitest";
import { searchPalettes } from "../src/server/search/search.ts";
import { shippedSnapshot } from "../src/server/search/snapshot.ts";
import { syncSnapshot } from "../src/server/search/sync.ts";
import { freshIsolate, makeAdmin, seedOf, type TestEnv, testEnv, unique } from "./helpers.ts";

/* The search as a database's own rows make it, through the schedule's build and a fresh isolate's read of the stored
   copy: the collection-mates that lead a palette's likes. */

/* palettes in the gallery, enough of them that the nearest twelfth of the site is a few palettes deep */
async function gallery(env: TestEnv, seeds: readonly string[]) {
  const now = Date.now();
  await env.DB.batch(
    seeds.map(seed =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)"
      ).bind(seed, now)
    )
  );
}

/* a public collection of Grabient's holding these palettes, in order */
async function agentCollection(env: TestEnv, title: string, seeds: readonly string[]) {
  const now = Date.now();
  const id = unique("c").replace(/[^a-z0-9]/g, "");
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count, created_at, updated_at)
     VALUES (?, ?, 'agent', 'a', ?, '', '[]', 'public', ?, ?, ?)`,
    id,
    `c-${id}`,
    title,
    seeds.length,
    now,
    now
  );
  for (const [position, seed] of seeds.entries())
    await run(
      env.DB,
      "INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at) VALUES (?, ?, ?, 'linearGradient', 7, 90, ?)",
      id,
      position,
      seed,
      now
    );
  return id;
}

describe("a palette's collection-mates", () => {
  it("lead its likes from the built copy, and a palette an admin voted out of the collection is no mate", async () => {
    const env = testEnv();
    await gallery(env, (await shippedSnapshot(env)).seeds.slice(0, 40));
    const [first, kept, out] = [
      seedOf("#0b1d3a", "#4a6fa5", "#c9d6ea"),
      seedOf("#0c1e3c", "#4b70a7", "#cad7eb"),
      seedOf("#0a1c39", "#496ea4", "#c8d5e9")
    ];
    // the one voted out stays in the gallery, as near as the one kept
    await gallery(env, [out]);
    const id = await agentCollection(env, "Harbor blues", [first, kept, out]);
    const admin = await makeAdmin(env);
    await run(
      env.DB,
      "INSERT INTO k_collection_votes (collection_id, seed, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, -1, ?, ?)",
      id,
      out,
      admin.id,
      Date.now(),
      Date.now()
    );
    expect(await syncSnapshot(env)).toMatchObject({ status: "built" });

    const { tier, items } = await searchPalettes(freshIsolate(env), first, { limit: 96 });
    expect(tier).toBe("similar");
    expect(items.filter(item => item.lead).map(item => item.kseed)).toEqual([kept]);
    expect(items.find(item => item.kseed === out)).toMatchObject({ kseed: out });
    expect(items.find(item => item.kseed === out)?.lead).toBeUndefined();
  });
});
