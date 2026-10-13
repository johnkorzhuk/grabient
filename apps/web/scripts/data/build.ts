/* Builds production as the rebuild will hold it after the cutover, in a local D1 that cf simulates, from the
   snapshots read.ts made of production (.data/production) and grabient-lite (.data/lite), and then staging's copy of it:

     1. production's own schema and migration history, then its rows: every account and Google link, its palettes,
        likes and the old app's records. Sessions and sign-in links are left out, Google's tokens are NULL.
     2. the repository's migrations, applied by cf as a deploy applies them: 0000_baseline finds production's tables
        there, 0022 to 0054 build on them and transform their rows.
     3. the plan: the palette import (palettes.ts), grabient-lite's contributor work (merge.ts), the counts made whole,
        the sign-in cleanup production needs, and the scores (scores.ts).
     4. the full build read back into .data/full and checked against both sources (verify.ts).
     5. staging's copy (stagingStatements), made from the full build in memory, loaded into a local D1 of its own as
        load.ts loads staging, read back into .data/local and checked against the full build.

   The plan is what production itself takes after its own migrations at the cutover, so it is also written out:
   .data/plan/plan.sql to read, and .data/plan/NNNN.json, the requests in order, to apply. Staging's rule is no part
   of it. .data/build ends as the local D1 of staging's copy.

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
  local,
  MIGRATIONS,
  name,
  requests,
  select
} from "./d1.ts";
import { loadStatements } from "./load.ts";
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
import { stagingCopy } from "./staging.ts";
import { report, verify, verifyStaging } from "./verify.ts";

export const BUILD = resolve(DATA, "build");
export const PLAN = resolve(DATA, "plan");
export const FULL = resolve(DATA, "full");
export const LOCAL = resolve(DATA, "local");

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
    MIGRATIONS
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
  const summary: Record<string, unknown> = {
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
  const writeReport = () =>
    writeFileSync(resolve(PLAN, "report.json"), `${JSON.stringify(summary, null, 1)}\n`);
  writeReport();
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

  step("4. The full build, read back and checked against its sources");
  const read = await readDatabase(reader(db), db, 5000);
  writeSnapshot(FULL, read.meta, read.schema, read.tables);
  const full = readSnapshot(FULL);
  if (!report(verify(full, production, lite, { aliases, now }))) process.exit(1);

  step("5. Staging's copy, loaded into a local D1 of its own, read back and checked");
  const copy = await stagingCopy(full, lite, now);
  rmSync(BUILD, { recursive: true, force: true });
  const staging = local(BUILD);
  await execute(staging, loadStatements(copy), done);
  const back = await readDatabase(reader(staging), staging, 5000);
  writeSnapshot(LOCAL, back.meta, back.schema, back.tables);
  summary.staging = Object.fromEntries(
    Object.entries(copy.meta.tables).map(([table, t]) => [table, t.rows])
  );
  writeReport();
  console.log();
  if (!report(verifyStaging(readSnapshot(LOCAL), full, lite, { local: copy }))) process.exit(1);
}
