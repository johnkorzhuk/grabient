/* A card of frosted glass on the palette, as the cards' widget lays one (Cards.tsx): the glass blurs the picture under
   it, veils it with a tint and holds its words in white or black. A browser blurs the picture and lays the veil and the
   glass's sheen over it in sRGB, so every color the card shows is a blend of the colors its blur reaches, veiled. Its
   words read where their ink reads on all of them by WCAG's 4.5:1 (fit.ts's TEXT):
   - white words on the lightest the glass can show: a blend in sRGB is never lighter than the lightest color in it, nor
     is it once veiled and lit by the sheen, which are blends too, so the colors the blur reaches are all there is to
     read (frost.test.ts holds the words too where a blur blends in linear light, which can lighten a veiled blend);
   - black words on the darkest: a blend can be darker than each of its colors (red and green blend in sRGB to an olive
     darker than both), but no channel of it is darker than the least of its colors there, in sRGB or in linear light,
     so each part of the card is read on the least of each channel among the colors its blur reaches from there,
     veiled; the sheen only lightens.
   The veil is the palette's own darkest color under white words and its lightest under black, at the least alpha the
   words read at, else plain black or white; at the last alpha, white words read on black veiling white. Each alpha is a
   whole byte and each blend is rounded the way that reads worse, so the browser's eight bits a channel change nothing. */
import { contrastOf, hexToSrgb, luminance } from "@grabient/engine/color.ts";
import { TEXT } from "./fit.ts";
import { colorsOfParts, drawnColors, type Part, type Shown } from "./paint.ts";

/** The glass on the picture: its words' ink, the tint it veils the picture with, how much (0 to 1) and as the CSS
    color that lays it, and the least contrast its words have on what it shows. */
export interface Frost {
  ink: string;
  tint: string;
  alpha: number;
  veil: string;
  ratio: number;
}

/** The veil's alphas, clearest first, each a whole byte: 12, 24, 36, 48 and 60 in a hundred. */
export const ALPHA_BYTES = [31, 61, 92, 122, 153] as const;
/** The glass's sheen: white laid from its top start corner, this strong at most (Cards.module.css's .glass). */
export const SHEEN = 0.1;
/** Parts a side the card is read in for black words, each on the colors its blur reaches from there. */
const PARTS = 5;
const WHITE = "#ffffff";
const BLACK = "#000000";

type Rgb = readonly number[];
const rgbOf = (hex: string): Rgb => hexToSrgb(hex) ?? [0, 0, 0];
/** `top` laid over `under` at `alpha`, as a browser lays a translucent color, in sRGB. */
const over = (under: Rgb, top: Rgb, alpha: number): Rgb =>
  under.map((v, i) => v + (top[i] - v) * alpha);
/** A blend in eight bits a channel, rounded up (lighter) or down (darker). */
const bytes = (rgb: Rgb, up: boolean): Rgb =>
  rgb.map(v => (up ? Math.ceil(v * 255 - 1e-9) : Math.floor(v * 255 + 1e-9)) / 255);

/** A part spread by `reach` of a box's width on every side, within a box `aspect` times as wide as tall. */
const spread = (part: Part, reach: number, aspect: number): Part => ({
  x0: Math.max(0, part.x0 - reach),
  y0: Math.max(0, part.y0 - reach * aspect),
  x1: Math.min(1, part.x1 + reach),
  y1: Math.min(1, part.y1 + reach * aspect)
});

/** The colors the glass can show at its lightest, for white words, and its darkest in each of its parts, for black:
    the colors its blur reaches (paint.ts's colorsOfParts, those every color there is a blend of), and the least of
    each channel among those it reaches from each part. */
function underGlass(s: Shown, card: Part, aspect: number, reach: number) {
  const colorsOf = colorsOfParts(s, aspect);
  const lights = colorsOf(spread(card, reach, aspect)).map(rgbOf);
  const dx = (card.x1 - card.x0) / PARTS;
  const dy = (card.y1 - card.y0) / PARTS;
  const darks: Rgb[] = [];
  for (let i = 0; i < PARTS; i++)
    for (let j = 0; j < PARTS; j++) {
      const part = {
        x0: card.x0 + dx * i,
        y0: card.y0 + dy * j,
        x1: card.x0 + dx * (i + 1),
        y1: card.y0 + dy * (j + 1)
      };
      const reached = colorsOf(spread(part, reach, aspect)).map(rgbOf);
      darks.push(reached.reduce((least, c) => least.map((v, k) => Math.min(v, c[k]))));
    }
  return { lights, darks };
}

/** The least contrast `ink` has on the colors under the glass, veiled with `tint` at `alpha`, white words also under
    the sheen; once under `need`, the first contrast found under it. */
function readOn(
  under: ReturnType<typeof underGlass>,
  ink: string,
  tint: string,
  alpha: number,
  need = 0
): number {
  const light = ink === WHITE;
  const veil = rgbOf(tint);
  const inkLight = luminance(rgbOf(ink));
  let least = 21;
  for (const c of light ? under.lights : under.darks) {
    const veiled = over(c, veil, alpha);
    const shown = bytes(light ? over(veiled, [1, 1, 1], SHEEN) : veiled, light);
    least = Math.min(least, contrastOf(inkLight, luminance(shown)));
    if (least < need) break;
  }
  return least;
}

const frostOf = (ink: string, tint: string, byte: number, ratio: number): Frost => ({
  ink,
  tint,
  alpha: byte / 255,
  veil: `${tint}${byte.toString(16).padStart(2, "0")}`,
  ratio
});

/** The glass a card laid on the palette at `card` of a box `aspect` times as wide as tall takes, its blur reaching
    `reach` of the box's width (three of the blur's standard deviations, past which it takes nothing that shows). */
export function frostOn(s: Shown, card: Part, aspect: number, reach: number): Frost {
  const under = underGlass(s, card, aspect, reach);
  const colors = drawnColors(s);
  const byLight = colors
    .map(hex => ({ hex, light: luminance(rgbOf(hex)) }))
    .sort((a, b) => a.light - b.light);
  const deep = byLight[0]?.hex ?? BLACK;
  const pale = byLight[byLight.length - 1]?.hex ?? WHITE;
  const veils = [
    { ink: WHITE, tint: deep, own: true },
    { ink: BLACK, tint: pale, own: true },
    { ink: WHITE, tint: BLACK, own: false },
    { ink: BLACK, tint: WHITE, own: false }
  ];
  for (const byte of ALPHA_BYTES) {
    /* the palette's own tint where it veils enough, the better read where both inks do */
    const best = veils
      .map(v => ({ ...v, ratio: readOn(under, v.ink, v.tint, byte / 255, TEXT) }))
      .filter(v => v.ratio >= TEXT)
      .sort((a, b) => Number(b.own) - Number(a.own) || b.ratio - a.ratio)[0];
    if (best) return frostOf(best.ink, best.tint, byte, best.ratio);
  }
  /* not reached: at the last alpha, white words read on black veiling white (frost.test.ts) */
  const last = ALPHA_BYTES[ALPHA_BYTES.length - 1];
  return frostOf(WHITE, BLACK, last, readOn(under, WHITE, BLACK, last / 255));
}
