/* A kernel holding every construct of the kit's kernel subset, for kit/compile.test.ts, which compiles this file and
   holds the C to it run in Node, and the JS numbers a target could miss: -0 from a negated counter, which atan2 tells
   from 0, and an integer past int32 among floats. Not an effect: its numbers mean nothing. */
import type { KernelU } from "../../src/kit/types.ts";

const RINGS = 3;
const HALF = 0.5;
const FLIP = -2;

/** 1 - t * t inside -w..w, 0 past it: an early return, a parameter assigned to */
function bump(t: number, w: number): number {
  t /= w;
  if (t > 1 || t < -1) return 0;
  return 1 - t * t;
}

/** a ring's wave, its phase a parameter, through another helper */
function ring(r: number, k: number, phase: number): number {
  return Math.cos(k * r + phase) * bump(r - HALF, 0.75);
}

export function constructs(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {
  x += 0.0625 * y;
  let sample = x * U.scale[0];
  let flat = y * U.scale[1];
  const r = Math.sqrt(sample * sample + flat * flat);
  let f = 0;
  for (let i = 0; i < RINGS; i++) {
    if (i === 1) continue;
    f += ring(r, U.rings[2 * i] + i, F[i]) * U.rings[2 * i + 1];
    for (let j = 1; j <= 2; j++) {
      f -= (Math.sin(F[RINGS + j - 1] + j * x) * HALF) / (i + j);
      if (f > 10) break;
    }
  }
  for (let n = 0; n < 3; ++n) f += 0.001 * Math.atan2(-n * HALF, -1) + 1e-12 * (n * 1500000000);
  f *= U.scale[2] > 0 ? 1 : FLIP;
  f /= 1 + Math.abs(Math.atan2(flat, sample)) / Math.PI;
  const m = Math.min(f, Math.max(-1, x, y));
  let g: number;
  if (m < -0.5 && !(x > 0)) g = Math.floor(m * 4) / 4;
  else if (m > 0.5 || y < -0.25) {
    g = Math.ceil(m * 4) / 4;
  } else g = Math.exp(-Math.abs(m)) + Math.log(1 + r) + Math.tan(0.1 * x);
  if (x !== y && x >= -1 && y <= 1) g -= Math.floor(g * 8 + 0.5) / 64;
  for (let q = 0; q <= 1; q += 1) if (q == 1 && x != y) g += 0.125;
  sample = g - f;
  flat -= 1e-3;
  {
    const w = 2 * Math.cos(2 * F[0]) - Math.sin(-F[1] + HALF * RINGS * x);
    flat += w * 0.125;
  }
  return f + 0.25 * g + sample * 0.0625 + flat * 0.01;
}
