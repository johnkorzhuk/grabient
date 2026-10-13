import { all, batch, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { RISING_FRAMES } from "../../lib/orders.ts";
import {
  collectionHot,
  LIKE_WINDOW,
  NEW_WINDOW,
  paletteHot,
  RISE_WINDOW,
  type Rising,
  risingScores
} from "./scores.ts";

/* The six-hour pass over the scores (scores.ts). The hot score fades with time, so it is written again wherever it
   drifted; a rising score never fades in storage, so it is written only where its likes no longer give the one stored,
   which a like taken back or a missed write leaves. The furthest off are written first, at most PALETTES_MAX palettes
   and COLLECTIONS_MAX collections a pass: D1 allows an invocation a thousand queries, and the rest wait for the next
   pass. */

/** A hot score drifting less than this a pass earns no row write. */
const HOT_STEP = 0.005;
/** A rising score is a logarithm: off by a hundredth of itself, it is written again. */
const RISING_STEP = 0.01;
const PALETTES_MAX = 500;
const COLLECTIONS_MAX = 200;
const BATCH = 100;
/** D1 binds a hundred values at most. */
const SEEDS_A_READ = 90;

interface Scored {
  hot: number;
  rising: Rising;
  hotOff: number;
  riseOff: number;
}
interface ScoreRow {
  hot: number;
  rising: number;
  rising_3m: number;
  rising_1y: number;
}

const storedRising = (row: ScoreRow): Rising => ({
  "1w": Number(row.rising) || 0,
  "3m": Number(row.rising_3m) || 0,
  "1y": Number(row.rising_1y) || 0
});

/** How far fresh scores stand from the stored ones, each 0 when it may stay. */
function scored(hot: number, rising: Rising, row: ScoreRow): Scored {
  const stored = Number(row.hot) || 0;
  const hotOff =
    Math.abs(hot - stored) >= HOT_STEP || (hot === 0 && stored !== 0) ? Math.abs(hot - stored) : 0;
  const was = storedRising(row);
  const off = Math.max(
    ...RISING_FRAMES.map(f =>
      rising[f] > 0 && was[f] > 0
        ? Math.abs(rising[f] - was[f])
        : rising[f] > 0 || was[f] > 0
          ? 1
          : 0
    )
  );
  return { hot, rising, hotOff, riseOff: off >= RISING_STEP ? off : 0 };
}

/** The write of the scores that are off and only those: an index is written again for every column a statement sets,
    and most passes move the hot score alone. */
function write(
  table: "k_palettes" | "k_collections",
  key: "seed" | "id",
  id: string,
  s: Scored
): Statement {
  const rising = [s.rising["1w"], s.rising["3m"], s.rising["1y"]];
  if (!s.riseOff) return [`UPDATE ${table} SET hot = ? WHERE ${key} = ?`, s.hot, id];
  if (!s.hotOff) {
    return [
      `UPDATE ${table} SET rising = ?, rising_3m = ?, rising_1y = ? WHERE ${key} = ?`,
      ...rising,
      id
    ];
  }
  return [
    `UPDATE ${table} SET hot = ?, rising = ?, rising_3m = ?, rising_1y = ? WHERE ${key} = ?`,
    s.hot,
    ...rising,
    id
  ];
}

/** Times by what they landed on: likes by palette, saved copies by the collection saved. */
function timesBy(rows: readonly { key: string; at: number }[]): Map<string, number[]> {
  const times = new Map<string, number[]>();
  for (const row of rows) {
    const list = times.get(row.key);
    if (list) list.push(Number(row.at));
    else times.set(row.key, [Number(row.at)]);
  }
  return times;
}

/** Writes the furthest off first, in batches. */
async function writeOff(
  env: Pick<Env, "DB">,
  writes: { off: number; statement: Statement }[],
  max: number
) {
  const chosen = writes
    .sort((a, b) => b.off - a.off)
    .slice(0, max)
    .map(w => w.statement);
  for (let i = 0; i < chosen.length; i += BATCH) await batch(env.DB, chosen.slice(i, i + BATCH));
  return chosen.length;
}

export interface RescoreReport {
  palettes: number;
  collections: number;
  hottest: { seed: string; hot: number } | null;
  ms: number;
}

/** One pass over every palette liked in the window, made lately or holding a score, and every public collection. */
export async function rescore(env: Pick<Env, "DB">, now = Date.now()): Promise<RescoreReport> {
  const started = Date.now();
  type Row = ScoreRow & { seed: string; created_at: number; likes_count: number };
  const COLUMNS = "seed, created_at, hot, rising, rising_3m, rising_1y, likes_count";
  const [likes, rows] = await Promise.all([
    all<{ key: string; at: number }>(
      env.DB,
      "SELECT palette_id AS key, created_at AS at FROM k_likes WHERE created_at >= ?",
      now - RISE_WINDOW
    ),
    all<Row>(
      env.DB,
      `SELECT ${COLUMNS} FROM k_palettes
       WHERE hot > 0 OR rising > 0 OR rising_3m > 0 OR rising_1y > 0 OR created_at >= ?`,
      now - NEW_WINDOW
    )
  ]);
  const likeTimes = timesBy(likes);
  const stored = new Map(rows.map(row => [row.seed, row]));
  /* a liked palette the read missed (no score yet, made long ago) still counts: its likes are what make it hot */
  const missing = [...likeTimes.keys()].filter(seed => !stored.has(seed));
  for (let i = 0; i < missing.length; i += SEEDS_A_READ) {
    const seeds = missing.slice(i, i + SEEDS_A_READ);
    const found = await all<Row>(
      env.DB,
      `SELECT ${COLUMNS} FROM k_palettes WHERE seed IN (${seeds.map(() => "?").join(",")})`,
      ...seeds
    );
    for (const row of found) stored.set(row.seed, row);
  }
  const fresh = new Map<string, number>();
  const writes: { off: number; statement: Statement }[] = [];
  let hottest: RescoreReport["hottest"] = null;
  for (const [seed, row] of stored) {
    const times = likeTimes.get(seed) ?? [];
    const hot = paletteHot(
      times.filter(at => at >= now - LIKE_WINDOW),
      Number(row.created_at),
      now
    );
    fresh.set(seed, hot);
    if (!hottest || hot > hottest.hot) hottest = { seed, hot };
    const s = scored(hot, risingScores(times, Number(row.likes_count) || 0, now), row);
    if (s.hotOff || s.riseOff) {
      writes.push({ off: s.hotOff + s.riseOff, statement: write("k_palettes", "seed", seed, s) });
    }
  }
  const palettes = await writeOff(env, writes, PALETTES_MAX);
  const collections = await writeOff(
    env,
    await collectionScores(env, now, fresh, likeTimes),
    COLLECTIONS_MAX
  );
  return { palettes, collections, hottest, ms: Date.now() - started };
}

/** One collection's scores, written as it reaches the public lists, so it stands in the hot and Rising orders from
    that request on. Its palettes count through their stored hot scores. */
export async function scoreCollection(
  env: Pick<Env, "DB">,
  id: string,
  now = Date.now()
): Promise<void> {
  const [palettes, likes] = await Promise.all([
    all<{ seed: string; hot: number }>(
      env.DB,
      `SELECT DISTINCT p.seed, p.hot FROM k_collection_items i JOIN k_palettes p ON p.seed = i.seed
       WHERE i.collection_id = ?`,
      id
    ),
    all<{ key: string; at: number }>(
      env.DB,
      `SELECT palette_id AS key, created_at AS at FROM k_likes
       WHERE created_at >= ? AND palette_id IN (SELECT seed FROM k_collection_items WHERE collection_id = ?)`,
      now - RISE_WINDOW,
      id
    )
  ]);
  const hot = new Map(palettes.map(row => [row.seed, Number(row.hot) || 0]));
  const writes = await collectionScores(env, now, hot, timesBy(likes), id);
  if (writes.length)
    await batch(
      env.DB,
      writes.map(w => w.statement)
    );
}

/** The public collections whose stored scores are off, or the one with `id`: a palette counts once however many
    views of it the collection holds, from when its first view joined; a like counts while the collection held it. */
async function collectionScores(
  env: Pick<Env, "DB">,
  now: number,
  palettesHot: ReadonlyMap<string, number>,
  likeTimes: ReadonlyMap<string, readonly number[]>,
  id?: string
): Promise<{ off: number; statement: Statement }[]> {
  type Row = ScoreRow & {
    id: string;
    created_at: number;
    published_at: number | null;
    likes_sum: number;
    fork_count: number;
  };
  const one = id ? [id] : [];
  const [collections, items, copies] = await Promise.all([
    all<Row>(
      env.DB,
      `SELECT id, created_at, published_at, hot, rising, rising_3m, rising_1y, likes_sum, fork_count
       FROM k_collections WHERE visibility = 'public'${id ? " AND id = ?" : ""}`,
      ...one
    ),
    all<{ id: string; seed: string; at: number | null }>(
      env.DB,
      `SELECT i.collection_id AS id, i.seed, i.created_at AS at FROM k_collection_items i
       JOIN k_collections c ON c.id = i.collection_id WHERE c.visibility = 'public'${id ? " AND c.id = ?" : ""}`,
      ...one
    ),
    all<{ key: string; at: number }>(
      env.DB,
      `SELECT forked_from AS key, created_at AS at FROM k_collections
       WHERE forked_from IS NOT NULL AND created_at >= ?${id ? " AND forked_from = ?" : ""}`,
      now - RISE_WINDOW,
      ...one
    )
  ]);
  /* when each collection's palettes first joined it: null for a row from before join times were kept, which joined
     with its collection */
  const held = new Map<string, Map<string, number | null>>();
  for (const row of items) {
    const seeds = held.get(row.id) ?? new Map<string, number | null>();
    held.set(row.id, seeds);
    const at = row.at === null ? null : Number(row.at);
    const was = seeds.get(row.seed);
    if (was === undefined || (was !== null && (at === null || at < was))) seeds.set(row.seed, at);
  }
  const copiedAt = timesBy(copies);
  return collections.flatMap(row => {
    const made = Number(row.created_at) || 0;
    const publishedAt = Number(row.published_at ?? made) || 0;
    const copied = copiedAt.get(row.id) ?? [];
    const itemHot: number[] = [];
    const joinedAt: number[] = [];
    const risenAt = [...copied];
    for (const [seed, at] of held.get(row.id) ?? []) {
      const hot = palettesHot.get(seed) ?? 0;
      if (hot > 0) itemHot.push(hot);
      if (at !== null && at >= now - NEW_WINDOW) joinedAt.push(at);
      for (const liked of likeTimes.get(seed) ?? []) {
        if (liked >= now - RISE_WINDOW && liked >= (at ?? made)) risenAt.push(liked);
      }
    }
    const hot = collectionHot(
      { itemHot, joinedAt, copiedAt: copied.filter(at => at >= now - LIKE_WINDOW), publishedAt },
      now
    );
    const total = (Number(row.likes_sum) || 0) + (Number(row.fork_count) || 0);
    const s = scored(hot, risingScores(risenAt, total, now, publishedAt), row);
    return s.hotOff || s.riseOff
      ? [{ off: s.hotOff + s.riseOff, statement: write("k_collections", "id", row.id, s) }]
      : [];
  });
}
