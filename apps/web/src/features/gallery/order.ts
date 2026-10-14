import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { DEFAULT_FRAME, isFrame, type Order, type RisingFrame } from "../../lib/orders.ts";

/* The order a reader chose last on a list, and the frame Rising was last read in, kept for the tab: where a section
   leads from the home, and where Rising leads from another order. Popular and the week's on both sides until the page
   is live, so the server's links and the first render's agree. */

interface Chosen {
  order: Order;
  frame: RisingFrame;
}
const KEY = "grabient-order";
const [chosen, setChosen] = createSignal<Chosen>({ order: "popular", frame: DEFAULT_FRAME });
/* the same choice, plain: a signal written now reads its old value until the write settles */
let kept = chosen();
let live = false;

/** The reader's order and Rising's frame, as this tab remembers them. */
export const readerOrder = chosen;

/** Reads the tab's memory once the page is live. */
export function recallOrder(): void {
  if (isServer || live) return;
  live = true;
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Chosen> | null;
    const order = stored?.order;
    if (
      (order === "popular" || order === "rising" || order === "saved") &&
      isFrame(stored?.frame)
    ) {
      kept = { order, frame: stored.frame };
      setChosen(kept);
    }
  } catch {
    /* nothing kept, or storage refused: Popular */
  }
}

/** A list is on screen in this order. Rising says its frame; any other order leaves the frame read last as it is. */
export function rememberOrder(order: Order, frame: RisingFrame = kept.frame): void {
  if (isServer) return;
  recallOrder();
  if (kept.order === order && kept.frame === frame) return;
  kept = { order, frame };
  setChosen(kept);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* the page still remembers it */
  }
}
