/* Stand-in for the accounts area's module of the same path, until it merges: the account's offline copy of its own
   collections is not here, so every reader of it asks the server. */

/** The account's own collections as its copy holds them, each with the items it holds; null while there is no copy. */
export const ownCollectionsHeld = ():
  | readonly {
      slug: string;
      title: string;
      count: number;
      keys: ReadonlySet<string>;
      seeds: readonly string[];
    }[]
  | null => null;
