import { expect, test } from "vitest";
import { BLOB_DESIGN, BLOB_LOOP, blobFilter, blobPlaces, blobScene } from "./blob.ts";
import { BLOB_RADIUS, blobMap, blobMelt } from "./blob-gl.ts";
import { type BLOB_LAYOUT_OUT, blobProgram } from "./blob-program.ts";
import { decodePalette } from "./codec.ts";
import { compile, DoubleProgram, evaluate, registersOf } from "./double-program.ts";
import type { Palette } from "./palette.ts";

/* the shader lab's palettes: a vivid six, a two-color isoluminant pastel near gray, an eight, an achromatic near
   gray, a near gray keeping its own tint, a pastel five */
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
  [2560, 1440],
  [1280, 720],
  [100, 100],
  [801, 401]
] as const;

test("a program's decimal rounds as toFixed does, and its operations as JavaScript's", () => {
  const p = new DoubleProgram();
  const a = p.input("a");
  const b = p.input("b");
  p.pin("decimal2", p.decimal(a, 2));
  p.pin("decimal3", p.decimal(a, 3));
  p.pin("floor", p.floor(p.sub(a, b)));
  p.pin("ceil", p.ceil(p.div(a, b)));
  p.pin("choose", p.choose(p.lt(a, b), a, b));
  const c = compile(p);
  let s = 3;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < 2000; i++) {
    const x = i < 8 ? [12.375, 0.125, 37.5, 0.0825, 1.005, 2.675, 0.0005, 99.995][i] : rand() * 100;
    const y = rand() * 10 + 0.1;
    const R = evaluate(c, registersOf(c, { a: x, b: y }));
    const at = (name: string) => R[c.pinned.get(name) as number];
    expect(at("decimal2") / 100, String(x)).toBe(Number(x.toFixed(2)));
    expect(at("decimal3") / 1000, String(x)).toBe(Number(x.toFixed(3)));
    expect(at("floor")).toBe(Math.floor(x - y));
    expect(at("ceil")).toBe(Math.ceil(x / y));
    expect(at("choose")).toBe(x < y ? x : y);
  }
});

const program = compile(blobProgram());
const section = (name: string) => program.sections.get(name) as { from: number; to: number };
const pinned = (R: number[], name: string) => R[program.pinned.get(name) as number];

test("the Shadertoy program lands on the player's layout and weights, double for double", () => {
  for (const seed of SEEDS)
    for (const [shape, frost] of [
      [null, 1],
      [0, 0],
      [500, 0.33],
      [999, 2]
    ] as const) {
      const P = decodePalette(seed) as Palette;
      const view = { shape, frost, bg: "#f4f1ea80", angle: 137 };
      const scene = blobScene(P, BLOB_DESIGN, view);
      const look = blobFilter(view, BLOB_DESIGN, scene);
      for (const [W, H] of SIZES) {
        const map = blobMap(W, H, 1, 1);
        const weights = new Float32Array(BLOB_RADIUS + 1);
        const melt = blobMelt(look, map, W, H, weights);
        const R = registersOf(program, {
          W,
          H,
          frost100: Math.round(frost * 100),
          melt: look.melt,
          pad: look.pad,
          bgR: 0xf4,
          bgG: 0xf1,
          bgB: 0xea,
          bgA: 0x80,
          bgOn: 1
        });
        evaluate(program, R, section("layout").from, section("layout").to);
        evaluate(program, R, section("weights").from, section("weights").to);
        const want: Partial<Record<(typeof BLOB_LAYOUT_OUT)[number], number>> = {
          sx: map.sx,
          sy: map.sy,
          tx: map.tx,
          ty: map.ty,
          meltX: melt.box.x,
          meltY: melt.box.y,
          texel: melt.box.texel,
          meltW: melt.box.w,
          meltH: melt.box.h,
          taps: melt.taps,
          region0: melt.region[0],
          region1: melt.region[1],
          region2: melt.region[2],
          region3: melt.region[3],
          scatter: look.scatter,
          k1: look.k1,
          k2: look.k2,
          noise: look.noise ? 1 : 0,
          groundA: 128 / 255
        };
        for (const [name, value] of Object.entries(want))
          expect(pinned(R, name), `${seed} ${shape} ${frost} ${W}x${H} ${name}`).toBe(value);
        for (let i = 0; i <= BLOB_RADIUS; i++) expect(pinned(R, `weight${i}`)).toBe(weights[i]);
      }
    }
});

test("the Shadertoy program places every ball where the player's Float32Array holds it", () => {
  for (const seed of SEEDS) {
    const P = decodePalette(seed) as Palette;
    const view = { shape: null, frost: 1, bg: null, angle: 45 };
    const scene = blobScene(P, BLOB_DESIGN, view);
    const look = blobFilter(view, BLOB_DESIGN, scene);
    for (const [W, H] of SIZES.slice(0, 4)) {
      const map = blobMap(W, H, 1, 1);
      const melt = blobMelt(look, map, W, H, new Float32Array(BLOB_RADIUS + 1));
      const layout = {
        sx: map.sx,
        sy: map.sy,
        tx: map.tx,
        ty: map.ty,
        meltX: melt.box.x,
        meltY: melt.box.y,
        texel: melt.box.texel
      };
      const data = new Float32Array(8 * 24);
      for (const f of [0, 0.0001, 0.123456789, 0.5, 0.75, 0.999999]) {
        blobPlaces(scene, f, data, 8);
        let i = 0;
        for (const blob of scene.blobs)
          for (const b of blob.balls) {
            const R = registersOf(program, {
              ...layout,
              blobX: blob.x,
              blobY: blob.y,
              blobR: blob.R,
              reachX: blob.wander[0].reach,
              reachY: blob.wander[1].reach,
              lapsX: blob.wander[0].laps,
              lapsY: blob.wander[1].laps,
              depth: blob.depth,
              spin: blob.spin,
              ballX: b.x,
              ballY: b.y,
              ballR: b.r,
              swing: b.swing,
              phaseCos: Math.cos(2 * Math.PI * b.phase),
              phaseSin: Math.sin(2 * Math.PI * b.phase),
              laps: b.laps,
              ring: b.ring ? 1 : 0,
              /* a clock held at f of the loop */
              speed100: 0,
              ease100: 160,
              fps: 60,
              t: f * BLOB_LOOP,
              drawn: -1,
              first: 1,
              changed: 1
            });
            evaluate(program, R, section("clock").from, section("place").to);
            const t = melt.box.texel;
            expect(pinned(R, "x")).toBe(
              Math.fround((data[8 * i] * map.sx + map.tx - melt.box.x) / t)
            );
            expect(pinned(R, "y")).toBe(
              Math.fround((data[8 * i + 1] * map.sy + map.ty - melt.box.y) / t)
            );
            expect(pinned(R, "r")).toBe(Math.fround((data[8 * i + 2] * map.sx) / t));
            i++;
          }
      }
    }
  }
});

test("the Shadertoy program's clock is the player's tick, given the frames' times exactly", () => {
  const frames = compile(blobProgram({ clock: "frames" }));
  const { from, to } = frames.sections.get("clock") as { from: number; to: number };
  for (const [speed, fps, ease] of [
    [1, 60, 1.6],
    [3, 24, 1.6],
    [0.5, 120, 1.6],
    [1, 60, 0],
    [0.37, 30, 1.6],
    [0, 60, 1.6]
  ]) {
    /* the player's tick (ui/blob-player.ts) at the lab's frames, k * (1000 / 60) ms */
    let t = 0;
    let warm = 0;
    let last = 0;
    let first = true;
    let drawn = -1;
    let changed = true;
    let paceLast = Number.NEGATIVE_INFINITY;
    let state = { t: 0, warm: 0, last: 0, paceSet: 0, drawn: -1 };
    for (let k = 0; k <= 1200; k++) {
      const now = k * (1000 / 60);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (speed <= 0) warm = 0;
      else if (!first) {
        warm = Math.min(ease, warm + dt);
        const e = ease ? warm / ease : 1;
        t += dt * speed * e * e * (3 - 2 * e);
      }
      const at = (t / BLOB_LOOP) % 1;
      let draw = changed;
      if (!changed && at !== drawn) {
        const every = 1000 / fps;
        if (!(now - paceLast < every - Math.min(4, every * 0.2))) {
          paceLast = now - paceLast > 2 * every ? now : paceLast + every;
          draw = true;
        }
      }
      if (draw) {
        drawn = at;
        changed = false;
      }
      const R = registersOf(frames, {
        speed100: Math.round(speed * 100),
        fps,
        ease100: Math.round(ease * 100),
        ...state,
        first: first ? 1 : 0,
        changed: k === 0 ? 1 : 0,
        frameIn: k
      });
      first = false;
      evaluate(frames, R, from, to);
      const out = (name: string) => R[frames.pinned.get(name) as number];
      state = {
        t: out("tOut"),
        warm: out("warmOut"),
        last: out("lastOut"),
        paceSet: out("paceSetOut"),
        drawn: out("drawnOut")
      };
      expect(
        [state.t, state.warm, state.drawn, out("draw")],
        `${speed} ${fps} ${ease} frame ${k}`
      ).toEqual([t, warm, drawn, draw ? 1 : 0]);
    }
  }
});
