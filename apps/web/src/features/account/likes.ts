import { localHref } from "@grabient/i18n";
import { loginHref } from "./session.ts";

/* Stands in for the accounts area's likes (U08) until it lands, under its names: the account's hearts, its presses and
   the counts a page shows. Signed out, as the session's stand-in always is, a press goes to sign in and comes back. */

/** Whether the account likes the palette. */
export const liked = (_seed: string): boolean => false;

/** The count beside a palette's heart: the latest this page knows, else `shown`, the one its page read with its data. */
export const likeCount = (_seed: string, shown = 0): number => shown;

/** The counts a page read with its data, at `at` (its read time). */
export function noteCounts(_items: readonly { seed: string; likes: number }[], _at?: number) {}

/** Asks the server for the counts that are due. */
export const readLikeCounts = (_seeds: readonly string[]): Promise<void> => Promise.resolve();

/** Where a heart was pressed, for an admin's like: the words of the search its page answers, or the collection its page
    shows. */
export interface LikeContext {
  query?: string;
  collectionId?: string;
}

/** A heart pressed. Signed out it leads to sign in. */
export function toggleLike(_seed: string, _on: boolean, _context: LikeContext = {}): Promise<void> {
  location.assign(localHref(loginHref()));
  return Promise.resolve();
}
