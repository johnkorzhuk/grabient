/* A database as files, under apps/web/.data/<name>: schema.json holds its sqlite_master rows, meta.json what was read
   and when, and <table>.jsonl one row per line as an object with its rowid under ROWID. The files hold production's
   accounts and stay on this machine (.data is ignored by git). */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { literal, name, type Value } from "./d1.ts";

export const ROWID = "_rowid_";

export type Row = Record<string, Value>;
export interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}
export interface TableMeta {
  columns: string[];
  rows: number;
  /** Why the rows were left unread: only their number was taken. */
  skipped?: string;
}
export interface Meta {
  database: string;
  id: string;
  local: boolean;
  readAt: number;
  /** The most rows any one read of the database went through. */
  mostRowsRead: number;
  tables: Record<string, TableMeta>;
}

export interface Snapshot {
  dir: string;
  meta: Meta;
  schema: SchemaRow[];
  /** A table's rows in rowid order, or none for a table the database lacks or the read skipped. */
  rows(table: string): Row[];
}

/** Tables a database keeps for itself. */
export const internal = (table: string) => /^(sqlite_|_cf_)/.test(table);

/** The tables in an order where each comes after the tables its foreign keys name, so rows insert in that order
    while D1 checks every key. */
export function dependencyOrder(schema: readonly SchemaRow[], tables: readonly string[]): string[] {
  const sql = new Map(
    schema.filter(entry => entry.type === "table").map(e => [e.name, e.sql ?? ""])
  );
  const parents = (table: string) =>
    [...(sql.get(table) ?? "").matchAll(/REFERENCES\s+[`"]?(\w+)/gi)]
      .map(match => match[1]!)
      .filter(parent => parent !== table && tables.includes(parent));
  const out: string[] = [];
  const visit = (table: string, path: readonly string[]) => {
    if (out.includes(table)) return;
    if (path.includes(table)) throw new Error(`Foreign keys run in a circle through ${table}`);
    for (const parent of parents(table)) visit(parent, [...path, table]);
    out.push(table);
  };
  for (const table of [...tables].sort()) visit(table, []);
  return out;
}

export function writeSnapshot(
  dir: string,
  meta: Meta,
  schema: SchemaRow[],
  tables: Map<string, Row[]>
) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [table, rows] of tables) {
    writeFileSync(
      join(dir, `${table}.jsonl`),
      rows.map(row => `${JSON.stringify(row)}\n`).join("")
    );
  }
  writeFileSync(join(dir, "schema.json"), `${JSON.stringify(schema, null, 1)}\n`);
  writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 1)}\n`);
}

export function readSnapshot(dir: string): Snapshot {
  if (!existsSync(join(dir, "meta.json"))) {
    throw new Error(`No snapshot in ${dir}: read the database first (scripts/data/read.ts).`);
  }
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta;
  const schema = JSON.parse(readFileSync(join(dir, "schema.json"), "utf8")) as SchemaRow[];
  const cache = new Map<string, Row[]>();
  return {
    dir,
    meta,
    schema,
    rows(table) {
      const kept = cache.get(table);
      if (kept) return kept;
      const file = join(dir, `${table}.jsonl`);
      const rows = existsSync(file)
        ? readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .map(line => JSON.parse(line) as Row)
        : [];
      cache.set(table, rows);
      return rows;
    }
  };
}

/** A snapshot as an in-memory SQLite database: its tables and indexes, every row it read, and no triggers or foreign
    key checks, so the rows are as the database held them and `PRAGMA foreign_key_check` finds what they lack. */
export function openSnapshot(snapshot: Snapshot): DatabaseSync {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
  const own = snapshot.schema.filter(entry => entry.sql && !internal(entry.name));
  for (const entry of own.filter(entry => entry.type === "table")) db.exec(entry.sql!);
  for (const [table, info] of Object.entries(snapshot.meta.tables)) {
    if (internal(table) || info.skipped) continue;
    const rows = snapshot.rows(table);
    for (let i = 0; i < rows.length; i += 200) {
      const values = rows
        .slice(i, i + 200)
        .map(
          row =>
            `(${[row[ROWID] ?? null, ...info.columns.map(c => row[c] ?? null)].map(literal).join(",")})`
        );
      db.exec(
        `INSERT INTO ${name(table)} (rowid, ${info.columns.map(name).join(", ")}) VALUES ${values.join(",")}`
      );
    }
  }
  for (const entry of own.filter(entry => entry.type === "index")) db.exec(entry.sql!);
  return db;
}
