import { all, run } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { FLAG_NAMES, type FlagName, STARTS_OFF } from "./names.ts";

/* The flags admins changed are rows of k_flags; a row exists only for a flag that was changed, and no row means the
   flag as it starts: on, or off for one that waits for an admin to turn it on (STARTS_OFF). Each isolate reads them at
   most every half minute, one query of a few rows, so a change reaches every isolate within about that. The read goes
   to the primary: a replica could hand the isolate that just wrote its own change back undone. When the table cannot
   be read an isolate keeps what it read last, and one that never read it keeps each flag as it starts: a database
   outage never turns a feature off, nor on one that waits for an admin. */

const READ_EVERY_MS = 30_000;

interface Known {
  at: number;
  off: Set<string>;
  writes: number;
  reading?: Promise<void>;
}

// By database binding: an isolate keeps its bindings from request to request.
const known = new WeakMap<D1Database, Known>();

function knownOf(db: D1Database): Known {
  let flags = known.get(db);
  if (!flags) {
    flags = { at: 0, off: new Set(STARTS_OFF), writes: 0 };
    known.set(db, flags);
  }
  return flags;
}

/* the flags off: each a row turned off, and each that starts off with no row that turned it on */
function offOf(rows: readonly { name: string; enabled: number }[]): Set<string> {
  const on = new Set(rows.filter(row => row.enabled !== 0).map(row => row.name));
  return new Set([
    ...rows.filter(row => row.enabled === 0).map(row => row.name),
    ...STARTS_OFF.filter(name => !on.has(name))
  ]);
}

async function offFlags(env: Pick<Env, "DB">): Promise<ReadonlySet<string>> {
  const flags = knownOf(env.DB);
  if (Date.now() - flags.at < READ_EVERY_MS) return flags.off;
  if (!flags.reading) {
    const writes = flags.writes;
    flags.reading = all<{ name: string; enabled: number }>(
      env.DB,
      "SELECT name, enabled FROM k_flags"
    )
      .then(
        rows => {
          // A change this isolate made while the read was out is newer than what the read saw.
          if (flags.writes === writes) flags.off = offOf(rows);
        },
        () => {}
      )
      .finally(() => {
        flags.at = Date.now();
        flags.reading = undefined;
      });
  }
  await flags.reading;
  return flags.off;
}

/** Whether an admin has turned this feature off for the whole site, on its own or with `all`. */
export async function flagOff(env: Pick<Env, "DB">, name: FlagName): Promise<boolean> {
  const off = await offFlags(env);
  return off.has(name) || off.has("all");
}

/** The header of an answer refused because an admin turned its feature off, naming the flag. The refusal is on
    purpose, so the Worker's pipeline counts no failure for it. */
export const PAUSED = "X-Grabient-Paused";

/** The headers of an answer refused while an admin has `name` off. */
export const pausedBy = (name: FlagName) => ({ [PAUSED]: name });

export interface FlagState {
  name: FlagName;
  on: boolean;
  updatedAt: number | null;
  /** The username, else the name, of the admin who changed it last. */
  updatedBy: string | null;
}

/** Every flag, in the order Settings lists them, with who changed it last: read from the primary, so an admin sees
    their own change. */
export async function listFlags(env: Pick<Env, "DB">): Promise<FlagState[]> {
  const rows = await all<{ name: string; enabled: number; updated_at: number; who: string | null }>(
    env.DB,
    `SELECT f.name, f.enabled, f.updated_at, COALESCE(u.username, u.name) AS who
     FROM k_flags f LEFT JOIN auth_user u ON u.id = f.updated_by`
  );
  const byName = new Map(rows.map(row => [row.name, row]));
  return FLAG_NAMES.map(name => {
    const row = byName.get(name);
    return {
      name,
      on: row ? row.enabled !== 0 : !STARTS_OFF.includes(name),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.who ?? null
    };
  });
}

/** Turns a flag on or off for the whole site, as the admin `userId`: the caller has checked the role. This isolate
    sees the change at once, the others within half a minute. */
export async function setFlag(
  env: Pick<Env, "DB">,
  name: FlagName,
  on: boolean,
  userId: string
): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO k_flags (name, enabled, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (name) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    name,
    on ? 1 : 0,
    Date.now(),
    userId
  );
  const flags = knownOf(env.DB);
  flags.writes++;
  if (on) flags.off.delete(name);
  else flags.off.add(name);
}
