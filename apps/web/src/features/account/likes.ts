/* A stand-in for the accounts feature's likes module, written to its contract so the editor builds against it: whether
   the account likes a palette, the heart's press, and the count a page shows (the server's count with the account's
   change still on its way). Signed out here: nothing is liked and every count reads as the server has none. The accounts
   feature's own module takes its place. */

/** Whether the account signed in likes the palette. */
export const liked = (_seed: string): boolean => false;
/** How many like the palette, as the page shows it. */
export const likeCount = (_seed: string): number => 0;
/** The palettes' counts read from the server, for the ones the page shows. */
export async function readLikeCounts(_seeds: readonly string[]): Promise<void> {}
/** The heart pressed: a like, or one let go, with where it was made. */
export async function toggleLike(
  _seed: string,
  _on: boolean,
  _context?: { query?: string; collectionId?: string; via?: string }
): Promise<void> {}
