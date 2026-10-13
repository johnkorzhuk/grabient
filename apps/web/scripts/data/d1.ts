/* D1 for the data scripts, through cf and only here. Production and grabient-lite are read with single SELECT
   statements; the remote database these scripts may write is grabient-staging alone, named by its id in
   cloudflare.config.ts, and the local copies kept under apps/web/.data. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEB = fileURLToPath(new URL("../..", import.meta.url));
export const DATA = resolve(WEB, ".data");
/** The database's migrations, which the server package keeps for every Worker on it. */
export const MIGRATIONS = resolve(WEB, "../../packages/server/migrations");

/** A database these scripts reach: a remote one by its id, or a local simulation kept in `persist`. */
export interface Database {
  name: string;
  id: string;
  persist?: string;
}

/* The databases by the ids cloudflare.config.ts gives them, which d1.test.ts holds equal. */
export const PRODUCTION: Database = {
  name: "grabient-prod",
  id: "8902a4a8-cca3-4a34-b456-7b35ad021985"
};
export const STAGING: Database = {
  name: "grabient-staging",
  id: "597c5ce0-b20a-4bb4-892f-35dc508cf19b"
};
/** grabient4's staging, the live site until the release. */
export const LITE: Database = { name: "grabient", id: "acb5748b-2b55-404e-8a15-2718a8524b86" };
/* No remote database has this id, so a command that lost its --local fails instead of reaching one. */
const LOCAL_ID = "00000000-0000-4000-8000-00000000da7a";
export const local = (persist: string): Database => ({ name: "local", id: LOCAL_ID, persist });

/* D1 refuses a statement over 100 KB. A batch entry may hold several statements joined, so each entry stays below
   that, and one request carries about a megabyte: each request is its own transaction. */
const ENTRY_BYTES = 90_000;
const REQUEST_BYTES = 1_000_000;

export type Value = string | number | null;
export interface Rows {
  columns: string[];
  rows: Value[][];
}

/** A read is one SELECT: cf would run a second statement after a semicolon, a WITH may end in a write, and the
    sources are never written. */
export function readOnly(sql: string): string {
  if (!/^\s*SELECT\s/i.test(sql) || sql.includes(";")) {
    throw new Error(`Refusing a read that is not a single SELECT: ${sql.slice(0, 80)}`);
  }
  return sql;
}

/** A write goes to a local copy or to grabient-staging, by its id, and nowhere else. */
export function writable(db: Database): Database {
  if (db.persist ? db.id !== LOCAL_ID : db.id !== STAGING.id) {
    throw new Error(
      `Refusing to write ${db.name} (${db.id}): these scripts write ${STAGING.name} alone.`
    );
  }
  return db;
}

const where = (db: Database) => (db.persist ? ["--local", "--persist-to", db.persist] : []);

/* Each local command starts its own simulation over the same files, so commands on one local copy run one at a time. */
const queues = new Map<string, Promise<unknown>>();
function inTurn<T>(db: Database, run: () => Promise<T>): Promise<T> {
  if (!db.persist) return run();
  const next = (queues.get(db.persist) ?? Promise.resolve()).then(run, run);
  queues.set(
    db.persist,
    next.catch(() => undefined)
  );
  return next;
}

/** cf's JSON answer to a command run in apps/web. */
export function cf(args: string[], timeout = 600_000): Promise<unknown> {
  return new Promise((done, fail) => {
    const child = spawn(resolve(WEB, "node_modules/.bin/cf"), args, { cwd: WEB });
    /* decoded as a stream, so a character whose bytes span two chunks stays whole */
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let out = "";
    let err = "";
    const limit = setTimeout(() => {
      child.kill();
      fail(new Error(`cf ${args.slice(0, 2).join(" ")} gave no answer in ${timeout / 1000} s`));
    }, timeout);
    child.stdout.on("data", chunk => {
      out += chunk;
    });
    child.stderr.on("data", chunk => {
      err += chunk;
    });
    child.on("error", fail);
    child.on("close", code => {
      clearTimeout(limit);
      if (code !== 0)
        return fail(new Error(`cf ${args.slice(0, 3).join(" ")} failed: ${err || out}`));
      try {
        done(JSON.parse(out));
      } catch {
        fail(new Error(`cf ${args.slice(0, 3).join(" ")} answered no JSON: ${out.slice(0, 200)}`));
      }
    });
  });
}

interface RawResult {
  success: boolean;
  results?: Rows;
  meta?: { changes?: number; rows_read?: number };
}

/** One read's columns and rows, in the order the database gave them, and how many rows D1 went through for it. */
export async function select(db: Database, sql: string): Promise<Rows & { rowsRead: number }> {
  const args = ["d1", "raw", db.id, ...where(db), "--sql", readOnly(sql)];
  const answer = (await inTurn(db, () => cf(args))) as RawResult[];
  const [result] = answer;
  if (!result?.success || !result.results) {
    throw new Error(`D1 read failed: ${JSON.stringify(result)}`);
  }
  return { ...result.results, rowsRead: result.meta?.rows_read ?? 0 };
}

/** Rows as objects keyed by column. */
export const objects = ({ columns, rows }: Rows): Record<string, Value>[] =>
  rows.map(row => Object.fromEntries(columns.map((column, i) => [column, row[i] ?? null])));

/** Statements grouped into requests of batch entries, in order. */
export function requests(statements: readonly string[]): string[][] {
  const out: string[][] = [];
  let bytes = REQUEST_BYTES;
  for (const statement of statements) {
    const size = Buffer.byteLength(statement) + 2;
    if (size > ENTRY_BYTES) throw new Error(`A statement of ${size} bytes is over D1's limit`);
    if (bytes + size > REQUEST_BYTES) {
      out.push([]);
      bytes = 0;
    }
    const request = out.at(-1)!;
    const last = request.length - 1;
    if (last >= 0 && Buffer.byteLength(request[last]!) + size < ENTRY_BYTES) {
      request[last] += `;\n${statement}`;
    } else {
      request.push(statement);
    }
    bytes += size;
  }
  return out;
}

/** Runs the statements in order, a request at a time; `progress` hears how many requests are done. A failed request
    rolls back alone, so a caller runs statements that are safe to run again or starts over. */
export async function execute(
  db: Database,
  statements: readonly string[],
  progress?: (done: number, of: number) => void
): Promise<number> {
  writable(db);
  const parts = requests(statements);
  const dir = mkdtempSync(join(tmpdir(), "grabient-data-"));
  let changes = 0;
  try {
    for (const [i, part] of parts.entries()) {
      const file = join(dir, "batch.json");
      writeFileSync(file, JSON.stringify(part.map(sql => ({ sql }))));
      const args = ["d1", "raw", db.id, ...where(db), "--batch", `@${file}`];
      const answer = (await inTurn(db, () => cf(args))) as RawResult[];
      const failed = answer.find(result => !result.success);
      if (failed) throw new Error(`D1 write failed: ${JSON.stringify(failed).slice(0, 2000)}`);
      for (const result of answer) changes += result.meta?.changes ?? 0;
      progress?.(i + 1, parts.length);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return changes;
}

/** What Cloudflare says of a remote database: a script that writes one checks it by the id it writes. */
export async function describe(db: Database): Promise<{ uuid: string; name: string }> {
  return (await cf(["d1", "get", db.id])) as { uuid: string; name: string };
}

/** A SQL literal of a value read from D1. */
export function literal(value: Value | boolean | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Not a number SQLite keeps: ${value}`);
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** A quoted SQL name. */
export const name = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/* A statement stays well under D1's 100 KB, so several fit one batch entry. */
const STATEMENT_BYTES = 40_000;

/** Multi-row inserts of `rows`, each statement under D1's size. */
export function insertRows(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, Value>[],
  conflict = "",
  verb = "INSERT"
): string[] {
  const out: string[] = [];
  const head = `${verb} INTO ${name(table)} (${columns.map(name).join(", ")}) VALUES `;
  let values: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (values.length) out.push(`${head}${values.join(", ")}${conflict && ` ${conflict}`}`);
    values = [];
    bytes = 0;
  };
  for (const row of rows) {
    const value = `(${columns.map(column => literal(row[column] ?? null)).join(", ")})`;
    const size = Buffer.byteLength(value) + 2;
    if (bytes + size > STATEMENT_BYTES) flush();
    values.push(value);
    bytes += size;
  }
  flush();
  return out;
}

/** A list in parts of at most `size`. */
export const chunks = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size)
  );
