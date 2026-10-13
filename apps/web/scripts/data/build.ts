/* Builds production as the rebuild will hold it after the cutover, in a local D1 that cf simulates, from the
   snapshots read.ts made of production (.data/production) and grabient-lite (.data/lite):

     1. production's own schema and migration history, then its rows: every account and Google link, its palettes,
        likes and the old app's records. Sessions and sign-in links are left out, Google's tokens are NULL.
     2. the repository's migrations, applied by cf as a deploy applies them: 0000_baseline finds production's tables
        there, 0022 to 0054 build on them and transform their rows.
     3. the plan: the palette import (palettes.ts), grabient-lite's contributor work (merge.ts), the counts made whole,
        the sign-in cleanup production needs, and the scores (scores.ts).
     4. grabient-lite's admins as admins, since only admins sign in on staging. The plan leaves this out.

   The plan is what production itself takes after its own migrations at the cutover, so it is also written out:
   .data/plan/plan.sql to read, and .data/plan/NNNN.json, the requests in order, to apply. The copy is then read back
   into .data/local and checked (verify.ts).

     node scripts/data/build.ts */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cf,
  DATA,
  type Database,
  execute,
  insertRows,
  literal,
  local,
  name,
  requests,
  select,
  WEB
} from "./d1.ts";
import { authCleanup, collectionRepairs, LEFT, mergeStatements } from "./merge.ts";
import {
  importStatements,
  likeCountStatements,
  type Original,
  readAliases,
  readOriginals,
  unmapped
} from "./palettes.ts";
import { BLANK, readDatabase, reader } from "./read.ts";
import { scoreDatabase } from "./scores.ts";
import {
  dependencyOrder,
  internal,
  type Row,
  readSnapshot,
  type Snapshot,
  writeSnapshot
} from "./snapshot.ts";
import { report, verify } from "./verify.ts";

export const BUILD = resolve(DATA, "build");
export const PLAN = resolve(DATA, "plan");

/** Production as it stands before the cutover: its schema, its migration history and the rows read.ts read. */
export function baseStatements(production: Snapshot): string[] {
  const own = production.schema.filter(entry => entry.sql && !internal(entry.name));
  const tables = own.filter(entry => entry.type === "table");
  const users = new Set(production.rows("auth_user").map(user => user.id));
  return [
    ...tables.map(entry => entry.sql!),
    ...dependencyOrder(
      production.schema,
      tables.map(entry => entry.name)
    ).flatMap(table => {
      const info = production.meta.tables[table];
      if (!info || info.skipped) return [];
      /* a Google link read after its account was deleted belongs to nobody, and a token was never read */
      const blank = BLANK[table] ?? [];
      const rows = production
        .rows(table)
        .filter(row => table !== "auth_account" || users.has(row.user_id))
        .map(row => ({ ...row, ...Object.fromEntries(blank.map(column => [column, null])) }));
      return insertRows(table, info.columns, rows);
    }),
    ...own.filter(entry => entry.type !== "table").map(entry => entry.sql!)
  ];
}

/** The plan but its scores, which need the rows it leaves: what a database at production's schema after the
    migrations takes to hold production's palettes and likes and grabient-lite's work. */
export function planStatements(
  production: Snapshot,
  lite: Snapshot,
  aliases: ReadonlyMap<string, string>,
  originals: readonly Original[]
) {
  const merge = mergeStatements(lite, {
    users: production.rows("auth_user"),
    collections: production.rows("k_collections")
  });
  return {
    merge,
    statements: [
      ...importStatements(aliases, originals),
      ...merge.statements,
      ...likeCountStatements(),
      ...collectionRepairs(),
      ...authCleanup()
    ]
  };
}

/** The accounts of grabient-lite's admins made admins, found by email. */
export const adminStatements = (lite: Snapshot) => {
  const emails = lite
    .rows("auth_user")
    .filter(user => user.role === "admin")
    .map(user => literal(String(user.email).toLowerCase()));
  return emails.length
    ? [
        `UPDATE auth_user SET role = 'admin' WHERE lower(email) IN (${emails.join(", ")}) AND role <> 'admin'`
      ]
    : [];
};

/** Every row of `table` matching `where`, a page at a time. */
export async function selectAll(
  db: Database,
  table: string,
  columns: readonly string[],
  where = "1 = 1",
  page = 5000
): Promise<Row[]> {
  const out: Row[] = [];
  for (let after = 0; ; ) {
    const part = await select(
      db,
      `SELECT rowid, ${columns.map(name).join(", ")} FROM ${name(table)} WHERE (${where}) AND rowid > ${after} ORDER BY rowid LIMIT ${page}`
    );
    for (const values of part.rows) {
      out.push(Object.fromEntries(columns.map((column, i) => [column, values[i + 1] ?? null])));
    }
    if (part.rows.length < page) return out;
    after = Number(part.rows.at(-1)![0]);
  }
}

/** cf's migration runner over the repository's migrations, on the local copy. */
async function migrate(db: Database): Promise<string[]> {
  const applied = (await cf([
    "d1",
    "migrations",
    "apply",
    db.id,
    "--local",
    "--persist-to",
    db.persist!,
    "--dir",
    resolve(WEB, "migrations")
  ])) as { name: string; status: string }[];
  const failed = applied.filter(migration => migration.status !== "✅");
  if (failed.length) throw new Error(`Migrations failed: ${failed.map(m => m.name).join(", ")}`);
  return applied.map(migration => migration.name);
}

const step = (text: string) => console.log(`\n${text}`);
const done = (n: number, of: number) => process.stdout.write(`\r  ${n} of ${of} requests`);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = readSnapshot(resolve(DATA, "production"));
  const lite = readSnapshot(resolve(DATA, "lite"));
  const aliases = readAliases();
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  console.log(
    `Production read at ${at(production.meta.readAt)} UTC, grabient-lite at ${at(lite.meta.readAt)} UTC.`
  );
  rmSync(BUILD, { recursive: true, force: true });
  const db = local(BUILD);

  step("1. Production's schema, migration history and rows");
  await execute(db, baseStatements(production), done);

  step("\n2. The repository's migrations");
  const migrations = await migrate(db);
  console.log(`  ${migrations.length} applied: ${migrations[0]} to ${migrations.at(-1)}`);

  step("3. The plan: the palette import, grabient-lite's work, the counts, the scores");
  const { merge, statements } = planStatements(production, lite, aliases, readOriginals());
  await execute(db, statements, done);
  const now = Date.now();
  const scoring = await scoreDatabase((...read) => selectAll(db, ...read), now);
  await execute(db, scoring, done);
  const plan = [...statements, ...scoring];
  rmSync(PLAN, { recursive: true, force: true });
  mkdirSync(PLAN, { recursive: true });
  writeFileSync(resolve(PLAN, "plan.sql"), `${plan.join(";\n\n")};\n`);
  for (const [i, part] of requests(plan).entries()) {
    writeFileSync(
      resolve(PLAN, `${String(i + 1).padStart(4, "0")}.json`),
      JSON.stringify(part.map(sql => ({ sql })))
    );
  }
  const missing = unmapped(production.rows("palettes"), aliases);
  const summary = {
    builtAt: now,
    production: production.meta.readAt,
    lite: lite.meta.readAt,
    migrations,
    paletteIdsWithoutSeed: missing.map(palette => palette.id),
    accounts: Object.fromEntries(merge.users),
    accountsMade: merge.created,
    collectionsRemapped: Object.fromEntries([...merge.collections].filter(([a, b]) => a !== b)),
    addressesMoved: Object.fromEntries(merge.slugs),
    moved: merge.moved,
    dropped: merge.dropped,
    left: LEFT
  };
  writeFileSync(resolve(PLAN, "report.json"), `${JSON.stringify(summary, null, 1)}\n`);
  const mapped = [...merge.users].filter(([, to]) => !merge.created.includes(to)).length;
  console.log(
    `\n  ${plan.length} statements in ${requests(plan).length} requests, written to ${PLAN}` +
      `\n  accounts: ${mapped} of grabient-lite's are production's by email, ${merge.created.length} made` +
      `\n  addresses moved under their owner's handle: ${merge.slugs.size}` +
      (missing.length
        ? `\n  ${missing.length} production palettes have no seed in the data maps and stay out: ${missing.map(p => p.id).join(", ")}`
        : "") +
      (Object.keys(merge.dropped).length ? `\n  left behind: ${JSON.stringify(merge.dropped)}` : "")
  );

  step("4. grabient-lite's admins as admins: only they sign in on staging");
  const admins = await execute(db, adminStatements(lite));
  console.log(`  ${admins} accounts made admin`);

  step("5. The copy, read back and checked");
  const read = await readDatabase(reader(db), db, 5000);
  writeSnapshot(resolve(DATA, "local"), read.meta, read.schema, read.tables);
  const checks = verify(readSnapshot(resolve(DATA, "local")), production, lite, { aliases, now });
  if (!report(checks)) process.exit(1);
}
