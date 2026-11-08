/* A field effect's pixel: what every format's shading does, branch for branch (the CPU's render.ts, the player's GLSL,
   the WGSL, the clips' C), and what the SVG's layers come to where a rasterizer lays them (svg.ts): the ground, then
   for each sheet k in turn its shadow, its rim and itself, then the lines.

   A pixel knows the field at its middle (f), how much the field changes a pixel (g, the forward differences to the
   pixel right of it and the one below it: what a pixel's width spans of the field), and the field at the two points
   whose sheets cast the pixel's shadow and its rim (fs, fr: the field a shadow's move and a rim's move back from the
   pixel). A sheet covers a pixel by its edge's distance, (f - level) / g pixels, as a ramp a pixel wide: a box filter
   of a straight edge. The sheets below the highest one covering the pixel whole are hidden under it; the next KIT_EDGE
   are drawn each with its shadow and its rim; past them only shadows can reach the pixel (the sheets are farther than
   a pixel, the rims a pixel or two), the whole ones at once and the last by its cover. A soft shadow is a few layers,
   each the sheet's level raised a little (kitShadowSteps), each at its share of the shadow's alpha. A shadow's color is
   the ink or the sheet below it darkened (kitShadowColor), a rim's white or its sheet's own color lit (kitRimColor). A line is the band within
   `half` of its level, its cover the two edges' difference; the three nearest are drawn. */
import { KIT_EDGE, type KitScene, kitLineColor, kitSheetColor } from "./scene.ts";

/** Whole shadows a pixel takes at most: past sixteen, more darken it by less than a thousandth. */
export const KIT_SHADOWS = 16;
/** A soft shadow's layers at most (ShadowRecipe.steps). */
export const KIT_SHADOW_STEPS = 4;

/** Sheet k's shadow's color into out[0..2]: the ink, or the sheet below it (the ground under the first) darkened. */
export function kitShadowColor(m: KitScene, k: number, out: Float64Array) {
  const S = m.def.sheets;
  const sh = S?.shadow;
  if (!S || !sh || sh.tint !== "below") {
    out[0] = m.shade[0];
    out[1] = m.shade[1];
    out[2] = m.shade[2];
    return;
  }
  if (k - 1 >= 0 || S.count === null) kitSheetColor(m, k - 1, out);
  else {
    out[0] = m.ground[0];
    out[1] = m.ground[1];
    out[2] = m.ground[2];
  }
  const d = sh.depth ?? 0.55;
  out[0] *= d;
  out[1] *= d;
  out[2] *= d;
}

/** Sheet k's rim's color into out[0..2]: white, or the sheet's own color lifted toward white. */
export function kitRimColor(m: KitScene, k: number, out: Float64Array) {
  const rim = m.def.sheets?.rim;
  if (rim?.tint !== "own") {
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    return;
  }
  kitSheetColor(m, k, out);
  const l = rim.lift ?? 0.4;
  out[0] += (1 - out[0]) * l;
  out[1] += (1 - out[1]) * l;
  out[2] += (1 - out[2]) * l;
}

/** A shadow's layers, and the rise from one to the next, in the field's units: its spread a share of the sheets' step
    as the view's steps space them (kitScene's sheetStep), the recipe's own `step` where it is given (kit/gl.ts's
    constants, for an effect the view's steps leave alone). */
export function kitShadowSteps(m: Pick<KitScene, "def"> & Partial<Pick<KitScene, "sheetStep">>): {
  steps: number;
  rise: number;
} {
  const S = m.def.sheets;
  const sh = S?.shadow;
  if (!S || !sh) return { steps: 0, rise: 0 };
  const steps = Math.min(KIT_SHADOW_STEPS, Math.max(1, Math.floor(sh.steps ?? 1)));
  const step = m.sheetStep ?? S.step;
  return { steps, rise: steps > 1 ? ((sh.spread ?? 0) * step) / (steps - 1) : 0 };
}

/** How much of a pixel lies where the field is at least `level`. */
export const kitCover = (f: number, level: number, g: number): number =>
  Math.min(1, Math.max(0, 0.5 + (f - level) / g));

/** The shading's scratch: a color, read and mixed into. */
export const kitScratch = (): Float64Array => new Float64Array(3);

/** The pixel's color into out[0..2], 0..1: f the field at its middle, g its change a pixel (at least 1e-9), fs and fr
    the field where the shadow and the rim come from (f where the effect has neither). */
export function kitShade(
  m: KitScene,
  f: number,
  g: number,
  fs: number,
  fr: number,
  c: Float64Array,
  out: Float64Array
) {
  const def = m.def;
  const S = def.sheets;
  out[0] = m.ground[0];
  out[1] = m.ground[1];
  out[2] = m.ground[2];
  if (S) {
    const half = 0.5 * g;
    const top = S.count === null ? Infinity : S.count - 1;
    /* the highest sheet that covers the pixel whole, -1 where none does */
    const step = m.sheetStep;
    let k0 = Math.floor((f - half - S.base) / step);
    if (S.count !== null) k0 = Math.min(top, Math.max(-1, k0));
    if (k0 >= 0 || S.count === null) kitSheetColor(m, k0, out);
    const sh = S.shadow;
    const rim = S.rim;
    const { steps, rise } = kitShadowSteps(m);
    /* each of a shadow's layers takes its share of the shadow's alpha */
    const share = sh ? sh.alpha / steps : 0;
    for (let i = 1; i <= KIT_EDGE; i++) {
      const k = k0 + i;
      if (k > top) break;
      const level = S.base + k * step;
      if (sh) {
        kitShadowColor(m, k, c);
        for (let s = 0; s < steps; s++) {
          const a = share * kitCover(fs, level + s * rise, g);
          out[0] += (c[0] - out[0]) * a;
          out[1] += (c[1] - out[1]) * a;
          out[2] += (c[2] - out[2]) * a;
        }
      }
      if (rim) {
        const a = rim.alpha * kitCover(fr, level, g);
        if (a > 0) {
          kitRimColor(m, k, c);
          out[0] += (c[0] - out[0]) * a;
          out[1] += (c[1] - out[1]) * a;
          out[2] += (c[2] - out[2]) * a;
        }
      }
      const a = kitCover(f, level, g);
      if (a > 0) {
        kitSheetColor(m, k, c);
        out[0] += (c[0] - out[0]) * a;
        out[1] += (c[1] - out[1]) * a;
        out[2] += (c[2] - out[2]) * a;
      }
    }
    /* the shadows of the sheets past those: the ones whose every layer covers the pixel whole at once, then the
       last two or three by their layers' covers */
    if (sh) {
      const from = k0 + KIT_EDGE + 1;
      const k1 = Math.min(top, Math.floor((fs + half - S.base) / step));
      if (k1 >= from) {
        const whole = Math.min(k1, Math.floor((fs - half - (steps - 1) * rise - S.base) / step));
        const n = whole - from + 1;
        if (n > 0) {
          /* each whole shadow keeps (1 - share)^steps of what lies under it: multiplied out, at most KIT_SHADOWS of
             them, so every format multiplies the same numbers in the same order */
          let one = 1;
          for (let s = 0; s < KIT_SHADOW_STEPS; s++) if (s < steps) one *= 1 - share;
          if (sh.tint === "below") {
            /* each its own color, the sheet below it darkened, in turn: the last KIT_SHADOWS of them, the topmost,
               whose cover leaves the rest under a thousandth */
            const start = Math.max(from, whole - KIT_SHADOWS + 1);
            for (let i = 0; i < KIT_SHADOWS; i++) {
              const k = start + i;
              if (k > whole) break;
              kitShadowColor(m, k, c);
              out[0] = c[0] + (out[0] - c[0]) * one;
              out[1] = c[1] + (out[1] - c[1]) * one;
              out[2] = c[2] + (out[2] - c[2]) * one;
            }
          } else {
            let keep = 1;
            for (let i = 0; i < KIT_SHADOWS; i++) if (i < n) keep *= one;
            out[0] = m.shade[0] + (out[0] - m.shade[0]) * keep;
            out[1] = m.shade[1] + (out[1] - m.shade[1]) * keep;
            out[2] = m.shade[2] + (out[2] - m.shade[2]) * keep;
          }
        }
        /* the shadows that cover part of the pixel: two at most while the sheets lie half a pixel apart or more, and
           one more where a soft shadow's layers reach past them */
        const k2 = Math.max(from, whole + 1);
        const partial = steps > 1 ? 3 : 2;
        for (let i = 0; i < partial; i++) {
          const k = k2 + i;
          if (k > k1) break;
          const level = S.base + k * step;
          kitShadowColor(m, k, c);
          for (let s = 0; s < steps; s++) {
            const a = share * kitCover(fs, level + s * rise, g);
            out[0] += (c[0] - out[0]) * a;
            out[1] += (c[1] - out[1]) * a;
            out[2] += (c[2] - out[2]) * a;
          }
        }
      }
    }
  }
  const L = def.lines;
  if (L) {
    /* the nearest line and one either side, counted from it, so a field past 2^53 or infinite ends the loop too (a
       kernel is finite wherever a box shows it: kit/fields.test.ts) */
    const j1 = Math.floor((f - L.base) / m.lineStep + 0.5);
    for (let i = -1; i <= 1; i++) {
      const j = j1 + i;
      const level = L.base + j * m.lineStep;
      const a = L.alpha * (kitCover(f, level - L.half, g) - kitCover(f, level + L.half, g));
      if (a > 0) {
        kitLineColor(m, j, c);
        out[0] += (c[0] - out[0]) * a;
        out[1] += (c[1] - out[1]) * a;
        out[2] += (c[2] - out[2]) * a;
      }
    }
  }
}
