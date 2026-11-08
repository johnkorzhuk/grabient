/* What a field effect is held to in more than one place, kept here so each holds it alike: the palettes it is looked at
   and checked in, the points, shapes and times its kernel must be finite at (kit/fields.test.ts holds every registered
   effect to them, kit-check.ts a candidate), and how close its levels crowd (kit-look.ts says so under a montage,
   kit-check.ts holds a candidate to it). */
import {
  type KitScene,
  kitFrameAt,
  kitRng,
  kitScene,
  kitTurnX,
  kitTurnY
} from "../src/kit/scene.ts";
import { type FieldEffect, kitFrameSize } from "../src/kit/types.ts";
import type { Palette } from "../src/palette.ts";
import type { Size } from "../src/view.ts";

/** Palettes to look at an effect in: a vivid one, a pastel, a dark one, two colors, a sunset, many hues, near black. */
export const KIT_PALETTES: Readonly<Record<string, string>> = {
  vivid: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  pastel: "kW4ihe8xe522aOLnGjnaI05o",
  dark: "kYNh-6rw818GUvVJB75wwtTjQcvy",
  two: "kQTIPV6CvNg",
  sunset: "kW4j4y3y-8Uy2O-9obqrBo6I",
  many: "ka-QARYTk7tb5PCkQDlVnHG2K-Q7_AFBg",
  black: "kWGAVnGIfA6SOv40FT-SQ_AA"
};

/** The shapes a kernel is finite at: the designed one, small ones, and shapes far past any a reader steps to. */
export const KIT_SHAPES: readonly (number | null)[] = [null, 1, 2, 7, 417, 999, 123456, 2147483647];

/** How far from the middle (D units) the kernel is read anywhere a box shows: a box's corner lies 1/span / 2 along
    its longer side and at most as far along the other, so a square box turned 45 degrees reads it √2 / span / 2 out;
    its shadow's point and its rim's lie their distances farther (kitFrameAt moves them by those); and a frame's SVG
    traces a margin past the box beyond those (trace.ts kitMargin, svg.ts tracedSteps: up to 7 pixels more at 320 by
    180, the smallest box the suites compare the SVG with the CPU at, 0.03 D there and 0.04 turned), held by 0.05 D.
    A square of side 2 D, all the points once read, held spans past 0.71 alone: the demo at span 0.6, a guard real to
    |x| 1.1, passed it and drew 1,640 pixels black at 600 by 600 turned 45 degrees (8 Nov 2026). */
export function kitReach(def: FieldEffect): number {
  const shadow = def.sheets?.shadow?.distance ?? 0;
  const rim = def.sheets?.rim?.distance ?? 0;
  return Math.SQRT2 / def.span / 2 + Math.max(shadow, rim) + 0.05;
}

/* the square of side 2 R about the middle: its lattice takes in both axes and the middle, where a kernel's 1/r would
   fail, and seeded points between */
function points(R: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 96; i++)
    for (let j = 0; j <= 96; j++) out.push(R * (-1 + i / 48), R * (-1 + j / 48));
  const r = kitRng(20261108);
  for (let i = 0; i < 4000; i++) out.push(R * (-1 + 2 * r()), R * (-1 + 2 * r()));
  return out;
}

/** Whether a kernel is finite wherever a box shows it: read at every point of the square its reach spans (kitReach,
    turned boxes and their shadows' points within it), at every shape of KIT_SHAPES and five times of its loop. The
    samples read, those that were not finite, and the first five of them. */
export function kitFinite(
  def: FieldEffect,
  P: Palette
): { samples: number; failed: number; first: string[] } {
  const first: string[] = [];
  let samples = 0;
  let failed = 0;
  const POINTS = points(kitReach(def));
  const at = new Float64Array(kitFrameSize(def));
  for (const shape of KIT_SHAPES) {
    const m = kitScene(def, P, { angle: 90, shape }, { width: 64, height: 64 });
    for (const t of [0, def.loop / 7, def.loop / 3, def.loop / 2, (def.loop * 5) / 6]) {
      kitFrameAt(m, t, at);
      const F = at.subarray(0, def.tracks);
      for (let p = 0; p < POINTS.length; p += 2) {
        const f = def.field(POINTS[p], POINTS[p + 1], m.U, F);
        samples++;
        if (Number.isFinite(f)) continue;
        failed++;
        if (first.length < 5)
          first.push(`shape ${shape}, t ${t}, (${POINTS[p]}, ${POINTS[p + 1]}): ${f}`);
      }
    }
  }
  return { samples, failed, first };
}

/** The most of a frame's pixels whose levels may lie under a pixel apart: past it the CPU's shading and the SVG part
    (the CPU draws the four levels past the one covering a pixel, the SVG every level). */
export const KIT_CROWDED = 0.002;
/** The box crowding is measured in, whatever size a frame is drawn at to look at: the smallest the suites compare an
    SVG with the CPU at, where the levels lie closest in pixels. */
export const KIT_CROWDING_SIZE: Size = { width: 320, height: 180 };

/** How close a frame's levels crowd: the share of its pixels, every other row and column, where the field changes by
    more than its closest levels' step (its sheets' or its lines', as the scene's steps space them: kitScene's
    sheetStep and lineStep) from the pixel to its right or below. A scene in KIT_CROWDING_SIZE is what KIT_CROWDED
    holds. */
export function kitCrowding(def: FieldEffect, m: KitScene, t: number): number {
  const at = new Float64Array(kitFrameSize(def));
  kitFrameAt(m, t, at);
  const F = at.subarray(0, def.tracks);
  const step = Math.min(def.sheets ? m.sheetStep : Infinity, def.lines ? m.lineStep : Infinity);
  if (!Number.isFinite(step)) return 0;
  let crowded = 0;
  let n = 0;
  for (let y = 0; y < m.height; y += 2)
    for (let x = 0; x < m.width; x += 2) {
      const qx = (x + 0.5 - m.width / 2) / m.D;
      const qy = (y + 0.5 - m.height / 2) / m.D;
      const f = def.field(kitTurnX(m, qx, qy), kitTurnY(m, qx, qy), m.U, F);
      const qx1 = qx + 1 / m.D;
      const qy1 = qy + 1 / m.D;
      const gx = def.field(kitTurnX(m, qx1, qy), kitTurnY(m, qx1, qy), m.U, F) - f;
      const gy = def.field(kitTurnX(m, qx, qy1), kitTurnY(m, qx, qy1), m.U, F) - f;
      if (Math.hypot(gx, gy) > step) crowded++;
      n++;
    }
  return crowded / n;
}
