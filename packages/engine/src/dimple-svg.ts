/* The dimple as an SVG of plain shapes: its still, its file and its picture with the hollow anywhere are one writer's.
   Two gradients and a circle a disc, no filter. The ground is a gradient about the hollow. Every disc is filled by
   the one gradient `p`, which is the palette itself laid along x in a disc's own space, a whole palette `r / run`
   long, running toward -x: a disc of radius r standing at its place along it holds `run` of the palette each way,
   its later end toward -x. The discs are drawn about the hollow: each circle stands at its place along the gradient,
   and its transform turns it to its direction from the hollow and carries it out to its distance, so its -x side,
   the palette's later end, faces the hollow. Two numbers place a disc, where its place in the picture and its turn
   would take three, and the discs past the palette's reach, more than half of them, stand at one place along the
   gradient and share one circle. A disc at the heart, with less of its run, is an ellipse so much narrower along x,
   widened back to a circle by its transform. The discs are written in the stack's order (dimple.ts), the bottom one
   first, as the CPU paints them.

   It has no loop, so its file is its still at any speed, as an SVG shown as a picture gets no pointer to follow
   (effect-why.ts). As a CSS background at the design square it is 34 KiB as designed and less in every other shape,
   which never has more discs (fx-still.ts's limit for a list's cards is 40), written in under a millisecond. */
import { toHex } from "./color.ts";
import {
  DIMPLE_GROUND_STEPS,
  DIMPLE_LOOK,
  DIMPLE_STOPS,
  type DimpleAt,
  type DimpleScene,
  type DimpleView,
  dimpleDisc,
  dimpleDiscBlank,
  dimpleGround,
  dimpleHollow,
  dimpleScene
} from "./dimple.ts";
import type { Palette } from "./palette.ts";
import { svgNumber } from "./svg-fit.ts";
import type { Size } from "./view.ts";

const n2 = (v: number) => svgNumber(v, 2);
const n4 = (v: number) => svgNumber(v, 4);
const hexAt = (c: readonly number[], o: number) => toHex([c[o], c[o + 1], c[o + 2]]);

const n1 = (v: number) => svgNumber(v, 1);

/** A scene's picture with the hollow at `at` (its rest where none is said), as an SVG document of the scene's size. */
export function dimpleSvgOf(m: DimpleScene, at: DimpleAt = null): string {
  const [cx, cy] = dimpleHollow(m, at);
  const ground = dimpleGround(m, cx, cy);
  const { width: W, height: H } = m;
  /* pixels a whole palette is long in a disc's own space, the gradient's middle at 0 so a disc's place is near */
  const span = m.r / DIMPLE_LOOK.run;
  let groundStops = "";
  for (let k = 0; k <= DIMPLE_GROUND_STEPS; k++)
    groundStops += `<stop offset="${n4(k / DIMPLE_GROUND_STEPS)}" stop-color="${hexAt(ground.c, k * 3)}"/>`;
  let ramp = "";
  for (let i = 0; i < DIMPLE_STOPS; i++)
    ramp += `<stop offset="${svgNumber(i / (DIMPLE_STOPS - 1), 5)}" stop-color="${hexAt(m.stops, i * 3)}"/>`;
  const r = n2(m.r);
  /* a disc's edge is half a pixel wide past its radius */
  const edge = m.r + 1;
  const tenth = (v: number) => Math.round(v * 10) / 10;
  /* where a disc with the palette's place t stands along the gradient, as written */
  const placeOf = (t: number) => tenth((0.5 - t) * span);
  /* the discs past the palette's reach all lie at its far end, less a run: one circle, used by each */
  const far = placeOf(1 - DIMPLE_LOOK.run);
  const disc = dimpleDiscBlank();
  let discs = "";
  for (let n = 0; n < m.places.length; n += 2) {
    dimpleDisc(m, m.places[n], m.places[n + 1], cx, cy, disc);
    if (disc.x < -edge || disc.x > W + edge || disc.y < -edge || disc.y > H + edge) continue;
    /* its direction from the hollow and its distance: its turn, then how far it is carried out from its place
       along the gradient, as written, so its middle lands where it is said to */
    const dx = disc.x - cx;
    const dy = disc.y - cy;
    const turn = n2((Math.atan2(dy, dx) * 180) / Math.PI);
    const d = Math.sqrt(dx * dx + dy * dy);
    const X = placeOf(disc.t);
    const out = n1(d - X);
    if (disc.k < 1)
      discs += `<ellipse cx="${n1(X)}" rx="${n4(m.r * disc.k)}" ry="${r}" transform="rotate(${turn})translate(${n2(d)})scale(${Number((1 / disc.k).toPrecision(6))} 1)translate(${n1(-X)})"/>`;
    else if (X === far) discs += `<use href="#f" transform="rotate(${turn})translate(${out})"/>`;
    else discs += `<circle cx="${n1(X)}" r="${r}" transform="rotate(${turn})translate(${out})"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(ground.far)}">${groundStops}</radialGradient>` +
    `<linearGradient id="p" gradientUnits="userSpaceOnUse" x1="${n2(span / 2)}" x2="${n2(-span / 2)}">${ramp}</linearGradient>` +
    `<circle id="f" cx="${n1(far)}" r="${r}"/></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/><g transform="translate(${n2(cx)} ${n2(cy)})" fill="url(#p)">${discs}</g></svg>`
  );
}

/** The still: the hollow at its rest. */
export const dimpleStillSvg = (P: Palette, view: DimpleView, size: Size): string =>
  dimpleSvgOf(dimpleScene(P, view, size));

/** Its SVG file, its still at any speed. */
export const dimpleFileSvg = dimpleStillSvg;

/** Its picture with the hollow at `at`, in the box's pixels: what any moment of it is as a vector picture. */
export const dimpleFrameSvg = (
  P: Palette,
  view: DimpleView,
  size: Size,
  at: DimpleAt = null
): string => dimpleSvgOf(dimpleScene(P, view, size), at);
