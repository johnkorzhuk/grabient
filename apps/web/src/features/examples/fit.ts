/* Whether a palette suits a part of an interface, decided by rules anyone can check with a contrast checker and a color
   picker, and the colors it gives that part where it does. A palette's examples show only the parts it suits.
   - A control (a press's fill, a switch, a slider's fill against its track) stands out from what it stands on by WCAG
     1.4.11's 3:1.
   - A chart's marks (lines, bars, cells) stand out from their tile by 2:1 at least: on the owner's own two charts, the
     line that read well never dropped under 2.49:1 (a saturated blue, which luminance contrast underrates), and the
     one whose black part vanished reached 1.1:1.
   - Words read by WCAG 1.4.3's 4.5:1, a large heading by 3:1.
   - An ordered scale, where a value's color says how much (a heatmap, a line colored by its value, a progress that
     turns as it fills), runs its lightness one way: by SPAN of OKLCH lightness at least from end to end, never turning
     back by more than SLACK. A palette whose middle is darker or lighter than both ends says two values with one color.
   - Series colors (a chart's sources, tags, avatars) are told apart: every two at least APART in OKLab, four of the
     just-noticeable steps CSS's gamut mapping takes (0.02), and as far on OKHSL's lightness near black, where OKLab
     holds apart colors a screen shows alike.
   The thresholds were set on the 1,664 palettes of the gallery: about half run as an ordered scale and seven in ten
   have every color stand out on a dark or a light tile, so three in ten color a line by its value; four series colors
   that stand out on a tile come from four in five; almost every palette has a color a press can be filled with. */
import { deltaE, hexToSrgb, srgbToLch } from "@grabient/engine/color.ts";
import { contrast } from "@grabient/engine/contrast.ts";
import { inkOn, type Theme, worstContrast } from "./paint.ts";

/** WCAG 1.4.11: a control's part against what it stands on. */
export const MARK = 3;
/** A chart's mark against its tile. */
export const SEEN = 2;
/** WCAG 1.4.3: words, and large words. */
export const TEXT = 4.5;
export const LARGE = 3;
/** An ordered scale's lightness from end to end, at least, in OKLCH. */
export const SPAN = 0.25;
/** The most an ordered scale's lightness may turn back on its way. */
export const SLACK = 0.04;
/** Series colors' least distance, in OKLab. */
export const APART = 0.08;
/** A press's color under the pointer: the next one along the palette, at least this far from its rest. */
const HOVER = 0.03;

/** A tile's paper in each theme (tokens.css's paper-solid): what a dashboard, a panel or an editor stands on. */
export const TILE: Readonly<Record<Theme, string>> = { dark: "#151518", light: "#faf9f7" };

const lchOf = (hex: string) => srgbToLch(hexToSrgb(hex) ?? [0, 0, 0]);
const lightness = (hex: string) => lchOf(hex)[0];

/* OKLab's lightness runs fast near black: #000000 and #130f0e stand 0.17 apart in it, which a screen shows alike.
   OKHSL's lightness, the toe Ottosson fitted to CIELAB's L* there, holds them 0.077 apart. Two series colors are as far
   apart as the nearer of the two says: near black as the eye tells them, elsewhere as OKLab does, where the toe holds
   colors farther apart and the thresholds were set. Of the gallery's palettes it takes series from a dozen at most, all
   on a light tile. */
const TOE_1 = 0.206;
const TOE_2 = 0.03;
const TOE_3 = (1 + TOE_1) / (1 + TOE_2);
const toe = (L: number) =>
  (TOE_3 * L - TOE_1 + Math.sqrt((TOE_3 * L - TOE_1) ** 2 + 4 * TOE_2 * TOE_3 * L)) / 2;

/** An ordered scale: its colors low to high, how far its lightness runs and how far it turns back, and whether it fits. */
export interface Scale {
  fits: boolean;
  /** low to high: the high end the one that stands out most from the ground */
  colors: string[];
  span: number;
  back: number;
}
/** Whether colors in their order read as an ordered scale on a ground: lightness one way, SPAN at least, SLACK at most
    back; turned so the end that stands out most from the ground says the most. */
export function orderedScale(colors: readonly string[], ground: string): Scale {
  const L = colors.map(lightness);
  const n = L.length;
  const span = n ? Math.abs(L[n - 1] - L[0]) : 0;
  const way = Math.sign(L[n - 1] - L[0]) || 1;
  let back = 0;
  let peak = Number.NEGATIVE_INFINITY;
  for (const l of L) {
    peak = Math.max(peak, l * way);
    back = Math.max(back, peak - l * way);
  }
  const high =
    n > 0 && contrast(colors[0], ground) > contrast(colors[n - 1], ground)
      ? [...colors].reverse()
      : [...colors];
  return { fits: n > 1 && span >= SPAN && back <= SLACK, colors: high, span, back };
}

/** Whether every color stands out from the ground as a chart's mark must. */
export const standsOut = (
  colors: readonly string[],
  ground: string,
  need: number = SEEN
): boolean => colors.length > 0 && worstContrast(ground, colors) >= need;

/** The tile theme on which every color stands out as a chart's mark, the better of the two where both do; null where
    neither. */
export function tileFor(colors: readonly string[], need: number = SEEN): Theme | null {
  const dark = worstContrast(TILE.dark, colors);
  const light = worstContrast(TILE.light, colors);
  const best: Theme = dark >= light ? "dark" : "light";
  return Math.max(dark, light) >= need ? best : null;
}

/** Series colors: up to `k` of the palette's colors told apart, among those that stand out from the ground at `need`.
    The most chromatic first, then each the farthest from those taken (farthest-point picks, in OKLab), kept in the
    palette's order. Fits where `k` of them are every two APART at least. */
export interface Series {
  fits: boolean;
  colors: string[];
  /** the least distance between two of them */
  apart: number;
}
export function seriesOf(
  colors: readonly string[],
  k: number,
  ground: string,
  need: number = SEEN
): Series {
  const pool = [...new Set(colors)].filter(c => contrast(c, ground) >= need);
  const lch = pool.map(lchOf);
  const toed = lch.map(([L, C, H]) => [toe(L), C, H]);
  const gap = (i: number, j: number) => Math.min(deltaE(lch[i], lch[j]), deltaE(toed[i], toed[j]));
  if (!pool.length) return { fits: false, colors: [], apart: 0 };
  const taken = [lch.reduce((best, c, i) => (c[1] > lch[best][1] ? i : best), 0)];
  while (taken.length < Math.min(k, pool.length)) {
    let far = -1;
    let farthest = -1;
    lch.forEach((_, i) => {
      if (taken.includes(i)) return;
      const d = Math.min(...taken.map(j => gap(i, j)));
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    });
    taken.push(far);
  }
  const apart = Math.min(
    ...taken.flatMap((a, i) => taken.slice(i + 1).map(b => gap(a, b))),
    Number.POSITIVE_INFINITY
  );
  const ordered = [...taken].sort((a, b) => a - b).map(i => pool[i]);
  return { fits: taken.length >= k && apart >= APART, colors: ordered, apart };
}

/** How far apart colors are by hue and chroma alone: the least distance between two of them in OKLab's a and b, their
    lightness aside; infinite for fewer than two. Series told apart only by how light they are come closest (black and
    a near black): where both themes give a part its series, the one farther apart here shows more of the palette
    (orange, mauve and pink on a dark paper rather than brown, black and a near black on a light one). */
export function huesApart(colors: readonly string[]): number {
  const flat = colors.map(color => {
    const [, C, H] = lchOf(color);
    return [0, C, H];
  });
  return Math.min(
    ...flat.flatMap((p, i) => flat.slice(i + 1).map(q => deltaE(p, q))),
    Number.POSITIVE_INFINITY
  );
}

/** A press filled with one of the palette's colors, on a surface: its fill, its label's ink and its color under the
    pointer. */
export interface Press {
  fill: string;
  label: string;
  hover: string;
}
/** The press the palette gives on a surface: the most chromatic of its colors that stands out from the surface as a
    control must (MARK) and under which white or black reads as words must (TEXT); under the pointer, the nearest color
    after it along the palette that passes too and is visibly another, else its own. Null where no color passes. */
export function pressOn(colors: readonly string[], surface: string): Press | null {
  const passes = (c: string) => contrast(c, surface) >= MARK && inkOn([c]).ratio >= TEXT;
  const fills = colors.filter(passes);
  if (!fills.length) return null;
  const fill = fills.reduce((best, c) => (lchOf(c)[1] > lchOf(best)[1] ? c : best));
  const label = inkOn([fill]).ink;
  const at = colors.indexOf(fill);
  const next = [...colors.slice(at + 1), ...colors.slice(0, at).reverse()].find(
    c => passes(c) && inkOn([c]).ink === label && deltaE(lchOf(c), lchOf(fill)) >= HOVER
  );
  return { fill, label, hover: next ?? fill };
}

/** How far a press clears its checks on a paper: the less of its fill against the paper over MARK and its label on its
    fill over TEXT; none where there is no press. */
const margin = (press: Press | null, paper: string) =>
  press
    ? Math.min(contrast(press.fill, paper) / MARK, contrast(press.label, press.fill) / TEXT)
    : 0;
/** The paper a part with a press stands on (a card's, a profile's): the theme on whose paper the palette gives a press,
    the one whose press clears its checks by more where both do, dark where they tie; with that press, none where
    neither theme gives one. */
export function pressPaper(colors: readonly string[]): { theme: Theme; press: Press | null } {
  const dark = pressOn(colors, TILE.dark);
  const light = pressOn(colors, TILE.light);
  return margin(light, TILE.light) > margin(dark, TILE.dark)
    ? { theme: "light", press: light }
    : { theme: "dark", press: dark };
}

/** The ink that reads on every one of the colors at `need`, with the least contrast it has there; null where neither
    white nor black does. */
export function inkThrough(
  colors: readonly string[],
  need: number = TEXT
): { ink: string; ratio: number } | null {
  const read = inkOn(colors);
  return read.ratio >= need ? read : null;
}

/** The theme whose page every color stands out from as large words (a heading in the palette's colors), the better of
    the two; null where neither. */
export const lettersTheme = (colors: readonly string[]): Theme | null => tileFor(colors, LARGE);
