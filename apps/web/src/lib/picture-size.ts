/* How large a palette's own picture is drawn, as its address asks: `w` and `h`, else the `size` its page takes, from 1
   pixel a side, so a row of its colors is a picture a shader or a chart reads. Past 2400 a side or four cards' pixels
   both sides are drawn smaller by one factor: drawing is the one costly thing, and a bound keeps every picture's cost
   known. The Worker's files read it (server/images/size.ts), and so does the editor's MP4, drawn in the reader's
   browser as the Worker draws the clip at its address (features/editor/video-clip.ts); it imports nothing of a page's,
   so the browser's worker carries it alone. */
import { parseSize, resolveSize, type Size } from "@grabient/engine/view.ts";

/** A share card's size, and a palette's own picture's where its address names none. */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
export const SIDE_MAX = 2400;
export const PIXELS_MAX = 4 * CARD_SIZE.width * CARD_SIZE.height;

/** A side as an address writes it: whole digits, however many, read up to the largest safe integer. */
export const wholeSide = (raw: string | null | undefined) =>
  raw && /^\d+$/.test(raw) ? Math.min(Number(raw), Number.MAX_SAFE_INTEGER) : null;

/** Sides within the bounds, at least `least` each. */
export function boundedSize(width: number, height: number, least: number): Size {
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
  if (size) return resolveSize(size, CARD_SIZE);
  const sides = /^(\d+|auto)x(\d+|auto)$/.exec(raw ?? "");
  const w = wholeSide(sides?.[1]);
  const h = wholeSide(sides?.[2]);
  if (w !== null)
    return { width: w, height: h ?? Math.round((w * CARD_SIZE.height) / CARD_SIZE.width) };
  return h === null
    ? null
    : { width: Math.round((h * CARD_SIZE.width) / CARD_SIZE.height), height: h };
}

/** The pixels of a palette's own picture. A missing `w` or `h` beside the other is the card's side. */
export function pictureSize(params: URLSearchParams): Size {
  const w = wholeSide(params.get("w"));
  const h = wholeSide(params.get("h"));
  const asked = w === null && h === null ? sizeAsked(params.get("size")) : null;
  return boundedSize(
    asked?.width ?? w ?? CARD_SIZE.width,
    asked?.height ?? h ?? CARD_SIZE.height,
    1
  );
}
