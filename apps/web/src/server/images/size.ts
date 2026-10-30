/* How large a picture is drawn, as its address asks. A share card is 1200 by 630, or an email's head at `head=WxH`. A
   palette's own picture reads `w` and `h`, else the `size` its page takes, from 1 pixel a side, so a row of its colors
   is a picture a shader or a chart reads; a picture of several palettes reads `w` and `h` alone, from 16. Past 2400 a
   side or four cards' pixels both sides are drawn smaller by one factor: drawing is the one costly thing here, and a
   bound keeps every picture's cost known. */
import { parseSize, resolveSize, type Size } from "@grabient/engine/view.ts";
import { CARD_SIZE, SHEET_SIZE } from "../../lib/page-meta.ts";

export const CARD: Size = CARD_SIZE;
/** A collection's sheet: square, as image searches show palettes, and kept in R2 once drawn (serve.ts). */
export const SHEET: Size = SHEET_SIZE;
export const SIDE_MAX = 2400;
export const PIXELS_MAX = 4 * CARD.width * CARD.height;

/* A share card's furniture, in pixels of a 1200 by 630 card: the margin the wordmark stands in, the wordmark's letters,
   and its bar, the logo's own 34 by 7 at 93, 43 scaled by 1.3 with the letters and set from the margin. The letters'
   mask stands apart in wordmark.data.ts, which only the painter loads. */
export const MARGIN = 32;
export const WORDMARK = { width: 286, height: 50 } as const;
export const BAR = { x: 153, y: 88, width: 44, height: 9 } as const;
/** The least a card is drawn at as an email's head: the wordmark and its bar with the margin around them. */
export const HEAD_MIN = { width: 2 * MARGIN + WORDMARK.width, height: BAR.y + BAR.height + MARGIN };

/** A side as an address writes it: whole digits, however many, read up to the largest safe integer. */
const whole = (raw: string | null | undefined) =>
  raw && /^\d+$/.test(raw) ? Math.min(Number(raw), Number.MAX_SAFE_INTEGER) : null;

function bounded(width: number, height: number, least: number): Size {
  const w = Math.max(least, width);
  const h = Math.max(least, height);
  const scale = Math.min(1, SIDE_MAX / Math.max(w, h), Math.sqrt(PIXELS_MAX / (w * h)));
  // The hair before flooring keeps a side that scales to a whole number, 2400 above all, from losing a pixel.
  const fit = (v: number) => Math.max(least, Math.min(SIDE_MAX, Math.floor(v * scale + 1e-9)));
  return { width: fit(w), height: fit(h) };
}

/* A size the page takes resolves an auto side at the card's shape within the page's bounds. Any other pair of sides is
   read as `w` and `h` are, so `256x1` is a strip, an auto side following the other at the card's shape. */
function sizeAsked(raw: string | null): Size | null {
  const size = parseSize(raw);
  if (size) return resolveSize(size, CARD);
  const sides = /^(\d+|auto)x(\d+|auto)$/.exec(raw ?? "");
  const w = whole(sides?.[1]);
  const h = whole(sides?.[2]);
  if (w !== null) return { width: w, height: h ?? Math.round((w * CARD.height) / CARD.width) };
  return h === null ? null : { width: Math.round((h * CARD.width) / CARD.height), height: h };
}

/** The pixels of a palette's own picture. A missing `w` or `h` beside the other is the card's side. */
export function pictureSize(params: URLSearchParams): Size {
  const w = whole(params.get("w"));
  const h = whole(params.get("h"));
  const asked = w === null && h === null ? sizeAsked(params.get("size")) : null;
  return bounded(asked?.width ?? w ?? CARD.width, asked?.height ?? h ?? CARD.height, 1);
}

/** The pixels of a picture of several palettes, which reads no `size`. */
export const montageSize = (params: URLSearchParams): Size =>
  bounded(whole(params.get("w")) ?? CARD.width, whole(params.get("h")) ?? CARD.height, 16);

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
