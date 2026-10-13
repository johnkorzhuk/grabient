import { localHref } from "@grabient/i18n";

/* Stands in for the accounts area's likes (U08) until it lands: the account's hearts, its presses and the counts a page
   shows. Signed out, as the session's stand-in always is, a press goes to sign in and comes back. */

/** Whether the account likes the palette. */
export const liked = (_seed: string): boolean => false;

/** The count a page shows: the server's, with the account's press not yet sent. */
export const likeCount = (_seed: string, server: number): number => server;

/** The account's press on a heart. */
export function toggleLike(
  _seed: string,
  _on: boolean,
  _context?: { query?: string; collectionId?: string; via?: string }
): void {
  location.assign(
    localHref(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
  );
}
