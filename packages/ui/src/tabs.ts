import { matches } from "./keys.ts";

/** The tab a key chooses on a row of `count` tabs with tab `at` chosen, or -1 for a key the row leaves alone. The
    arrows take the tab beside it as the row is seen, so in a right-to-left row the left arrow goes on, and wrap round
    the ends; Home and End take the first and the last. */
export function tabAfter(e: KeyboardEvent, count: number, at: number): number {
  const rtl = getComputedStyle(e.currentTarget as Element).direction === "rtl";
  if (matches(e, "Home")) return 0;
  if (matches(e, "End")) return count - 1;
  if (matches(e, rtl ? "ArrowLeft" : "ArrowRight")) return (at + 1) % count;
  if (matches(e, rtl ? "ArrowRight" : "ArrowLeft")) return (at + count - 1) % count;
  return -1;
}
