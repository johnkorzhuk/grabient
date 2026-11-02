import { expect, test } from "vitest";
import {
  BLOB_DESIGN,
  BLOB_LOOP,
  type BlobScene,
  blobFilter,
  blobPlaces,
  blobScene
} from "./blob.ts";
import { blobFixedMirror, type FixedScene } from "./blob-fixed.ts";
import { BLOB_RADIUS, blobMap, blobMelt } from "./blob-gl.ts";
import { decodePalette } from "./codec.ts";
import type { Palette } from "./palette.ts";

const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kQ9hLj-wW4g",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kSMQbGJYI_q4CwC",
  "kCYD0ov39_J_0cKtM",
  "kW0B2lbAbMXISxv1E0NeJVCg"
];
const SIZES = [
  [800, 400],
  [500, 500],
  [1920, 1080],
  [390, 844],
  [333, 777],
  [2560, 1440]
] as const;

const fixedSceneOf = (scene: BlobScene): FixedScene => ({
  blobs: scene.blobs.map(b => ({
    x: b.x,
    y: b.y,
    R: b.R,
    reachX: b.wander[0].reach,
    reachY: b.wander[1].reach,
    lapsX: b.wander[0].laps,
    lapsY: b.wander[1].laps,
    depth: b.depth,
    spin: b.spin
  })),
  balls: scene.blobs
    .flatMap(b => b.balls)
    .map(b => ({
      x: b.x,
      y: b.y,
      r: b.r,
      swing: b.swing,
      phaseCos: Math.cos(2 * Math.PI * b.phase),
      phaseSin: Math.sin(2 * Math.PI * b.phase),
      laps: b.laps,
      ring: b.ring
    }))
});

test("the shipped Shadertoy's fixed point places every ball where the player's Float32Array holds it", () => {
  const mirror = blobFixedMirror({ speed: 1, fps: 60, ease: 1.6 });
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const s of SEEDS)
    for (const shape of [null, 0, 999]) {
      const P = decodePalette(s) as Palette;
      const view = { shape, frost: 1, bg: null, angle: 137 };
      const scene = blobScene(P, BLOB_DESIGN, view);
      const look = blobFilter(view, BLOB_DESIGN, scene);
      const fixedScene = fixedSceneOf(scene);
      for (const [W, H] of SIZES) {
        const map = blobMap(W, H, 1, 1);
        const melt = blobMelt(look, map, W, H, new Float32Array(BLOB_RADIUS + 1));
        const layout = {
          sx: map.sx,
          sy: map.sy,
          tx: map.tx,
          ty: map.ty,
          meltX: melt.box.x,
          meltY: melt.box.y,
          invTexel: 1 / melt.box.texel
        };
        const data = new Float32Array(8 * 24);
        for (let k = 0; k < 6; k++) {
          /* a share of the loop as the fixed clock holds it, and the double it is */
          const at = k ? BigInt(Math.floor(rand() * 2 ** 40)) << 12n : 0n;
          blobPlaces(scene, Number(at) / 2 ** 52, data, 8);
          const t = melt.box.texel;
          for (let i = 0; i < 24; i++)
            expect(mirror.place(at, fixedScene, i, layout), `${s} ${shape} ${W}x${H} ${i}`).toEqual(
              [
                Math.fround((data[8 * i] * map.sx + map.tx - melt.box.x) / t),
                Math.fround((data[8 * i + 1] * map.sy + map.ty - melt.box.y) / t),
                Math.fround((data[8 * i + 2] * map.sx) / t)
              ]
            );
        }
      }
    }
}, 60_000);

test("the shipped Shadertoy's fixed point clock draws the player's frames, within a hair of its time", () => {
  for (const [speed, fps] of [
    [1, 60],
    [3, 24],
    [0.5, 120],
    [10, 50]
  ]) {
    const mirror = blobFixedMirror({ speed, fps, ease: 1.6 });
    let state = { t: 0n, warm: 0n, last: 0n, drawn: -(1n << 52n), paceSet: false };
    /* the player's tick at 60 frames a second */
    let t = 0;
    let warm = 0;
    let drawn = -1;
    let paceLast = Number.NEGATIVE_INFINITY;
    let worst = 0;
    for (let k = 0; k <= 3000; k++) {
      const now = k * (1000 / 60);
      const dt = k ? Math.min(0.1, (now - (k - 1) * (1000 / 60)) / 1000) : 0;
      if (k) {
        warm = Math.min(1.6, warm + dt);
        const e = warm / 1.6;
        t += dt * speed * e * e * (3 - 2 * e);
      }
      const at = (t / BLOB_LOOP) % 1;
      let draw = k === 0;
      if (!draw && at !== drawn) {
        const every = 1000 / fps;
        if (!(now - paceLast < every - Math.min(4, every * 0.2))) {
          paceLast = now - paceLast > 2 * every ? now : paceLast + every;
          draw = true;
        }
      }
      if (draw) drawn = at;
      const c = mirror.clock(state, k === 0, k === 0, k ? dt : 0, now / 1000);
      state = c;
      expect(c.draw, `${speed} ${fps} frame ${k}`).toBe(draw);
      worst = Math.max(worst, Math.abs(Number(c.at) / 2 ** 52 - at));
    }
    /* Shadertoy's frame time is a float, 1/60 as 5.2e-8 more than the player's double, and the settings floats: over
       50 s at speed 10 the share drifts by under 1e-6 of a loop, all that parts the two */
    expect(worst).toBeLessThan(1e-6);
  }
});
