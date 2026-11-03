/* What the vector effects (silk, rosette, papercut: effect.ts's EFFECT_KINDS) give the code that treats them alike:
   their still, the frame at t = 0 drawn as a plain SVG of shapes and gradients with no filter, so a list of them is
   cheap and a page's first paint has it; the name a page gives a still (fxStillKey), which the server paints from the
   head as the glass's and the blob's stills are painted (apps/web server/fx-still.ts); their SVG file, moving where
   it can, their loop, and the colors a card's glow takes.

   A still is the one design drawn in a square and laid over any box as CSS's cover lays it, centered: each kind lays
   its picture out from the box's longer side (ROSETTE_SPAN, SILK_SPAN, PAPERCUT_SPAN), so the square's middle is the
   box's picture exactly, and the player, laying out the box itself, starts on that frame. */
import { svgUrl } from "./css.ts";
import { sampleStops } from "./curve.ts";
import { type FxLook, fxStillKey, type VectorKind } from "./effect.ts";

export { type FxLook, fxStillKey } from "./effect.ts";

import type { Palette } from "./palette.ts";
import { PAPERCUT_LOOP, papercutSceneSteps } from "./papercut.ts";
import { papercutFileSvg, papercutStillSteps, papercutStillSvg } from "./papercut-svg.ts";
import { rosetteScene } from "./rosette.ts";
import { rosetteMovingSvg, rosetteStillSvg } from "./rosette-svg.ts";
import { SILK_LOOP } from "./silk.ts";
import { silkMovingSvg, silkStillSvg } from "./silk-svg.ts";
import type { Size, Style } from "./view.ts";

/** The side of the square a still is drawn in: its numbers are a box's, scaled to cover it. */
export const FX_STILL_SIDE = 1000;
const SQUARE: Size = { width: FX_STILL_SIDE, height: FX_STILL_SIDE };

/** A still's name read back, or null for one no page wrote. */
export function readFxStillKey(
  key: string
): { kind: VectorKind; seed: string; look: FxLook } | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  const [kind, seed, angle, shape] = parts;
  if (kind !== "silk" && kind !== "rosette" && kind !== "papercut") return null;
  if (!/^[\w-]{2,}$/.test(seed)) return null;
  if (!/^\d{1,3}$/.test(angle) || Number(angle) > 360) return null;
  if (shape !== "" && !/^\d{1,3}$/.test(shape)) return null;
  const look = { angle: Number(angle), shape: shape === "" ? null : Number(shape) };
  return fxStillKey(kind, seed, look) === key ? { kind, seed, look } : null;
}

/** The still as an SVG document of a size (the design square unless said): the papercut's with its shadows stepped,
    no blur (papercut-svg.ts). */
export function fxStillSvg(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  size: Size = SQUARE
): string {
  return kind === "rosette"
    ? rosetteStillSvg(rosetteScene(P, look, size))
    : kind === "papercut"
      ? papercutStillSvg(P, look, size)
      : silkStillSvg(P, look, size);
}

/** A still's SVG as a CSS background covering any box, centered, as the player lays the box out: what a kind's own
    embed script paints its still with (apps/web/src/embed), carrying no other kind's drawing. */
export const fxCover = (svg: string): string => `${svgUrl(svg)} 50% 50% / cover no-repeat`;

/** The still as a CSS background covering any box, centered, as the player lays the box out. */
export const fxStillBackground = (kind: VectorKind, P: Palette, look: FxLook): string =>
  fxCover(fxStillSvg(kind, P, look));

/** The same background drawn a step at a time, each under a millisecond on a desktop: the papercut's levels are found
    and its cuts traced from its field, some 10 ms for a view no still has shown yet (papercut.ts and papercut-svg.ts
    keep them by the view), where the silk's and the rosette's are written in tenths of one, in one step. A page
    drawing a list of them gives each frame its share of the steps. */
export function* fxStillSteps(kind: VectorKind, P: Palette, look: FxLook): Generator<void, string> {
  if (kind !== "papercut") return fxStillBackground(kind, P, look);
  const m = yield* papercutSceneSteps(P, look, SQUARE);
  return fxCover(yield* papercutStillSteps(m));
}

/** The SVG file of a size at a speed (1 as designed): the silk and the rosette moving, 0 their still. The papercut's
    is its still at any speed, its shadows blurred as the CPU draws them (a cut's islands surface and part as it moves,
    which no transform of fixed paths follows), which Figma's importer takes as layer blurs. */
export function fxMovingSvg(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  size: Size,
  speed: number
): string {
  if (kind === "papercut") return papercutFileSvg(P, look, size);
  if (speed <= 0) return fxStillSvg(kind, P, look, size);
  return kind === "rosette"
    ? rosetteMovingSvg(rosetteScene(P, look, size), speed)
    : silkMovingSvg(P, look, size, speed);
}

/** Seconds a loop lasts at speed 1: the rosette's by its shape (its rings' period and density), the silk's and the
    papercut's one each. */
export const fxLoop = (kind: VectorKind, P: Palette, look: FxLook): number =>
  kind === "rosette"
    ? rosetteScene(P, look, SQUARE).design.loop
    : kind === "papercut"
      ? PAPERCUT_LOOP
      : SILK_LOOP;

/** The glow under a card that plays it: the palette's colors as the effect lays them, along the silk's and the
    papercut's angle, or out from the rosette's heart as its rings run. */
export function fxGlow(
  kind: VectorKind,
  P: Palette,
  angle: number
): { stops: string[]; style: Style; angle: number } {
  const stops = sampleStops(P, 6).map(s => s.hex);
  return kind === "rosette"
    ? { stops, style: "radialGradient", angle }
    : { stops, style: "linearGradient", angle };
}
