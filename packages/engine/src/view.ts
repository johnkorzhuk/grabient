/* The view: how a palette is drawn, which is no part of its identity. Style, steps, angle and the size of a picture,
   their bounds and defaults, and the address that carries them, defaults left out so the shortest address is the
   canonical one. */
import { clamp } from "./math.ts";
import { type Language, msg } from "./message.ts";
import type { Palette } from "./palette.ts";

export const STYLES = [
  "linearGradient",
  "linearSwatches",
  "angularGradient",
  "angularSwatches",
  "radialGradient",
  "radialSwatches"
] as const;
export type Style = (typeof STYLES)[number];
/** A list may leave the style to each palette. */
export type StyleChoice = Style | "auto";
export const isStyle = (v: unknown): v is Style => STYLES.includes(v as Style);
/** Swatch styles draw hard bands, rings or wedges; gradient styles blend. */
export const isSwatchStyle = (style: Style) => style.endsWith("Swatches");
export const STYLE_LABELS: Readonly<Record<Style, string>> = {
  linearGradient: msg("Linear"),
  linearSwatches: msg("Linear bands"),
  angularGradient: msg("Angular"),
  angularSwatches: msg("Angular bands"),
  radialGradient: msg("Radial"),
  radialSwatches: msg("Radial bands")
};
export const styleLabel = (choice: StyleChoice, language: Language) =>
  language.t(choice === "auto" ? msg("As saved") : STYLE_LABELS[choice]);
/** A style as a sentence says it: "linear gradient". */
export const styleWords = (style: Style) => style.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/* Three is the fewest stops that draw a curve: two show its ends and nothing between them. */
export const STEPS_MIN = 3;
export const STEPS_MAX = 100;
export const DEFAULT_STYLE: Style = "linearGradient";
export const DEFAULT_STEPS = 7;
export const DEFAULT_ANGLE = 90;

/** A picture's pixels. */
export interface Size {
  width: number;
  height: number;
}
/** A size the reader set. An auto side follows the other at the auto size's shape; both auto is no size (null). */
export interface SizeChoice {
  width: number | "auto";
  height: number | "auto";
}
export const SIZE_MIN = 40;
export const SIZE_MAX = 6000;
export const DEFAULT_SIZE: Size = { width: 800, height: 400 };

export interface View {
  style: Style;
  steps: number;
  angle: number;
  size?: SizeChoice | null;
}

/** `WxH` with 2 to 4 digits a side, 40 to 6000, either side `auto` (not both); null for anything else. */
export function parseSize(raw: string | null | undefined): SizeChoice | null {
  const match = raw?.match(/^(\d{2,4}|auto)x(\d{2,4}|auto)$/);
  if (!match) return null;
  const side = (s: string) => (s === "auto" ? "auto" : Number(s));
  const width = side(match[1]);
  const height = side(match[2]);
  const fits = (v: number | "auto") => v === "auto" || (v >= SIZE_MIN && v <= SIZE_MAX);
  return fits(width) && fits(height) && !(width === "auto" && height === "auto")
    ? { width, height }
    : null;
}
export const sizeParam = (size: SizeChoice | null | undefined): string | null =>
  size && !(size.width === "auto" && size.height === "auto")
    ? `${size.width}x${size.height}`
    : null;
export const isFixedSize = (size: SizeChoice | null | undefined): size is Size =>
  !!size && size.width !== "auto" && size.height !== "auto";
const bound = (v: number) => clamp(Math.round(v), SIZE_MIN, SIZE_MAX);
/** A size as a control writes it: each side rounded into bounds, an auto side kept, a side that is no number the
    default size's. */
export function clampSize(size: SizeChoice): SizeChoice {
  const side = (v: number | "auto", fallback: number) =>
    v === "auto" ? v : Number.isFinite(v) ? bound(v) : fallback;
  return {
    width: side(size.width, DEFAULT_SIZE.width),
    height: side(size.height, DEFAULT_SIZE.height)
  };
}
/** The pixels a size comes to. No size is the auto size; one auto side takes the other's length at its shape. */
export function resolveSize(choice: SizeChoice | null | undefined, auto: Size): Size {
  const w = choice?.width ?? "auto";
  const h = choice?.height ?? "auto";
  if (w === "auto" && h === "auto") return { width: auto.width, height: auto.height };
  const ratio = auto.width / Math.max(1, auto.height);
  if (w === "auto") return { width: bound((h as number) * ratio), height: h as number };
  if (h === "auto") return { width: w, height: bound(w / ratio) };
  return { width: w, height: h };
}

/** What a view is read from: an address's URLSearchParams, or anything that answers `get` the same way. */
export interface ParamReader {
  get(name: string): string | null;
}
const integer = (v: string | null, min: number, max: number) => {
  if (v == null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};
/** The view an address names: what is missing or out of bounds takes the default, and a count of steps under three
    (as few as the palette allows) is raised to three. */
export function parseView(params: ParamReader): View {
  const style = params.get("style");
  const steps = integer(params.get("steps"), 1, STEPS_MAX);
  const size = parseSize(params.get("size"));
  return {
    style: isStyle(style) ? style : DEFAULT_STYLE,
    steps: steps == null ? DEFAULT_STEPS : Math.max(steps, STEPS_MIN),
    angle: integer(params.get("angle"), 0, 360) ?? DEFAULT_ANGLE,
    ...(size ? { size } : {})
  };
}
/** The view's query: style, steps, angle and size in that order, defaults left out, then `extra` (raw parts an
    address adds after the view, empty ones dropped). Every value is URL-safe as it is. */
export function viewSearch(view: View, extra: readonly string[] = []): string {
  const size = sizeParam(view.size);
  const parts = [
    view.style !== DEFAULT_STYLE && `style=${view.style}`,
    view.steps !== DEFAULT_STEPS && `steps=${view.steps}`,
    view.angle !== DEFAULT_ANGLE && `angle=${view.angle}`,
    size && `size=${size}`,
    ...extra
  ].filter(Boolean);
  return parts.length ? `?${parts.join("&")}` : "";
}
/** The view a palette's files are drawn in: style, steps and angle read as an address reads them, steps never under
    the palette's keyframes. */
export function drawnView(P: Palette, input: Partial<View> = {}): View {
  const given = (key: string) =>
    key === "style" || key === "steps" || key === "angle" ? input[key] : undefined;
  const { style, steps, angle } = parseView({ get: key => given(key)?.toString() ?? null });
  return { style, steps: Math.max(steps, P.anchors.length), angle };
}
/** Whether a palette is drawn in the view it was saved in: the same style, steps and angle, each read as its drawing
    reads it. The words written for a palette describe it in that view alone. */
export function asSaved(P: Palette, view: Partial<View>, saved: Partial<View>): boolean {
  const a = drawnView(P, view);
  const b = drawnView(P, saved);
  return a.style === b.style && a.steps === b.steps && a.angle === b.angle;
}
/** A list's view over a palette's own: each of style, steps and angle unless the list leaves it `auto`. */
export function effectiveView(
  own: Pick<View, "style" | "steps" | "angle">,
  list: { style: StyleChoice; steps: number | "auto"; angle: number | "auto" }
): Pick<View, "style" | "steps" | "angle"> {
  return {
    style: list.style === "auto" ? own.style : list.style,
    steps: clamp(Math.round(list.steps === "auto" ? own.steps : list.steps), STEPS_MIN, STEPS_MAX),
    angle: list.angle === "auto" ? own.angle : list.angle
  };
}
