import type { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { planStatements } from "./build.ts";
import type { Snapshot } from "./snapshot.ts";
import { sinceLoad, stagingWork, type Work, workReport } from "./staging-work.ts";
import {
  A,
  ALIASES,
  B,
  C,
  type Changes,
  copyOf,
  LOADED,
  lite,
  memory,
  O,
  ORIGINALS,
  production,
  run,
  type Sources,
  snapshotOf,
  stagingOf,
  unloaded
} from "./testing.ts";
import { type Check, verify } from "./verify.ts";

/* Two palettes only staging's gallery holds, each brought in by the admin's like. */
const D = "kDdddddddd";
const E = "kFeeeeeeee";
/** The build's time, after every change below. */
const BUILT = 1_000_000;

const item = (collection: string, position: number, seed: string, at: number) =>
  `('${collection}', ${position}, '${seed}', 'linearGradient', 7, 90, ${at})`;
const items = (...values: string[]) =>
  `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at) VALUES ${values.join(", ")}`;
const collection = (
  id: string,
  slug: string,
  kind: string,
  owner: string,
  title: string,
  at: number
) =>
  `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, item_count, created_at, updated_at)
   VALUES ('${id}', '${slug}', '${kind}', '${owner}', '${title}', '${kind === "agent" ? "public" : "private"}', 0, ${at}, ${at})`;
const liked = (user: string, seed: string, at: number, pressedOn = "NULL") =>
  `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at, collection_id)
   VALUES ('${user}', '${seed}', 32, 'radialGradient', 90, ${at}, ${pressedOn})`;
const palette = (seed: string, at: number) =>
  `INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES ('${seed}', 'radialGradient', 32, 90, ${at})`;

/* grabient-lite before staging's load: the admin's own collection of greens, and a like pressed on another. */
const greens: Changes[number] = [
  [
    collection("c7", "@john/greens", "user", "LA", "Greens", 9950),
    items(item("c7", 0, B, 9950), item("c7", 1, C, 9950)),
    liked("LA", O, 9950, "'c6'")
  ],
  9950
];

/* The admin's work on staging since its load, and the personas' and the queue's there, in order. */
const onStaging: Changes = [
  [[palette(D, 100_000), liked("PA", D, 100_000, "'c1'")], 100_000],
  [[liked("persona-ash", O, 105_000)], 105_000],
  [[`DELETE FROM k_likes WHERE user_id = 'PA' AND palette_id = '${B}'`], 110_000],
  [[`DELETE FROM k_likes WHERE user_id = 'PA' AND palette_id = '${C}'`], 120_000],
  [
    [
      collection("s1", "@john/staging-picks", "user", "PA", "Staging picks", 130_000),
      items(item("s1", 0, O, 130_000), item("s1", 1, A, 130_000))
    ],
    130_000
  ],
  [
    [
      `UPDATE k_collections SET title = 'Warm sunsets, kept', description = 'Edited on staging', tags = '["warm"]',
         updated_at = 140000 WHERE id = 'c3'`,
      "UPDATE k_collection_items SET position = 1 - position WHERE collection_id = 'c3'"
    ],
    140_000
  ],
  [
    ["UPDATE k_collections SET title = 'Greens on staging', updated_at = 145000 WHERE id = 'c7'"],
    145_000
  ],
  [
    [
      "DELETE FROM k_collection_items WHERE collection_id = 's1'",
      "UPDATE k_collections SET updated_at = 150000 WHERE id = 's1'"
    ],
    150_000
  ],
  [["DELETE FROM k_collections WHERE id = 'c6'"], 160_000],
  [
    [
      `INSERT INTO k_collection_notes (id, collection_id, author_id, text, created_at, items_then)
       VALUES ('n2', 'c1', 'PA', 'cooler, please', 165000, '[]')`,
      `INSERT INTO k_admin_actions (id, actor_id, action, collection_id, slug, title, after, created_at)
       VALUES ('a-note', 'PA', 'note', 'c1', 'warm-sunsets', 'warm-sunsets', '{"id":"n2"}', 165000)`
    ],
    165_000
  ],
  [
    [
      `INSERT INTO k_newsletter_leads (issue, seed, chosen_by, chosen_at) VALUES (1, '${A}', 'PA', 170000)`
    ],
    170_000
  ],
  [
    [
      `DELETE FROM k_collection_items WHERE collection_id = 'c1' AND seed = '${C}'`,
      "UPDATE k_collections SET updated_at = 175000 WHERE id = 'c1'",
      `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, before, created_at)
       VALUES ('a-remove', 'PA', 'remove', '${C}', 'c1', 'warm-sunsets', 'warm-sunsets', '{"position":1}', 175000)`
    ],
    175_000
  ],
  [
    [
      collection("q-purple", "purple-swatches", "agent", "grabient", "Purple swatches", 180_000),
      items(item("q-purple", 0, B, 180_000)),
      `INSERT INTO k_queue (id, key, agent, kind, payload, due_at, status, created_at, done_at)
       VALUES ('q3', 'collection:purple', 'grabient', 'collection', '{"slug":"purple-swatches","items":[{"seed":"${B}"}]}',
         180000, 'done', 9000, 180000)`
    ],
    180_000
  ],
  [[palette(E, 182_000), liked("PA", E, 182_000, "'q-purple'")], 182_000],
  [
    [
      `UPDATE k_collection_votes SET vote = -1, updated_at = 185000 WHERE collection_id = 'c1' AND seed = '${A}'
         AND user_id = 'PA'`,
      `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, before, after, created_at)
       VALUES ('a-vote', 'PA', 'vote', '${A}', 'c1', 'warm-sunsets', 'warm-sunsets', '{"vote":1}', '{"vote":-1}', 185000)`
    ],
    185_000
  ]
];

/* grabient-lite after staging's load: its own queue's copy of the same collection, the admin liking again a palette
   staging unliked, and the greens renamed after staging renamed them. */
const onLite: Changes = [
  greens,
  [
    [
      collection("l-purple", "purple-swatches", "agent", "grabient", "Purple swatches", 180_500),
      items(item("l-purple", 0, B, 180_500))
    ],
    180_500
  ],
  [
    [
      `DELETE FROM k_likes WHERE user_id = 'LA' AND palette_id = '${C}'`,
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES ('LA', '${C}', 6, 'linearSwatches', 0, 200000)`
    ],
    200_000
  ],
  [
    [
      "UPDATE k_collections SET title = 'Greens on grabient-lite', updated_at = 210000 WHERE id = 'c7'"
    ],
    210_000
  ]
];

let source: Sources;
let work: Work;
let db: DatabaseSync;
let plan: string[];
const one = (sql: string) => db.prepare(sql).get() as Record<string, unknown> | undefined;
const column = (sql: string) =>
  (db.prepare(sql).all() as Record<string, unknown>[]).map(r => Object.values(r)[0]);
const checked = (copy: Snapshot) =>
  verify(copy, source.production, source.lite, {
    aliases: ALIASES,
    originals: ORIGINALS,
    now: BUILT,
    staging: source.staging
  });
const failed = (checks: Check[]) => checks.filter(c => c.status === "fail").map(c => c.name);
/** The first column of each row a query finds. */
const values = (built: DatabaseSync, sql: string) =>
  (built.prepare(sql).all() as Record<string, unknown>[]).map(r => Object.values(r)[0]);

/** A build from a grabient-lite and a staging loaded from it after `base`, each changed since as given, checked. */
async function built(onStaging: Changes, onLite: Changes, base: Changes = []) {
  const sources = { production: await production(), lite: await lite(base) };
  const source: Sources = {
    production: sources.production,
    lite: await lite([...base, ...onLite]),
    staging: await stagingOf(sources, onStaging)
  };
  const { db } = await copyOf(source, BUILT);
  const checks = verify(await snapshotOf(db, 1000), source.production, source.lite, {
    aliases: ALIASES,
    originals: ORIGINALS,
    now: BUILT,
    staging: source.staging
  });
  return { db, checks, work: stagingWork(source.staging, source.production, source.lite, ALIASES) };
}

beforeAll(async () => {
  const sources = { production: await production(), lite: await lite([greens]) };
  source = {
    production: sources.production,
    lite: await lite(onLite),
    staging: await stagingOf(sources, onStaging)
  };
  work = stagingWork(source.staging, source.production, source.lite, ALIASES);
  ({ db, plan } = await copyOf(source, BUILT));
});

describe("staging's work", () => {
  it("finds the load where the copy's log ends, and nothing for a staging never loaded", async () => {
    expect(work.loadedAt).toBe(LOADED);
    expect(stagingWork(await unloaded(), source.production, source.lite, ALIASES).likes).toEqual(
      []
    );
  });

  it("stops once staging's log was pruned, since its load can't be found", async () => {
    const pruned = await snapshotOf(
      memory([
        "CREATE TABLE k_sync_log (id INTEGER PRIMARY KEY, account_id TEXT, kind TEXT, key TEXT, at INTEGER)",
        "CREATE TABLE k_sync_meta (key TEXT PRIMARY KEY, value INTEGER)",
        "INSERT INTO k_sync_log VALUES (9, 'PA', 'like', 'kx', 5)",
        "INSERT INTO k_sync_meta VALUES ('pruned', 8)"
      ])
    );
    expect(() => sinceLoad(pruned)).toThrow(/pruned/);
  });

  it("carries a like and an unlike made on staging, the like with where it was pressed", () => {
    expect(
      one(
        `SELECT created_at, style, collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${D}'`
      )
    ).toEqual({
      created_at: 100_000,
      style: "radialGradient",
      collection_id: "c1"
    });
    expect(
      one(`SELECT 1 AS n FROM k_likes WHERE user_id = 'PA' AND palette_id = '${B}'`)
    ).toBeUndefined();
  });

  it("brings in the palettes its likes brought into staging's gallery", () => {
    expect(
      column(`SELECT seed FROM k_palettes WHERE seed IN ('${D}', '${E}') ORDER BY seed`)
    ).toEqual([D, E]);
    expect(work.palettes.map(p => p.seed).sort()).toEqual([D, E]);
  });

  it("lets a like made on grabient-lite after staging's unlike stand, and names the conflict", () => {
    expect(
      one(`SELECT created_at FROM k_likes WHERE user_id = 'PA' AND palette_id = '${C}'`)
    ).toEqual({
      created_at: 200_000
    });
    expect(work.conflicts).toContainEqual({
      kind: "like",
      key: C,
      staging: 120_000,
      other: 200_000,
      source: "grabient-lite",
      stands: "grabient-lite"
    });
  });

  it("carries a collection made and emptied on staging, and one edited and reordered", () => {
    expect(one("SELECT slug, owner_id, title FROM k_collections WHERE id = 's1'")).toEqual({
      slug: "@john/staging-picks",
      owner_id: "PA",
      title: "Staging picks"
    });
    expect(column("SELECT seed FROM k_collection_items WHERE collection_id = 's1'")).toEqual([]);
    expect(one("SELECT title, description, tags FROM k_collections WHERE id = 'c3'")).toEqual({
      title: "Warm sunsets, kept",
      description: "Edited on staging",
      tags: '["warm"]'
    });
    expect(
      column("SELECT seed FROM k_collection_items WHERE collection_id = 'c3' ORDER BY position")
    ).toEqual([C, A]);
  });

  it("carries a collection deleted on staging, and clears what pointed at it", () => {
    expect(one("SELECT 1 AS n FROM k_collections WHERE id = 'c6'")).toBeUndefined();
    expect(
      one(`SELECT collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${O}'`)
    ).toEqual({
      collection_id: null
    });
  });

  it("lets grabient-lite's later change of a collection stand, and names the conflict", () => {
    expect(one("SELECT title FROM k_collections WHERE id = 'c7'")).toEqual({
      title: "Greens on grabient-lite"
    });
    expect(work.conflicts).toContainEqual({
      kind: "collection",
      key: "@john/greens",
      staging: 145_000,
      other: 210_000,
      source: "grabient-lite",
      stands: "grabient-lite"
    });
  });

  it("carries the admin's curation of Grabient's collection with its record, and a note", () => {
    expect(
      column("SELECT seed FROM k_collection_items WHERE collection_id = 'c1' ORDER BY position")
    ).toEqual([A]);
    expect(
      column("SELECT id FROM k_admin_actions WHERE id IN ('a-note', 'a-remove') ORDER BY id")
    ).toEqual(["a-note", "a-remove"]);
    expect(one("SELECT author_id, text FROM k_collection_notes WHERE id = 'n2'")).toEqual({
      author_id: "PA",
      text: "cooler, please"
    });
  });

  it("carries the newsletter's lead an admin chose", () => {
    expect(one("SELECT issue, seed, chosen_by, chosen_at FROM k_newsletter_leads")).toEqual({
      issue: 1,
      seed: A,
      chosen_by: "PA",
      chosen_at: 170_000
    });
  });

  it("leaves out a persona's like and the collection staging's queue made, which grabient-lite holds as its own", () => {
    expect(
      one(`SELECT 1 AS n FROM k_likes WHERE user_id = 'persona-ash' AND palette_id = '${O}'`)
    ).toBeUndefined();
    expect(column("SELECT id FROM k_collections WHERE slug = 'purple-swatches'")).toEqual([
      "l-purple"
    ]);
    expect(
      one(`SELECT collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${E}'`)
    ).toEqual({
      collection_id: "l-purple"
    });
  });

  it("names what it leaves on staging: the admin's fit vote and its record", () => {
    expect(work.left).toEqual([
      { table: "k_admin_actions", what: `vote ${A} in warm-sunsets`, at: 185_000 }
    ]);
    expect(
      one(`SELECT vote FROM k_collection_votes WHERE collection_id = 'c1' AND seed = '${A}'`)
    ).toEqual({ vote: 1 });
  });

  it("reports what it carries, the count a loaded copy waits on", () => {
    const reported = workReport(work, new Map());
    expect(reported).toMatchObject({
      loadedAt: new Date(LOADED).toISOString(),
      carried: 13,
      likes: 2,
      unlikes: 1,
      likesChangedLaterElsewhere: 1
    });
    expect(reported.collections.map(c => [c.address ?? c.id, c.change, c.stands])).toEqual([
      ["@john/staging-picks", "made", "staging"],
      ["@john/warm-sunsets", "changed", "staging"],
      ["@john/greens", "changed", "grabient-lite"],
      ["c6", "deleted", "staging"],
      ["warm-sunsets", "changed", "staging"]
    ]);
  });

  it("makes every count whole again after it", () => {
    expect(
      column(
        "SELECT seed FROM k_palettes p WHERE likes_count <> legacy_likes_count + (SELECT COUNT(*) FROM k_likes l WHERE l.palette_id = p.seed)"
      )
    ).toEqual([]);
    expect(
      column(
        "SELECT id FROM k_collections c WHERE item_count <> (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = c.id)"
      )
    ).toEqual([]);
  });

  it("changes nothing when its plan runs again, or is made again from the copy", async () => {
    const before = await snapshotOf(db, 1000);
    run(db, plan);
    run(db, planStatements(before, source.lite, source.staging, ALIASES, ORIGINALS).statements);
    const after = await snapshotOf(db, 1000);
    for (const table of Object.keys(before.meta.tables)) {
      if (table === "k_sync_log") continue;
      expect(after.rows(table), table).toEqual(before.rows(table));
    }
  });
});

describe("Grabient's collections the queue runs on both sides", () => {
  /* a job both sites' queues hold from the load, and one grabient-lite's queue was given since */
  const queued = (id: string, seed: string, status: string, done: number | null) =>
    `INSERT INTO k_queue (id, key, agent, kind, payload, due_at, status, created_at, done_at)
     VALUES ('${id}', 'collection:${id}', 'grabient', 'collection', '{"slug":"warm-sunsets","items":[{"seed":"${seed}"}]}',
       190000, '${status}', 9000, ${done})`;
  const ran = (id: string, seed: string, position: number, at: number) => [
    items(item("c1", position, seed, at)),
    `UPDATE k_collections SET item_count = item_count + 1, updated_at = ${at} WHERE id = 'c1'`,
    `UPDATE k_queue SET status = 'done', done_at = ${at} WHERE id = '${id}'`
  ];
  const removedC: Changes[number] = [
    [
      `DELETE FROM k_collection_items WHERE collection_id = 'c1' AND seed = '${C}'`,
      "UPDATE k_collections SET item_count = 1, updated_at = 175000 WHERE id = 'c1'",
      `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, before, created_at)
       VALUES ('a-remove', 'PA', 'remove', '${C}', 'c1', 'warm-sunsets', 'warm-sunsets', '{"position":1}', 175000)`
    ],
    175_000
  ];
  const base: Changes = [[[queued("q9", O, "due", null)], 9_000]];
  const c1 = (built: DatabaseSync) =>
    values(
      built,
      "SELECT seed FROM k_collection_items WHERE collection_id = 'c1' ORDER BY position"
    );
  const recorded = (built: DatabaseSync) =>
    values(built, "SELECT id FROM k_admin_actions WHERE id = 'a-remove'");

  it("keeps the palette the admin took out on staging out, and every palette either queue added", async () => {
    const { db, work, checks } = await built(
      [
        removedC,
        [ran("q9", O, 2, 190_200), 190_200],
        [[items(item("c1", 3, B, 192_000))], 192_000]
      ],
      [
        [ran("q9", O, 2, 190_000), 190_000],
        [[queued("q10", D, "due", null), ...ran("q10", D, 3, 195_000)], 195_000]
      ],
      base
    );
    /* A stands, C stays out, the job both ran adds O once, his B joins when he added it, and D from grabient-lite's
       own job after it */
    expect(c1(db)).toEqual([A, O, B, D]);
    expect(recorded(db)).toEqual(["a-remove"]);
    expect(work.conflicts).toEqual([]);
    expect(work.left).toEqual([]);
    expect(failed(checks)).toEqual([]);
  });

  it("lets grabient-lite's admin's later curation of the collection stand, and names the conflict", async () => {
    const { db, work, checks } = await built(
      [removedC],
      [
        [
          [
            `DELETE FROM k_collection_items WHERE collection_id = 'c1' AND seed = '${A}'`,
            "UPDATE k_collections SET item_count = 1, updated_at = 200000 WHERE id = 'c1'",
            `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, created_at)
             VALUES ('a-lite', 'LA', 'remove', '${A}', 'c1', 'warm-sunsets', 'warm-sunsets', 200000)`
          ],
          200_000
        ]
      ],
      base
    );
    expect(c1(db)).toEqual([C]);
    expect(recorded(db)).toEqual([]);
    expect(work.conflicts).toEqual([
      {
        kind: "collection",
        key: "warm-sunsets",
        staging: 175_000,
        other: 200_000,
        source: "grabient-lite",
        stands: "grabient-lite"
      }
    ]);
    expect(failed(checks)).toEqual([]);
  });
});

describe("a like of a palette an admin deleted from the gallery", () => {
  const X = "kWxxxxxxxx";
  /* grabient-lite's gallery holds X at the load, so staging's does too */
  const inGallery: Changes = [[[palette(X, 9_960)], 9_960]];
  /* the delete the site makes: every like of the palette, the palette, and the record */
  const deleted = (id: string, actor: string, seed: string, at: number): Changes[number] => [
    [
      `DELETE FROM k_likes WHERE palette_id = '${seed}'`,
      `DELETE FROM k_palettes WHERE seed = '${seed}'`,
      `INSERT INTO k_admin_actions (id, actor_id, action, seed, created_at)
       VALUES ('${id}', '${actor}', 'delete', '${seed}', ${at})`
    ],
    at
  ];
  const likeOf = (built: DatabaseSync, seed: string) =>
    values(built, `SELECT created_at FROM k_likes WHERE user_id = 'PA' AND palette_id = '${seed}'`);
  const paletteOf = (built: DatabaseSync, seed: string) =>
    values(built, `SELECT seed FROM k_palettes WHERE seed = '${seed}'`);

  it("goes with grabient-lite's later delete, which took every like of the palette", async () => {
    const { db, work, checks } = await built(
      [[[liked("PA", X, 100_000)], 100_000]],
      [deleted("a-delete", "LA", X, 150_000)],
      inGallery
    );
    expect(likeOf(db, X)).toEqual([]);
    expect(paletteOf(db, X)).toEqual([]);
    expect(work.conflicts).toEqual([
      {
        kind: "like",
        key: X,
        staging: 100_000,
        other: 150_000,
        source: "grabient-lite",
        stands: "grabient-lite"
      }
    ]);
    expect(failed(checks)).toEqual([]);
  });

  it("stands without its palette when saved after grabient-lite's delete, as the site saves one", async () => {
    const { db, work, checks } = await built(
      [[[liked("PA", X, 150_000)], 150_000]],
      [deleted("a-delete", "LA", X, 100_000)],
      inGallery
    );
    expect(likeOf(db, X)).toEqual([150_000]);
    expect(paletteOf(db, X)).toEqual([]);
    expect(work.palettes).toEqual([]);
    expect(failed(checks)).toEqual([]);
  });

  it("stands without its palette after a delete on staging alone, with the delete's record", async () => {
    const Y = "kYyyyyyyyy";
    const { db, work, checks } = await built(
      [
        [[palette(Y, 100_000), liked("PA", Y, 100_000)], 100_000],
        deleted("s-delete", "PA", Y, 110_000),
        [[liked("PA", Y, 120_000)], 120_000]
      ],
      []
    );
    expect(likeOf(db, Y)).toEqual([120_000]);
    expect(paletteOf(db, Y)).toEqual([]);
    expect(values(db, "SELECT id FROM k_admin_actions WHERE id = 's-delete'")).toEqual([
      "s-delete"
    ]);
    expect(work.left).toEqual([]);
    expect(failed(checks)).toEqual([]);
  });
});

describe("verify, with staging's work", () => {
  it("passes the build, warning of the conflicts and what stays on staging", async () => {
    const checks = checked(await snapshotOf(db, 1000));
    expect(failed(checks)).toEqual([]);
    expect(checks.find(c => c.name === "conflicts")?.status).toBe("warn");
    expect(checks.find(c => c.name === "left on staging")?.detail).toContain("vote");
  });

  it.each([
    [
      "a carried like lost",
      `DELETE FROM k_likes WHERE user_id = 'PA' AND palette_id = '${D}'`,
      "staging's work"
    ],
    [
      "an unlike undone",
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES ('PA', '${B}', 4, 'radialSwatches', 45, 1)`,
      "staging's work"
    ],
    [
      "a carried collection's palettes out of order",
      "UPDATE k_collection_items SET position = 1 - position WHERE collection_id = 'c3'",
      "staging's work"
    ],
    ["the lead lost", "DELETE FROM k_newsletter_leads", "staging's work"],
    [
      "a curation's record lost",
      "DELETE FROM k_admin_actions WHERE id = 'a-remove'",
      "staging's work"
    ],
    ["a persona's like from staging", liked("persona-ash", O, 105_000), "row counts"],
    [
      "the collection staging's queue made",
      collection("q-purple", "purple-swatches-2", "agent", "grabient", "Purple swatches", 180_000),
      "row counts"
    ]
  ])("fails the build with %s", async (_, sql, name) => {
    const { db: tampered } = await copyOf(source, BUILT);
    run(tampered, [sql]);
    expect(failed(checked(await snapshotOf(tampered, 1000)))).toContain(name);
  });
});
