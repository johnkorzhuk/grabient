/* The hot and rising scores of a database, as the six-hour pass writes them, so a copy orders its lists rightly from
   its first request. The three score functions have the signatures U03 gives server/order/scores.ts and stand in for
   it until that module lands, which this file then imports instead. */
import { literal, type Value } from "./d1.ts";
import type { Row } from "./snapshot.ts";

const DAY = 86_400_000;
const LIKE_DAYS = 14;
const NEW_DAYS = 7;
const NEW_WEIGHT = 0.5;
/** How far back the pass reads likes for the hot score, and new palettes and joins. */
const LIKE_WINDOW = 90 * DAY;
const NEW_WINDOW = 60 * DAY;
/** How far back a like or an arrival lifts a rising score at all. */
const RISE_WINDOW = 720 * DAY;
const COLLECTION_ITEMS = 12;

export type Frame = "1w" | "3m" | "1y";
const HALF: Record<Frame, number> = { "1w": 2 * DAY, "3m": 45 * DAY, "1y": 180 * DAY };
const FRAMES = Object.keys(HALF) as Frame[];
/** Each frame's column. */
export const RISE_COLUMN: Record<Frame, string> = {
  "1w": "rising",
  "3m": "rising_3m",
  "1y": "rising_1y"
};

const decay = (age: number, days: number) => (age <= 0 ? 1 : Math.exp(-age / (days * DAY)));
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const newest = (times: readonly number[]) => [...times].sort((a, b) => b - a);

/** The likes of the last weeks, each fading with a 14-day constant, and half a like of newness fading over a week. */
export function paletteHot(likeTimes: readonly number[], createdAt: number, now: number): number {
  let score = createdAt > 0 ? NEW_WEIGHT * decay(now - createdAt, NEW_DAYS) : 0;
  for (const at of likeTimes) score += decay(now - at, LIKE_DAYS);
  return round(score);
}

/** A frame's half-lives since 1970, as a natural logarithm: what its stored scores are measured against. */
export const riseClock = (frame: Frame, now: number) => (Math.LN2 * now) / HALF[frame];

/** The rising score of what gained likes at `times` and holds `total` now: the newest counts against the total less
    itself, the next against one fewer, each halving every half-life; an arrival at `publishedAt` adds half a like.
    Kept as a logarithm with each like weighed by its own time, so time alone never moves it. 0 is no score. */
export function risingScore(
  times: readonly number[],
  total: number,
  now: number,
  frame: Frame = "1w",
  publishedAt = 0
): number {
  const since = now - RISE_WINDOW;
  const half = HALF[frame];
  let sum = publishedAt >= since ? NEW_WEIGHT * 0.5 ** (Math.max(0, now - publishedAt) / half) : 0;
  const sorted = newest(times);
  for (let k = 0; k < sorted.length && sorted[k]! >= since; k++) {
    sum += 0.5 ** (Math.max(0, now - sorted[k]!) / half) / (Math.max(0, total - k - 1) + 1);
  }
  return sum > 0 ? riseClock(frame, now) + Math.log(sum) : 0;
}

/** A collection's hot score: its twelve hottest palettes at half weight, the palettes that joined it lately, the
    copies saved of it lately, and its newness from when it was made public. */
export function collectionHot(
  input: {
    itemHot: readonly number[];
    joinedAt: readonly number[];
    copiedAt: readonly number[];
    publishedAt: number;
  },
  now: number
): number {
  let score = input.publishedAt > 0 ? NEW_WEIGHT * decay(now - input.publishedAt, NEW_DAYS) : 0;
  for (const hot of newest(input.itemHot).slice(0, COLLECTION_ITEMS)) score += 0.5 * hot;
  for (const at of newest(input.joinedAt).slice(0, COLLECTION_ITEMS)) {
    score += 0.25 * decay(now - at, NEW_DAYS);
  }
  for (const at of input.copiedAt) score += decay(now - at, LIKE_DAYS);
  return round(score);
}

type Scored = { hot: number } & Record<Frame, number>;

export interface ScoreInput {
  /** Every like's palette and time. */
  likes: readonly { palette_id: string; created_at: number }[];
  palettes: readonly { seed: string; created_at: number; likes_count: number }[];
  /** Public collections with their sums as they stand. */
  collections: readonly {
    id: string;
    created_at: number;
    published_at: number | null;
    likes_sum: number;
    fork_count: number;
  }[];
  /** The items of those collections, each with the time it joined (null: with its collection). */
  items: readonly { collection_id: string; seed: string; created_at: number | null }[];
  /** Saved copies: the collection each copies, and when. */
  copies: readonly { forked_from: string; created_at: number }[];
}

/** The reads the scores come from: each a table, its columns, and which of its rows. */
export const SCORE_READS = {
  likes: ["k_likes", ["palette_id", "created_at"], "1 = 1"],
  palettes: ["k_palettes", ["seed", "created_at", "likes_count"], "1 = 1"],
  collections: [
    "k_collections",
    ["id", "created_at", "published_at", "likes_sum", "fork_count"],
    "visibility = 'public'"
  ],
  items: [
    "k_collection_items",
    ["collection_id", "seed", "created_at"],
    "collection_id IN (SELECT id FROM k_collections WHERE visibility = 'public')"
  ],
  copies: ["k_collections", ["forked_from", "created_at"], "forked_from IS NOT NULL"]
} satisfies Record<keyof ScoreInput, [string, string[], string]>;

/** Rows those reads gave, as the scores take them. */
export function scoreInput(rows: Record<keyof ScoreInput, readonly Row[]>): ScoreInput {
  const at = (value: Value | undefined) =>
    value === null || value === undefined ? null : Number(value);
  return {
    likes: rows.likes.map(r => ({
      palette_id: String(r.palette_id),
      created_at: Number(r.created_at)
    })),
    palettes: rows.palettes.map(r => ({
      seed: String(r.seed),
      created_at: Number(r.created_at),
      likes_count: Number(r.likes_count)
    })),
    collections: rows.collections.map(r => ({
      id: String(r.id),
      created_at: Number(r.created_at),
      published_at: at(r.published_at),
      likes_sum: Number(r.likes_sum),
      fork_count: Number(r.fork_count)
    })),
    items: rows.items.map(r => ({
      collection_id: String(r.collection_id),
      seed: String(r.seed),
      created_at: at(r.created_at)
    })),
    copies: rows.copies.map(r => ({
      forked_from: String(r.forked_from),
      created_at: Number(r.created_at)
    }))
  };
}

/** The statements that give a database the scores of its rows at `now`, read through `read`. */
export async function scoreDatabase(
  read: (table: string, columns: readonly string[], where: string) => Promise<Row[]>,
  now: number
): Promise<string[]> {
  const take = (key: keyof ScoreInput) => read(...SCORE_READS[key]);
  const [likes, palettes, collections, items, copies] = await Promise.all([
    take("likes"),
    take("palettes"),
    take("collections"),
    take("items"),
    take("copies")
  ]);
  const scored = scores(scoreInput({ likes, palettes, collections, items, copies }), now);
  return [
    ...scoreStatements("k_palettes", "seed", scored.palettes),
    ...scoreStatements("k_collections", "id", scored.collections)
  ];
}

const by = <T>(rows: readonly T[], key: (row: T) => string, at: (row: T) => number) => {
  const out = new Map<string, number[]>();
  for (const row of rows) {
    const list = out.get(key(row));
    if (list) list.push(at(row));
    else out.set(key(row), [at(row)]);
  }
  return out;
};

/** Every score the pass would write at `now`, for the palettes and public collections it reads; the rest stay 0. */
export function scores(input: ScoreInput, now: number) {
  const likeTimes = by(
    input.likes.filter(like => like.created_at >= now - RISE_WINDOW),
    like => like.palette_id,
    like => like.created_at
  );
  const palettes = new Map<string, Scored>();
  for (const palette of input.palettes) {
    const times = likeTimes.get(palette.seed) ?? [];
    if (!times.length && palette.created_at < now - NEW_WINDOW) continue;
    const recent = times.filter(at => at >= now - LIKE_WINDOW);
    palettes.set(palette.seed, {
      hot: paletteHot(recent, palette.created_at, now),
      ...rising(times, palette.likes_count, now)
    });
  }

  const held = new Map<string, Map<string, number | null>>();
  for (const item of input.items) {
    const seeds = held.get(item.collection_id) ?? new Map<string, number | null>();
    held.set(item.collection_id, seeds);
    const was = seeds.get(item.seed);
    /* a palette counts once, from when its first view joined; a view with no time joined with the collection */
    if (
      was === undefined ||
      (was !== null && (item.created_at === null || item.created_at < was))
    ) {
      seeds.set(item.seed, item.created_at);
    }
  }
  const copies = by(
    input.copies.filter(copy => copy.created_at >= now - RISE_WINDOW),
    copy => copy.forked_from,
    copy => copy.created_at
  );
  const collections = new Map<string, Scored>();
  for (const collection of input.collections) {
    const publishedAt = collection.published_at ?? collection.created_at;
    const copiedAt = copies.get(collection.id) ?? [];
    const itemHot: number[] = [];
    const joinedAt: number[] = [];
    const risenAt = [...copiedAt];
    for (const [seed, at] of held.get(collection.id) ?? []) {
      const hot = palettes.get(seed)?.hot ?? 0;
      if (hot > 0) itemHot.push(hot);
      if (at !== null && at >= now - NEW_WINDOW) joinedAt.push(at);
      for (const liked of likeTimes.get(seed) ?? []) {
        if (liked >= (at ?? collection.created_at)) risenAt.push(liked);
      }
    }
    collections.set(collection.id, {
      hot: collectionHot(
        {
          itemHot,
          joinedAt,
          copiedAt: copiedAt.filter(at => at >= now - LIKE_WINDOW),
          publishedAt
        },
        now
      ),
      ...rising(risenAt, collection.likes_sum + collection.fork_count, now, publishedAt)
    });
  }
  return { palettes, collections };
}

const rising = (times: readonly number[], total: number, now: number, publishedAt = 0) =>
  Object.fromEntries(
    FRAMES.map(frame => [frame, risingScore(times, total, now, frame, publishedAt)])
  ) as Record<Frame, number>;

/** Statements that give `table` these scores and every other row none, a hundred rows a statement. */
export function scoreStatements(
  table: "k_palettes" | "k_collections",
  key: "seed" | "id",
  scored: ReadonlyMap<string, Scored>
): string[] {
  const columns = ["hot", ...FRAMES.map(frame => RISE_COLUMN[frame])];
  const out = [
    `UPDATE ${table} SET ${columns.map(c => `${c} = 0`).join(", ")} WHERE ${columns.map(c => `${c} <> 0`).join(" OR ")}`
  ];
  const rows = [...scored].filter(([, s]) => s.hot || FRAMES.some(frame => s[frame]));
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100);
    const cases = (value: (s: Scored) => number) =>
      `CASE ${key} ${part.map(([id, s]) => `WHEN ${literal(id)} THEN ${value(s)}`).join(" ")} END`;
    out.push(
      `UPDATE ${table} SET hot = ${cases(s => s.hot)}, ${FRAMES.map(
        frame => `${RISE_COLUMN[frame]} = ${cases(s => s[frame])}`
      ).join(", ")} WHERE ${key} IN (${part.map(([id]) => literal(id)).join(",")})`
    );
  }
  return out;
}
