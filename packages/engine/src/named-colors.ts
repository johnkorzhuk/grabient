/* The colors people ask about by name. Every CSS named color stands at the value CSS gives it, the one a web page
   writes; the common names CSS has no word for stand at the precise list's value (color-name-list, see NOTICE). A page
   about one of them, a collection of it or a search for it, shows its codes. */
import { hexToSrgb, srgbToOklab } from "./color.ts";

const CSS_COLORS =
  "alice blue f0f8ff,antique white faebd7,aqua 00ffff,aquamarine 7fffd4,azure f0ffff,beige f5f5dc,bisque ffe4c4," +
  "black 000000,blanched almond ffebcd,blue 0000ff,blue violet 8a2be2,brown a52a2a,burlywood deb887," +
  "cadet blue 5f9ea0,chartreuse 7fff00,chocolate d2691e,coral ff7f50,cornflower blue 6495ed,cornsilk fff8dc," +
  "crimson dc143c,cyan 00ffff,dark blue 00008b,dark cyan 008b8b,dark goldenrod b8860b,dark gray a9a9a9," +
  "dark green 006400,dark grey a9a9a9,dark khaki bdb76b,dark magenta 8b008b,dark olive green 556b2f," +
  "dark orange ff8c00,dark orchid 9932cc,dark red 8b0000,dark salmon e9967a,dark sea green 8fbc8f," +
  "dark slate blue 483d8b,dark slate gray 2f4f4f,dark slate grey 2f4f4f,dark turquoise 00ced1,dark violet 9400d3," +
  "deep pink ff1493,deep sky blue 00bfff,dim gray 696969,dim grey 696969,dodger blue 1e90ff,firebrick b22222," +
  "floral white fffaf0,forest green 228b22,fuchsia ff00ff,gainsboro dcdcdc,ghost white f8f8ff,gold ffd700," +
  "goldenrod daa520,gray 808080,green 008000,green yellow adff2f,grey 808080,honeydew f0fff0,hot pink ff69b4," +
  "indian red cd5c5c,indigo 4b0082,ivory fffff0,khaki f0e68c,lavender e6e6fa,lavender blush fff0f5," +
  "lawn green 7cfc00,lemon chiffon fffacd,light blue add8e6,light coral f08080,light cyan e0ffff," +
  "light goldenrod yellow fafad2,light gray d3d3d3,light green 90ee90,light grey d3d3d3,light pink ffb6c1," +
  "light salmon ffa07a,light sea green 20b2aa,light sky blue 87cefa,light slate gray 778899," +
  "light slate grey 778899,light steel blue b0c4de,light yellow ffffe0,lime 00ff00,lime green 32cd32," +
  "linen faf0e6,magenta ff00ff,maroon 800000,medium aquamarine 66cdaa,medium blue 0000cd,medium orchid ba55d3," +
  "medium purple 9370db,medium sea green 3cb371,medium slate blue 7b68ee,medium spring green 00fa9a," +
  "medium turquoise 48d1cc,medium violet red c71585,midnight blue 191970,mint cream f5fffa,misty rose ffe4e1," +
  "moccasin ffe4b5,navajo white ffdead,navy 000080,old lace fdf5e6,olive 808000,olive drab 6b8e23," +
  "orange ffa500,orange red ff4500,orchid da70d6,pale goldenrod eee8aa,pale green 98fb98,pale turquoise afeeee," +
  "pale violet red db7093,papaya whip ffefd5,peach puff ffdab9,peru cd853f,pink ffc0cb,plum dda0dd," +
  "powder blue b0e0e6,purple 800080,rebecca purple 663399,red ff0000,rosy brown bc8f8f,royal blue 4169e1," +
  "saddle brown 8b4513,salmon fa8072,sandy brown f4a460,sea green 2e8b57,seashell fff5ee,sienna a0522d," +
  "silver c0c0c0,sky blue 87ceeb,slate blue 6a5acd,slate gray 708090,slate grey 708090,snow fffafa," +
  "spring green 00ff7f,steel blue 4682b4,tan d2b48c,teal 008080,thistle d8bfd8,tomato ff6347,turquoise 40e0d0," +
  "violet ee82ee,wheat f5deb3,white ffffff,white smoke f5f5f5,yellow ffff00,yellow green 9acd32";

/* names people search for that CSS has no word for */
const OTHER_COLORS =
  "amber ffbf00,baby blue a2cffe,baby pink ffb7ce,blush f29e8e,bronze a87900,burgundy 900020,butter yellow fffd74," +
  "cerulean 55aaee,champagne e9d2ac,charcoal 343837,cobalt 030aa7,copper b87333,cream ffffc2,emerald 028f1e," +
  "greige b0a999,jade 00a86b,lilac cea2fd,mauve e0b0ff,mint 3eb489,mustard ceb301,ochre cc7722,off white ffffe4," +
  "peach ffb07c,periwinkle 8e82fe,petrol 005f6a,rose ff007f,rose gold b76e79,ruby ca0147,rust a83c09,sage 87ae73," +
  "sand e2ca76,sapphire 0f52ba,scarlet ff2400,slate 516572,taupe b9a281,terracotta cb6843,umber b26400," +
  "vermilion f4320c,wine 80013f";

/* other ways people write a name above */
const ALIASES: Readonly<Record<string, string>> = {
  "navy blue": "navy",
  "olive green": "olive",
  "petrol blue": "petrol",
  "sage green": "sage"
};

/** A color people ask for by name: its name as the lists write it, and its #rrggbb. */
export interface NamedColor {
  readonly name: string;
  readonly hex: string;
}

/* by name without its spaces, so "sky blue" and "skyblue" are one color, read once */
let byName: Map<string, NamedColor> | null = null;
function names(): Map<string, NamedColor> {
  if (byName) return byName;
  byName = new Map();
  for (const entry of `${CSS_COLORS},${OTHER_COLORS}`.split(",")) {
    const at = entry.lastIndexOf(" ");
    const name = entry.slice(0, at);
    byName.set(name.replace(/ /g, ""), { name, hex: `#${entry.slice(at + 1)}` });
  }
  return byName;
}

/** Every named color, CSS's first. */
export const namedColors = (): readonly NamedColor[] => [...names().values()];

/* the words a search or an address writes around a color's name */
const AROUND = /\b(?:colou?rs?|gradients?|palettes?|swatch(?:es)?|hex|codes?)\b/g;

/** Words as they name a color: lowercase, an address's hyphens as spaces, without the words written around a name. */
export const colorWords = (words: string): string =>
  words.toLowerCase().replace(/[-_]+/g, " ").replace(AROUND, " ").replace(/\s+/g, " ").trim();

/** The one color some words name: "burgundy", "Sky blue gradients", an address's "off-white-color-palette". Null for
    anything else, words of a theme or of two colors among them. */
export function namedColor(words: string): NamedColor | null {
  const said = colorWords(words);
  const name = ALIASES[said] ?? said;
  return name ? (names().get(name.replace(/ /g, "")) ?? null) : null;
}

/** A color's codes as CSS writes them. */
export interface ColorCodes {
  readonly hex: string;
  readonly rgb: string;
  readonly hsl: string;
  readonly oklch: string;
}

/** The codes of a #rrggbb color; null for anything else. */
export function colorCodes(hex: string): ColorCodes | null {
  const srgb = hexToSrgb(hex);
  if (!srgb) return null;
  const [r, g, b] = srgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const light = (max + min) / 2;
  const saturation = chroma && chroma / (1 - Math.abs(2 * light - 1));
  const sector = !chroma
    ? 0
    : max === r
      ? (g - b) / chroma
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  const hue = (sector * 60 + 360) % 360;
  const [L, A, B] = srgbToOklab(r, g, b);
  const C = Math.hypot(A, B);
  /* a gray has no hue: CSS writes it as none */
  const H = C < 0.0005 ? "none" : (((Math.atan2(B, A) * 180) / Math.PI + 360) % 360).toFixed(1);
  const byte = (v: number) => Math.round(v * 255);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return {
    hex: `#${hex.replace(/^#/, "").toLowerCase()}`,
    rgb: `rgb(${byte(r)} ${byte(g)} ${byte(b)})`,
    hsl: `hsl(${Math.round(hue) % 360} ${pct(saturation)} ${pct(light)})`,
    oklch: `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H})`
  };
}

/** A color as an answer gives it, its name where it has one and then its codes; null for no color. */
export function colorFacts(
  color: { hex: string; name?: string } | null
): ({ name?: string } & ColorCodes) | null {
  const codes = color && colorCodes(color.hex);
  return codes ? { ...(color.name ? { name: color.name } : {}), ...codes } : null;
}
