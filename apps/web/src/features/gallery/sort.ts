import type { ListSort, RisingFrame } from "../../lib/orders.ts";

interface Sortable {
  kseed: string;
  likes: number;
  createdAt: number;
  score?: number;
  rising?: number;
  rising3m?: number;
  rising1y?: number;
}

/** A search's order, the same on the Worker and in the browser so a page boundary never moves on hydration. Popular is
    the most liked, then the best answer to the words; Rising the frame's score, then the newest. Ties go by the seed's
    code points, never by a reader's collation. */
export function sortSearch<T extends Sortable>(
  items: readonly T[],
  sort: ListSort = "popular",
  frame: RisingFrame = "1w"
): T[] {
  const risen = (item: T) =>
    (frame === "3m" ? item.rising3m : frame === "1y" ? item.rising1y : item.rising) ?? 0;
  const order = (a: T, b: T) =>
    sort === "rising"
      ? risen(b) - risen(a) || b.createdAt - a.createdAt
      : sort === "newest"
        ? b.createdAt - a.createdAt
        : sort === "oldest"
          ? a.createdAt - b.createdAt
          : b.likes - a.likes || (b.score ?? 0) - (a.score ?? 0);
  return [...items].sort(
    (a, b) => order(a, b) || (a.kseed < b.kseed ? -1 : a.kseed > b.kseed ? 1 : 0)
  );
}
