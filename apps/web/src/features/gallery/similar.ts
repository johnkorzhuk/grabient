import { localHref } from "@grabient/i18n";
import { framePath } from "../../lib/orders.ts";
import { LIST_PATHS } from "./address.ts";
import { readerOrder } from "./order.ts";

/** Where a palette's Similar palettes leads, from a card or the editor: the palettes list searched by the palette
    alone, its seed, with none of the view it is drawn in, in the reader's own order (Saved reads Popular) and Rising
    in the frame they read it in last, in the reader's language. */
export function similarHref(seed: string): string {
  const { order, frame } = readerOrder();
  const list = order === "rising" ? framePath(LIST_PATHS.rising, frame) : LIST_PATHS.popular;
  return localHref(`${list}?${new URLSearchParams({ q: seed })}`);
}
