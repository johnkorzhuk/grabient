import { isStyle } from "@grabient/engine/view.ts";
import { all, batch, first } from "@grabient/server/db/d1.ts";
import type { SyncCollection, SyncLike, SyncResponse } from "../../features/account/wire.ts";
import { ownDocuments } from "./collections.ts";

/* What changed for an account since a browser's copy last heard, read from the log the triggers of migration 0044
   write for every like and every change to an account's collections (scores write nothing to it). A browser new to
   the account, behind what was pruned, or ahead of this database (another deploy's copy) is sent everything. */

type Reader = { DB: D1Database };

/** Past this many log rows since its cursor a browser is sent everything, which reads less than every row would. */
const DELTA_ROWS = 2000;
/** An answer holds at most the account's latest 5,000 likes. */
const LIKES_KEPT = 5000;
/** D1 binds at most 100 values a statement: the seeds, and the account. */
const SEEDS_A_READ = 89;
const LOG_KEPT_MS = 30 * 86_400_000;
const CLIENTS_KEPT_MS = 180 * 86_400_000;

interface LikeRow {
  seed: string;
  style: string;
  steps: number;
  angle: number;
  at: number;
  likes: number | null;
  title: string | null;
}
const LIKES = `SELECT own.palette_id AS seed, own.style, own.steps, own.angle, own.created_at AS at,
  COALESCE(p.likes_count, 0) AS likes, own.title
  FROM k_likes own LEFT JOIN k_palettes p ON p.seed = own.palette_id WHERE own.user_id = ?`;
const likeOf = (row: LikeRow): SyncLike => ({
  seed: row.seed,
  style: isStyle(row.style) ? row.style : "linearGradient",
  steps: Number(row.steps),
  angle: Number(row.angle),
  at: Number(row.at),
  likes: Math.max(0, Number(row.likes) || 0),
  ...(row.title ? { title: row.title } : {})
});

/** The account's likes: of these palettes, or with none named its latest. */
async function likesOf(
  env: Reader,
  userId: string,
  seeds?: readonly string[]
): Promise<SyncLike[]> {
  if (!seeds) {
    const rows = await all<LikeRow>(
      env.DB,
      `${LIKES} ORDER BY at DESC, own.palette_id LIMIT ?`,
      userId,
      LIKES_KEPT
    );
    return rows.map(likeOf);
  }
  const out: SyncLike[] = [];
  for (let i = 0; i < seeds.length; i += SEEDS_A_READ) {
    const part = seeds.slice(i, i + SEEDS_A_READ);
    const rows = await all<LikeRow>(
      env.DB,
      `${LIKES} AND own.palette_id IN (${part.map(() => "?").join(",")})`,
      userId,
      ...part
    );
    out.push(...rows.map(likeOf));
  }
  return out;
}

export type Changes = Pick<
  SyncResponse,
  "cursor" | "reset" | "likes" | "unliked" | "collections" | "removed"
>;

/** What changed for the account since `cursor`, or everything when the cursor is too old to say. */
export async function readChanges(
  env: Reader,
  userId: string,
  cursor: number | null,
  origin: string
): Promise<Changes> {
  // the head is read first: a change landing during the reads below is read again next time, never missed
  const marks = await first<{ head: number; pruned: number | null }>(
    env.DB,
    `SELECT (SELECT COALESCE(MAX(id), 0) FROM k_sync_log) AS head,
       (SELECT value FROM k_sync_meta WHERE key = 'pruned') AS pruned`
  );
  const head = Number(marks?.head ?? 0);
  const pruned = Number(marks?.pruned ?? 0);
  let rows: { kind: string; key: string }[] | null = null;
  if (cursor !== null && cursor >= pruned && cursor <= head) {
    const read = await all<{ kind: string; key: string }>(
      env.DB,
      "SELECT kind, key FROM k_sync_log WHERE account_id = ? AND id > ? AND id <= ? ORDER BY id LIMIT ?",
      userId,
      cursor,
      head,
      DELTA_ROWS + 1
    );
    if (read.length <= DELTA_ROWS) rows = read;
  }
  if (!rows) {
    const [likes, collections] = await Promise.all([
      likesOf(env, userId),
      ownDocuments(env, userId, origin)
    ]);
    return { cursor: head, reset: true, likes, unliked: [], collections, removed: [] };
  }
  const named = (kind: string) => [
    ...new Set(rows.filter(row => row.kind === kind).map(row => row.key))
  ];
  const seeds = named("like");
  const ids = named("collection");
  const [likes, collections]: [SyncLike[], SyncCollection[]] = await Promise.all([
    seeds.length ? likesOf(env, userId, seeds) : [],
    ids.length ? ownDocuments(env, userId, origin, ids) : []
  ]);
  const liked = new Set(likes.map(like => like.seed));
  const held = new Set(collections.map(doc => doc.id));
  return {
    cursor: head,
    reset: false,
    likes,
    unliked: seeds.filter(seed => !liked.has(seed)),
    collections,
    removed: ids.filter(id => !held.has(id))
  };
}

/** The schedule's upkeep: log rows past 30 days go, the newest of them kept as the point a browser must have read
    past, and browsers unseen for 180 days are forgotten. */
export async function pruneSync(env: Reader, now = Date.now()) {
  const edge = await first<{ id: number | null }>(
    env.DB,
    "SELECT MAX(id) AS id FROM k_sync_log WHERE at < ?",
    now - LOG_KEPT_MS
  );
  const below = Number(edge?.id ?? 0);
  const [log, , clients] = await batch(env.DB, [
    ["DELETE FROM k_sync_log WHERE id <= ?", below],
    [
      `INSERT INTO k_sync_meta (key, value) VALUES ('pruned', ?)
       ON CONFLICT (key) DO UPDATE SET value = MAX(value, excluded.value)`,
      below
    ],
    ["DELETE FROM k_sync_clients WHERE updated_at < ?", now - CLIENTS_KEPT_MS]
  ]);
  return { log: log?.meta.changes ?? 0, clients: clients?.meta.changes ?? 0 };
}

/** Sessions and sign-in rows past their time: the library never deletes them itself. */
export async function pruneExpired(env: Reader, now = Date.now()) {
  const [sessions, verifications] = await batch(env.DB, [
    ["DELETE FROM auth_session WHERE expires_at < ?", now],
    ["DELETE FROM auth_verification WHERE expires_at < ?", now]
  ]);
  return { sessions: sessions?.meta.changes ?? 0, verifications: verifications?.meta.changes ?? 0 };
}
