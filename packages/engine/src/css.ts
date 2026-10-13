/* A palette as CSS: one gradient writer for the stage, the cards and every export, the four spellings of a color, the
   Display-P3 block and the CSS file. Gradient styles blend their stops and swatch styles draw hard bands; linear and
   angular take the angle and radial ignores it. Only the oklch spelling of a gradient style names an interpolation
   space: the sRGB spellings blend as hex always has, and a band has nothing to blend. */
import { decodePalette } from "./codec.ts";
import { fitChroma, hexBytes, lchToP3, srgbToLch, type Triple, toCssP3 } from "./color.ts";
import { type Stop, sampleStops } from "./curve.ts";
import { clamp01, onWheel } from "./math.ts";
import { isSwatchStyle, type Style, type View } from "./view.ts";

/** The spellings of a color in CSS. OKLCH is the default; hex, rgb() and hsl() are the same sRGB color. */
export type ColorKind = "hex" | "rgb" | "hsl" | "oklch";
export const COLOR_KINDS: readonly (readonly [ColorKind, string])[] = [
  ["hex", "Hex"],
  ["rgb", "RGB"],
  ["hsl", "HSL"],
  ["oklch", "OKLCH"]
];
/** A spelling named from outside (an address's `colors`, a browser's storage): OKLCH unless it names another. */
export const colorKind = (v: unknown): ColorKind =>
  COLOR_KINDS.find(([kind]) => kind === v)?.[0] ?? "oklch";

/* Two decimals of L% and hue: with one, about a fifth of stops land a channel 1/255 off the hex. */
const oklchText = ([L, C, H]: readonly number[]) =>
  `oklch(${(L * 100).toFixed(2)}% ${C.toFixed(4)} ${onWheel(H).toFixed(2)})`;
/** A stop's delivered color read back out of sRGB, so the oklch() text paints the hex's pixels. */
export const oklchOf = (stop: Stop) => oklchText(srgbToLch(stop.rgb));
const tenth = (x: number) => Math.round(x * 10) / 10;
/* hsl() is read from the hex with one decimal each, the fewest that bring every 8-bit color back as itself */
function hslOf(hex: string): string {
  const [r, g, b] = hexBytes(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const h =
    d &&
    60 *
      (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  const s = d && (100 * (max - l)) / Math.min(l, 1 - l);
  return `hsl(${tenth(h) % 360} ${tenth(s)}% ${tenth(l * 100)}%)`;
}
/** A stop's color in a spelling. */
export function spell(kind: ColorKind, stop: Stop): string {
  if (kind === "oklch") return oklchOf(stop);
  if (kind === "rgb") return `rgb(${hexBytes(stop.hex).join(" ")})`;
  return kind === "hsl" ? hslOf(stop.hex) : stop.hex;
}

const percent = (x: number, digits: number) => `${(x * 100).toFixed(digits)}%`;
/** The gradient of these colors (any CSS colors) in a style: blended stops at one decimal of a percent, or hard
    bands at three. `transparent` for no colors. */
export function gradientCss(
  colors: readonly string[],
  style: Style = "linearGradient",
  angle = 90,
  space?: "oklch"
): string {
  const n = colors.length;
  if (!n) return "transparent";
  const list = isSwatchStyle(style)
    ? colors.map((c, i) => `${c} ${percent(i / n, 3)} ${percent((i + 1) / n, 3)}`)
    : colors.map((c, i) => `${c} ${percent(n > 1 ? i / (n - 1) : 0, 1)}`);
  const at = space && !isSwatchStyle(style) ? ` in ${space}` : "";
  const fn = style.startsWith("radial")
    ? `radial-gradient(circle at 50% 50%${at}`
    : style.startsWith("angular")
      ? `conic-gradient(from ${angle}deg${at}`
      : `linear-gradient(${angle}deg${at}`;
  return `${fn}, ${list.join(", ")})`;
}
const declaration = (colors: readonly string[], style: Style, angle: number, kind: ColorKind) =>
  `background: ${gradientCss(colors, style, angle, kind === "oklch" ? "oklch" : undefined)};`;
const spelled = (stops: readonly Stop[], kind: ColorKind) => stops.map(s => spell(kind, s));
/** The one CSS declaration in a spelling. */
export const cssLine = (stops: readonly Stop[], style: Style, angle: number, kind: ColorKind) =>
  declaration(spelled(stops, kind), style, angle, kind);

/* Display-P3. A browser keeps the last declaration it can parse on any screen, so P3 colors stand under
   @media (color-gamut: p3) and the sRGB line comes first. The block is written only where a P3 screen shows some stop
   at least a just-noticeable step more vivid (0.02, the JND of CSS Color 4's gamut mapping); in it each stop sRGB cuts
   takes the chroma P3 keeps at its lightness and hue. Nothing asks the screen: the CSS is the same on every device. */
const JND = 0.02;
function wideOf(stop: Stop): { lch: Triple; gain: number } | null {
  const L = clamp01(stop.lch[0]);
  const [, C, H] = stop.lch;
  const wide = fitChroma(L, C, H, true);
  const narrow = fitChroma(L, C, H, false);
  return wide > narrow ? { lch: [L, wide, H], gain: wide - narrow } : null;
}
/** Whether a P3 screen shows some stop visibly more vivid, so the CSS carries the P3 block. */
export const cssWide = (stops: readonly Stop[]) => stops.some(s => (wideOf(s)?.gain ?? 0) >= JND);
/** The declaration under @media (color-gamut: p3), or null where sRGB shows the palette as vividly. */
export function cssP3(
  stops: readonly Stop[],
  style: Style,
  angle: number,
  kind: ColorKind
): string | null {
  const wide = stops.map(wideOf);
  if (!wide.some(w => (w?.gain ?? 0) >= JND)) return null;
  const colors = stops.map((s, i) => {
    const w = wide[i];
    if (!w) return spell(kind, s);
    return kind === "oklch" ? oklchText(w.lch) : toCssP3(lchToP3(...w.lch));
  });
  return declaration(colors, style, angle, kind);
}
/** The declarations a copy takes: the line and, where wide, the P3 block. */
export function cssBlock(
  stops: readonly Stop[],
  style: Style,
  angle: number,
  kind: ColorKind
): string {
  const line = cssLine(stops, style, angle, kind);
  const p3 = cssP3(stops, style, angle, kind);
  return p3 ? `${line}\n@media (color-gamut: p3) {\n  ${p3}\n}` : line;
}
/** One color a line in a spelling. */
export const colorsText = (kind: ColorKind, stops: readonly Stop[]) =>
  spelled(stops, kind).join("\n");

/** The CSS file: the palette filling a page as it is, the root's rule at least the window's height so a short page
    never tiles it. It lands in other people's code, so only the comment, the palette's address, names the site. */
export function paletteCss(
  stops: readonly Stop[],
  view: Pick<View, "style" | "angle">,
  address: string,
  kind: ColorKind = "oklch"
): string {
  const p3 = cssP3(stops, view.style, view.angle, kind);
  const wide = p3 ? `@media (color-gamut: p3) {\n  html {\n    ${p3}\n  }\n}\n` : "";
  return `/* ${address} */\nhtml {\n  min-height: 100%;\n  ${cssLine(stops, view.style, view.angle, kind)}\n}\n${wide}`;
}

/** A card's background from its seed: the hex gradient at the view; null for a seed that is no palette. */
export function cardBackground(
  seed: string,
  style: Style,
  steps: number,
  angle: number
): string | null {
  const P = decodePalette(seed);
  const hexes = P && sampleStops(P, steps).map(s => s.hex);
  return hexes && gradientCss(hexes, style, angle);
}
