/* What the vector effects (effect.ts's EFFECT_KINDS) give the code that treats them alike:
   their still, the frame at t = 0 drawn as a plain SVG of shapes and gradients with no filter, so a list of them is
   cheap and a page's first paint has it; the name a page gives a still (fxStillKey), which the server paints from the
   head as the glass's and the blob's stills are painted (apps/web server/fx-still.ts); their SVG file, moving where
   it can, their loop, and the colors a card's glow takes.

   A still is the one design drawn in a square and laid over any box as CSS's cover lays it, centered: each kind lays
   its picture out from the box's longer side (ROSETTE_SPAN, SILK_SPAN, PAPERCUT_SPAN, a field effect's span), so the
   square's middle is the box's picture exactly, and the player, laying out the box itself, starts on that frame. The
   field effects (kit/) are one branch of each switch, their definitions read here at once (kit/registry.ts). */
import { svgUrl } from "./css.ts";
import { sampleStops } from "./curve.ts";
import {
  effectGround,
  effectSteps,
  type FxLook,
  fxStillKey,
  isEffect,
  isVectorKind,
  type VectorKind
} from "./effect.ts";
import { isKitKind } from "./kit/kinds.ts";
import { kitEffect } from "./kit/registry.ts";
import { kitFileSvg, kitFrameSvg, kitStillSteps, kitStillSvg } from "./kit/svg.ts";

export { type FxLook, fxStillKey } from "./effect.ts";

import type { Palette } from "./palette.ts";
import { PAPERCUT_LOOP, papercutSceneSteps } from "./papercut.ts";
import {
  papercutFileSvg,
  papercutFrameSvg,
  papercutStillSteps,
  papercutStillSvg
} from "./papercut-svg.ts";
import { rosetteScene } from "./rosette.ts";
import { rosetteFrameSvg, rosetteMovingSvg, rosetteStillSvg } from "./rosette-svg.ts";
import { SILK_LOOP } from "./silk.ts";
import { silkFrameSvg, silkMovingSvg, silkStillSvg } from "./silk-svg.ts";
import { STRINGS_LOOP, stringsScene } from "./strings.ts";
import {
  stringsFileSvg,
  stringsFrameSvg,
  stringsStillSteps,
  stringsStillSvg
} from "./strings-svg.ts";
import type { Size, Style } from "./view.ts";

/** The side of the square a still is drawn in: its numbers are a box's, scaled to cover it. */
export const FX_STILL_SIDE = 1000;
const SQUARE: Size = { width: FX_STILL_SIDE, height: FX_STILL_SIDE };

/** A still's name read back, or null for one no page wrote: its steps, where it names them, those its kind takes at
    any but their designed number (effect.ts effectSteps), and its ground, where it names one, one its kind takes
    (effectGround), as fxStillKey writes them. */
export function readFxStillKey(
  key: string
): { kind: VectorKind; seed: string; look: FxLook } | null {
  const parts = key.split("|");
  if (parts.length < 4 || parts.length > 6) return null;
  const [kind, seed, angle, shape, ...rest] = parts;
  if (!isEffect(kind) || !isVectorKind(kind)) return null;
  if (!/^[\w-]{2,}$/.test(seed)) return null;
  if (!/^\d{1,3}$/.test(angle) || Number(angle) > 360) return null;
  if (shape !== "" && !/^\d{1,3}$/.test(shape)) return null;
  const steps = rest[0] !== undefined && /^\d{1,3}$/.test(rest[0]) ? rest.shift() : undefined;
  const bg = rest.shift();
  if (rest.length || (bg !== undefined && !bg.startsWith("#"))) return null;
  const look = {
    angle: Number(angle),
    shape: shape === "" ? null : Number(shape),
    steps: steps === undefined ? null : effectSteps(kind, steps),
    bg: bg === undefined ? null : effectGround(kind, bg)
  };
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
  if (isKitKind(kind)) return kitStillSvg(kitEffect(kind), P, look, size);
  switch (kind) {
    case "rosette":
      return rosetteStillSvg(rosetteScene(P, look, size));
    case "papercut":
      return papercutStillSvg(P, look, size);
    case "strings":
      return stringsStillSvg(P, look, size);
    case "silk":
      return silkStillSvg(P, look, size);
  }
}

/** A still's SVG as a CSS background covering any box, centered, as the player lays the box out: what a kind's own
    embed script paints its still with (apps/web/src/embed), carrying no other kind's drawing. */
export const fxCover = (svg: string): string => `${svgUrl(svg)} 50% 50% / cover no-repeat`;

/** The still as a CSS background covering any box, centered, as the player lays the box out. */
export const fxStillBackground = (kind: VectorKind, P: Palette, look: FxLook): string =>
  fxCover(fxStillSvg(kind, P, look));

/** The same background drawn a step at a time, each under a millisecond on a desktop: the papercut's levels are found
    and its cuts traced from its field, some 10 ms for a view no still has shown yet (papercut.ts and papercut-svg.ts
    keep them by the view), the strings' threads traced, some 30 ms (strings-svg.ts keeps them by the view), and a
    field effect's levels traced, 25 to 80 ms (kit/svg.ts keeps them by the view), where the silk's and the rosette's
    are written in tenths of one, in one step. A page drawing a list of them gives each frame its share of the steps. */
export function* fxStillSteps(kind: VectorKind, P: Palette, look: FxLook): Generator<void, string> {
  if (isKitKind(kind)) return fxCover(yield* kitStillSteps(kitEffect(kind), P, look));
  switch (kind) {
    case "papercut": {
      const m = yield* papercutSceneSteps(P, look, SQUARE);
      return fxCover(yield* papercutStillSteps(m));
    }
    case "strings":
      return fxCover(yield* stringsStillSteps(stringsScene(P, look, SQUARE)));
    case "silk":
    case "rosette":
      return fxStillBackground(kind, P, look);
  }
}

/** The SVG file of a size at a speed (1 as designed): each moving, 0 its still. The papercut's is its still at any
    speed (John, 3 Nov 2026: "we just dont do animations with svg"): its cuts change shape as it moves, islands
    surfacing and parting, which an SVG follows only by stills fading into each other or outlines morphing, each some
    megabytes; its still is its first frame with its shadows blurred as the CPU draws them, which Figma's importer
    takes as layer blurs. Its shaders, clips and script play it. The strings' and every field effect's are their first
    frame at any speed, as their threads and levels change shape as they move (effect.ts's EFFECT_KINDS). */
export function fxMovingSvg(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  size: Size,
  speed: number
): string {
  if (isKitKind(kind)) return kitFileSvg(kitEffect(kind), P, look, size);
  switch (kind) {
    case "papercut":
      return papercutFileSvg(P, look, size);
    case "strings":
      return stringsFileSvg(P, look, size);
    case "rosette":
      return speed <= 0
        ? fxStillSvg(kind, P, look, size)
        : rosetteMovingSvg(rosetteScene(P, look, size), speed);
    case "silk":
      return speed <= 0 ? fxStillSvg(kind, P, look, size) : silkMovingSvg(P, look, size, speed);
  }
}

/** The frame at t seconds of the loop at speed 1 as a plain SVG of its own, of a size: what any moment of the effect
    is as a vector picture, which effect-conformance.test.ts draws and holds to the CPU's frame at that time. The
    papercut's is its file's drawing then, its shadows blurred as the CPU draws them. */
export function fxFrameSvg(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  size: Size,
  t: number
): string {
  if (isKitKind(kind)) return kitFrameSvg(kitEffect(kind), P, look, size, t);
  switch (kind) {
    case "rosette":
      return rosetteFrameSvg(rosetteScene(P, look, size), t);
    case "papercut":
      return papercutFrameSvg(P, look, size, t);
    case "strings":
      return stringsFrameSvg(P, look, size, t);
    case "silk":
      return silkFrameSvg(P, look, size, t);
  }
}

/** The frame at t as a CSS background covering any box, centered, drawn in the design square as a still is. */
export const fxFrameCss = (kind: VectorKind, P: Palette, look: FxLook, t: number): string =>
  fxCover(fxFrameSvg(kind, P, look, SQUARE, t));

/** Seconds a loop lasts at speed 1: the rosette's by its shape (its rings' period and density), the others' one each. */
export function fxLoop(kind: VectorKind, P: Palette, look: FxLook): number {
  if (isKitKind(kind)) return kitEffect(kind).loop;
  switch (kind) {
    case "rosette":
      return rosetteScene(P, look, SQUARE).design.loop;
    case "papercut":
      return PAPERCUT_LOOP;
    case "strings":
      return STRINGS_LOOP;
    case "silk":
      return SILK_LOOP;
  }
}

/** The glow under a card that plays it: the palette's colors as the effect lays them, along the angle of each but the
    rosette, or out from the rosette's heart as its rings run. */
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
