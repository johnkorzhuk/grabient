/* Staging's copy of the full build. Anyone may sign in on staging, so it holds what the site shows every reader and,
   whole, the accounts the site's own work needs; every other account is left out with every row of its own.

   Kept whole: the admins, grabient-lite's found by email among them, the personas, and any other account the site's
   work names (WORK_COLUMNS), each with its Google links (which hold no token), its likes and where each was pressed,
   its collections, its votes and its sync log. Left out: every other account with its own rows (OWN_COLUMNS) and its
   private collections. Its likes stay in the palettes' counts as a deleted account's do, likes of no account the
   database holds, so a count made again from the rows comes out the same and the scores stand as the full build wrote
   them. A public collection of a left-out account keeps its byline, the name and username, under an account made to
   hold them alone, with no address that takes mail and no way to sign in.

   The full build holds no session, sign-in link, token, newsletter row or reader's signal to begin with. Here newsletter
   issues and session replay are off, and the tags under the search field are grabient-lite's, with the search counts
   they are made from: words the site knows counted by day, with no account or address.

   The statements run over the full build's rows in memory, where no trigger fires, and load.ts writes the result with
   the triggers made after the rows. */
import { insertRows, literal } from "./d1.ts";
import { readDatabase } from "./read.ts";
import { openSnapshot, reads, type Snapshot } from "./snapshot.ts";

type Columns = readonly (readonly [table: string, column: string])[];

/** Where the site's own work names an account: the persona it is, the record, the contributions, the reviews, the
    queue's likes, the notes for the agents, the switches and the scheduled searches. Each account named here is kept. */
export const WORK_COLUMNS: Columns = [
  ["k_personas", "user_id"],
  ["k_admin_actions", "actor_id"],
  ["k_contributions", "actor_id"],
  ["k_reviews", "reviewer_id"],
  ["k_queue", "actor"],
  ["k_collection_notes", "author_id"],
  ["k_flags", "updated_by"],
  ["k_scheduled_searches", "created_by"]
];
/** An account's own rows, which go with it. Its collections are named by owner_kind and owner_id together. */
export const OWN_COLUMNS: Columns = [
  ["auth_account", "user_id"],
  ["likes", "user_id"],
  ["refine_sessions", "user_id"],
  ["k_likes", "user_id"],
  ["k_collection_votes", "user_id"],
  ["k_search_votes", "user_id"],
  ["k_sync_log", "account_id"]
];
/** The address of an account made to hold a byline: no mail reaches it and nobody signs in with it. */
export const BYLINE_MAIL = "bylines.grabient.invalid";
/** The site switches staging holds off: no newsletter issue goes out from it and no session is recorded. */
export const STAGING_OFF = ["newsletter", "session-replay"];
/** grabient-lite's tables staging takes as they are: the tags under the search field and the counts behind them. */
export const SEARCH_TABLES = ["k_popular_searches", "k_search_counts"];

/** The emails of grabient-lite's admins, in lowercase. */
export const liteAdmins = (lite: Snapshot) =>
  lite
    .rows("auth_user")
    .filter(user => user.role === "admin")
    .map(user => String(user.email).toLowerCase());

/** The statements that make the full build's rows staging's copy, in order. */
export function stagingStatements(lite: Snapshot, now: number): string[] {
  const admins = liteAdmins(lite).map(literal);
  const kept = "(SELECT id FROM kept)";
  const collections = "(SELECT id FROM k_collections)";
  return [
    ...(admins.length
      ? [
          `UPDATE auth_user SET role = 'admin' WHERE lower(email) IN (${admins.join(", ")}) AND role <> 'admin'`
        ]
      : []),
    `CREATE TEMP TABLE kept AS SELECT id FROM auth_user WHERE role = 'admin'
${WORK_COLUMNS.map(([table, column]) => `UNION SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL`).join("\n")}`,
    `CREATE TEMP TABLE bylines AS
SELECT u.id, 'byline-' || ROW_NUMBER() OVER (ORDER BY u.id) AS holder, u.name, u.username, MIN(c.created_at) AS at
FROM k_collections c JOIN auth_user u ON u.id = c.owner_id
WHERE c.owner_kind = 'user' AND c.visibility = 'public' AND u.id NOT IN ${kept} GROUP BY u.id`,
    `UPDATE k_collections SET owner_id = b.holder FROM bylines b
WHERE k_collections.owner_kind = 'user' AND k_collections.visibility = 'public' AND k_collections.owner_id = b.id`,
    "INSERT INTO kept SELECT holder FROM bylines",
    `UPDATE k_palettes SET legacy_likes_count = legacy_likes_count + gone.n
FROM (SELECT palette_id, COUNT(*) AS n FROM k_likes WHERE user_id NOT IN ${kept} GROUP BY palette_id) AS gone
WHERE gone.palette_id = k_palettes.seed`,
    `DELETE FROM k_collections WHERE owner_kind = 'user' AND owner_id NOT IN ${kept}`,
    ...OWN_COLUMNS.map(([table, column]) => `DELETE FROM ${table} WHERE ${column} NOT IN ${kept}`),
    `DELETE FROM auth_user WHERE id NOT IN ${kept}`,
    `INSERT INTO auth_user (id, email, email_verified, name, username, role, created_at, updated_at)
SELECT holder, holder || '@${BYLINE_MAIL}', 0, name, username, 'user', at, at FROM bylines ORDER BY holder`,
    /* what a collection left out held, and what pointed at it */
    ...["k_collection_items", "k_collection_notes", "k_collection_votes"].map(
      table => `DELETE FROM ${table} WHERE collection_id NOT IN ${collections}`
    ),
    `DELETE FROM k_translations WHERE kind = 'collection' AND key NOT IN ${collections}`,
    `UPDATE k_collections SET forked_from = NULL, forked_base = NULL WHERE forked_from NOT IN ${collections}`,
    `UPDATE k_likes SET collection_id = NULL WHERE collection_id NOT IN ${collections}`,
    `INSERT INTO k_flags (name, enabled, updated_at, updated_by)
VALUES ${STAGING_OFF.map(flag => `(${literal(flag)}, 0, ${now}, NULL)`).join(", ")}
ON CONFLICT(name) DO UPDATE SET enabled = 0, updated_at = excluded.updated_at, updated_by = NULL WHERE enabled <> 0`,
    ...SEARCH_TABLES.flatMap(table => [
      `DELETE FROM ${table}`,
      ...insertRows(table, lite.meta.tables[table]?.columns ?? [], lite.rows(table))
    ]),
    /* a collection's tag only where the copy shows the collection */
    "DELETE FROM k_popular_searches WHERE kind = 'collections' AND value NOT IN (SELECT slug FROM k_collections WHERE visibility = 'public')",
    "DROP TABLE kept",
    "DROP TABLE bylines"
  ];
}

/** Staging's copy of `full`, the full build as read back: its rows with the statements applied in memory, under its
    schema. */
export async function stagingCopy(full: Snapshot, lite: Snapshot, now: number): Promise<Snapshot> {
  const db = openSnapshot(full);
  for (const statement of stagingStatements(lite, now)) db.exec(statement);
  const { meta, tables } = await readDatabase(reads(db), { name: "staging", id: "memory" }, 5000);
  db.close();
  return { dir: "", meta, schema: full.schema, rows: table => tables.get(table) ?? [] };
}
