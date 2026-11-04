/* How large a picture is drawn, as its address asks. A share card is 1200 by 630, or an email's head at `head=WxH`. A
   palette's own picture reads `w` and `h`, else the `size` its page takes (lib/picture-size.ts, which the editor's MP4
   reads too); a picture of several palettes reads `w` and `h` alone, from 16. Past 2400 a side or four cards' pixels
   both sides are drawn smaller by one factor: drawing is the one costly thing here, and a bound keeps every picture's
   cost known. */
import type { Size } from "@grabient/engine/view.ts";
import { SHEET_SIZE } from "../../lib/page-meta.ts";
import { boundedSize, CARD_SIZE, wholeSide } from "../../lib/picture-size.ts";

export {
  boundedSize,
  CLIP_BOUNDS,
  PIXELS_MAX,
  pictureSize,
  SIDE_MAX
} from "../../lib/picture-size.ts";
export const CARD: Size = CARD_SIZE;
/** A collection's sheet: square, as image searches show palettes, and kept in R2 once drawn (serve.ts). */
export const SHEET: Size = SHEET_SIZE;

/* A share card's furniture, in pixels of a 1200 by 630 card: the margin the wordmark stands in, the wordmark's letters,
   and its bar, the logo's own 34 by 7 at 93, 43 scaled by 1.3 with the letters and set from the margin. The letters'
   mask stands apart in wordmark.data.ts, which only the painter loads. */
export const MARGIN = 32;
export const WORDMARK = { width: 286, height: 50 } as const;
export const BAR = { x: 153, y: 88, width: 44, height: 9 } as const;
/** The least a card is drawn at as an email's head: the wordmark and its bar with the margin around them. */
export const HEAD_MIN = { width: 2 * MARGIN + WORDMARK.width, height: BAR.y + BAR.height + MARGIN };

/** The pixels of a picture of several palettes, which reads no `size`. */
export const montageSize = (params: URLSearchParams): Size =>
  boundedSize(
    wholeSide(params.get("w")) ?? CARD.width,
    wholeSide(params.get("h")) ?? CARD.height,
    16
  );

/** A palette's share card: 1200 by 630 with its chips unless `chips=off`, or an email's head at `head=WxH` with none,
    never smaller than its wordmark needs nor larger than a card. */
export function cardSize(params: URLSearchParams): Size & { chips: boolean } {
  const head = /^(\d{1,4})x(\d{1,4})$/.exec(params.get("head") ?? "");
  if (!head) return { ...CARD, chips: params.get("chips") !== "off" };
  const within = (v: number, least: number, most: number) => Math.max(least, Math.min(most, v));
  return {
    width: within(Number(head[1]), HEAD_MIN.width, CARD.width),
    height: within(Number(head[2]), HEAD_MIN.height, CARD.height),
    chips: false
  };
}
