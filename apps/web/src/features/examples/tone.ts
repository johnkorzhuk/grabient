/* The theme a palette's examples page sets its hero's words in: the one whose ink reads on the colors under them, at a
   hero's shape on a wide screen and on a phone held upright alike, so the server's choice holds at any width; the page
   reads it again as the palette changes under the keys. */
import { CONTRAST_TEXT } from "@grabient/engine/contrast.ts";
import { dir } from "@grabient/i18n";
import { colorsUnder, mirrored, type Part, type Shown, type Theme, themeOn } from "./paint.ts";

/** The hero's shape, its width over its height, on a wide screen and on a phone held upright. */
const WIDE = 1.7;
const TALL = 0.56;
/* the hero's words and code: its lower start on a wide screen, its whole lower part on a phone */
const WORDS: readonly (readonly [aspect: number, part: Part])[] = [
  [WIDE, { x0: 0, y0: 0.4, x1: 0.56, y1: 1 }],
  [TALL, { x0: 0, y0: 0.42, x1: 1, y1: 1 }]
];

const placed = (part: Part, rtl: boolean) => (rtl ? mirrored(part) : part);

/** The theme the hero's words stand in, their ink reading at 4.5:1 as text must; null where neither theme reads, and the
    words stand on a sheet of the page's own. */
export function wordsTone(s: Shown, rtl = dir() === "rtl"): Theme | null {
  return themeOn(
    WORDS.flatMap(([aspect, part]) => colorsUnder(s, placed(part, rtl), aspect)),
    CONTRAST_TEXT
  );
}
