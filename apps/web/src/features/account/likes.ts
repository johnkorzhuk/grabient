import { localHref } from "@grabient/i18n";

/* Stands in for the accounts area's likes (U08) until it lands, under its names: the account's hearts, its presses and
   the counts a page shows. Signed out, as the session's stand-in always is, a press goes to sign in and comes back. */

/** Where an admin's press was made, which the like keeps. */
export interface LikeContext {
  query?: string;
  collectionId?: string;
}

/** Whether the account likes the palette. */
export const liked = (_seed: string): boolean => false;

/** The count a page shows: the latest it knows, else the one its page read with its data. */
export const likeCount = (_seed: string, shown = 0): number => shown;

/** The account's press on a heart; rejects with the reason when the server refuses it. */
export async function toggleLike(
  _seed: string,
  _on: boolean,
  _context: LikeContext = {}
): Promise<void> {
  location.assign(
    localHref(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
  );
}
