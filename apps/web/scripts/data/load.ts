/* Writes staging's copy (.data/local, which build.ts made from the full build, loaded into a local D1, read back and
   checked) to grabient-staging, named by its id alone, then reads staging back into .data/staging and checks it again:
   against the full build (.data/full), and row for row against the local copy.

     node scripts/data/load.ts [--replace]

   Staging must hold no table of its own, or --replace drops each one first. The tables go first, then the rows, each
   with its rowid, in an order where every foreign key finds its row, then the indexes and the triggers, so no trigger
   runs on a loaded row. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA, describe, execute, insertRows, name, STAGING, select, writable } from "./d1.ts";
import { readDatabase, reader } from "./read.ts";
import {
  dependencyOrder,
  internal,
  ROWID,
  readSnapshot,
  type SchemaRow,
  type Snapshot,
  writeSnapshot
} from "./snapshot.ts";
import { report, verifyStaging } from "./verify.ts";

/** The statements that make an empty database the snapshot's. */
export function loadStatements(snapshot: Snapshot): string[] {
  const own = snapshot.schema.filter(entry => entry.sql && !internal(entry.name));
  const tables = own.filter(entry => entry.type === "table");
  return [
    ...tables.map(entry => entry.sql!),
    ...dependencyOrder(
      snapshot.schema,
      tables.map(entry => entry.name)
    ).flatMap(table => {
      const info = snapshot.meta.tables[table];
      if (!info) return [];
      if (info.skipped && info.rows) {
        throw new Error(
          `${table} holds ${info.rows} rows the copy never read: no copy carries ${info.skipped}.`
        );
      }
      const rows = snapshot.rows(table).map(row => ({ ...row, rowid: row[ROWID] ?? null }));
      return insertRows(table, ["rowid", ...info.columns], rows);
    }),
    ...own.filter(entry => entry.type !== "table").map(entry => entry.sql!)
  ];
}

/** The statements that drop the tables a database holds, those whose foreign keys name others first. */
export const dropStatements = (schema: readonly SchemaRow[]) => {
  const tables = schema.filter(e => e.type === "table" && !internal(e.name)).map(e => e.name);
  return dependencyOrder(schema, tables)
    .reverse()
    .map(table => `DROP TABLE IF EXISTS ${name(table)}`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args: string[] = process.argv.slice(2);
  if (args.some(arg => arg !== "--replace")) {
    console.error("usage: node scripts/data/load.ts [--replace]");
    process.exit(1);
  }
  const copy = readSnapshot(resolve(DATA, "local"));
  const about = await describe(writable(STAGING));
  if (about.uuid !== STAGING.id || about.name !== STAGING.name) {
    throw new Error(
      `Cloudflare names ${STAGING.id} ${about.name}: this script writes ${STAGING.name} alone.`
    );
  }
  const held = (
    await select(
      STAGING,
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type = 'table'"
    )
  ).rows.map(([type, entry, tbl, sql]) => ({
    type: String(type),
    name: String(entry),
    tbl_name: String(tbl),
    sql: sql === null ? null : String(sql)
  }));
  const own = held.filter(entry => !internal(entry.name));
  if (own.length && !args.includes("--replace")) {
    console.error(
      `${STAGING.name} holds ${own.length} tables. Run again with --replace to drop them first.`
    );
    process.exit(1);
  }
  const done = (n: number, of: number) => process.stdout.write(`\r  ${n} of ${of} requests`);
  if (own.length) {
    console.log(`Dropping ${STAGING.name}'s ${own.length} tables...`);
    await execute(STAGING, dropStatements(held), done);
  }
  const statements = loadStatements(copy);
  console.log(`\nWriting the local copy to ${STAGING.name} (${STAGING.id})...`);
  await execute(STAGING, statements, done);

  console.log(`\nReading ${STAGING.name} back...`);
  const read = await readDatabase(reader(STAGING), STAGING, 2000);
  writeSnapshot(resolve(DATA, "staging"), read.meta, read.schema, read.tables);
  const snapshot = (dir: string) => readSnapshot(resolve(DATA, dir));
  const checks = verifyStaging(snapshot("staging"), snapshot("full"), snapshot("lite"), {
    local: copy
  });
  if (!report(checks)) process.exit(1);
}
