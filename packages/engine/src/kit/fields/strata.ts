/* Sandstone (style=strata): a slot canyon's wall seen up close, the palette laid down as its strata, plain bands of
   its colors meeting edge to edge, swept round two swirls. The swirls drift across the card on slow arcs, tightening
   and easing as they go, and a broad shear sways the whole sweep, so the composition slowly changes shape over the
   loop while the bands breathe through it. Each shape is its own sweep; the view's steps set how dense its bands are,
   8 to 40, 28 as designed (FieldEffect.steps).

   John's calls (8 Nov 2026), from round two's sandstone, whose long shadows stacked where the layers bunched: "i dont
   like how the overlapping layers has dark area where it overlaps", then of short shadows and rims, "i dont like how
   there looks like each band is outlined"; of plain bands that only slid through themselves, "i want the curves shape
   to change ... the overall shape of the shader should slowly changes"; "lets go plain bands"; "lets make shape
   include how dense the bands are as well as the actual shape", then of the density each shape drew, "what if we moved
   the density to steps, this style can have steps. i think there needs to be a larger min for this one though".

   The field is the strata's height, a ramp up the box read where two vortices have curled the plane and a broad shear
   has swept it (an exact rotation and a slide, so the layers keep their order and no level closes on itself), through
   a staircase: s plus (lam / pi) atan(r sin b / (1 - r cos b)), the sawtooth's smooth form, so each bed is a broad
   face and then a ledge where its bands bunch. The view's steps space its levels (kit/scene.ts kitScene): at n steps
   they lie 28 / n times the design's step apart and each takes the palette 28 / n times as far, so the sweep across a
   box stays and only the bands narrow or widen, where a shape's density scaled the field and a sparse shape showed one
   end of the palette.

   Measured 8 Nov 2026: the kernel's cost 151 of 160 (compile.ts); kitRender 240 to 390 ns a pixel (a 1200 by 630
   card 0.18 to 0.29 s); the GPU pass 0.34 to 0.40 ms a frame at 3840 by 2160 on an RTX 2080 Ti (round five's plain
   bands, the same pass); the still as CSS 13.3 to 15.6 KiB at its 28 steps over seven palettes and three looks, 4.0
   to 4.5 at 8, 19.1 to 22.2 at 40 (at 48 its ledges crowded 0.59% of a frame at 320 by 180, past kit-check's 0.2%, and
   past 40 the bands blur into a smooth gradient, a look John turned down: W/kit/rejected); the frame SVG at 280
   moments across the loop, an even half second and 40 at random, three looks, within a mean of 0.018 and a p99 of
   0.17 of the GPU's frame at that moment (the frame half a second on 0.42 to 0.68 and about 3; W/kit/tools/svg-sweep,
   at its designed density); kit-check.ts passes every check in all seven palettes, crowding and the still at 40 steps
   and the motion at 8 among them. */
import { kitRng, kitRound } from "../scene.ts";
import type { FieldEffect, KernelU, Track } from "../types.ts";

const VORTICES = 2;
/** the seed shape 0 draws (see designedSeed below) */
const DESIGNED_SEED = 1002;

/** The field (kernel subset). U.shear: its direction, wavenumber and depth; U.vortex, seven a vortex: its middle, the
    tangent of its half turn and that tangent's swing, 1 / sigma^2, and its middle's drift across and down; U.bed: the
    ramp's direction, the staircase's lam / pi, wavenumber and phase, and its sharpness r. F[0] the shear's phase, F[1]
    and F[2] the vortices', F[3] the beds'. */
export function strataField(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {
  const w = Math.sin(U.shear[2] * (U.shear[0] * x + U.shear[1] * y) + F[0]) * U.shear[3];
  let px = x - U.shear[1] * w;
  let py = y + U.shear[0] * w;
  for (let i = 0; i < VORTICES; i++) {
    /* the vortex's middle drifts along an arc as its phase swings, so the curls travel and the whole sweep changes */
    const sn = Math.sin(F[1 + i]);
    const cx = U.vortex[7 * i] + U.vortex[7 * i + 5] * Math.cos(F[1 + i]);
    const cy = U.vortex[7 * i + 1] + U.vortex[7 * i + 6] * sn;
    const vx = px - cx;
    const vy = py - cy;
    /* the half turn's tangent falls off as 1 / (1 + r^2 / sigma^2); its cosine and sine from it, an exact rotation
       without trigonometry */
    const t =
      (U.vortex[7 * i + 2] + U.vortex[7 * i + 3] * sn) /
      (1 + (vx * vx + vy * vy) * U.vortex[7 * i + 4]);
    const t2 = t * t;
    const n = 1 / (1 + t2);
    const c = (1 - t2) * n;
    const s = 2 * t * n;
    px = cx + c * vx - s * vy;
    py = cy + s * vx + c * vy;
  }
  /* across the beds and along them */
  const s = U.bed[0] * px + U.bed[1] * py;
  const r = U.bed[5];
  const b = U.bed[3] * s + U.bed[4] + F[1 + VORTICES];
  return s + U.bed[2] * Math.atan2(r * Math.sin(b), 1 - r * Math.cos(b));
}

const TAU = Math.PI * 2;
/** A layer's thickness, D, at the designed 28 steps: 7.9 px at a list's 320 where the ramp runs at its own pace, 28 / n
    times that at n steps (the view's). At 0.03 its ledges crowded (0.58% of a frame at 320 by 180). */
const STEP = 0.033;

export function strataDesign(seed: number) {
  const r = kitRng(seed);
  const tracks: Track[] = [];
  /* the broad shear: a wave 1.6 to 2.5 D long, sliding the plane 0.07 to 0.18 D, swaying 1.1 radians once a loop, so
     the sweep between the swirls changes (0.3 left the composition still while its bands moved) */
  const turn = r() * TAU;
  const k = 2.5 + r() * 1.5;
  const shear = [Math.cos(turn), Math.sin(turn), k, (0.3 + r() * 0.15) / k];
  tracks.push({ rest: kitRound(r() * TAU), swing: 1.1, cycles: 1, psi: kitRound(r() * TAU) });
  /* two vortices turning opposite ways within 0.3 D of the middle, 2.6 to 3.2 radians at the heart, sigma 0.25 to
     0.35 D: the curls (1.6 to 2.4 radians drew waves, not carved forms) */
  const vortex: number[] = [];
  const spin = r() < 0.5 ? -1 : 1;
  for (let i = 0; i < VORTICES; i++) {
    const a = r() * TAU;
    const rad = 0.3 * Math.sqrt(r());
    const th = (2.6 + r() * 0.6) * (i === 0 ? spin : -spin);
    const sig = 0.25 + r() * 0.1;
    const half = Math.tan(th / 2);
    /* its middle drifts 0.08 to 0.14 D each way along an arc as its phase swings three quarters of a turn each way,
       once a loop, and it tightens and eases by a fifth: the curls travel and the sweep between them changes */
    const dx = (0.08 + r() * 0.06) * (r() < 0.5 ? -1 : 1);
    const dy = (0.08 + r() * 0.06) * (r() < 0.5 ? -1 : 1);
    vortex.push(
      rad * Math.cos(a),
      rad * Math.sin(a) * 0.6,
      half,
      half * 0.2,
      1 / (sig * sig),
      dx,
      dy
    );
    tracks.push({
      rest: kitRound(r() * TAU),
      swing: kitRound(0.75 * Math.PI),
      cycles: 1,
      psi: kitRound(r() * TAU)
    });
  }
  /* the beds: the ramp up the box within 20 degrees of upright, a bed every 0.255 to 0.345 D, their ledges' sharpness
     0.38 (0.6 crowded 0.77% of a frame at 320 by 180); they breathe 0.6 radians every 20 s, the bands moving through
     the sweep as it changes */
  const ta = ((20 * Math.PI) / 180) * (r() * 2 - 1);
  const lam = 0.3 * (0.85 + 0.3 * r());
  const bed = [Math.sin(ta), -Math.cos(ta), lam / Math.PI, TAU / lam, r() * TAU, 0.38];
  tracks.push({ rest: 0, swing: 0.6, cycles: 6, psi: kitRound(r() * TAU) });
  return {
    U: { shear: shear.map(kitRound), vortex: vortex.map(kitRound), bed: bed.map(kitRound) },
    tracks
  };
}

export const strata: FieldEffect = {
  kind: "strata",
  about: {
    shows:
      "its colors as the swept strata of a sandstone wall, plain bands meeting edge to edge round two slow swirls",
    video:
      "A looping video of a Grabient palette: the strata of a sandstone wall in its colors, swept round two swirls that drift and reshape the sweep as the bands breathe.",
    describe:
      "{name} played as sandstone: the palette {colors} laid down as the strata of a slot canyon's wall, plain bands meeting edge to edge, swept round two swirls that drift across it, tightening and easing, so the whole sweep slowly changes shape as the bands breathe through it.",
    what: "the sandstone, the palette as the strata of a slot canyon's wall swept round two drifting swirls"
  },
  loop: 120,
  span: 0.75,
  /* of 1000 to 1023 (sunset, vivid, pastel and dark): one great diagonal sweep of strata from the lower left to the
     upper right, the palette's two ends at the two corners, which reads as a wall of the canyon in every palette;
     1012 curls the same sweep into a hook at the right, 1015 and 1017 stand a band upright, 1000 and 1006 sit in one
     end of the palette, 1001 and 1009 are plain waves */
  designedSeed: DESIGNED_SEED,
  uniforms: { shear: 4, vortex: 7 * VORTICES, bed: 6 },
  tracks: 2 + VORTICES,
  design: strataDesign,
  field: strataField,
  /* never shown: the layers run on (count null) */
  ground: { pick: "darkest", lightness: 0.5, bound: 0.2, chroma: 0.7, lift: 0 },
  /* the view's steps, how many bands a sweep of the palette spans: 28 the look approved on 8 Nov 2026, the sheets' step
     and hop below; 8 the fewest, as John asked ("there needs to be a larger min for this one"), 40 the most, past
     which the bands blur into a smooth gradient, a look he turned down (W/kit/rejected) */
  steps: { least: 8, most: 40, designed: 28 },
  sheets: {
    base: 0,
    step: STEP,
    count: null,
    /* the palette's middle at the wall's middle, a thirtieth of it a layer, there and back: a 16:9 card shows it end
       to end across its 30 to 50 layers (from its start, offset 0, a card showed only its first half, a near-black
       palette all dark) */
    colors: { hop: 0.035, offset: 0.5, wrap: "mirror" },
    /* no shadow and no rim: either drew a line along every band's edge, and long shadows stacked into dark turns
       where the bands bunch (the head); plain bands are also the cheapest to draw in every form */
    shadow: null,
    rim: null
  },
  lines: null,
  /* its clips' weight (test/kit-weight.ts, 8 Nov 2026, on a clips' module built with this kernel, the machine quiet,
     its load 0.5 to 0.7): its frames measured 17.7 to 21.2 against a pixel of the glass's longest clip over four runs
     at its designed steps (the median 19.9 to 20.0), in wide, tall and square clips at 60 and 30 frames a second and
     three palettes, and 17.9 to 20.8 at 40 steps and 18.2 to 20.2 at 8, where kitVideoWeight counts its kernel's
     costliest path, 28.6: plain bands read the kernel once a pixel, with no shadow's or rim's read, at any steps */
  clipWeight: { weight: 22, cost: 151 }
};

export default strata;
