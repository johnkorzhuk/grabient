/* Reads a database into a snapshot (snapshot.ts): its schema, then every table a page at a time in rowid order, the
   ones that record changes last, each page one SELECT that reads at most PAGE rows, so a read never holds the database
   for long.

     node scripts/data/read.ts production|lite|staging       a remote database, by its id in d1.ts
     node scripts/data/read.ts local [--persist <dir>]        the local copy build.ts makes (.data/build)

   The snapshot lands in .data/<name>. Sessions, sign-in links, connected apps' tokens and the newsletter's unsubscribe
   tokens are never read from any database: no copy needs them, and their numbers alone are counted. Google's tokens
   and password hashes are read as an empty string where a row holds one and NULL where not, so a check can tell a
   copy that holds one without the secret ever leaving the database. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA,
  type Database,
  LITE,
  local,
  name,
  PRODUCTION,
  type Rows,
  STAGING,
  select
} from "./d1.ts";
import { internal, type Meta, ROWID, type Row, type SchemaRow, writeSnapshot } from "./snapshot.ts";

/** The most rows one read takes. */
export const PAGE = 500;
/** Reads run this many at a time. */
const AT_ONCE = 4;

/** Tables whose rows no copy needs: only how many there are is read. */
export const UNREAD: Record<string, string> = {
  auth_session: "sessions",
  auth_verification: "sign-in links and codes",
  auth_oauth_access_token: "an earlier provider's tokens",
  auth_oauth_refresh_token: "an earlier provider's tokens",
  auth_oauth_consent: "an earlier provider's grants",
  auth_oauth_client: "an earlier provider's clients",
  k_newsletter: "unsubscribe tokens",
  k_newsletter_events: "the newsletter's record"
};
/** Columns whose value is never read: only whether a row holds one. */
export const BLANK: Record<string, readonly string[]> = {
  auth_account: ["access_token", "refresh_token", "id_token", "password"]
};
/** The tables that record changes to the rest, read after them: a change made while the others are read leaves its
    record in the snapshot, dated after the read began. */
export const RECORDS = ["k_sync_log", "k_admin_actions", "k_contributions", "k_queue"];

export const SOURCES: Record<string, Database> = {
  production: PRODUCTION,
  lite: LITE,
  staging: STAGING
};

type Select = (sql: string) => Promise<Rows & { rowsRead?: number }>;

/** The page of `table` after rowid `after`: the rowid first, then each column, a blanked one as whether it is held. */
export function pageSql(table: string, columns: readonly string[], after: number, limit = PAGE) {
  const blank = new Set(BLANK[table] ?? []);
  const list = columns.map(column =>
    blank.has(column)
      ? `CASE WHEN ${name(column)} IS NULL THEN NULL ELSE '' END AS ${name(column)}`
      : name(column)
  );
  return `SELECT rowid AS ${ROWID}, ${list.join(", ")} FROM ${name(table)} WHERE rowid > ${after} ORDER BY rowid LIMIT ${limit}`;
}

/** Every row of a table, a page at a time. With `count`, rowids alone are read and only their number kept. */
async function readTable(
  read: Select,
  table: string,
  columns: readonly string[],
  count: boolean,
  page: number
) {
  const rows: Row[] = [];
  let total = 0;
  let after = 0;
  let most = 0;
  for (;;) {
    const part = await read(
      count
        ? `SELECT rowid AS ${ROWID} FROM ${name(table)} WHERE rowid > ${after} ORDER BY rowid LIMIT ${page}`
        : pageSql(table, columns, after, page)
    );
    most = Math.max(most, part.rowsRead ?? 0);
    total += part.rows.length;
    if (!count) {
      for (const values of part.rows) {
        rows.push(Object.fromEntries(part.columns.map((column, i) => [column, values[i] ?? null])));
      }
    }
    if (part.rows.length < page) return { rows, total, most };
    after = Number(part.rows.at(-1)![0]);
  }
}

/** Reads the whole database through `read` (SQL in, rows out), `page` rows a read. The read is dated by the
    database's own clock, which its triggers and the Worker date its rows by. */
export async function readDatabase(read: Select, db: Database, page = PAGE) {
  const clock = await read(
    "SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AS now"
  );
  const schema = (
    await read("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY rowid")
  ).rows.map(([type, entry, tbl, sql]) => ({
    type: String(type),
    name: String(entry),
    tbl_name: String(tbl),
    sql: sql === null ? null : String(sql)
  })) satisfies SchemaRow[];
  const info = await read(
    `SELECT m.name, p.name FROM sqlite_master m JOIN pragma_table_info(m.name) p
     WHERE m.type = 'table' AND substr(m.name, 1, 4) <> '_cf_' AND substr(m.name, 1, 7) <> 'sqlite_'
     ORDER BY m.rowid, p.cid`
  );
  const columns = new Map<string, string[]>();
  for (const [table, column] of info.rows as [string, string][]) {
    if (internal(table)) continue;
    columns.set(table, [...(columns.get(table) ?? []), column]);
  }
  const meta: Meta = {
    database: db.name,
    id: db.id,
    local: Boolean(db.persist),
    readAt: Number(clock.rows[0]?.[0]),
    mostRowsRead: 0,
    tables: {}
  };
  const tables = new Map<string, Row[]>();
  const readAll = async (queue: string[]) => {
    const worker = async () => {
      for (let table = queue.shift(); table; table = queue.shift()) {
        const skipped = UNREAD[table];
        const { rows, total, most } = await readTable(
          read,
          table,
          columns.get(table)!,
          Boolean(skipped),
          page
        );
        meta.mostRowsRead = Math.max(meta.mostRowsRead, most);
        meta.tables[table] = {
          columns: columns.get(table)!,
          rows: total,
          ...(skipped && { skipped })
        };
        if (!skipped) tables.set(table, rows);
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
  };
  await readAll([...columns.keys()].filter(table => !RECORDS.includes(table)));
  await readAll([...columns.keys()].filter(table => RECORDS.includes(table)));
  meta.tables = Object.fromEntries(
    Object.entries(meta.tables).sort(([a], [b]) => a.localeCompare(b))
  );
  return { meta, schema, tables };
}

/** Reads of `db` through cf. */
export const reader =
  (db: Database): Select =>
  sql =>
    select(db, sql);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, ...args] = process.argv.slice(2);
  const at = args.indexOf("--persist");
  const db =
    source === "local"
      ? local(resolve(at >= 0 ? args[at + 1]! : resolve(DATA, "build")))
      : SOURCES[source ?? ""];
  if (!db) {
    console.error(
      "usage: node scripts/data/read.ts production|lite|staging|local [--persist <dir>]"
    );
    process.exit(1);
  }
  const started = Date.now();
  console.log(
    `Reading ${db.name}${db.persist ? ` (local, ${db.persist})` : ` (${db.id})`}, ${PAGE} rows a read...`
  );
  const { meta, schema, tables } = await readDatabase(reader(db), db);
  const dir = resolve(DATA, source!);
  writeSnapshot(dir, meta, schema, tables);
  /* a character that reached here as U+FFFD lost its bytes on the way, unless the database held it so */
  const lost = [...tables].flatMap(([table, rows]) =>
    rows.some(row => Object.values(row).some(v => typeof v === "string" && v.includes("\uFFFD")))
      ? [table]
      : []
  );
  if (lost.length)
    console.warn(`U+FFFD in ${lost.join(", ")}: check that the database holds it so.`);
  const counted = Object.entries(meta.tables)
    .map(([table, t]) => `${table} ${t.rows}${t.skipped ? " (counted)" : ""}`)
    .join(", ");
  console.log(
    `${counted}\nWritten to ${dir} in ${((Date.now() - started) / 1000).toFixed(0)} s; no read went through more than ${meta.mostRowsRead} rows.`
  );
}
