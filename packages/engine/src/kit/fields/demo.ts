/* The kit's own example, never an effect of the site: a ramp along the angle bent by five waves where two shears have
   stirred the plane, cut into twelve sheets with shadows and rims, and lines between their cuts. The kit's tests draw
   it in every format, and a new effect starts from a copy of it. */
import { kitRng, kitRound } from "../scene.ts";
import type { FieldEffect, KernelU, Track } from "../types.ts";

const SHEARS = 2;
const WAVES = 5;

/** The field: the plane stirred by the shears (each slides it across its own direction by a sine along it), then a
    ramp along x and the waves there. In the kernel subset (kit/README.md). */
export function demoField(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {
  let px = x;
  let py = y;
  for (let i = 0; i < SHEARS; i++) {
    const dx = U.shear[4 * i];
    const dy = U.shear[4 * i + 1];
    const s = Math.sin(U.shear[4 * i + 2] * (dx * px + dy * py) + F[i]) * U.shear[4 * i + 3];
    px -= dy * s;
    py += dx * s;
  }
  let f = 0.6 * px;
  for (let i = 0; i < WAVES; i++) {
    const s = U.wave[4 * i + 2] * (U.wave[4 * i] * px + U.wave[4 * i + 1] * py) + F[SHEARS + i];
    f += U.wave[4 * i + 3] * Math.sin(s);
  }
  return f;
}

const TAU = Math.PI * 2;

export const demo: FieldEffect = {
  kind: "demo",
  about: {
    shows:
      "its colors as twelve sheets cut along a stirred ramp, each casting a shadow, with lines between them",
    video:
      "A looping video of a Grabient palette: sheets in its colors cut along a stirred ramp, their shadows turning with the light.",
    describe:
      "{name} played as the kit's demo: the palette {colors} cut into twelve sheets along a ramp the waves stir, each casting a shadow on the one below, with lines between them.",
    what: "the demo, the palette as twelve sheets cut along a stirred ramp on its darkest color, each casting a shadow and lit at its rim, with lines between them"
  },
  loop: 60,
  span: 0.75,
  designedSeed: 1000,
  uniforms: { shear: 4 * SHEARS, wave: 4 * WAVES },
  tracks: SHEARS + WAVES,
  design(seed) {
    const r = kitRng(seed);
    let turn = r() * TAU;
    const shear: number[] = [];
    const wave: number[] = [];
    const tracks: Track[] = [];
    const add = (list: number[], k: number, a: number) => {
      turn += 2.39996 + (r() - 0.5) * 0.6;
      list.push(kitRound(Math.cos(turn)), kitRound(Math.sin(turn)), kitRound(k), kitRound(a));
      tracks.push({
        rest: kitRound(r() * TAU),
        swing: kitRound(1.2 + r()),
        cycles: 1 + Math.floor(r() * 2),
        psi: kitRound(r() * TAU)
      });
    };
    for (let i = 0; i < SHEARS; i++) add(shear, 3 + r() * 3, 0.06 + r() * 0.05);
    for (let i = 0; i < WAVES; i++) {
      const k = 4 + r() * 6;
      add(wave, k, (0.25 + r() * 0.25) / k);
    }
    return { U: { shear, wave }, tracks };
  },
  field: demoField,
  ground: { pick: "darkest", lightness: 0.5, bound: 0.2, chroma: 0.7, lift: 0 },
  sheets: {
    base: -0.66,
    step: 0.12,
    count: 12,
    colors: { hop: 1 / 11, offset: 0, wrap: "clamp" },
    shadow: { angle: 60, distance: 0.006, alpha: 0.32, swing: 20 },
    rim: { distance: 0.0012, alpha: 0.3 }
  },
  lines: { base: 0, step: 0.12, half: 0.004, colors: "lightest", alpha: 0.5 }
};

export default demo;
