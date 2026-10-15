/* Checks the copies build.ts makes, from snapshots alone: the full build (.data/full) against its three sources,
   production's, grabient-lite's and grabient-staging's (.data/staging, as read before the build), and staging's copy
   (.data/local, as build.ts loaded it into a local D1, or .data/staging, as load.ts read grabient-staging back) against
   the full build.

     node scripts/data/verify.ts full|local|staging

   The full build must hold production's history and every migration in the repository, so later ones apply on top; the
   schema those migrations give production's; every production account, link, palette and like; every grabient-lite
   collection with its palettes in order under its owner's production account, and the rest of its contributor work;
   what the admins did on staging since its load, as the later change leaves it (staging-work.ts), and nothing else of
   staging's; no row naming one that is not there; counts, sums and scores that agree with the rows; and no session,
   token or password. Staging's copy must hold what staging.ts keeps of it and nothing else (verifyStaging), and a copy
   read back from grabient-staging must equal the local one row for row. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { RISING_FRAMES, type RisingFrame } from "../../src/lib/orders.ts";
import { RISE_COLUMN } from "../../src/server/gallery/scores.ts";
import { DATA, MIGRATIONS, type Value } from "./d1.ts";
import { handleOf } from "./merge.ts";
import { type Original, readAliases, readOriginals, STYLES } from "./palettes.ts";
import { SCORE_READS, scoreInput, scores } from "./scores.ts";
import { internal, openSnapshot, type Row, readSnapshot, type Snapshot } from "./snapshot.ts";
import {
  BYLINE_MAIL,
  liteAdmins,
  OWN_COLUMNS,
  SEARCH_TABLES,
  STAGING_OFF,
  WORK_COLUMNS
} from "./staging.ts";
import { stagingWork } from "./staging-work.ts";

export interface Check {
  name: string;
  /** "warn" names a gap the copy carries on purpose. */
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** The repository's migrations, in the order cf applies them. */
export const migrationFiles = (dir = MIGRATIONS) =>
  readdirSync(dir)
    .filter(file => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));

/** The schema production will have after its migrations: its own, then each migration in order. */
export function expectedSchema(production: Snapshot, dir = MIGRATIONS) {
  const db = new DatabaseSync(":memory:");
  const own = production.schema.filter(entry => entry.sql && !internal(entry.name));
  for (const entry of own.filter(e => e.type === "table")) db.exec(entry.sql!);
  for (const entry of own.filter(e => e.type !== "table")) db.exec(entry.sql!);
  for (const file of migrationFiles(dir)) db.exec(readFileSync(resolve(dir, file), "utf8"));
  return db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as {
    type: string;
    name: string;
    sql: string;
  }[];
}

/** Tables a moved row of grabient-lite is found by in the copy, and the columns that name an account. */
const MOVED: Record<string, { key: string[]; accounts?: string[] }> = {
  k_personas: { key: ["user_id"], accounts: ["user_id"] },
  k_collection_notes: { key: ["id"], accounts: ["author_id"] },
  k_collection_votes: { key: ["collection_id", "seed", "user_id"], accounts: ["user_id"] },
  k_admin_actions: { key: ["id"], accounts: ["actor_id"] },
  k_contributions: { key: ["id"], accounts: ["actor_id"] },
  k_reviews: { key: ["seed", "subject"], accounts: ["reviewer_id"] },
  k_queue: { key: ["id"], accounts: ["actor"] },
  k_palette_texts: { key: ["seed"] },
  k_translations: { key: ["kind", "locale", "key"] },
  k_flags: { key: ["name"], accounts: ["updated_by"] },
  k_search_votes: { key: ["query", "seed", "user_id"], accounts: ["user_id"] },
  k_scheduled_searches: { key: ["id"], accounts: ["created_by"] },
  k_likes: { key: ["user_id", "palette_id"], accounts: ["user_id"] }
};
/** A Google link's columns migration 0034 clears, and the password no copy holds. */
const CLEARED = [
  "access_token",
  "refresh_token",
  "id_token",
  "access_token_expires_at",
  "refresh_token_expires_at",
  "password"
];
/** Tables a copy holds no row of: what no copy needs, and grabient-lite's readers' signals and browsers' state. */
const EMPTY = [
  "auth_session",
  "auth_verification",
  "auth_oauth_access_token",
  "auth_oauth_refresh_token",
  "auth_oauth_consent",
  "auth_oauth_client",
  "k_newsletter",
  "k_newsletter_events",
  "k_palette_use",
  "k_palette_edits",
  "k_search_counts",
  "k_search_unread",
  "k_popular_searches",
  "k_sync_clients",
  "k_sync_meta"
];
/** Tables staging's copy holds no row of: sign-in, the newsletter, browsers' state and readers' own signals. */
const PRIVATE = [
  "auth_session",
  "auth_verification",
  "auth_oauth_access_token",
  "auth_oauth_refresh_token",
  "auth_oauth_consent",
  "auth_oauth_client",
  "k_newsletter",
  "k_newsletter_events",
  "k_sync_clients",
  "k_sync_meta",
  "k_palette_use",
  "k_palette_edits",
  "k_search_unread"
];
/** Rows that point at another table without a foreign key: each must find its row, or be one the fourth names. A like
    saved after an admin deleted its palette from the gallery stays without it, as the site saves one. */
const POINTERS: [string, string, string, string?][] = [
  [
    "k_likes.palette_id",
    "k_palettes",
    "seed",
    "SELECT seed FROM k_admin_actions WHERE action = 'delete'"
  ],
  ["k_queue.actor", "k_personas", "user_id"],
  ["k_collection_notes.author_id", "auth_user", "id"],
  ["k_collection_votes.user_id", "auth_user", "id"],
  ["k_search_votes.user_id", "auth_user", "id"],
  ["k_admin_actions.actor_id", "auth_user", "id"],
  ["k_contributions.actor_id", "auth_user", "id"],
  ["k_reviews.reviewer_id", "auth_user", "id"],
  ["k_flags.updated_by", "auth_user", "id"],
  ["k_collections.forked_from", "k_collections", "id"],
  ["k_likes.collection_id", "k_collections", "id"]
];

const same = (a: Value | undefined, b: Value | undefined) => (a ?? null) === (b ?? null);
const keyOf = (row: Row, columns: readonly string[]) =>
  JSON.stringify(columns.map(c => row[c] ?? null));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/* D1 drops the comments of a statement it stores, and its local simulation keeps them */
const flat = (sql: string | undefined) =>
  sql
    ?.replace(/^\s*--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

/** A list of checks, and the call that adds one: faults make it fail (or warn), none make it pass with `fine`. */
function checker() {
  const checks: Check[] = [];
  const check = (
    name: string,
    faults: readonly string[],
    fine: string,
    status: Check["status"] = "fail"
  ) =>
    checks.push(
      faults.length
        ? {
            name,
            status,
            detail: `${faults.length} found, first: ${faults.slice(0, 3).join("; ")}`
          }
        : { name, status: "ok", detail: fine }
    );
  return { checks, check };
}

/** What a copy names that it does not hold: foreign keys, and the rows that point at another without one. */
function orphans(db: DatabaseSync): string[] {
  const all = <T>(sql: string) => db.prepare(sql).all() as T[];
  const loose = all<{ table: string; parent: string }>("PRAGMA foreign_key_check").map(
    r => `${r.table} → ${r.parent}`
  );
  for (const [from, table, column, unless] of POINTERS) {
    const [source, field] = from.split(".") as [string, string];
    loose.push(
      ...all<{ v: Value }>(
        `SELECT DISTINCT "${field}" AS v FROM "${source}" WHERE "${field}" IS NOT NULL AND "${field}" NOT IN (SELECT "${column}" FROM "${table}")${unless ? ` AND "${field}" NOT IN (${unless})` : ""}`
      ).map(r => `${from} ${r.v}`)
    );
  }
  loose.push(
    ...all<{ v: Value }>(
      `SELECT DISTINCT owner_id AS v FROM k_collections WHERE owner_kind = 'user' AND owner_id NOT IN (SELECT id FROM auth_user)`
    ).map(r => `k_collections.owner_id ${r.v}`),
    ...all<{ v: Value }>(
      `SELECT DISTINCT key AS v FROM k_translations WHERE kind = 'collection' AND key NOT IN (SELECT id FROM k_collections)`
    ).map(r => `k_translations.key ${r.v}`)
  );
  return loose;
}

/** Whether a copy read back from a database equals the local one it was written from, every row at its rowid. */
function sameAsLocal(copy: Snapshot, local: Snapshot): Check {
  const rowsOf = (snapshot: Snapshot, table: string) =>
    snapshot
      .rows(table)
      .map(row => JSON.stringify(row))
      .sort();
  const faults = Object.keys(local.meta.tables).flatMap(table => {
    const held = copy.meta.tables[table]?.rows ?? 0;
    if (local.meta.tables[table]!.rows !== held)
      return [`${table} holds ${held} rows, the local copy ${local.meta.tables[table]!.rows}`];
    const a = rowsOf(local, table);
    const b = rowsOf(copy, table);
    return a.every((row, i) => row === b[i]) ? [] : [`${table} differs`];
  });
  return faults.length
    ? { name: "the local copy", status: "fail", detail: faults.slice(0, 3).join("; ") }
    : { name: "the local copy", status: "ok", detail: "every table row for row, rowids included" };
}

export function verify(
  copy: Snapshot,
  production: Snapshot,
  lite: Snapshot,
  options: {
    now: number;
    staging: Snapshot;
    aliases?: ReadonlyMap<string, string>;
    originals?: readonly Original[];
    local?: Snapshot;
  }
): Check[] {
  const { checks, check } = checker();
  const db = openSnapshot(copy);
  const all = <T = Row>(sql: string) => db.prepare(sql).all() as T[];
  const count = (table: string) => copy.meta.tables[table]?.rows ?? 0;
  const aliases = options.aliases ?? readAliases();
  const files = migrationFiles();
  const work = stagingWork(options.staging, production, lite, aliases);
  const carried = work.collections.filter(c => c.stands === "staging");
  /* collections staging's version or deletion stands for, and the ones it deleted */
  const decided = new Set(carried.map(c => c.id));
  const gone = new Set(carried.filter(c => !c.row).map(c => c.id));
  const likesDecided = new Set(work.likes.map(like => `${like.user} ${like.seed}`));
  /* fit votes staging's change stands for */
  const votes = work.votes.filter(v => v.stands === "staging");
  const voteKey = (collection: Value | undefined, seed: Value | undefined, user: Value) =>
    `${collection} ${seed} ${user}`;
  const votesDecided = new Set(votes.map(v => voteKey(v.collection, v.seed, v.user)));

  /* migrations and schema */
  const history = copy.rows("d1_migrations").map(row => String(row.name));
  const wanted = [...production.rows("d1_migrations").map(row => String(row.name)), ...files];
  check(
    "migrations",
    wanted
      .flatMap((file, i) =>
        history[i] === file ? [] : [`#${i + 1} is ${history[i]}, not ${file}`]
      )
      .concat(
        history.length > wanted.length
          ? [`${history.length - wanted.length} more than the repository's`]
          : []
      ),
    `production's ${production.rows("d1_migrations").length}, then the repository's ${files.length}; none left to apply`
  );
  const expected = new Map(
    expectedSchema(production)
      .filter(e => !internal(e.name))
      .map(e => [`${e.type} ${e.name}`, e.sql])
  );
  const held = new Map(
    copy.schema.filter(e => e.sql && !internal(e.name)).map(e => [`${e.type} ${e.name}`, e.sql!])
  );
  check(
    "schema",
    [
      ...[...expected.keys()].filter(key => !held.has(key)).map(key => `${key} is missing`),
      ...[...held.keys()].filter(key => !expected.has(key)).map(key => `${key} is extra`),
      ...[...expected]
        .filter(([key, sql]) => held.has(key) && flat(held.get(key)) !== flat(sql))
        .map(([key]) => `${key} differs`)
    ],
    `${held.size} tables, indexes and triggers, as production's schema and the migrations make them`
  );

  /* accounts: production's, and grabient-lite's by email */
  const copyUsers = new Map(copy.rows("auth_user").map(user => [String(user.id), user]));
  const copyByEmail = new Map(
    copy.rows("auth_user").map(user => [String(user.email).toLowerCase(), user])
  );
  const liteUsers = new Map(lite.rows("auth_user").map(user => [String(user.id), user]));
  const account = (id: Value) => {
    const user = liteUsers.get(String(id));
    return user ? (copyByEmail.get(String(user.email).toLowerCase())?.id ?? null) : id;
  };
  const columns = production.meta.tables.auth_user!.columns;
  check(
    "production's accounts",
    production.rows("auth_user").flatMap(user => {
      const held = copyUsers.get(String(user.id));
      if (!held) return [`${user.id} is missing`];
      const differ = columns.filter(c => !same(held[c], user[c]));
      return differ.length ? [`${user.id} differs in ${differ.join(", ")}`] : [];
    }),
    `all ${production.rows("auth_user").length}, as production holds them`
  );
  for (const table of ["auth_account", "palettes", "likes", "refine_sessions"]) {
    const info = production.meta.tables[table];
    if (!info) continue;
    /* migration 0034 clears Google's tokens and their expiry times */
    const kept = info.columns.filter(c => table !== "auth_account" || !CLEARED.includes(c));
    const held = new Set(copy.rows(table).map(row => keyOf(row, kept)));
    check(
      `production's ${table}`,
      production
        .rows(table)
        .flatMap(row => (held.has(keyOf(row, kept)) ? [] : [keyOf(row, kept).slice(0, 80)])),
      `all ${production.rows(table).length} rows${table === "auth_account" ? ", but for what migration 0034 clears" : ""}`
    );
  }
  const unmapped = production.rows("palettes").filter(p => !aliases.has(String(p.id)));
  check(
    "production palettes without a seed",
    unmapped.map(p => String(p.id)),
    "every one has a seed in the data maps",
    "warn"
  );

  /** grabient-lite's rows as the admins' work on staging leaves them: what a collection staging deleted held goes, what
      pointed at it points nowhere, and each like staging changed is checked with that work */
  const liteRows = (table: string): Row[] =>
    lite.rows(table).flatMap(row => {
      switch (table) {
        case "k_likes":
          if (likesDecided.has(`${account(row.user_id)} ${row.palette_id}`)) return [];
          return gone.has(String(row.collection_id)) ? [{ ...row, collection_id: null }] : [row];
        case "k_collection_votes":
          if (votesDecided.has(voteKey(row.collection_id, row.seed, account(row.user_id))))
            return [];
          return gone.has(String(row.collection_id)) ? [] : [row];
        case "k_collection_notes":
          return gone.has(String(row.collection_id)) ? [] : [row];
        case "k_translations":
          return row.kind === "collection" && gone.has(String(row.key)) ? [] : [row];
      }
      return [row];
    });
  /** The rows staging's work adds to grabient-lite's tables, beside its likes and collections. */
  const fromStaging: Record<string, readonly Row[]> = {
    k_collection_notes: work.notes,
    k_collection_votes: votes.flatMap(v => (v.row ? [v.row] : [])),
    k_admin_actions: work.records,
    k_contributions: work.contributions
  };

  /* row counts */
  const kseeds = new Set(
    production
      .rows("palettes")
      .flatMap(p => (aliases.has(String(p.id)) ? [aliases.get(String(p.id))!] : []))
  );
  const originals = (options.originals ?? readOriginals()).filter(o => !o.legacy).map(o => o.kseed);
  const gallery = new Set([
    ...kseeds,
    ...originals,
    ...lite.rows("k_palettes").map(p => String(p.seed)),
    ...work.palettes.map(p => String(p.seed))
  ]);
  const productionUsers = new Set(production.rows("auth_user").map(u => String(u.id)));
  const likeKeys = new Set([
    ...production
      .rows("likes")
      .flatMap(like =>
        productionUsers.has(String(like.user_id)) &&
        aliases.has(String(like.palette_id)) &&
        STYLES.includes(String(like.style))
          ? [`${like.user_id} ${aliases.get(String(like.palette_id))}`]
          : []
      ),
    ...lite.rows("k_likes").map(like => `${account(like.user_id)} ${like.palette_id}`)
  ]);
  for (const like of work.likes) {
    const key = `${like.user} ${like.seed}`;
    if (like.liked) likeKeys.add(key);
    else likeKeys.delete(key);
  }
  const made = [...copyUsers.values()].filter(user => !productionUsers.has(String(user.id)));
  const counts: Record<string, number> = {
    auth_user: production.rows("auth_user").length + made.length,
    auth_account: production.rows("auth_account").length,
    d1_migrations: wanted.length,
    likes: production.rows("likes").length,
    palettes: production.rows("palettes").length,
    refine_sessions: production.rows("refine_sessions").length,
    k_legacy_map: aliases.size,
    k_palettes: gallery.size,
    k_likes: likeKeys.size,
    k_collections:
      lite.rows("k_collections").length +
      carried.filter(c => c.row && c.made).length -
      carried.filter(c => !c.row && !c.made).length,
    k_collection_items:
      lite.rows("k_collection_items").filter(i => !decided.has(String(i.collection_id))).length +
      carried.reduce((n, c) => n + (c.row ? c.items.length : 0), 0),
    ...Object.fromEntries(
      Object.keys(MOVED)
        .filter(t => t !== "k_likes")
        .map(table => [table, liteRows(table).length + (fromStaging[table]?.length ?? 0)])
    ),
    k_newsletter_leads: work.leads.length,
    ...Object.fromEntries(EMPTY.map(table => [table, 0]))
  };
  check(
    "row counts",
    Object.entries(counts).flatMap(([table, n]) =>
      count(table) === n ? [] : [`${table} holds ${count(table)}, not ${n}`]
    ),
    Object.entries(copy.meta.tables)
      .map(([table, t]) => `${table} ${t.rows}`)
      .join(", ")
  );
  check(
    "accounts made",
    made.flatMap(user => {
      const from = lite
        .rows("auth_user")
        .find(u => String(u.email).toLowerCase() === String(user.email).toLowerCase());
      return from ? [] : [`${user.id} is no grabient-lite account`];
    }),
    `${plural(made.length, "account")} grabient-lite's rows name and production lacks: ${made.map(u => u.id).join(", ") || "none"}`
  );

  /* grabient-lite's collections: same id, owner by email, palettes in order */
  const copyCollections = new Map(copy.rows("k_collections").map(c => [String(c.id), c]));
  const itemsOf = (snapshot: Snapshot) => {
    const out = new Map<string, Row[]>();
    for (const item of snapshot.rows("k_collection_items")) {
      out.set(String(item.collection_id), [...(out.get(String(item.collection_id)) ?? []), item]);
    }
    for (const list of out.values()) list.sort((a, b) => Number(a.position) - Number(b.position));
    return out;
  };
  const liteItems = itemsOf(lite);
  const copyItems = itemsOf(copy);
  const itemColumns = ["position", "seed", "style", "steps", "angle", "created_at"];
  const words = [
    "title",
    "description",
    "tags",
    "visibility",
    "created_at",
    "updated_at",
    "published_at",
    "forked_from",
    "forked_base",
    "search_text"
  ];
  /** Whether a collection holds its address, or one the build moved it to: under its owner's handle, or numbered. */
  const placed = (held: Row, slug: string, owner: Value) => {
    const user = copyUsers.get(String(owner));
    const at = String(held.slug);
    return (
      at === slug ||
      (slug.startsWith("@") && !!user && at.startsWith(`@${handleOf(user)}/`)) ||
      (at.startsWith(`${slug}-`) && /^\d+$/.test(at.slice(slug.length + 1)))
    );
  };
  const kept = lite.rows("k_collections").filter(c => !decided.has(String(c.id)));
  check(
    "grabient-lite's collections",
    kept.flatMap(c => {
      const held = copyCollections.get(String(c.id));
      if (!held) return [`${c.slug} is missing`];
      const owner = c.owner_kind === "user" ? account(c.owner_id) : c.owner_id;
      if (held.owner_kind !== c.owner_kind || held.owner_id !== owner)
        return [`${c.slug} has another owner`];
      const slug = String(c.slug);
      if (!placed(held, slug, owner)) return [`${slug} is at ${held.slug}`];
      const want = gone.has(String(c.forked_from))
        ? { ...c, forked_from: null, forked_base: null }
        : c;
      const differ = words.filter(w => !same(held[w], want[w]));
      if (differ.length) return [`${slug} differs in ${differ.join(", ")}`];
      const a = (liteItems.get(String(c.id)) ?? []).map(i => keyOf(i, itemColumns));
      const b = (copyItems.get(String(c.id)) ?? []).map(i => keyOf(i, itemColumns));
      return a.join() === b.join()
        ? []
        : [`${slug} holds ${b.length} palettes, not grabient-lite's ${a.length} in its order`];
    }),
    kept.length === lite.rows("k_collections").length
      ? `all ${kept.length} with their palettes in order, under their owners`
      : `${kept.length} with their palettes in order, under their owners; staging's change stands for the ` +
          `other ${lite.rows("k_collections").length - kept.length}`
  );

  /* what the admins did on staging since its load, as the later change leaves it */
  const likesHeld = new Map(copy.rows("k_likes").map(l => [`${l.user_id} ${l.palette_id}`, l]));
  const byKey = (table: string, key: readonly string[]) =>
    new Map(copy.rows(table).map(row => [keyOf(row, key), row]));
  const rowsIn = (table: string, key: readonly string[], rows: readonly Row[]) => {
    const held = byKey(table, key);
    const columns = options.staging.meta.tables[table]?.columns ?? [];
    return rows.flatMap(row => {
      const there = held.get(keyOf(row, key));
      if (!there) return [`${table} ${keyOf(row, key).slice(0, 60)} is missing`];
      const differ = columns.filter(c => !same(there[c], row[c]));
      return differ.length
        ? [`${table} ${keyOf(row, key).slice(0, 60)} differs in ${differ.join(", ")}`]
        : [];
    });
  };
  const likeColumns = options.staging.meta.tables.k_likes?.columns ?? [];
  const votesHeld = new Set(
    copy.rows("k_collection_votes").map(v => voteKey(v.collection_id, v.seed, v.user_id))
  );
  const inGallery = new Set(copy.rows("k_palettes").map(p => String(p.seed)));
  check(
    "staging's work",
    [
      ...work.likes.flatMap(like => {
        const held = likesHeld.get(`${like.user} ${like.seed}`);
        if (like.liked !== !!held)
          return [`the like of ${like.seed} is ${held ? "there" : "missing"}`];
        if (!held || like.stands !== "staging") return [];
        const differ = likeColumns.filter(c => !same(held[c], like.row![c]));
        return differ.length ? [`the like of ${like.seed} differs in ${differ.join(", ")}`] : [];
      }),
      ...work.palettes.flatMap(p =>
        inGallery.has(String(p.seed)) ? [] : [`palette ${p.seed} is missing`]
      ),
      ...carried.flatMap(c => {
        const held = copyCollections.get(c.id);
        if (!c.row) return held ? [`${held.slug} is there, though staging deleted it`] : [];
        const slug = String(c.row.slug);
        if (!held) return [`${slug} is missing`];
        if (held.owner_kind !== c.row.owner_kind || held.owner_id !== c.row.owner_id)
          return [`${slug} has another owner`];
        if (!placed(held, slug, c.row.owner_id)) return [`${slug} is at ${held.slug}`];
        const differ = words.filter(w => !same(held[w], c.row![w]));
        if (differ.length) return [`${slug} differs in ${differ.join(", ")}`];
        const a = c.items.map(i => keyOf(i, itemColumns));
        const b = (copyItems.get(c.id) ?? []).map(i => keyOf(i, itemColumns));
        return a.join() === b.join()
          ? []
          : [`${slug} holds ${b.length} palettes, not staging's ${a.length} in its order`];
      }),
      ...rowsIn("k_collection_notes", ["id"], work.notes),
      ...rowsIn(
        "k_collection_votes",
        ["collection_id", "seed", "user_id"],
        fromStaging.k_collection_votes!
      ),
      ...votes.flatMap(v =>
        !v.row && votesHeld.has(voteKey(v.collection, v.seed, v.user))
          ? [`the vote on ${v.seed} is there, though staging took it back`]
          : []
      ),
      ...rowsIn("k_admin_actions", ["id"], work.records),
      ...rowsIn("k_contributions", ["id"], work.contributions),
      ...rowsIn("k_newsletter_leads", ["issue"], work.leads)
    ],
    work.loadedAt === null
      ? "staging was never loaded"
      : `since its load at ${new Date(work.loadedAt).toISOString().slice(0, 19)} UTC: ` +
          `${plural(work.likes.length, "like")} changed, ${plural(work.palettes.length, "palette")} brought in, ` +
          `${plural(carried.length, "collection")} as staging left ${carried.length === 1 ? "it" : "them"}, ` +
          `${plural(work.notes.length, "note")}, ${plural(votes.length, "fit vote")}, ` +
          `${plural(work.leads.length, "lead")}, ` +
          `${plural(work.records.length + work.contributions.length, "record")} of them`
  );
  check(
    "conflicts",
    work.conflicts.map(
      c =>
        `${c.kind} ${c.key}: staging ${new Date(c.staging).toISOString()}, ${c.source} ` +
        `${new Date(c.other).toISOString()}, ${c.stands}'s stands`
    ),
    "no like, collection or fit vote changed on both sides since staging's load",
    "warn"
  );
  check(
    "left on staging",
    work.left.map(l => `${l.table}: ${l.what} at ${new Date(l.at).toISOString()}`),
    "nothing the admins changed on staging since its load is left there",
    "warn"
  );

  /* the rest of the work, row by row */
  for (const [table, { key, accounts = [] }] of Object.entries(MOVED)) {
    const info = lite.meta.tables[table];
    if (!info) continue;
    const held = new Map(copy.rows(table).map(row => [keyOf(row, key), row]));
    check(
      `grabient-lite's ${table}`,
      liteRows(table).flatMap(row => {
        const mapped: Row = { ...row };
        for (const column of accounts)
          if (mapped[column] !== null) mapped[column] = account(mapped[column] ?? null);
        const there = held.get(keyOf(mapped, key));
        if (!there) return [`${keyOf(mapped, key).slice(0, 80)} is missing`];
        const differ = info.columns.filter(c => !same(there[c], mapped[c]));
        return differ.length
          ? [`${keyOf(mapped, key).slice(0, 60)} differs in ${differ.join(", ")}`]
          : [];
      }),
      `all ${liteRows(table).length}`
    );
  }
  const seeds = new Set(copy.rows("k_palettes").map(p => p.seed));
  check(
    "gallery",
    lite.rows("k_palettes").flatMap(p => (seeds.has(p.seed) ? [] : [`${p.seed} is missing`])),
    `grabient-lite's ${lite.rows("k_palettes").length} gallery palettes are there`
  );

  /* nothing names a row that is not there */
  check("orphans", orphans(db), "every row's account, collection, persona and palette is there");

  /* counts, sums and dates agree with the rows */
  const deleted = new Map<string, Set<string>>();
  for (const like of production.rows("likes")) {
    const seed = aliases.get(String(like.palette_id));
    if (!seed || productionUsers.has(String(like.user_id))) continue;
    deleted.set(seed, (deleted.get(seed) ?? new Set()).add(String(like.user_id)));
  }
  check(
    "counts and sums",
    [
      ...copy
        .rows("k_palettes")
        .flatMap(p =>
          Number(p.legacy_likes_count) === (deleted.get(String(p.seed))?.size ?? 0)
            ? []
            : [`${p.seed} counts ${p.legacy_likes_count} likes of deleted accounts`]
        ),
      ...all<{ seed: string }>(
        "SELECT seed FROM k_palettes p WHERE likes_count <> legacy_likes_count + (SELECT COUNT(*) FROM k_likes l WHERE l.palette_id = p.seed)"
      ).map(r => `${r.seed} likes_count`),
      ...all<{ id: string }>(
        `SELECT id FROM k_collections c WHERE likes_sum <> CASE WHEN visibility = 'public' THEN (SELECT COALESCE(SUM(p.likes_count), 0) FROM k_palettes p
           WHERE p.seed IN (SELECT seed FROM k_collection_items WHERE collection_id = c.id)) ELSE 0 END`
      ).map(r => `${r.id} likes_sum`),
      ...all<{ id: string }>(
        "SELECT id FROM k_collections c WHERE item_count <> (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = c.id)"
      ).map(r => `${r.id} item_count`),
      ...all<{ id: string }>(
        "SELECT id FROM k_collections c WHERE fork_count <> (SELECT COUNT(DISTINCT f.owner_id) FROM k_collections f WHERE f.forked_from = c.id AND f.owner_kind = 'user')"
      ).map(r => `${r.id} fork_count`),
      ...all<{ seed: string }>(
        `SELECT seed FROM k_palettes p WHERE created_at > (SELECT MIN(COALESCE(i.created_at, c.created_at)) FROM k_collection_items i
           JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = p.seed)`
      ).map(r => `${r.seed} is dated after a collection held it`)
    ],
    "likes and legacy likes, sums, palette and copy counts and dates all agree with the rows"
  );

  /* the scores are the pass's at the time of the build */
  const num = (v: Value | undefined) => Number(v ?? 0);
  const take = (key: keyof typeof SCORE_READS) => {
    const [table, columns, where] = SCORE_READS[key];
    return all(`SELECT ${columns.map(c => `"${c}"`).join(", ")} FROM "${table}" WHERE ${where}`);
  };
  const scored = scores(
    scoreInput({
      likes: take("likes"),
      palettes: take("palettes"),
      collections: take("collections"),
      items: take("items"),
      copies: take("copies")
    }),
    options.now
  );
  const frames = RISING_FRAMES;
  const off = (row: Row, s: ({ hot: number } & Record<RisingFrame, number>) | undefined) =>
    Math.abs(num(row.hot) - (s?.hot ?? 0)) > 1e-9 ||
    frames.some(f => Math.abs(num(row[RISE_COLUMN[f]]) - (s?.[f] ?? 0)) > 1e-6);
  check(
    "scores",
    [
      ...copy
        .rows("k_palettes")
        .filter(p => off(p, scored.palettes.get(String(p.seed))))
        .map(p => `palette ${p.seed}`),
      ...copy
        .rows("k_collections")
        .filter(c => off(c, scored.collections.get(String(c.id))))
        .map(c => `collection ${c.slug}`)
    ],
    `hot and rising as the six-hour pass writes them at ${new Date(options.now).toISOString().slice(0, 16)} UTC: ` +
      `${[...scored.palettes.values()].filter(s => s.hot > 0).length} palettes hot, ${[...scored.collections.values()].filter(s => s.hot > 0).length} collections`
  );

  /* nothing that signs anyone in */
  check(
    "sign-in secrets",
    [
      ...copy
        .rows("auth_account")
        .filter(a => CLEARED.some(c => a[c] !== null))
        .map(a => `account link ${a.id} holds a token`),
      ...["auth_session", "auth_verification"]
        .filter(t => count(t) > 0)
        .map(t => `${t} holds ${count(t)} rows`)
    ],
    "no session, sign-in link, Google token or password"
  );
  if (options.local) checks.push(sameAsLocal(copy, options.local));
  return checks;
}

/** Checks staging's copy against the full build it was made from, and grabient-lite for its admins and tags: the
    accounts staging.ts keeps, whole, and no other; every other row the full build holds, as the rule leaves it, and
    nothing more; no row, word or address naming an account left out; nothing that signs anyone in or a reader left;
    the counts and scores the full build holds; the switches staging holds off. */
export function verifyStaging(
  copy: Snapshot,
  full: Snapshot,
  lite: Snapshot,
  options: { local?: Snapshot } = {}
): Check[] {
  const { checks, check } = checker();
  const db = openSnapshot(copy);
  const count = (table: string) => copy.meta.tables[table]?.rows ?? 0;

  /* migrations and schema: the full build's, so later migrations apply on top */
  const history = (snapshot: Snapshot) => snapshot.rows("d1_migrations").map(row => row.name);
  check(
    "migrations",
    history(copy).join() === history(full).join() ? [] : ["the history is not the full build's"],
    `the full build's ${history(full).length}`
  );
  const schemaOf = (snapshot: Snapshot) =>
    new Map(
      snapshot.schema
        .filter(e => e.sql && !internal(e.name))
        .map(e => [`${e.type} ${e.name}`, flat(e.sql!)])
    );
  const held = schemaOf(copy);
  const wanted = schemaOf(full);
  check(
    "schema",
    [
      ...[...wanted.keys()].filter(key => !held.has(key)).map(key => `${key} is missing`),
      ...[...held.keys()].filter(key => !wanted.has(key)).map(key => `${key} is extra`),
      ...[...wanted]
        .filter(([key, sql]) => held.has(key) && held.get(key) !== sql)
        .map(([key]) => `${key} differs`)
    ],
    `${held.size} tables, indexes and triggers, as the full build's`
  );

  /* the accounts the rule keeps, and the bylines it makes */
  const admins = new Set(liteAdmins(lite));
  const users = full.rows("auth_user");
  const kept = new Set(
    users
      .filter(user => user.role === "admin" || admins.has(String(user.email).toLowerCase()))
      .map(user => String(user.id))
  );
  for (const [table, column] of WORK_COLUMNS) {
    for (const row of full.rows(table)) if (row[column] !== null) kept.add(String(row[column]));
  }
  const left = users.filter(user => !kept.has(String(user.id)));
  const leftIds = new Set(left.map(user => String(user.id)));
  const userCollections = full.rows("k_collections").filter(c => c.owner_kind === "user");
  const bylined = [
    ...new Set(
      userCollections
        .filter(c => c.visibility === "public" && leftIds.has(String(c.owner_id)))
        .map(c => String(c.owner_id))
    )
  ].sort();
  const holders = new Map(bylined.map((id, i) => [id, `byline-${i + 1}`]));
  const holderIds = new Set(holders.values());
  const stays = (id: Value) => id === null || kept.has(String(id)) || holderIds.has(String(id));
  const leftCollections = new Set(
    userCollections
      .filter(
        c =>
          !kept.has(String(c.owner_id)) &&
          !(c.visibility === "public" && holders.has(String(c.owner_id)))
      )
      .map(c => String(c.id))
  );
  const userColumns = full.meta.tables.auth_user!.columns;
  const holderRows = bylined.map(id => {
    const user = users.find(u => u.id === id)!;
    const at = Math.min(
      ...userCollections
        .filter(c => c.owner_id === id && c.visibility === "public")
        .map(c => Number(c.created_at))
    );
    const holder = holders.get(id)!;
    const set: Row = {
      id: holder,
      email: `${holder}@${BYLINE_MAIL}`,
      email_verified: 0,
      name: user.name ?? null,
      username: user.username ?? null,
      role: "user",
      created_at: at,
      updated_at: at
    };
    return Object.fromEntries(userColumns.map(c => [c, set[c] ?? null]));
  });
  const copyUsers = new Map(copy.rows("auth_user").map(user => [String(user.id), user]));
  const personas = new Set(full.rows("k_personas").map(p => String(p.user_id)));
  const keptHere = users.filter(user => kept.has(String(user.id)));
  const adminsHere = keptHere.filter(
    u => u.role === "admin" || admins.has(String(u.email).toLowerCase())
  ).length;
  const personasHere = keptHere.filter(u => personas.has(String(u.id))).length;
  check(
    "accounts",
    [
      ...keptHere.filter(u => !copyUsers.has(String(u.id))).map(u => `${u.id} is missing`),
      ...[...copyUsers.keys()]
        .filter(id => !kept.has(id) && !holderIds.has(id))
        .map(id => `${id} is no account the rule keeps`)
    ],
    `${plural(keptHere.length, "account")} kept whole (${plural(adminsHere, "admin")}, ${plural(personasHere, "persona")}, ` +
      `${keptHere.length - adminsHere - personasHere} more the site's work names), ` +
      `${plural(holderRows.length, "byline")} held apart, ${left.length} left out`
  );
  check(
    "admins",
    [...admins].flatMap(email => {
      const user = copy.rows("auth_user").find(u => String(u.email).toLowerCase() === email);
      return user?.role === "admin"
        ? []
        : [`grabient-lite's admin ${email.replace(/^[^@]*/, "…")} is not one here`];
    }),
    "grabient-lite's admins are admins here"
  );

  /* every row the rule keeps, as it leaves it, and no other */
  const own = new Map(OWN_COLUMNS);
  const leftLikes = new Map<string, number>();
  for (const like of full.rows("k_likes")) {
    if (!stays(like.user_id))
      leftLikes.set(String(like.palette_id), (leftLikes.get(String(like.palette_id)) ?? 0) + 1);
  }
  const expect = (table: string, row: Row): Row | null => {
    const column = own.get(table);
    if (column && !stays(row[column] ?? null)) return null;
    const inLeft = (id: Value | undefined) =>
      id !== null && id !== undefined && leftCollections.has(String(id));
    switch (table) {
      case "auth_user":
        if (!kept.has(String(row.id))) return null;
        return admins.has(String(row.email).toLowerCase()) ? { ...row, role: "admin" } : row;
      case "k_collections": {
        if (inLeft(row.id)) return null;
        const holder = row.owner_kind === "user" ? holders.get(String(row.owner_id)) : undefined;
        return {
          ...row,
          ...(holder && { owner_id: holder }),
          ...(inLeft(row.forked_from) && { forked_from: null, forked_base: null })
        };
      }
      case "k_collection_items":
      case "k_collection_notes":
      case "k_collection_votes":
        return inLeft(row.collection_id) ? null : row;
      case "k_translations":
        return row.kind === "collection" && inLeft(row.key) ? null : row;
      case "k_likes":
        return inLeft(row.collection_id) ? { ...row, collection_id: null } : row;
      case "k_palettes":
        return {
          ...row,
          legacy_likes_count:
            Number(row.legacy_likes_count) + (leftLikes.get(String(row.seed)) ?? 0)
        };
    }
    return row;
  };
  const differ = (table: string, a: readonly Row[], b: readonly Row[]) => {
    const columns = full.meta.tables[table]?.columns ?? copy.meta.tables[table]?.columns ?? [];
    const line = (row: Row) => JSON.stringify(columns.map(c => row[c] ?? null));
    const tally = (rows: readonly Row[]) => {
      const out = new Map<string, number>();
      for (const row of rows) out.set(line(row), (out.get(line(row)) ?? 0) + 1);
      return out;
    };
    const want = tally(a);
    const have = tally(b);
    const short = (key: string) => `${table} ${key.slice(0, 70)}`;
    return [
      ...[...want]
        .filter(([key, n]) => (have.get(key) ?? 0) < n)
        .map(([key]) => `${short(key)} is missing`),
      ...[...have]
        .filter(([key, n]) => (want.get(key) ?? 0) < n)
        .map(([key]) => `${short(key)} is extra`)
    ];
  };
  const ruled = Object.entries(full.meta.tables).filter(
    ([table, info]) => !info.skipped && table !== "k_flags" && !SEARCH_TABLES.includes(table)
  );
  check(
    "rows",
    ruled.flatMap(([table]) =>
      differ(
        table,
        [
          ...full
            .rows(table)
            .map(row => expect(table, row))
            .filter(row => row !== null),
          ...(table === "auth_user" ? holderRows : [])
        ],
        copy.rows(table)
      )
    ),
    `every row of ${ruled.length} tables the rule keeps, as it leaves it, and no other`
  );

  /* nothing names an account left out: no value of any row holds one's id, email or private address */
  const emails = new Set(left.map(user => String(user.email).toLowerCase()));
  const handles = new Set(left.map(handleOf));
  const named: string[] = [];
  for (const table of Object.keys(copy.meta.tables)) {
    for (const row of copy.rows(table)) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value !== "string") continue;
        const hit =
          value.split(/[^\w-]+/).find(word => leftIds.has(word)) ??
          value.match(/[\w.%+-]+@[\w.-]+/g)?.find(email => emails.has(email.toLowerCase())) ??
          [...value.matchAll(/@([^/\s"'@]+)\//g)].find(m => handles.has(m[1]!.toLowerCase()))?.[0];
        if (hit)
          named.push(`${table}.${column} names ${hit.length > 12 ? `${hit.slice(0, 8)}…` : hit}`);
      }
    }
  }
  check("left out", named, `no row names one of the ${left.length} accounts left out`);
  check("orphans", orphans(db), "every row's account, collection, persona and palette is there");

  /* nothing that signs anyone in, and nothing of a reader's own */
  check(
    "nothing private",
    [
      ...PRIVATE.filter(table => count(table) > 0).map(
        table => `${table} holds ${count(table)} rows`
      ),
      ...copy
        .rows("auth_account")
        .filter(a => CLEARED.some(c => a[c] !== null))
        .map(a => `account link ${a.id} holds a token`)
    ],
    "no session, sign-in link, token, password, newsletter row, sync state or reader's signal"
  );

  /* the counts and scores every reader sees, as the full build holds them */
  const fullPalettes = new Map(full.rows("k_palettes").map(p => [String(p.seed), p]));
  const fullCollections = new Map(full.rows("k_collections").map(c => [String(c.id), c]));
  const likeRows = new Map<string, number>();
  for (const like of copy.rows("k_likes")) {
    likeRows.set(String(like.palette_id), (likeRows.get(String(like.palette_id)) ?? 0) + 1);
  }
  const itemRows = new Map<string, number>();
  for (const item of copy.rows("k_collection_items")) {
    itemRows.set(String(item.collection_id), (itemRows.get(String(item.collection_id)) ?? 0) + 1);
  }
  const scoreColumns = ["hot", ...Object.values(RISE_COLUMN)];
  const changed = (row: Row, was: Row | undefined, columns: readonly string[]) =>
    columns.filter(c => !was || Number(row[c]) !== Number(was[c]));
  check(
    "counts and scores",
    [
      ...copy.rows("k_palettes").flatMap(p => {
        const off = changed(p, fullPalettes.get(String(p.seed)), ["likes_count", ...scoreColumns]);
        if (
          Number(p.likes_count) !==
          Number(p.legacy_likes_count) + (likeRows.get(String(p.seed)) ?? 0)
        )
          off.push("likes left out");
        return off.length ? [`palette ${p.seed}: ${off.join(", ")}`] : [];
      }),
      ...copy.rows("k_collections").flatMap(c => {
        const off = changed(c, fullCollections.get(String(c.id)), [
          "item_count",
          "likes_sum",
          "fork_count",
          ...scoreColumns
        ]);
        if (Number(c.item_count) !== (itemRows.get(String(c.id)) ?? 0)) off.push("items");
        return off.length ? [`collection ${c.slug}: ${off.join(", ")}`] : [];
      })
    ],
    `${copy.rows("k_palettes").length} palettes and ${copy.rows("k_collections").length} collections: likes, sums, ` +
      `copies and scores as the full build holds them; each like count is its likes here and the ${[...leftLikes.values()].reduce((a, b) => a + b, 0)} left out`
  );

  /* the switches: staging's off, the rest the full build's */
  const flags = new Map(copy.rows("k_flags").map(f => [String(f.name), f]));
  check(
    "switches",
    [
      ...STAGING_OFF.filter(name => Number(flags.get(name)?.enabled ?? 1) !== 0).map(
        name => `${name} is on`
      ),
      ...differ(
        "k_flags",
        full.rows("k_flags").filter(f => !STAGING_OFF.includes(String(f.name))),
        copy.rows("k_flags").filter(f => !STAGING_OFF.includes(String(f.name)))
      )
    ],
    `${STAGING_OFF.join(" and ")} off, every other switch as the full build holds it`
  );

  /* the tags under the search field, and the counts they are made from: grabient-lite's */
  const shown = new Set(
    copy
      .rows("k_collections")
      .filter(c => c.visibility === "public")
      .map(c => String(c.slug))
  );
  check(
    "search tags",
    SEARCH_TABLES.flatMap(table =>
      differ(
        table,
        lite
          .rows(table)
          .filter(
            row =>
              table !== "k_popular_searches" ||
              row.kind !== "collections" ||
              shown.has(String(row.value))
          ),
        copy.rows(table)
      )
    ),
    `grabient-lite's ${SEARCH_TABLES.map(t => `${count(t)} ${t}`).join(" and ")}`
  );

  if (options.local) checks.push(sameAsLocal(copy, options.local));
  return checks;
}

/** Prints the checks; true when none failed. */
export function report(checks: readonly Check[]): boolean {
  const marks = { ok: "ok  ", warn: "WARN", fail: "FAIL" };
  for (const c of checks) console.log(`  ${marks[c.status]}  ${c.name}: ${c.detail}`);
  const failed = checks.filter(c => c.status === "fail").length;
  console.log(failed ? `\n${plural(failed, "check")} failed.` : "\nEvery check passed.");
  return failed === 0;
}

/** When the copy was scored: the build's own time. */
export function builtAt(): number {
  const file = resolve(DATA, "plan", "report.json");
  if (!existsSync(file))
    throw new Error("No build report in .data/plan: run scripts/data/build.ts first.");
  return (JSON.parse(readFileSync(file, "utf8")) as { builtAt: number }).builtAt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = process.argv[2];
  if (which !== "full" && which !== "local" && which !== "staging") {
    console.error("usage: node scripts/data/verify.ts full|local|staging");
    process.exit(1);
  }
  const snapshot = (name: string) => readSnapshot(resolve(DATA, name));
  const checks =
    which === "full"
      ? verify(snapshot("full"), snapshot("production"), snapshot("lite"), {
          now: builtAt(),
          staging: snapshot("staging")
        })
      : verifyStaging(snapshot(which), snapshot("full"), snapshot("lite"), {
          local: which === "staging" ? snapshot("local") : undefined
        });
  if (!report(checks)) process.exit(1);
}
