/* Colors written as text, as people copy them from a style sheet, a browser's tools or a design app: every form CSS
   reads a color in (#rgb to #rrggbbaa, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), and color() in each of
   its spaces), with commas or without, the HSB and HSV of design apps, 0x hex, and six hex digits standing alone.
   Each is read as the sRGB hex the site keeps a color as, the one Firefox paints it as (test/fixtures). Its alpha is
   left out. A color outside sRGB keeps its OKLCH lightness and hue while its chroma comes down until it fits, as the
   engine fits every color it draws and as a palette's CSS pairs its P3 colors with sRGB ones; a browser clips it
   instead. The matrices are CSS Color 4's, each composed with XYZ D65 to linear sRGB. */
import { lchToSrgb, linOklab, type Triple, toEncoded, toHex, toLinear } from "./color.ts";
import { clamp, DEG, onWheel } from "./math.ts";

/** A color written in a text: where it starts and ends there, and the #rrggbb it is. */
export interface WrittenColor {
  readonly start: number;
  readonly end: number;
  readonly hex: string;
}

type Matrix = readonly (readonly number[])[];
const XYZ65: Matrix = [
  [3.240969942, -1.537383178, -0.4986107603],
  [-0.9692436363, 1.875967502, 0.04155505741],
  [0.0556300797, -0.2039769589, 1.056971514]
];
const XYZ50: Matrix = [
  [3.134135853, -1.617385998, -0.4906622179],
  [-0.9787954766, 1.916254377, 0.03344287339],
  [0.07195539256, -0.2289767598, 1.405386035]
];
const P3: Matrix = [
  [1.224940176, -0.2249401763, 0],
  [-0.04205695471, 1.042056955, 0],
  [-0.01963755459, -0.07863604555, 1.0982736]
];
/* CIELAB's XYZ relative to D50's white, its columns scaled by that white */
const LAB: Matrix = [
  [3.022233652, -1.617385998, -0.4048476543],
  [-0.9438482462, 1.916254377, 0.02759386876],
  [0.06938627394, -0.2289767598, 1.159590486]
];

const signed = (curve: (v: number) => number) => (v: number) => Math.sign(v) * curve(Math.abs(v));
const srgbCurve = signed(toLinear);
const same = (v: number) => v;
/* color()'s spaces: how each decodes a channel to linear light, and its matrix to linear sRGB */
const SPACES: Readonly<Record<string, readonly [(v: number) => number, Matrix | null]>> = {
  srgb: [srgbCurve, null],
  "srgb-linear": [same, null],
  "display-p3": [srgbCurve, P3],
  "display-p3-linear": [same, P3],
  "a98-rgb": [
    signed(v => v ** (563 / 256)),
    [
      [1.398355744, -0.398355744, 0],
      [0, 1, 0],
      [0, -0.04292898929, 1.042928989]
    ]
  ],
  "prophoto-rgb": [
    signed(v => (v <= 1 / 32 ? v / 16 : v ** 1.8)),
    [
      [2.03438085, -0.7276357899, -0.3067450596],
      [-0.2288257316, 1.231742541, -0.002916809557],
      [-0.008558828784, -0.1532667021, 1.161825531]
    ]
  ],
  rec2020: [
    signed(v =>
      v < 0.081242858 ? v / 4.5 : ((v + 0.09929682680944) / 1.09929682680944) ** (1 / 0.45)
    ),
    [
      [1.660491002, -0.5876411388, -0.07284986332],
      [-0.1245504745, 1.132899897, -0.008349422604],
      [-0.01815076335, -0.100578898, 1.118729661]
    ]
  ],
  xyz: [same, XYZ65],
  "xyz-d65": [same, XYZ65],
  "xyz-d50": [same, XYZ50]
};

const times = (m: Matrix | null, v: Triple): Triple =>
  m ? (m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as Triple) : v;

/** Linear sRGB as its hex: within sRGB as it is, else fitted at its own OKLCH lightness and hue. */
function linearHex(rgb: Triple): string {
  if (rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6)) return toHex(rgb.map(toEncoded));
  const [L, a, b] = linOklab(...rgb);
  return toHex(lchToSrgb(L, Math.hypot(a, b), Math.atan2(b, a) / DEG));
}

/* HSL as sRGB, its hue in degrees and the rest 0 to 1: CSS Color 4's formula, which HWB starts from too */
function hslRgb(h: number, s: number, l: number): Triple {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** One channel as written: its number (the keyword none is 0) and its unit, % or an angle's, empty for none. */
interface Channel {
  readonly n: number;
  readonly unit: string;
}
const ANGLES: Readonly<Record<string, number>> = {
  "": 1,
  deg: 1,
  grad: 0.9,
  rad: 1 / DEG,
  turn: 360
};
/* a channel where 100% stands for `full` */
const value = (c: Channel, full: number) => (c.unit === "%" ? (c.n / 100) * full : c.n);
const percent = (c: Channel) => clamp(c.n, 0, 100) / 100;
const hueOf = (c: Channel) => onWheel(c.n * (ANGLES[c.unit] ?? 0));

/* Which channel of each function is a hue, and the color its three channels make. A hue takes a number or an angle,
   and every other channel a number or a percentage, as CSS takes them: HSL, HWB and HSV read a plain number as a
   percentage. A function not named here is no color. */
const FUNCTIONS: Readonly<Record<string, readonly [number, (c: readonly Channel[]) => string]>> = {
  rgb: [-1, c => toHex(c.map(ch => clamp(value(ch, 255), 0, 255) / 255))],
  hsl: [0, ([h, s, l]) => toHex(hslRgb(hueOf(h), percent(s), percent(l)))],
  hwb: [
    0,
    ([h, w, b]) => {
      const white = percent(w);
      const black = percent(b);
      if (white + black >= 1) return toHex(Array(3).fill(white / (white + black)));
      return toHex(hslRgb(hueOf(h), 1, 0.5).map(v => v * (1 - white - black) + white));
    }
  ],
  hsv: [
    0,
    ([h, s, v]) => {
      const sat = percent(s);
      const bright = percent(v);
      const k = (n: number) => (n + hueOf(h) / 60) % 6;
      return toHex(
        [5, 3, 1].map(n => bright - bright * sat * Math.max(0, Math.min(k(n), 4 - k(n), 1)))
      );
    }
  ],
  lab: [-1, ([l, a, b]) => labHex(value(l, 100), value(a, 125), value(b, 125))],
  lch: [
    2,
    ([l, c, h]) => {
      const chroma = Math.max(0, value(c, 150));
      const hue = hueOf(h) * DEG;
      return labHex(value(l, 100), chroma * Math.cos(hue), chroma * Math.sin(hue));
    }
  ],
  oklab: [
    -1,
    ([l, a, b]) => {
      const A = value(a, 0.4);
      const B = value(b, 0.4);
      return toHex(lchToSrgb(value(l, 1), Math.hypot(A, B), Math.atan2(B, A) / DEG));
    }
  ],
  oklch: [2, ([l, c, h]) => toHex(lchToSrgb(value(l, 1), Math.max(0, value(c, 0.4)), hueOf(h)))]
};

/* CIELAB (D50, as CSS has it) by way of XYZ */
function labHex(L: number, a: number, b: number): string {
  const l = clamp(L, 0, 100);
  const fy = (l + 16) / 116;
  const xyz = (f: number) => (f ** 3 > 216 / 24389 ? f ** 3 : (116 * f - 16) / (24389 / 27));
  return linearHex(
    times(LAB, [xyz(fy + a / 500), l > 8 ? fy ** 3 : l / (24389 / 27), xyz(fy - b / 200)])
  );
}

/* What starts a color: # and 3, 4, 6 or 8 hex digits; a function's name and its opening, written with ( or, for any
   but color(), with a colon or a space before its first number; 0x and 6 or 8 digits (an Android or Flutter color,
   alpha first); or six hex digits alone, which below must hold a digit or spell no word. */
const START =
  /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|(?<![\p{L}\p{N}_-])(?:(rgba?|hsla?|hwba?|hs[bv]a?|oklab|oklch|lab|lch)(?:\s*\(|(?:\s*:\s*|\s+)(?=[\d.+\-−n]))|(color)\s*\(|0x([0-9a-f]{8}|[0-9a-f]{6})(?![\p{L}\p{N}_])|([0-9a-f]{6})(?![\p{L}\p{N}_]))/giu;
/* a channel: what separates it from the one before (a comma, a slash before alpha, or space), its number, its unit */
const CHANNEL =
  /\s*([,/]?)\s*(none|[+\-−]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-−]?\d+)?)(%|deg|grad|rad|turn)?(?![\p{L}\p{N}.%])/iuy;
const SPACE =
  /\s*(srgb-linear|srgb|display-p3-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz-d50|xyz-d65|xyz)(?![\p{L}\p{N}_-])/iuy;
const CLOSE = /\s*(?:\)|$)/y;
/* six hex digits that spell a word, which stay words: a facade is no color */
const WORDS = new Set([
  "accade",
  "accede",
  "acabad",
  "baffed",
  "beaded",
  "bedded",
  "beefed",
  "cabbed",
  "dabbed",
  "decade",
  "deeded",
  "deface",
  "efface",
  "facade"
]);

const hexDigits = (digits: string) => {
  const d = digits.toLowerCase();
  return `#${d.length < 6 ? [...d.slice(0, 3)].map(c => c + c).join("") : d.slice(0, 6)}`;
};

/* The channels after a function's opening, from `at`: three, then an alpha after a slash or a comma (inside
   parentheses, any fourth), then the closing parenthesis, or the text's end, when it opened with one. Null when they
   are not a color's. */
function channels(
  text: string,
  at: number,
  parens: boolean
): { list: Channel[]; end: number } | null {
  const list: Channel[] = [];
  let end = at;
  while (list.length < 4) {
    CHANNEL.lastIndex = end;
    const m = CHANNEL.exec(text);
    if (!m) break;
    const [, sep, number, unit = ""] = m;
    if (list.length === 3 && !parens && !sep) break;
    if (list.length < 3 ? sep === "/" || (!list.length && sep) : unit && unit !== "%") return null;
    const none = number.toLowerCase() === "none";
    list.push({ n: none ? 0 : Number(number.replace(/−/g, "-")), unit: unit.toLowerCase() });
    end = CHANNEL.lastIndex;
  }
  if (list.length < 3) return null;
  if (parens) {
    CLOSE.lastIndex = end;
    if (!CLOSE.test(text)) return null;
    end = CLOSE.lastIndex;
  }
  return { list: list.slice(0, 3), end };
}

/* a function's color, read from the end of its name's opening: color()'s space, then its channels, each of a kind
   CSS takes there */
function functionColor(
  text: string,
  at: number,
  name: string,
  parens: boolean
): { hex: string; end: number } | null {
  if (name === "color") {
    SPACE.lastIndex = at;
    const named = SPACE.exec(text);
    const space = named ? SPACES[named[1].toLowerCase()] : undefined;
    const read = space && channels(text, SPACE.lastIndex, parens);
    if (!space || !read?.list.every(c => !c.unit || c.unit === "%")) return null;
    const [decode, matrix] = space;
    const linear = read.list.map(c => decode(value(c, 1))) as Triple;
    return { hex: linearHex(times(matrix, linear)), end: read.end };
  }
  const fn = FUNCTIONS[name.replace(/a$/, "").replace("hsb", "hsv")];
  const read = fn && channels(text, at, parens);
  if (!fn || !read) return null;
  const [hue, make] = fn;
  const kinds = read.list.every((c, i) => (i === hue ? c.unit !== "%" : !c.unit || c.unit === "%"));
  return kinds ? { hex: make(read.list), end: read.end } : null;
}

/** Every color written in a text, in its order. */
export function colorsIn(text: string): WrittenColor[] {
  const found: WrittenColor[] = [];
  START.lastIndex = 0;
  for (let m = START.exec(text); m; m = START.exec(text)) {
    const [head, hash, name, color, ox, bare] = m;
    const after = m.index + head.length;
    const digits =
      hash ??
      ox?.slice(-6) ??
      (bare && (/\d/.test(bare) || !WORDS.has(bare.toLowerCase())) ? bare : null);
    const read = digits
      ? { hex: hexDigits(digits), end: after }
      : name || color
        ? functionColor(text, after, (name ?? color).toLowerCase(), head.trimEnd().endsWith("("))
        : null;
    if (read) found.push({ start: m.index, ...read });
    START.lastIndex = read?.end ?? after;
  }
  return found;
}

/** One color written alone, spaces around it aside, as #rrggbb: any form above, and here, where nothing else is
    written, hex digits without a # too (fff, c0ffee, facade). Null for anything else. */
export function readColor(text: string): string | null {
  const said = text.trim();
  const digits = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(said)?.[1];
  if (digits) return hexDigits(digits);
  const [only] = colorsIn(said);
  return only && only.start === 0 && only.end === said.length ? only.hex : null;
}
