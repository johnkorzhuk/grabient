/* What an email wears, read from the design tokens, so an email changes when they do. Outlook's Word engine reads no
   alpha, so a translucent token is laid over the ground it stands on and written opaque, and font stacks lose their
   quotes so a style attribute never needs one. */
import { withBlack, withWhite } from "@grabient/engine/contrast.ts";
import { MARK_FIXED } from "@grabient/ui/mark.ts";
import { color, font, radius, size, space } from "@grabient/ui/tokens.ts";

export type Mode = "light" | "dark";
type Rgb = readonly [number, number, number];

function rgbOf(value: string): { rgb: Rgb; alpha: number } {
  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (fn) {
    const [r = 0, g = 0, b = 0, alpha = 1] = fn[1].split(",").map(Number);
    return { rgb: [r, g, b], alpha };
  }
  const n = Number.parseInt(value.slice(1), 16);
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
}
const hexOf = (rgb: Rgb): string =>
  `#${rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const over = (value: string, ground: string): string => {
  const top = rgbOf(value);
  return hexOf(lerp(rgbOf(ground).rgb, top.rgb, top.alpha));
};

/** A color carried part of the way to another. */
export const mix = (from: string, to: string, t: number): string =>
  hexOf(lerp(rgbOf(from).rgb, rgbOf(to).rgb, t));

/** Colors as one ramp, read anywhere from 0 to 1. */
export function ramp(colors: readonly string[]): (t: number) => string {
  const rgb = colors.map(c => rgbOf(c).rgb);
  const last = rgb.length - 1;
  return t => {
    const at = Math.min(1, Math.max(0, t)) * last;
    const i = Math.min(last, Math.floor(at));
    return hexOf(lerp(rgb[i], rgb[Math.min(last, i + 1)], at - i));
  };
}

/** Black or white, whichever reads better on a color, as the site sets a chip's hex. */
export const onColor = (hex: string): string =>
  withBlack(hex) >= withWhite(hex) ? color.light.onLight : color.light.onDark;

/** One scheme's colors, each opaque. */
export interface Scheme {
  /** the page behind the sheet */
  bg: string;
  /** the sheet every word stands on */
  paper: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** the label on an ink button */
  onInk: string;
  /** the sheet's rim */
  edge: string;
  /** the dashed rule and the rim of what stands on the sheet */
  line: string;
  /** a tile on the sheet: the code, a note, a quiet button */
  fill: string;
  shadow: string;
  /** how far a palette's colors reach into the page behind the sheet */
  wash: number;
}

/* The wash is the water behind the site's sign-in sheet, stilled: faint enough that the sheet stays the lightest thing on
   a light page and the brightest on a dark one. */
function scheme(mode: Mode, wash: number): Scheme {
  const c = color[mode];
  return {
    bg: c.bg,
    paper: c.paperSolid,
    ink: c.ink,
    ink2: over(c.ink2, c.paperSolid),
    ink3: over(c.ink3, c.paperSolid),
    onInk: c.onInk,
    edge: over(c.edge, c.bg),
    line: over(c.edge2, c.paperSolid),
    fill: over(c.paper2, c.paperSolid),
    shadow: c.shadowFrost,
    wash
  };
}
export const SCHEMES: Readonly<Record<Mode, Scheme>> = {
  light: scheme("light", 0.3),
  dark: scheme("dark", 0.2)
};

const unquoted = (stack: string) => stack.replaceAll('"', "");
/** Poppins cannot write Vietnamese whole: that language is set in the system stack, as on the site. */
export const FONT = {
  sans: `Poppins, ${unquoted(font.system)}`,
  system: unquoted(font.system),
  mono: unquoted(font.mono)
};

const px = (n: number) => `${n}px`;
/* A type role with its line height in pixels, as Outlook needs it. */
const role = <More extends Record<string, string>>(
  fontSize: number,
  leading: number,
  weight: number,
  more?: More
) => ({
  "font-size": px(fontSize),
  "line-height": px(Math.round(fontSize * leading)),
  "font-weight": weight,
  ...(more as More)
});
export const TYPE = {
  title: role(font.fs7, font.lhTight, font.medium, { "letter-spacing": font.lsTitle }),
  display: role(font.fs6, font.lhTight, font.medium, { "letter-spacing": font.lsTitle }),
  h2: role(font.fs5, font.lhUi, font.bold, { "letter-spacing": font.lsHeading }),
  h3: role(font.fs4, font.lhUi, font.bold),
  body: role(font.fs4, font.lhProse, font.medium),
  lede: role(font.fs4, font.lhUi, font.medium),
  small: role(font.fs2, font.lhUi, font.medium),
  micro: role(font.fs1, font.lhUi, font.bold, {
    "letter-spacing": font.lsMicro,
    "text-transform": "uppercase"
  }),
  mono: role(font.fs2, font.lhUi, font.medium),
  /** the sign-in code: the title's size, in mono */
  code: role(font.fs7, font.lhTight, font.bold, { "letter-spacing": font.lsWide })
};
export type TypeRole = keyof typeof TYPE;

export const SPACE = {
  s1: space.s1,
  s2: space.s2,
  s3: space.s3,
  s4: space.s4,
  s5: space.s5,
  s6: space.s6,
  s8: space.s8,
  s10: space.s10,
  s12: space.s12
} as const;
export type Space = keyof typeof SPACE;
export const RADIUS = { control: radius.control, surface: radius.surface } as const;

/** A newsletter's room for words and pictures: its width less the sheet's padding. */
const WORDS = 2 * size.card - 2 * space.s8;
const CARD = WORDS - space.s4;
export const SIZE = {
  /** an account email: the site's sign-in sheet */
  sheet: size.sheet,
  /** a newsletter: two palette cards wide */
  letter: 2 * size.card,
  button: size.touch,
  /** the pictures an email asks the site for, twice what a desk shows: a palette alone on its row, one beside
      another, and a collection's tile. None holds more pixels than the site's share card. */
  pictures: {
    lead: [2 * WORDS, Math.round((2 * WORDS * 10) / 16)],
    card: [CARD, Math.round((CARD * 3) / 4)],
    tile: [size.card, size.card]
  },
  /** an email's head, the palette it wears with the wordmark on it: twice the sheet's width and a quarter as tall, and
      a newsletter's lead as wide as a share card and a little shorter */
  heads: {
    sheet: [2 * size.sheet, size.sheet / 2],
    letter: [4 * size.card, size.card],
    lead: [4 * size.card, Math.round((4 * size.card * 9) / 20)]
  },
  /** a lead's chips under its head */
  strip: size.stripShort,
  /** the chips on a phone, where the head over them is about three fifths its size at a desk */
  stripNarrow: space.s8,
  hairline: size.hairline,
  /** a chip's hex */
  chip: font.fs0,
  /** a chip's hex on a phone: the smallest that still reads, so eight stand across with room between them */
  chipNarrow: Math.round(font.fs0 * 0.76)
} as const;
export type PictureSize = keyof typeof SIZE.pictures;
export type HeadSize = keyof typeof SIZE.heads;

/** The brand's gradient, the mark's own: what an email wears when it has no palette of its own. */
export const BRAND = MARK_FIXED;
/** The brand's heads, drawn ahead by the site's card painter and served from the site's public files. */
export const HEAD_FILES = {
  sheet: "email/head-sheet.png",
  letter: "email/head-letter.png"
} as const;
/** The id a head goes by when it travels with its email as an inline attachment. */
export const HEAD_CID = "grabient-head";
