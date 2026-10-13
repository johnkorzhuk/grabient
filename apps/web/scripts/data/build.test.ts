import type { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { planStatements } from "./build.ts";
import type { Snapshot } from "./snapshot.ts";
import {
  A,
  ALIASES,
  B,
  C,
  copyOf,
  lite,
  NOW,
  O,
  ORIGINALS,
  production,
  run,
  snapshotOf
} from "./testing.ts";

let source: { production: Snapshot; lite: Snapshot };
let db: DatabaseSync;
let plan: string[];
const one = (sql: string) => db.prepare(sql).get() as Record<string, unknown>;
const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];

beforeAll(async () => {
  source = { production: await production(), lite: await lite() };
  ({ db, plan } = await copyOf(source));
});

describe("the copy of production", () => {
  it("keeps production's accounts, links and history, and no session or token", () => {
    expect(
      all("SELECT id FROM auth_user WHERE id IN ('PA', 'PJ1234567890xyz', 'PU')")
    ).toHaveLength(3);
    expect(one("SELECT COUNT(*) AS n FROM auth_account").n).toBe(3);
    expect(one("SELECT COUNT(*) AS n FROM auth_session").n).toBe(0);
    expect(all("SELECT name FROM d1_migrations ORDER BY id").map(r => r.name)).toEqual(
      expect.arrayContaining([
        "0000_old.sql",
        "0021_old.sql",
        "0000_baseline.sql",
        "0054_search_unread.sql"
      ])
    );
    expect(one("SELECT name FROM d1_migrations ORDER BY id LIMIT 1 OFFSET 2").name).toBe(
      "0000_baseline.sql"
    );
  });

  it("puts every production palette with a seed in the gallery, the older id naming it", () => {
    const a = one(`SELECT style, steps, angle, created_at FROM k_palettes WHERE seed = '${A}'`);
    /* _old2 is older than _old1; steps rise to the seed's four keyframes; the first Grabient dates it 500 */
    expect(a).toEqual({ style: "linearSwatches", steps: 5, angle: 0, created_at: 500 });
    expect(one(`SELECT created_at FROM k_palettes WHERE seed = '${O}'`).created_at).toBe(100);
    expect(one("SELECT COUNT(*) AS n FROM k_legacy_map").n).toBe(3);
  });

  it("makes an account's likes its saved palettes, the newest of two ids of one seed winning", () => {
    expect(
      one(
        `SELECT style, steps, created_at FROM k_likes WHERE user_id = 'PU' AND palette_id = '${A}'`
      )
    ).toEqual({
      style: "linearSwatches",
      steps: 5,
      created_at: 6000
    });
    /* the like of an old id no map knows stays behind */
    expect(one("SELECT COUNT(*) AS n FROM k_likes WHERE user_id = 'PU'").n).toBe(1);
  });

  it("counts a deleted account's like as history", () => {
    expect(
      one(`SELECT legacy_likes_count, likes_count FROM k_palettes WHERE seed = '${B}'`)
    ).toEqual({
      legacy_likes_count: 1,
      likes_count: 2
    });
  });

  it("maps grabient-lite's accounts by email and makes the ones its rows name", () => {
    expect(one("SELECT owner_id FROM k_collections WHERE id = 'c3'").owner_id).toBe("PA");
    expect(one("SELECT username, role FROM auth_user WHERE id = 'persona-ash'")).toEqual({
      username: null,
      role: "user"
    });
    /* production holds its username, so the account made from grabient-lite's goes without */
    expect(one("SELECT username FROM auth_user WHERE id = 'LX'").username).toBe(null);
    expect(all("SELECT id FROM auth_user WHERE id IN ('LA', 'LJ', 'LY')")).toEqual([]);
  });

  it("moves a private collection under its owner's handle in production", () => {
    expect(one("SELECT slug FROM k_collections WHERE id = 'c2'").slug).toBe("@_pj12345678/blue");
    expect(one("SELECT slug FROM k_collections WHERE id = 'c4'").slug).toBe("@_lx/mine");
    expect(one("SELECT slug FROM k_collections WHERE id = 'c3'").slug).toBe("@john/warm-sunsets");
  });

  it("keeps a collection's palettes in order and its counts whole", () => {
    expect(
      all(
        "SELECT seed, created_at FROM k_collection_items WHERE collection_id = 'c1' ORDER BY position"
      )
    ).toEqual([
      { seed: A, created_at: 8000 },
      { seed: C, created_at: null }
    ]);
    const c1 = one("SELECT fork_count, likes_sum, item_count FROM k_collections WHERE id = 'c1'");
    const likes = one(
      `SELECT SUM(likes_count) AS n FROM k_palettes WHERE seed IN ('${A}', '${C}')`
    ).n;
    expect(c1).toEqual({ fork_count: 1, likes_sum: likes, item_count: 2 });
  });

  it("lets grabient-lite's like win over production's, with where it was pressed", () => {
    expect(
      one(
        `SELECT style, query, collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${B}'`
      )
    ).toEqual({
      style: "radialSwatches",
      query: "blue",
      collection_id: "c1"
    });
  });

  it("carries the record, the queue, texts, translations, switches and votes under production's accounts", () => {
    expect(one("SELECT actor_id FROM k_admin_actions WHERE id = 'a1'").actor_id).toBe("PA");
    expect(one("SELECT reviewer_id FROM k_reviews").reviewer_id).toBe("PA");
    expect(one("SELECT actor FROM k_queue WHERE id = 'q1'").actor).toBe("persona-ash");
    expect(one("SELECT COUNT(*) AS n FROM k_translations").n).toBe(2);
    expect(one("SELECT updated_by FROM k_flags").updated_by).toBe("PA");
    expect(one("SELECT user_id FROM k_search_votes").user_id).toBe("PA");
    expect(one("SELECT COUNT(*) AS n FROM k_popular_searches").n).toBe(0);
    expect(one("SELECT COUNT(*) AS n FROM k_palette_use").n).toBe(0);
  });

  it("scores what was liked lately and what is new, and nothing else", () => {
    expect(Number(one(`SELECT hot FROM k_palettes WHERE seed = '${C}'`).hot)).toBeGreaterThan(1);
    expect(Number(one(`SELECT rising FROM k_palettes WHERE seed = '${C}'`).rising)).toBeGreaterThan(
      0
    );
    expect(Number(one("SELECT hot FROM k_collections WHERE id = 'c1'").hot)).toBeGreaterThan(0);
    expect(one("SELECT hot FROM k_collections WHERE id = 'c2'").hot).toBe(0);
    expect(NOW).toBeGreaterThan(9800);
  });

  it("changes nothing when its plan runs again", async () => {
    const before = await snapshotOf(db, 1000);
    run(db, plan);
    const after = await snapshotOf(db, 1000);
    for (const table of Object.keys(before.meta.tables)) {
      if (table === "k_sync_log") continue;
      expect(after.rows(table), table).toEqual(before.rows(table));
    }
  });

  it("changes nothing when a plan is made again from the copy, as a second run at the cutover is", async () => {
    const before = await snapshotOf(db, 1000);
    run(db, planStatements(before, source.lite, ALIASES, ORIGINALS).statements);
    const after = await snapshotOf(db, 1000);
    for (const table of Object.keys(before.meta.tables)) {
      if (table === "k_sync_log") continue;
      expect(after.rows(table), table).toEqual(before.rows(table));
    }
  });
});
