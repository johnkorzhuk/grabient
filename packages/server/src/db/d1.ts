/* Typed helpers over D1's prepared statements. There are two ways to read: `env.DB` asks the primary, which every write
   goes to and which sees a write the moment it is made; `replica(env)` opens a session that may answer from a read
   replica near the reader, for public reads that can trail a write by a moment. */

export type Db = D1Database | D1DatabaseSession;
export type Param = string | number | boolean | null | ArrayBuffer | ArrayBufferView;
/** One statement of a batch: its SQL and the values bound to its `?`s in order. */
export type Statement = readonly [query: string, ...params: Param[]];

const prepare = (db: Db, [query, ...params]: Statement) => db.prepare(query).bind(...params);

/* What D1 answers a read it could not make when its connection dropped or the database restarted under it, as it does
   for Cloudflare's own updates, after asking twice itself at once: on 19 and 20 Oct 2026 about a dozen of grabient.com's
   pages a day failed with these. A read is asked once more a moment later, which outlasts such a restart. A busy
   database ("overloaded") is not asked again, as more asks are what it cannot take, and a write is never asked twice. */
const PASSING =
  /network connection lost|reset because its code was updated|storage caused object to be reset/i;
const AGAIN_MS = 150;
const reads = (query: string) =>
  /^\s*(?:SELECT|WITH)\b/i.test(query) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query);

async function asked<T>(query: string, ask: () => Promise<T>): Promise<T> {
  try {
    return await ask();
  } catch (error) {
    if (!reads(query) || !PASSING.test(error instanceof Error ? error.message : String(error)))
      throw error;
    await new Promise(resolve => setTimeout(resolve, AGAIN_MS + Math.random() * AGAIN_MS));
    return ask();
  }
}

export function first<T>(db: Db, query: string, ...params: Param[]): Promise<T | null> {
  return asked(query, () => prepare(db, [query, ...params]).first<T>());
}

export function all<T>(db: Db, query: string, ...params: Param[]): Promise<T[]> {
  return asked(query, async () => (await prepare(db, [query, ...params]).all<T>()).results);
}

/** Runs a write and says what it changed (`changes`, `last_row_id`). */
export async function run(db: Db, query: string, ...params: Param[]): Promise<D1Meta> {
  return (await prepare(db, [query, ...params]).run()).meta;
}

/** Runs the statements in order as one transaction: every one applies, or none does. */
export function batch(db: Db, statements: readonly Statement[]): Promise<D1Result[]> {
  return db.batch(statements.map(statement => prepare(db, statement)));
}

/** A session for one request's public reads. Its queries see each other's results in order, and the first may go to
    any replica. Open one per request: a session holds the request's place in the database's history. */
export function replica(env: { DB: D1Database }): D1DatabaseSession {
  return env.DB.withSession("first-unconstrained");
}
