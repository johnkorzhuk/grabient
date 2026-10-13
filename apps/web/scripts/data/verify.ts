/* Checks a copy against its two sources, from snapshots alone: the copy's (.data/local, read back by build.ts, or
   .data/staging, read back by load.ts), production's and grabient-lite's.

     node scripts/data/verify.ts local|staging

   The copy must hold production's history and every migration in the repository, so later ones apply on top; the
   schema those migrations give production's; every production account, link, palette and like; every grabient-lite
   collection with its palettes in order under its owner's production account, and the rest of its contributor work;
   no row naming one that is not there; counts, sums and scores that agree with the rows; no session, token or
   password; and grabient-lite's admins as admins. A staging copy must also equal the local one row for row. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DATA, type Value, WEB } from "./d1.ts";
import { accountHandle } from "./merge.ts";
import { type Original, readAliases, readOriginals, STYLES } from "./palettes.ts";
import { type Frame, RISE_COLUMN, SCORE_READS, scoreInput, scores } from "./scores.ts";
import { internal, openSnapshot, type Row, readSnapshot, type Snapshot } from "./snapshot.ts";

export interface Check {
  name: string;
  /** "warn" names a gap the copy carries on purpose. */
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** The repository's migrations, in the order cf applies them. */
export const migrationFiles = (dir = resolve(WEB, "migrations")) =>
  readdirSync(dir)
    .filter(file => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));

/** The schema production will have after its migrations: its own, then each migration in order. */
export function expectedSchema(production: Snapshot, dir = resolve(WEB, "migrations")) {
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
/** Rows that point at another table without a foreign key: each must find its row. */
const POINTERS: [string, string, string][] = [
  ["k_likes.palette_id", "k_palettes", "seed"],
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

export function verify(
  copy: Snapshot,
  production: Snapshot,
  lite: Snapshot,
  options: {
    now: number;
    aliases?: ReadonlyMap<string, string>;
    originals?: readonly Original[];
    local?: Snapshot;
  }
): Check[] {
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
  const db = openSnapshot(copy);
  const all = <T = Row>(sql: string) => db.prepare(sql).all() as T[];
  const count = (table: string) => copy.meta.tables[table]?.rows ?? 0;
  const aliases = options.aliases ?? readAliases();
  const files = migrationFiles();

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
  /* D1 drops the comments of a statement it stores, and its local simulation keeps them */
  const flat = (sql: string | undefined) =>
    sql
      ?.replace(/^\s*--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
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
    ...lite.rows("k_palettes").map(p => String(p.seed))
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
    k_collections: lite.rows("k_collections").length,
    k_collection_items: lite.rows("k_collection_items").length,
    ...Object.fromEntries(
      Object.keys(MOVED)
        .filter(t => t !== "k_likes")
        .map(table => [table, lite.rows(table).length])
    ),
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
  check(
    "grabient-lite's collections",
    lite.rows("k_collections").flatMap(c => {
      const held = copyCollections.get(String(c.id));
      if (!held) return [`${c.slug} is missing`];
      const owner = c.owner_kind === "user" ? account(c.owner_id) : c.owner_id;
      if (held.owner_kind !== c.owner_kind || held.owner_id !== owner)
        return [`${c.slug} has another owner`];
      const user = copyUsers.get(String(owner));
      const slug = String(c.slug);
      const moved =
        user && slug.startsWith("@") && String(held.slug).startsWith(`@${accountHandle(user)}/`);
      if (held.slug !== slug && !moved) return [`${slug} is at ${held.slug}`];
      const differ = words.filter(w => !same(held[w], c[w]));
      if (differ.length) return [`${slug} differs in ${differ.join(", ")}`];
      const a = (liteItems.get(String(c.id)) ?? []).map(i => keyOf(i, itemColumns));
      const b = (copyItems.get(String(c.id)) ?? []).map(i => keyOf(i, itemColumns));
      return a.join() === b.join()
        ? []
        : [`${slug} holds ${b.length} palettes, not grabient-lite's ${a.length} in its order`];
    }),
    `all ${lite.rows("k_collections").length} with their ${lite.rows("k_collection_items").length} palettes in order, under their owners`
  );

  /* the rest of the work, row by row */
  for (const [table, { key, accounts = [] }] of Object.entries(MOVED)) {
    const info = lite.meta.tables[table];
    if (!info) continue;
    const held = new Map(copy.rows(table).map(row => [keyOf(row, key), row]));
    check(
      `grabient-lite's ${table}`,
      lite.rows(table).flatMap(row => {
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
      `all ${lite.rows(table).length}`
    );
  }
  const seeds = new Set(copy.rows("k_palettes").map(p => p.seed));
  check(
    "gallery",
    lite.rows("k_palettes").flatMap(p => (seeds.has(p.seed) ? [] : [`${p.seed} is missing`])),
    `grabient-lite's ${lite.rows("k_palettes").length} gallery palettes are there`
  );

  /* nothing names a row that is not there */
  const loose = all<{ table: string; parent: string }>("PRAGMA foreign_key_check").map(
    r => `${r.table} → ${r.parent}`
  );
  for (const [from, table, column] of POINTERS) {
    const [source, field] = from.split(".") as [string, string];
    loose.push(
      ...all<{ v: Value }>(
        `SELECT DISTINCT "${field}" AS v FROM "${source}" WHERE "${field}" IS NOT NULL AND "${field}" NOT IN (SELECT "${column}" FROM "${table}")`
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
  check("orphans", loose, "every row's account, collection, persona and palette is there");

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
  const frames = Object.keys(RISE_COLUMN) as Frame[];
  const off = (row: Row, s: ({ hot: number } & Record<Frame, number>) | undefined) =>
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
  check(
    "admins",
    lite
      .rows("auth_user")
      .filter(u => u.role === "admin")
      .flatMap(u => {
        const held = copyByEmail.get(String(u.email).toLowerCase());
        return held?.role === "admin" ? [] : [`grabient-lite's admin ${u.id} is not an admin here`];
      }),
    "grabient-lite's admins are admins here"
  );

  if (options.local) {
    const local = options.local;
    const rowsOf = (snapshot: Snapshot, table: string) =>
      snapshot
        .rows(table)
        .map(row => JSON.stringify(row))
        .sort();
    check(
      "the local copy",
      Object.keys(local.meta.tables).flatMap(table => {
        if (local.meta.tables[table]!.rows !== count(table))
          return [
            `${table} holds ${count(table)} rows, the local copy ${local.meta.tables[table]!.rows}`
          ];
        const a = rowsOf(local, table);
        const b = rowsOf(copy, table);
        return a.every((row, i) => row === b[i]) ? [] : [`${table} differs`];
      }),
      "every table row for row, rowids included"
    );
  }
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
  if (which !== "local" && which !== "staging") {
    console.error("usage: node scripts/data/verify.ts local|staging");
    process.exit(1);
  }
  const snapshot = (name: string) => readSnapshot(resolve(DATA, name));
  const checks = verify(snapshot(which), snapshot("production"), snapshot("lite"), {
    now: builtAt(),
    local: which === "staging" ? snapshot("local") : undefined
  });
  if (!report(checks)) process.exit(1);
}
