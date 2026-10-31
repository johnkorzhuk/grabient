/* The themes a palette's examples page stands in over its hero, which runs under the header to the window's top: the
   header's two sides (the wordmark at its start, the theme and account presses at its end) and the hero's words, each
   in the theme whose ink reads on the colors under it, at a hero's shape on a wide screen and on a phone held upright
   alike, so the server's choice holds at any width. The route's loader reads the header's (routes/$id/examples.tsx),
   which the frame shows from the first paint; the page reads both again as the palette changes under the keys. */
import { CONTRAST_LARGE, CONTRAST_TEXT } from "@grabient/engine/contrast.ts";
import { dir } from "@grabient/i18n";
import type { HeaderTone } from "../../app/shell.ts";
import { colorsUnder, mirrored, type Part, type Shown, type Theme, themeOn } from "./paint.ts";

/** The hero's shape, its width over its height, on a wide screen and on a phone held upright. */
const WIDE = 1.7;
const TALL = 0.56;
/* the header's parts over the hero: its band, the wordmark's side and the corner's */
const WORDMARK: Part = { x0: 0, y0: 0, x1: 0.34, y1: 0.11 };
const CORNER: Part = { x0: 0.7, y0: 0, x1: 1, y1: 0.11 };
/* the hero's words and code: its lower start on a wide screen, its whole lower part on a phone */
const WORDS: readonly (readonly [aspect: number, part: Part])[] = [
  [WIDE, { x0: 0, y0: 0.4, x1: 0.56, y1: 1 }],
  [TALL, { x0: 0, y0: 0.42, x1: 1, y1: 1 }]
];

const placed = (part: Part, rtl: boolean) => (rtl ? mirrored(part) : part);

/** The header's tone over the hero: each side's theme, its ink reading at 3:1 as a large word and a control's glyph
    must; null where one side reads in neither theme. */
export function headerTone(s: Shown, rtl = dir() === "rtl"): HeaderTone | null {
  const side = (part: Part) =>
    themeOn(
      [WIDE, TALL].flatMap(aspect => colorsUnder(s, placed(part, rtl), aspect)),
      CONTRAST_LARGE
    );
  const start = side(WORDMARK);
  const end = side(CORNER);
  return start && end ? { start, end } : null;
}

/** The theme the hero's words stand in, their ink reading at 4.5:1 as text must; null where neither theme reads, and the
    words stand on a sheet of the page's own. */
export function wordsTone(s: Shown, rtl = dir() === "rtl"): Theme | null {
  return themeOn(
    WORDS.flatMap(([aspect, part]) => colorsUnder(s, placed(part, rtl), aspect)),
    CONTRAST_TEXT
  );
}
