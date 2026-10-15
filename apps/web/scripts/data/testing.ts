/* The data scripts' tests run the pipeline in memory: a production with the old app's schema, a grabient-lite built
   by the repository's migrations, a grabient-staging loaded from an earlier copy and changed since, all read into
   snapshots as read.ts reads D1, and the copy build.ts makes of them, in node:sqlite with foreign keys on as D1 has
   them. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { baseStatements, planStatements } from "./build.ts";
import { type Database, insertRows, MIGRATIONS } from "./d1.ts";
import { loadStatements } from "./load.ts";
import type { Original } from "./palettes.ts";
import { readDatabase } from "./read.ts";
import { scoreDatabase } from "./scores.ts";
import { type Row, reads, type Snapshot } from "./snapshot.ts";
import { stagingCopy } from "./staging.ts";
import { migrationFiles } from "./verify.ts";

/** Production's schema at the old app's last migration, as its sqlite_master holds it. */
export const PRODUCTION_SCHEMA = [
  `CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`,
  "CREATE TABLE `auth_account` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`account_id` text NOT NULL,\n\t`provider_id` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`access_token` text,\n\t`refresh_token` text,\n\t`id_token` text,\n\t`access_token_expires_at` integer,\n\t`refresh_token_expires_at` integer,\n\t`scope` text,\n\t`password` text,\n\t`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `auth_session` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`token` text NOT NULL,\n\t`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`ip_address` text,\n\t`user_agent` text,\n\t`user_id` text NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`)",
  "CREATE TABLE `auth_user` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`email` text NOT NULL,\n\t`email_verified` integer DEFAULT false NOT NULL,\n\t`image` text,\n\t`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL\n, `username` text, `name` text NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user', `attribution_source` text, `attribution_medium` text, `attribution_campaign` text, `attribution_referrer` text, `attribution_landing` text, `attribution_at` integer)",
  "CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` (`email`)",
  "CREATE TABLE `auth_verification` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`identifier` text NOT NULL,\n\t`value` text NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL\n)",
  'CREATE TABLE "likes" (\n  `user_id` text NOT NULL,\n  `palette_id` text NOT NULL,\n  `steps` integer NOT NULL,\n  `style` text NOT NULL,\n  `angle` integer NOT NULL,\n  `created_at` integer NOT NULL, `coeff_key` text,\n  PRIMARY KEY (`user_id`, `palette_id`)\n)',
  "CREATE INDEX `likes_palette_id_idx` ON `likes` (`palette_id`)",
  'CREATE TABLE "palettes" (\n  `id` text PRIMARY KEY NOT NULL,\n  `style` text NOT NULL,\n  `steps` integer NOT NULL,\n  `angle` integer NOT NULL,\n  `created_at` integer NOT NULL\n)',
  "CREATE UNIQUE INDEX `auth_user_username_unique` ON `auth_user` (`username`)",
  "CREATE TABLE `refine_sessions` (\n  `id` text PRIMARY KEY NOT NULL,\n  `user_id` text,\n  `query` text NOT NULL,\n  `version` integer DEFAULT 1 NOT NULL,\n  `generated_seeds` text DEFAULT '{}' NOT NULL,\n  `feedback` text DEFAULT '{}' NOT NULL,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL\n)"
];

/** A database in memory, with foreign keys checked as D1 checks them. */
export const memory = (statements: readonly string[] = []) => {
  const db = new DatabaseSync(":memory:");
  run(db, statements);
  return db;
};
export const run = (db: DatabaseSync, statements: readonly string[]) => {
  for (const statement of statements) db.exec(statement);
};
/** The repository's migrations, applied and recorded by name as cf's runner does. */
export function migrate(db: DatabaseSync) {
  const dir = MIGRATIONS;
  for (const file of migrationFiles(dir)) {
    db.exec(readFileSync(resolve(dir, file), "utf8"));
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
  }
}
/** Rows by table, inserted in the order given, each with the columns it names so the rest take their defaults. */
export function insert(db: DatabaseSync, tables: Record<string, Row[]>) {
  for (const [table, rows] of Object.entries(tables)) {
    for (const row of rows) run(db, insertRows(table, Object.keys(row), [row]));
  }
}

/** The in-memory database read into a snapshot, as read.ts reads D1. */
export async function snapshotOf(db: DatabaseSync, page = 3): Promise<Snapshot> {
  const target: Database = { name: "memory", id: "memory" };
  const { meta, schema, tables } = await readDatabase(reads(db), target, page);
  return { dir: "", meta, schema, rows: table => tables.get(table) ?? [] };
}

/** A change as the site writes it, its triggers and all, with the log rows it wrote dated `at`. */
export function change(db: DatabaseSync, statements: readonly string[], at: number) {
  const { id } = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM k_sync_log").get() as {
    id: number;
  };
  run(db, statements);
  db.prepare("UPDATE k_sync_log SET at = ? WHERE id > ?").run(at, id);
}
export type Changes = readonly (readonly [statements: readonly string[], at: number])[];

/* Seeds whose second letter gives their keyframes: E four, A two, G five, C three. */
export const A = "kEaaaaaaaa";
export const B = "kAbbbbbbbb";
export const C = "kGcccccccc";
export const O = "kCoooooooo";
export const ALIASES = new Map([
  ["_old1", A],
  ["_old2", A],
  ["_old3", B]
]);
export const ORIGINALS: Original[] = [
  { kseed: O, createdAt: 100, style: "linearGradient", steps: 7, angle: 90 },
  { kseed: A, createdAt: 500, legacy: "_old1" }
];
export const NOW = 10_000;
/** When the copy loaded into staging was written: its log ends here, and staging's own changes come later. */
export const LOADED = 20_000;

const user = (id: string, email: string, extra: Row = {}): Row => ({
  id,
  email,
  email_verified: 1,
  created_at: 1,
  updated_at: 1,
  name: "",
  role: "user",
  ...extra
});

/** Production: an admin, the admin's second account, a reader, an account grabient-lite made an admin; four palettes,
    one with no seed; likes, one of a deleted account; a session. */
export async function production() {
  const db = memory(PRODUCTION_SCHEMA);
  insert(db, {
    d1_migrations: [
      { id: 1, name: "0000_old.sql", applied_at: "2025-11-30 00:19:42" },
      { id: 2, name: "0021_old.sql", applied_at: "2026-08-15 19:56:56" }
    ],
    auth_user: [
      user("PA", "owner@example.test", { role: "admin", username: "john" }),
      user("PJ1234567890xyz", "alt@example.test"),
      user("PU", "reader@example.test", { username: "johnny", name: "Johnny R." }),
      user("PB", "bob@example.test")
    ],
    auth_account: ["PA", "PJ1234567890xyz", "PU"].map(id => ({
      id: `acc-${id}`,
      account_id: `g-${id}`,
      provider_id: "google",
      user_id: id,
      scope: "openid",
      created_at: 1,
      updated_at: 1
    })),
    palettes: [
      { id: "_old1", style: "linearGradient", steps: 2, angle: 90, created_at: 2000 },
      { id: "_old2", style: "linearSwatches", steps: 5, angle: 0, created_at: 1000 },
      { id: "_old3", style: "radialGradient", steps: 4, angle: 45, created_at: 3000 },
      { id: "_old4", style: "linearGradient", steps: 7, angle: 90, created_at: 4000 }
    ],
    likes: [
      {
        user_id: "PU",
        palette_id: "_old1",
        steps: 2,
        style: "linearGradient",
        angle: 90,
        created_at: 5000
      },
      {
        user_id: "PU",
        palette_id: "_old2",
        steps: 5,
        style: "linearSwatches",
        angle: 0,
        created_at: 6000
      },
      {
        user_id: "GONE",
        palette_id: "_old3",
        steps: 4,
        style: "radialGradient",
        angle: 45,
        created_at: 3500
      },
      {
        user_id: "PA",
        palette_id: "_old3",
        steps: 4,
        style: "radialGradient",
        angle: 45,
        created_at: 7000
      },
      {
        user_id: "PU",
        palette_id: "_old4",
        steps: 7,
        style: "linearGradient",
        angle: 90,
        created_at: 7100
      }
    ],
    refine_sessions: [{ id: "r1", user_id: "PA", query: "blue", created_at: 1, updated_at: 1 }],
    auth_session: [
      { id: "s1", expires_at: 99_999, token: "t", created_at: 1, updated_at: 1, user_id: "PU" }
    ]
  });
  return snapshotOf(db);
}

/** grabient-lite: the same people under other ids, a persona, accounts production lacks; Grabient's collection and
    accounts' ones, a reader's public one among them, with likes, notes, votes, the record, the queue, texts,
    translations, switches, and the tags and search counts. Its log is dated before the build; `later` changes it
    after staging's load. */
export async function lite(later: Changes = []) {
  const db = memory(PRODUCTION_SCHEMA);
  migrate(db);
  const item = (
    collection_id: string,
    position: number,
    seed: string,
    created_at: number | null
  ) => ({
    collection_id,
    position,
    seed,
    style: "linearGradient",
    steps: 7,
    angle: 90,
    created_at
  });
  const collection = (
    id: string,
    slug: string,
    owner_kind: string,
    owner_id: string,
    extra: Row = {}
  ) => ({
    id,
    slug,
    owner_kind,
    owner_id,
    title: slug,
    visibility: "private",
    item_count: 0,
    created_at: 8000,
    updated_at: 8000,
    ...extra
  });
  insert(db, {
    auth_user: [
      user("LA", "OWNER@example.test", { role: "admin", username: "john" }),
      user("LJ", "alt@example.test", { username: "johnk" }),
      user("persona-ash", "ash@personas.grabient.invalid", { name: "Ash" }),
      user("LX", "new@example.test", { username: "johnny" }),
      user("LY", "idle@example.test"),
      user("LB", "BOB@example.test", { role: "admin" }),
      user("LR", "reader@example.test"),
      user("LF", "former@example.test", { name: "Former admin" })
    ],
    k_personas: [{ user_id: "persona-ash", agent: "grabient", handle: "ash", created_at: 1 }],
    k_palettes: [
      { seed: A, style: "linearGradient", steps: 10, angle: 90, classes: "[]", created_at: 1500 },
      {
        seed: C,
        style: "linearSwatches",
        steps: 6,
        angle: 0,
        classes: '["vivid"]',
        created_at: 9000
      }
    ],
    k_collections: [
      collection("c1", "warm-sunsets", "agent", "grabient", {
        visibility: "public",
        published_at: 8000,
        hot: 9,
        item_count: 2
      }),
      collection("c2", "@johnk/blue", "user", "LJ", { item_count: 1 }),
      collection("c3", "@john/warm-sunsets", "user", "LA", {
        forked_from: "c1",
        created_at: 8200,
        item_count: 2
      }),
      collection("c4", "@johnny/mine", "user", "LX", { forked_from: "c1", item_count: 1 }),
      collection("c5", "reader-picks", "user", "LR", {
        visibility: "public",
        published_at: 8400,
        created_at: 8400,
        item_count: 1
      }),
      collection("c6", "@john/blue-copy", "user", "LA", { forked_from: "c2", forked_base: "{}" })
    ],
    k_collection_items: [
      item("c1", 0, A, 8000),
      item("c1", 1, C, null),
      item("c2", 0, B, 8100),
      item("c3", 0, A, 8200),
      item("c3", 1, C, 8200),
      item("c4", 0, C, 8300),
      item("c5", 0, B, 8400)
    ],
    k_likes: [
      {
        user_id: "persona-ash",
        palette_id: C,
        steps: 6,
        style: "linearSwatches",
        angle: 0,
        created_at: 9500
      },
      {
        user_id: "LA",
        palette_id: B,
        steps: 4,
        style: "radialSwatches",
        angle: 45,
        created_at: 9600,
        query: "blue",
        collection_id: "c1"
      },
      {
        user_id: "LA",
        palette_id: C,
        steps: 6,
        style: "linearSwatches",
        angle: 0,
        created_at: 9700,
        via: "mcp"
      },
      {
        user_id: "LJ",
        palette_id: A,
        steps: 7,
        style: "linearGradient",
        angle: 90,
        created_at: 9800
      },
      {
        user_id: "LA",
        palette_id: A,
        steps: 7,
        style: "linearGradient",
        angle: 90,
        created_at: 9900,
        collection_id: "c4"
      }
    ],
    k_collection_notes: [
      { id: "n1", collection_id: "c1", author_id: "LA", text: "warmer", created_at: 8500 }
    ],
    k_collection_votes: [
      { collection_id: "c1", seed: A, user_id: "LA", vote: 1, created_at: 8600, updated_at: 8600 },
      { collection_id: "c1", seed: C, user_id: "LJ", vote: -1, created_at: 8650, updated_at: 8650 }
    ],
    k_admin_actions: [
      { id: "a1", actor_id: "LA", action: "remove", seed: C, collection_id: "c1", created_at: 8700 }
    ],
    k_contributions: [
      {
        id: "x1",
        actor_id: "LA",
        tool: "collection_publish",
        target: "warm-sunsets",
        created_at: 8000
      },
      { id: "x2", actor_id: "LF", tool: "palette_titles", target: A, created_at: 7000 }
    ],
    k_reviews: [
      {
        seed: A,
        subject: "collection:warm-sunsets",
        verdict: "good",
        reviewer_id: "LA",
        created_at: 8800,
        updated_at: 8800
      }
    ],
    k_queue: [
      {
        id: "q1",
        key: "like:ash",
        agent: "grabient",
        kind: "like",
        actor: "persona-ash",
        payload: JSON.stringify({ seed: A }),
        due_at: 20_000,
        created_at: 8900
      },
      {
        id: "q2",
        key: "collection:warm",
        agent: "grabient",
        kind: "collection",
        payload: JSON.stringify({ slug: "warm-sunsets", items: [] }),
        due_at: 20_000,
        created_at: 8900
      }
    ],
    k_palette_texts: [
      { seed: A, title: "Ember dusk", embed: "", agent: "grabient", created_at: 1, updated_at: 1 }
    ],
    k_translations: [
      {
        kind: "collection",
        locale: "de",
        key: "c1",
        title: "Warme Sonnenuntergänge",
        updated_at: 1
      },
      { kind: "tag", locale: "fr", key: "warm", title: "chaud", updated_at: 1 },
      { kind: "collection", locale: "de", key: "c5", title: "Lesers Auswahl", updated_at: 1 }
    ],
    k_flags: [
      { name: "rising-3m", enabled: 0, updated_at: 1, updated_by: "LA" },
      { name: "newsletter", enabled: 1, updated_at: 2, updated_by: "LA" }
    ],
    k_search_votes: [
      { query: "blue", seed: B, user_id: "LA", vote: 1, created_at: 1, updated_at: 1 },
      { query: "blue", seed: A, user_id: "LJ", vote: -1, created_at: 2, updated_at: 2 }
    ],
    k_popular_searches: [
      { kind: "palettes", position: 0, value: "blue", words: "blue", score: 1, computed_at: 1 },
      {
        kind: "collections",
        position: 0,
        value: "reader-picks",
        words: "picks",
        score: 1,
        computed_at: 1
      },
      {
        kind: "collections",
        position: 1,
        value: "nowhere",
        words: "nowhere",
        score: 1,
        computed_at: 1
      }
    ],
    k_search_counts: [{ day: 1, page: "home", words: "blue", count: 3 }],
    k_search_unread: [{ day: 1, page: "palettes", words: "jellyfish", count: 1 }],
    k_palette_use: [{ day: 1, seed: A, action: "copy", surface: "home", count: 1 }]
  });
  run(db, ["UPDATE k_sync_log SET at = 9000"]);
  for (const [statements, at] of later) change(db, statements, at);
  return snapshotOf(db);
}

export interface Sources {
  production: Snapshot;
  lite: Snapshot;
  staging: Snapshot;
}

/** A staging no copy was ever loaded into. */
export const unloaded = () => snapshotOf(memory());

/** The copy build.ts makes of the three, with its plan, in memory, scored at `now`. */
export async function copyOf(source: Sources, now = NOW) {
  const db = memory();
  run(db, baseStatements(source.production));
  migrate(db);
  const plan = planStatements(source.production, source.lite, source.staging, ALIASES, ORIGINALS);
  run(db, plan.statements);
  const read = reads(db);
  const select = async (table: string, columns: readonly string[], where: string) => {
    const { columns: names, rows } = await read(
      `SELECT ${columns.map(c => `"${c}"`).join(", ")} FROM "${table}" WHERE ${where}`
    );
    return rows.map(values => Object.fromEntries(names.map((n, i) => [n, values[i] ?? null])));
  };
  const scoring = await scoreDatabase(select, now);
  run(db, scoring);
  return { db, plan: [...plan.statements, ...scoring], merge: plan.merge, work: plan.work };
}

/** grabient-staging as load.ts loads it with the copy built from production and grabient-lite, its log ending at
    LOADED, then changed by `changes`. */
export async function stagingOf(source: Omit<Sources, "staging">, changes: Changes = []) {
  const built = await copyOf({ ...source, staging: await unloaded() });
  const copy = await stagingCopy(await snapshotOf(built.db, 1000), source.lite, NOW);
  const db = memory(loadStatements(copy));
  run(db, [`UPDATE k_sync_log SET at = ${LOADED} - (SELECT MAX(id) FROM k_sync_log) + id`]);
  for (const [statements, at] of changes) change(db, statements, at);
  return snapshotOf(db, 1000);
}
