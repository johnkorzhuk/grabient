/* The themes a palette's examples page stands in over its hero, which runs under the header to the window's top: the
   header's two sides (the wordmark at its start, the theme and account presses at its end) and the hero's words, each
   in the theme whose ink reads on the colors under it, at a hero's shape on a wide screen and on a phone held upright
   alike, so the server's choice holds at any width. The route's loader reads the header's (routes/$id/examples.tsx),
   which the frame shows from the first paint; the page reads both again as the palette changes under the keys. */
import { CONTRAST_TEXT } from "@grabient/engine/contrast.ts";
import { dir } from "@grabient/i18n";
import type { HeaderTone } from "../../app/shell.ts";
import { colorsUnder, mirrored, type Part, type Shown, type Theme, themeOn } from "./paint.ts";

/** The hero's shape, its width over its height, on a wide screen and on a phone held upright. */
const WIDE = 1.7;
const TALL = 0.56;
/* where the header's glyphs stand over the hero: the wordmark in its top start corner, the theme and account presses
   in its top end corner; on a phone held upright the wordmark takes nearly half the width and the presses a quarter */
const WORDMARK = {
  wide: { x0: 0.015, y0: 0, x1: 0.17, y1: 0.08 },
  tall: { x0: 0.03, y0: 0, x1: 0.48, y1: 0.08 }
} as const satisfies Record<string, Part>;
const TOGGLE = {
  wide: { x0: 0.9, y0: 0, x1: 0.935, y1: 0.08 },
  tall: { x0: 0.73, y0: 0, x1: 0.83, y1: 0.08 }
} as const satisfies Record<string, Part>;
const ACCOUNT = {
  wide: { x0: 0.935, y0: 0, x1: 0.98, y1: 0.08 },
  tall: { x0: 0.85, y0: 0, x1: 0.97, y1: 0.08 }
} as const satisfies Record<string, Part>;
/* the hero's words and code: its lower start on a wide screen, its whole lower part on a phone */
const WORDS: readonly (readonly [aspect: number, part: Part])[] = [
  [WIDE, { x0: 0, y0: 0.4, x1: 0.56, y1: 1 }],
  [TALL, { x0: 0, y0: 0.42, x1: 1, y1: 1 }]
];

const placed = (part: Part, rtl: boolean) => (rtl ? mirrored(part) : part);

/** The header's tone over the hero: the theme whose ink reads better on the colors under each of its glyphs, as the
    wordmark and the corner's presses stand bare on the picture in it, with no surface of their own: the wordmark's on
    a wide screen and a phone alike, each press's for each (the header gives a phone's its own). */
export function headerTone(s: Shown, rtl = dir() === "rtl"): HeaderTone {
  /* any contrast at all is 1:1 or more: the better of the two themes, dark where they tie */
  const better = (parts: readonly (readonly [number, Part])[]): Theme =>
    themeOn(
      parts.flatMap(([aspect, part]) => colorsUnder(s, placed(part, rtl), aspect)),
      1
    ) ?? "dark";
  return {
    start: better([
      [WIDE, WORDMARK.wide],
      [TALL, WORDMARK.tall]
    ]),
    toggle: better([[WIDE, TOGGLE.wide]]),
    toggleNarrow: better([[TALL, TOGGLE.tall]]),
    account: better([[WIDE, ACCOUNT.wide]]),
    accountNarrow: better([[TALL, ACCOUNT.tall]])
  };
}

/** The theme the hero's words stand in, their ink reading at 4.5:1 as text must; null where neither theme reads, and the
    words stand on a sheet of the page's own. */
export function wordsTone(s: Shown, rtl = dir() === "rtl"): Theme | null {
  return themeOn(
    WORDS.flatMap(([aspect, part]) => colorsUnder(s, placed(part, rtl), aspect)),
    CONTRAST_TEXT
  );
}
