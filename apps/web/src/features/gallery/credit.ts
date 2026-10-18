import { t } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createStore } from "solid-js";
import * as v from "valibot";
import { CREDIT_SECONDS } from "../../lib/cache.ts";
import { getJson } from "../../lib/query.ts";
import { isSeed } from "../editor/address.ts";

/* Who a palette's cards and page credit for bringing it to Grabient (server/gallery/credit.ts): Grabient, or a person
   by the username they chose to show. The browser asks as the pointer, the focus or a tap reaches a card, or as a
   palette's page opens, in every language, and a page's document never holds one, so no crawler reads one. The edge
   keeps an answer half a minute, and a page that reaches the palette again asks again after as long, so a name its
   account takes back leaves within the minute. */

export const Credit = v.variant("by", [
  v.object({ by: v.literal("grabient") }),
  v.object({ by: v.literal("person"), name: v.string() })
]);
export type Credit = v.InferOutput<typeof Credit>;
const Answer = v.object({ credit: v.nullable(Credit) });

/* the palettes this tab asked about, each with when, the oldest first, and each answer once it came; the last few
   are kept */
const KEPT = 80;
const asked = new Map<string, number>();
const [credits, setCredits] = createStore<Record<string, Credit | null>>({});

/** In the browser, asks who to credit for a palette a reader reached, unless an answer from the last half minute is
    in. A failed answer is asked again the next time. */
export function askCredit(seed: string): void {
  if (isServer || !isSeed(seed)) return;
  const now = Date.now();
  const at = asked.get(seed);
  if (at !== undefined && now - at < CREDIT_SECONDS * 1000) return;
  asked.delete(seed);
  asked.set(seed, now);
  const oldest = asked.size > KEPT ? asked.keys().next().value : undefined;
  if (oldest !== undefined) asked.delete(oldest);
  void getJson(`/api/palette-credit?${new URLSearchParams({ seed })}`, Answer).then(
    came =>
      setCredits(draft => {
        if (oldest !== undefined) delete draft[oldest];
        if (asked.get(seed) === now) draft[seed] = came.credit;
      }),
    () => {
      if (asked.get(seed) === now) asked.delete(seed);
    }
  );
}

/** Who the server credits for a palette: undefined until its answer comes, null for no one. Reactive. */
export const creditOf = (seed: string): Credit | null | undefined => credits[seed];

/** Who a card names after a palette's age: Grabient, or the person by their username. */
export const creditName = (credit: Credit | null | undefined): string | undefined =>
  !credit ? undefined : credit.by === "grabient" ? "Grabient" : credit.name;

/** A credit in words, as a palette's page and the MCP view say it. */
export const creditWords = (credit: Credit | null | undefined): string | undefined =>
  !credit
    ? undefined
    : credit.by === "grabient"
      ? t("From Grabient")
      : t("First liked by {name}", { name: credit.name });
