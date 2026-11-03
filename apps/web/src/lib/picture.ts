/* A palette's picture as the site paints it: its stops in a view, a soft one's blurred along the style's line
   (engine/soft.ts) and the grain's tile laid over (engine/grain.ts), whose file at each strength the build writes
   (scripts/grain.ts). The stage, the cards and the menu's tiles all paint through here.
   The blur's code loads only where a view is soft (soft-load.ts); a picture drawn before it comes is drawn plain and
   drawn again once it does. What a copy carries is copy-finish.ts's. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { lchToP3, toCssP3 } from "@grabient/engine/color.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import { GRAIN_MAX, type Style } from "@grabient/engine/view.ts";
import type { Drawn } from "./palette.ts";
import { loadSoft, softNow } from "./soft-load.ts";

/** A view's stops as its picture draws them now: a soft one's blurred, in its family's gradient at their places, and
    plain while the blur's code comes (followed, so what reads it is drawn again). */
export function drawn(
  stops: readonly Stop[],
  view: { style: Style; soft?: number | null }
): { stops: readonly Stop[]; style: Style; at?: readonly number[] } {
  if (!view.soft) return { stops, style: view.style, at: undefined };
  const soft = softNow();
  if (!soft) {
    void loadSoft().catch(() => {});
    return { stops, style: view.style, at: undefined };
  }
  return soft.drawnStops(stops, view);
}

/** The grain's tile at a strength, as the build writes it: what a copy carries. */
export const grainSrc = (grain: number): string => `${__GRAIN__}/${grain}.png`;
/** The tile at full strength as a CSS image, which every picture on the site lays over itself at the grain's share
    as its opacity (grainLook): a grain being set changes no file, so none flickers as it comes. */
export const GRAIN_IMAGE = `url("${grainSrc(GRAIN_MAX)}")`;
/** The grain's layer over a picture: the tile and its opacity; none for none. */
export const grainLook = (grain?: number | null): { image: string; opacity: number } | undefined =>
  grain ? { image: GRAIN_IMAGE, opacity: grain / GRAIN_MAX } : undefined;

/** What a picture paints: its colors (hexes, or Display-P3 where the screen shows it), the style they are drawn in, a
    soft view's places for them along the line, and the grain over them, a layer of its own. */
export interface Picture {
  stops: readonly string[];
  style: Style;
  at?: readonly number[];
  grain?: { image: string; opacity: number };
}

/** A view's stops as its picture paints them. */
export function pictureOf(
  stops: readonly Stop[],
  view: { style: Style; soft?: number | null; grain?: number | null },
  wide = false
): Picture {
  const d = drawn(stops, view);
  const grain = grainLook(view.grain);
  return {
    stops: d.stops.map(s => (wide ? toCssP3(lchToP3(...s.lch)) : s.hex)),
    style: d.style,
    ...(d.at ? { at: d.at } : {}),
    ...(grain ? { grain } : {})
  };
}

/** A picture's gradient as one CSS background; the grain stands over it as a layer of its own. */
export const pictureCss = (p: Picture, angle: number): string =>
  gradientCss(p.stops, p.style, angle, undefined, p.at);

/* A list reads the same palettes again and again as its view changes; each card's picture is kept by seed and view,
   the oldest going first. */
const KEPT = 512;
const kept = new Map<string, Picture>();

/** A palette as a card draws it, in a list's view: none for a seed that is no palette. */
export function cardPicture(p: Drawn): Picture {
  /* a soft picture drawn plain while the blur's code came is no keeper */
  const plain = !!p.soft && !softNow();
  const key = `${p.seed}:${p.style}:${p.steps}:${p.soft ?? 0}:${p.grain ?? 0}`;
  let picture = plain ? undefined : kept.get(key);
  if (!picture) {
    const palette = decodePalette(p.seed);
    picture = palette
      ? pictureOf(sampleStops(palette, Math.max(p.steps, palette.anchors.length)), p)
      : { stops: [], style: p.style };
    if (!plain) {
      if (kept.size >= KEPT) kept.delete(kept.keys().next().value!);
      kept.set(key, picture);
    }
  }
  return picture;
}
