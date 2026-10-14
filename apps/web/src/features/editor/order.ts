import { isServer } from "@solidjs/web";
import { DEFAULT_FRAME, isFrame, type Order, type RisingFrame } from "../../lib/orders.ts";

/** The order the reader reads them in: the most liked first, or the rising in one of Rising's frames. */
export interface SimilarOrder {
  sort: "popular" | "rising";
  frame: RisingFrame;
}

/* The reader's order is the tab's, the one the lists are in: the lists keep the same record under the same key, so a
   list read in Rising opens a palette on its rising neighbors, and a press here orders the list opened next. Saved is
   the account's own list and no order of these, so it reads Popular. Read as a sheet is drawn, never held here: a list
   may have written it since. */
const KEY = "grabient-order";

export function keptOrder(): SimilarOrder {
  let said: { order?: unknown; frame?: unknown } | null = null;
  try {
    said = isServer ? null : JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    /* nothing kept, or storage refused: Popular */
  }
  return {
    sort: said?.order === "rising" ? "rising" : "popular",
    frame: isFrame(said?.frame) ? said.frame : DEFAULT_FRAME
  };
}

export function keepOrder(next: SimilarOrder): void {
  const record: { order: Order; frame: RisingFrame } = { order: next.sort, frame: next.frame };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* the sheet still shows it */
  }
}
