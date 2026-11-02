import { expect, test } from "vitest";
import { BLOB_DESIGN, type BlobScene, blobFilter, blobPlaces, blobScene } from "./blob.ts";
import { blobFixedMirror, type FixedScene, fixedOf } from "./blob-fixed.ts";
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
  const mirror = blobFixedMirror();
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const s of SEEDS)
    for (const shape of [null, 0, 999]) {
      const P = decodePalette(s) as Palette;
      const view = { shape, frost: 1, bg: null };
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
          /* a share of the loop as the clock's doubles hold it, rounded to the fixed point's 52 bits */
          const at = [0, 1e-9, 0.25, 0.999999][k] ?? rand();
          blobPlaces(scene, at, data, 8);
          const t = melt.box.texel;
          for (let i = 0; i < 24; i++)
            expect(
              mirror.place(fixedOf(at), fixedScene, i, layout),
              `${s} ${shape} ${W}x${H} ${i}`
            ).toEqual([
              Math.fround((data[8 * i] * map.sx + map.tx - melt.box.x) / t),
              Math.fround((data[8 * i + 1] * map.sy + map.ty - melt.box.y) / t),
              Math.fround((data[8 * i + 2] * map.sx) / t)
            ]);
        }
      }
    }
}, 60_000);
