import type { Reader } from "./read.ts";

/* The seam between the collections and the site's ranking (hot and Rising), which the gallery's order owns: a
   collection made public stands in the hot and Rising orders from that request on, and a copy saved lifts its source's
   Rising scores as a like lifts a palette's. Where the ranking is not wired here, the schedule's pass scores a
   collection within six hours. */

/** A collection that just reached the public lists takes its hot and Rising scores now. */
export async function scoreArrival(_env: Reader, _id: string, _now: number): Promise<void> {}

/** The SET assignments that lift a collection's Rising scores for a copy saved at `now`, where `counts` holds; empty
    where the ranking is not wired here. */
export const risingSaved = (_now: number, _counts: string): string => "";
