/* A color written any way CSS writes one: hex (#rgb, #rgba, #rrggbb, #rrggbbaa, with or without its #), rgb() and
   rgba(), hsl() and hsla(), hwb(), lab() and lch() (CIE, with D50's white), oklab() and oklch(), color() in the
   predefined spaces, a named color or transparent, in the commas of old or the spaces and slash of new; read as sRGB
   and an alpha, a color outside sRGB clipped into it. A blob's ground is one (effect.ts), and its address keeps the
   hex cssColorHex writes. The numbers are CSS Color 4's own (its sample code's matrices and constants). This module
   loads on demand: the Worker reads it for an address that names a ground in other words than hex, and the editor's
   ground field as it opens. */
import { oklabToLinear, toEncoded, toLinear } from "./color.ts";

/** sRGB, each channel 0 to 1, and its alpha, 0 to 1. */
export interface CssColor {
  rgb: [number, number, number];
  alpha: number;
}

type M3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number]
];
const times = (m: M3, v: readonly number[]): [number, number, number] => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
];

const XYZ_TO_SRGB: M3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]
];
/* Bradford's chromatic adaptation from D50's white to D65's */
const D50_TO_D65: M3 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124]
];
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585] as const;
/* the predefined RGB spaces of color(): linear to XYZ (D65, ProPhoto's D50), and each one's transfer to linear */
const SPACES: Record<string, { matrix: M3 | null; d50?: true; linear: (v: number) => number }> = {
  srgb: { matrix: null, linear: v => Math.sign(v) * toLinear(Math.abs(v)) },
  "srgb-linear": { matrix: null, linear: v => v },
  "display-p3": {
    matrix: [
      [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
      [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
      [0, 0.04511338185890264, 1.043944368900976]
    ],
    linear: v => Math.sign(v) * toLinear(Math.abs(v))
  },
  rec2020: {
    matrix: [
      [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
      [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
      [0, 0.028072693049087428, 1.060985057710791]
    ],
    linear: v => {
      const a = 1.09929682680944;
      const b = 0.018053968510807;
      const x = Math.abs(v);
      return Math.sign(v) * (x < b * 4.5 ? x / 4.5 : ((x + a - 1) / a) ** (1 / 0.45));
    }
  },
  "a98-rgb": {
    matrix: [
      [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
      [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
      [0.02703136138641234, 0.07068885253582723, 0.9913375368376388]
    ],
    linear: v => Math.sign(v) * Math.abs(v) ** (563 / 256)
  },
  "prophoto-rgb": {
    matrix: [
      [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
      [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
      [0, 0, 0.8251046025104601]
    ],
    d50: true,
    linear: v => (Math.abs(v) <= 16 / 512 ? v / 16 : Math.sign(v) * Math.abs(v) ** 1.8)
  },
  xyz: {
    matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    linear: v => v
  },
  "xyz-d65": {
    matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    linear: v => v
  },
  "xyz-d50": {
    matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    d50: true,
    linear: v => v
  }
};

/* the named colors, name and hex in turn */
const NAMED = new Map<string, string>();
const NAMES =
  "aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32".split(
    " "
  );
for (let i = 0; i < NAMES.length; i += 2) NAMED.set(NAMES[i], NAMES[i + 1]);

/** A hex color's digits as sRGB and alpha: 3, 4, 6 or 8 of them, with or without `#`. */
function fromHex(text: string): CssColor | null {
  const digits = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (!digits) return null;
  const full = digits.length < 6 ? digits.replace(/./g, c => c + c) : digits;
  const byte = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return { rgb: [byte(0), byte(2), byte(4)], alpha: full.length === 8 ? byte(6) : 1 };
}

/** One of a function's numbers: a number, a percentage of `whole`, an angle in degrees, or none (0). */
function amount(token: string, whole: number): number | null {
  if (token === "none") return 0;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/.exec(token);
  if (!match) return null;
  const n = Number(match[1]);
  switch (match[2]) {
    case "%":
      return (n / 100) * whole;
    case "rad":
      return (n * 180) / Math.PI;
    case "grad":
      return n * 0.9;
    case "turn":
      return n * 360;
    default:
      return n;
  }
}

const hue = (h: number) => ((h % 360) + 360) % 360;
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
/** CIE Lab with D50's white to linear sRGB. */
function labToLinear(L: number, a: number, b: number): [number, number, number] {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const f1 = (L + 16) / 116;
  const f0 = a / 500 + f1;
  const f2 = f1 - b / 200;
  const xyz = [
    (f0 ** 3 > e ? f0 ** 3 : (116 * f0 - 16) / k) * D50[0],
    (L > k * e ? f1 ** 3 : L / k) * D50[1],
    (f2 ** 3 > e ? f2 ** 3 : (116 * f2 - 16) / k) * D50[2]
  ];
  return times(XYZ_TO_SRGB, times(D50_TO_D65, xyz));
}

/** The color a function writes, from its name and its arguments' text. */
function fromFunction(name: string, args: string): CssColor | null {
  const slash = args.split("/");
  if (slash.length > 2) return null;
  const parts = slash[0]
    .trim()
    .split(/\s*,\s*|\s+/)
    .filter(Boolean);
  let alphaText: string | undefined = slash[1]?.trim();
  let space: string | undefined;
  if (name === "color") space = parts.shift() ?? "";
  /* the old syntax's fourth number is its alpha */
  if (!alphaText && parts.length === 4) alphaText = parts.pop();
  if (parts.length !== 3) return null;
  const alpha = alphaText === undefined ? 1 : amount(alphaText, 1);
  if (alpha === null) return null;
  const n = (i: number, whole: number) => amount(parts[i], whole);
  let linear: [number, number, number] | null = null;
  let rgb: [number, number, number] | null = null;
  switch (name) {
    case "rgb":
    case "rgba": {
      const v = [n(0, 255), n(1, 255), n(2, 255)];
      if (v.some(x => x === null)) return null;
      rgb = v.map(x => (x as number) / 255) as [number, number, number];
      break;
    }
    case "hsl":
    case "hsla": {
      const [h, s, l] = [n(0, 360), n(1, 100), n(2, 100)];
      if (h === null || s === null || l === null) return null;
      rgb = hslToRgb(hue(h), Math.min(1, Math.max(0, s / 100)), Math.min(1, Math.max(0, l / 100)));
      break;
    }
    case "hwb": {
      const [h, w0, b0] = [n(0, 360), n(1, 100), n(2, 100)];
      if (h === null || w0 === null || b0 === null) return null;
      const w = Math.max(0, w0 / 100);
      const b = Math.max(0, b0 / 100);
      if (w + b >= 1) {
        const gray = w / (w + b);
        rgb = [gray, gray, gray];
        break;
      }
      rgb = hslToRgb(hue(h), 1, 0.5).map(c => c * (1 - w - b) + w) as [number, number, number];
      break;
    }
    case "lab":
    case "lch": {
      const L = n(0, 100);
      if (L === null) return null;
      if (name === "lab") {
        const [a, b] = [n(1, 125), n(2, 125)];
        if (a === null || b === null) return null;
        linear = labToLinear(L, a, b);
      } else {
        const [C, h] = [n(1, 150), n(2, 360)];
        if (C === null || h === null) return null;
        const r = (hue(h) * Math.PI) / 180;
        linear = labToLinear(L, C * Math.cos(r), C * Math.sin(r));
      }
      break;
    }
    case "oklab":
    case "oklch": {
      const L = n(0, 1);
      if (L === null) return null;
      if (name === "oklab") {
        const [a, b] = [n(1, 0.4), n(2, 0.4)];
        if (a === null || b === null) return null;
        linear = oklabToLinear(L, a, b);
      } else {
        const [C, h] = [n(1, 0.4), n(2, 360)];
        if (C === null || h === null) return null;
        const r = (hue(h) * Math.PI) / 180;
        linear = oklabToLinear(L, C * Math.cos(r), C * Math.sin(r));
      }
      break;
    }
    case "color": {
      const s = space && SPACES[space];
      if (!s) return null;
      const v = [n(0, 1), n(1, 1), n(2, 1)];
      if (v.some(x => x === null)) return null;
      const lin = (v as number[]).map(s.linear);
      if (!s.matrix) linear = lin as [number, number, number];
      else {
        const xyz = times(s.matrix, lin);
        linear = times(XYZ_TO_SRGB, s.d50 ? times(D50_TO_D65, xyz) : xyz);
      }
      break;
    }
    default:
      return null;
  }
  const encoded =
    rgb ?? (linear as [number, number, number]).map(v => toEncoded(Math.min(1, Math.max(0, v))));
  return {
    rgb: encoded.map(v => Math.min(1, Math.max(0, v))) as [number, number, number],
    alpha: Math.min(1, Math.max(0, alpha))
  };
}

/** A color as CSS writes it, read as sRGB and an alpha; null for text that is no color. Full-width characters read as
    the ones they spell, and case and spaces at either end do not count. */
export function parseCssColor(text: string): CssColor | null {
  const t = text.normalize("NFKC").trim().toLowerCase();
  if (!t) return null;
  if (t === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  const named = NAMED.get(t);
  if (named) return fromHex(named);
  const hex = fromHex(t);
  if (hex) return hex;
  const call = /^([a-z-]+)\(\s*(.*?)\s*\)$/.exec(t);
  return call ? fromFunction(call[1], call[2]) : null;
}

/** A color as the hex an address keeps: `#rrggbb`, or `#rrggbbaa` where it lets some of what is behind it through;
    null for one wholly clear, which is no ground at all. */
export function cssColorHex(color: CssColor): string | null {
  const byte = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  const a = Math.round(color.alpha * 255);
  if (a === 0) return null;
  return `#${color.rgb.map(byte).join("")}${a < 255 ? byte(color.alpha) : ""}`;
}

/** Text as the hex an address keeps, `undefined` for text that is no color, and null for none or a wholly clear one. */
export function cssColorText(text: string): string | null | undefined {
  if (!text.trim()) return null;
  const color = parseCssColor(text);
  return color ? cssColorHex(color) : undefined;
}
