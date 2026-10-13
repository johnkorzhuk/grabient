import type { Style } from "@grabient/engine/view.ts";

/* A stand-in for the accounts feature's likes module, written to its contract so the editor builds against it: whether
   the account likes a palette, the count beside its heart, the counts asked for, and the heart's press. Signed out here:
   nothing is liked and every count is the one the page read. The accounts feature's own module takes its place. */

/** Whether the account likes the palette: its heart. */
export const liked = (_seed: string): boolean => false;
/** The count beside a palette's heart: the latest this page knows, else `shown`, the one its page read. */
export const likeCount = (_seed: string, shown: number): number => shown;
/** Asks the server for the counts that are due, together. */
export const refreshCounts = (_seeds: readonly string[]): Promise<void> => Promise.resolve();

/** Where a heart was pressed, and the view the palette is saved in, as the page shows it. */
export interface LikeContext {
  view?: { style: Style; steps: number; angle: number };
  query?: string;
  collectionId?: string;
}
/** A heart pressed: the palette's like turns over, and the server follows. */
export const toggleLike = (
  _seed: string,
  _on: boolean,
  _context: LikeContext = {}
): Promise<void> => Promise.resolve();
