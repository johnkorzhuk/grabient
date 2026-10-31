/* The orders lists read in. Popular is the most liked first; Rising is what gained likes lately, in one of three time
   frames; hot is the home's, what was liked lately and what is new (server/gallery/scores.ts). Newest and oldest are
   the API's alone: no page's address says them. A frame is named the same in an address, in the API and in a score's
   column. */

export const RISING_FRAMES = ["1w", "3m", "1y"] as const;
export type RisingFrame = (typeof RISING_FRAMES)[number];
/** The week's frame is Rising itself: its list's own address, and the frame a Rising address without one reads in. */
export const DEFAULT_FRAME: RisingFrame = "1w";

export const isFrame = (value: unknown): value is RisingFrame =>
  RISING_FRAMES.includes(value as RisingFrame);

/** The frame after this one among those offered: what a press on Rising leads to while Rising is the order, each in
    turn and round again. From a frame that is not offered, the first of them. */
export const nextFrame = (
  frame: RisingFrame = DEFAULT_FRAME,
  offered: readonly RisingFrame[] = RISING_FRAMES
): RisingFrame => offered[(offered.indexOf(frame) + 1) % offered.length] ?? DEFAULT_FRAME;

/** A Rising list's address in a frame: the list's own for the week, a last segment for another. */
export const framePath = (rising: string, frame: RisingFrame = DEFAULT_FRAME): string =>
  frame === DEFAULT_FRAME ? rising : `${rising}/${frame}`;

/** A palette list's order as an address or the API says it. */
export type ListSort = "popular" | "rising" | "newest" | "oldest";
/** The orders a page's row offers: Saved is the account's own list. */
export type Order = "popular" | "rising" | "saved";

export const parseSort = (value: unknown): ListSort =>
  value === "rising" || value === "newest" || value === "oldest" ? value : "popular";

/** A list page's number and size as the database reads them: past its bounds, each reads as the nearest. */
export const PAGE_MAX = 10_000;
export const LIMIT_MAX = 96;
export const DEFAULT_LIMIT = 24;

export const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value as number))) : fallback;
