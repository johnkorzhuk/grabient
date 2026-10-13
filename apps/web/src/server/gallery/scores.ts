import { RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";

/* The scores the orders read through their indexes, as math and as the SQL that moves them when a like lands.

   Hot, the home's order: a like counts 1 the hour it lands and fades with a 14-day time constant, and a palette the
   site first held this week carries half a like of newness fading over 7 days. A collection is hot by its twelve
   hottest palettes at half weight, the palettes that joined it lately, the copies saved of it lately and its newness
   from when it was made public.

   Rising, the lists' order: a like counts by how much it grew what it landed on, 1 over the likes there before it plus
   one, and halves every 2 days in the week's frame, every 45 in three months' and every 180 in the year's, counting
   nothing after 720 days. A collection rises by the likes its palettes gained while it held them, the copies saved of
   it, and half a like of newness from when it was made public. A score is stored as the logarithm of its sum with each
   like weighed up by its own time (riseClock), so two scores stand in the order their faded sums do at every moment: a
   score is written when a like lands and never because time passed. 0 is no score; the faintest real one, in the
   year's frame, is over fifty. */

const DAY = 86_400_000;
const LIKE_DAYS = 14;
const NEW_DAYS = 7;
/** The newness a palette new to the gallery, or a collection made public, starts with. */
export const NEW_WEIGHT = 0.5;
/** How far back the hot pass reads likes, joins and newness; older ones add nothing measurable. */
export const LIKE_WINDOW = 90 * DAY;
export const NEW_WINDOW = 60 * DAY;
/** Four of the year's half-lives, where that frame has faded a like to a sixteenth. */
export const RISE_WINDOW = 720 * DAY;
const RISE_HALF: Readonly<Record<RisingFrame, number>> = {
  "1w": 2 * DAY,
  "3m": 45 * DAY,
  "1y": 180 * DAY
};
/** The column each frame's score is kept in: the week's is the one the lists began with. */
export const RISE_COLUMN = { "1w": "rising", "3m": "rising_3m", "1y": "rising_1y" } as const;
const COLLECTION_ITEMS = 12;

const fade = (age: number, days: number) => (age <= 0 ? 1 : Math.exp(-age / (days * DAY)));
/** Four places, which tell apart scores a ten-thousandth apart and keep a pass from writing noise. */
export const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const latest = (times: readonly number[], n: number) =>
  [...times].sort((a, b) => b - a).slice(0, n);

export function paletteHot(likeTimes: readonly number[], createdAt: number, now: number): number {
  let score = createdAt > 0 ? NEW_WEIGHT * fade(now - createdAt, NEW_DAYS) : 0;
  for (const at of likeTimes) score += fade(now - at, LIKE_DAYS);
  return round4(score);
}

export interface CollectionHeat {
  /** its palettes' hot scores */
  itemHot: readonly number[];
  /** when its palettes joined it */
  joinedAt: readonly number[];
  /** when copies were saved of it */
  copiedAt: readonly number[];
  publishedAt: number;
}

export function collectionHot(input: CollectionHeat, now: number): number {
  let score = input.publishedAt > 0 ? NEW_WEIGHT * fade(now - input.publishedAt, NEW_DAYS) : 0;
  for (const hot of latest(input.itemHot, COLLECTION_ITEMS)) score += 0.5 * hot;
  for (const at of latest(input.joinedAt, COLLECTION_ITEMS))
    score += 0.25 * fade(now - at, NEW_DAYS);
  for (const at of input.copiedAt) score += fade(now - at, LIKE_DAYS);
  return round4(score);
}

/** What a frame's stored scores are measured against at a moment: its half-lives since 1970, as a natural logarithm.
    A stored score less this is the logarithm of its sum as faded by then. */
export const riseClock = (frame: RisingFrame, now: number): number =>
  (Math.LN2 * now) / RISE_HALF[frame];

/** The rising score in a frame of what gained likes at `times` and holds `total` likes now, older ones included: the
    newest counts against the total less itself, the next against one fewer, and so on. A collection made public at
    `publishedAt` adds its newness. 0 when nothing in the window lifts it. */
export function risingScore(
  times: readonly number[],
  total: number,
  now: number,
  frame: RisingFrame = "1w",
  publishedAt = 0
): number {
  const since = now - RISE_WINDOW;
  const half = RISE_HALF[frame];
  const faded = (at: number) => 0.5 ** (Math.max(0, now - at) / half);
  let sum = publishedAt >= since ? NEW_WEIGHT * faded(publishedAt) : 0;
  const newest = latest(times, times.length);
  for (let k = 0; k < newest.length && newest[k]! >= since; k++) {
    sum += faded(newest[k]!) / (Math.max(0, total - k - 1) + 1);
  }
  return sum > 0 ? riseClock(frame, now) + Math.log(sum) : 0;
}

/** A stored score as the sum it stands for at a moment: 1 for a first like that instant, a half one half-life on. */
export const risen = (stored: number, frame: RisingFrame, now: number): number =>
  stored > 0 ? Math.exp(stored - riseClock(frame, now)) : 0;

export type Rising = Record<RisingFrame, number>;

export const risingScores = (
  times: readonly number[],
  total: number,
  now: number,
  publishedAt = 0
): Rising => ({
  "1w": risingScore(times, total, now, "1w", publishedAt),
  "3m": risingScore(times, total, now, "3m", publishedAt),
  "1y": risingScore(times, total, now, "1y", publishedAt)
});

/* A like's rising weight is written in the like's own batch, before its row lands, so the counts the SQL reads are
   the ones before it. The scores are logarithms, so a weight joins one inside it: the clock, plus the logarithm of the
   faded sum and the weight together. A score of 0 fades to nothing there, so a first like needs no case of its own. A
   like taken back takes its own weight off, and the six-hour pass repairs what that leaves off. */
const lifted = (column: string, clock: number, weight: string) =>
  `${clock} + ln(exp(${column} - ${clock}) + ${weight})`;
const lowered = (column: string, clock: number, weight: string) =>
  `CASE WHEN exp(${column} - ${clock}) - ${weight} > 1e-9 THEN ${clock} + ln(exp(${column} - ${clock}) - ${weight}) ELSE 0 END`;
const everyFrame = (now: number, value: (column: string, clock: number) => string) =>
  RISING_FRAMES.map(f => `${RISE_COLUMN[f]} = ${value(RISE_COLUMN[f], riseClock(f, now))}`).join(
    ", "
  );
/** The public collections holding the palette whose seed is bound; the caller adds its guard. */
const HOLDING =
  "WHERE visibility = 'public' AND id IN (SELECT collection_id FROM k_collection_items WHERE seed = ?)";
const PALETTE_WEIGHT = "1.0 / (likes_count + 1)";
const COLLECTION_WEIGHT = "1.0 / (likes_sum + fork_count + 1)";

/** A palette's SET clause for a like made at `now`. */
export const risingLiked = (now: number) =>
  everyFrame(now, (column, clock) => lifted(column, clock, PALETTE_WEIGHT));
export const collectionsRisingLiked = (now: number) =>
  `UPDATE k_collections SET ${everyFrame(now, (column, clock) => lifted(column, clock, COLLECTION_WEIGHT))} ${HOLDING}`;
/** A palette's SET clause for a like made at `now` taken back. */
export const risingUnliked = (now: number) =>
  everyFrame(now, (column, clock) => lowered(column, clock, "1.0 / MAX(likes_count, 1)"));
export const collectionsRisingUnliked = (now: number) =>
  `UPDATE k_collections SET ${everyFrame(now, (column, clock) => lowered(column, clock, "1.0 / MAX(likes_sum + fork_count, 1)"))} ${HOLDING}`;
/** A collection's SET clause for a copy saved of it at `now`, counted only where `counts` holds. */
export const risingSaved = (now: number, counts: string) =>
  everyFrame(
    now,
    (column, clock) =>
      `CASE WHEN ${counts} THEN ${lifted(column, clock, COLLECTION_WEIGHT)} ELSE ${column} END`
  );
