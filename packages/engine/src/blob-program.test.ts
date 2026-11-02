import { expect, test } from "vitest";
import { BLOB_DESIGN, BLOB_LOOP, blobFilter, blobScene } from "./blob.ts";
import { BLOB_RADIUS, blobMap, blobMelt } from "./blob-gl.ts";
import { type BLOB_LAYOUT_OUT, blobClock, blobProgram } from "./blob-program.ts";
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

/* the player's tick (ui/blob-player.ts) and its pace (ui/pace.ts), as it runs in a page */
function playerClock(speed: number, fps: number, ease: number) {
  let t = 0;
  let warm = 0;
  let last = 0;
  let first = true;
  let drawn = -1;
  let changed = true;
  let paceLast = Number.NEGATIVE_INFINITY;
  return (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (speed <= 0) warm = 0;
    else if (!first) {
      warm = Math.min(ease, warm + dt);
      const e = ease ? warm / ease : 1;
      t += dt * speed * e * e * (3 - 2 * e);
    }
    first = false;
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
    return { t, warm, at, draw };
  };
}

/* the clock's program as the text runs it each frame, on Shadertoy's iTime (a float), from the state the frame before
   left: the layout's settings first, as the texels keep them */
const clock = compile(blobClock());
function textClock(speed: number, fps: number, ease: number) {
  const R0 = registersOf(program, {
    W: 800,
    H: 400,
    speed100: Math.round(speed * 100),
    fps,
    ease100: Math.round(ease * 100),
    frost100: 100,
    melt: 30,
    pad: 40
  });
  evaluate(program, R0, section("layout").from, section("layout").to);
  const settings = Object.fromEntries(
    ["speed", "ease", "every", "early"].map(name => [name, pinned(R0, name)])
  );
  let state = { t: 0, warm: 0, before: 0, paceLast: 0, paceSet: 0, drawn: -1 };
  let first = true;
  const f = Math.fround;
  return (iTime: number) => {
    /* the shader's float arithmetic: the time in 240ths, its nearest whole number, and whether it is that number's */
    const x = f(iTime * 240);
    const grid = Math.floor(f(x + 0.5));
    const R = registersOf(clock, {
      ...settings,
      ...state,
      grid,
      time: iTime,
      onGrid: f(Math.abs(f(x - grid))) <= Math.max(f(1e-4), f(grid * f(2.4e-7))) ? 1 : 0,
      first: first ? 1 : 0,
      changed: first ? 1 : 0
    });
    first = false;
    evaluate(clock, R);
    const out = (name: string) => R[clock.pinned.get(name) as number];
    state = {
      t: out("tOut"),
      warm: out("warmOut"),
      before: out("beforeOut"),
      paceLast: out("paceLastOut"),
      paceSet: out("paceSetOut"),
      drawn: out("drawnOut")
    };
    return { t: state.t, warm: state.warm, at: out("at"), draw: out("draw") === 1 };
  };
}

test("the Shadertoy program's clock is the player's tick, double for double, at every frame rate", () => {
  /* the shader lab's frames: frame k at k * (1000 / hz) ms, Shadertoy's iTime that over 1000 as a float. Every frame
     rate from 1 to 120 a second, on screens of 60 and 120 Hz, through the ease and past a loop's end at speed 3 */
  const runs: [speed: number, fps: number, ease: number, hz: number, frames: number][] = [];
  for (let fps = 1; fps <= 120; fps++) runs.push([3, fps, 1.6, 60, 1000], [1, fps, 1.6, 120, 400]);
  runs.push(
    [1, 60, 1.6, 30, 1600],
    [1.37, 54, 1.6, 240, 1200],
    [0.29, 24, 0, 60, 3200],
    [10, 60, 1.6, 60, 400],
    [0, 60, 1.6, 60, 50]
  );
  for (const [speed, fps, ease, hz, frames] of runs) {
    const player = playerClock(speed, fps, ease);
    const text = textClock(speed, fps, ease);
    const interval = 1000 / hz;
    for (let k = 0; k <= frames; k++) {
      const now = k * interval;
      expect(text(Math.fround(now / 1000)), `${speed} ${fps} ${ease} ${hz} Hz frame ${k}`).toEqual(
        player(now)
      );
    }
  }
}, 120_000);

test("the Shadertoy program's clock reads a time off the grid as the float it is", () => {
  /* a screen's own times, as shadertoy.com's performance.now() gives them: never on a 240th, so read as floats, which
     moves the motion on as the player's does, within a float's precision */
  const player = playerClock(1, 60, 1.6);
  const text = textClock(1, 60, 1.6);
  let worst = 0;
  for (let k = 0; k <= 2000; k++) {
    const now = k ? k * 16.68 + 0.37 : 0;
    const a = player(now);
    const b = text(Math.fround(now / 1000));
    worst = Math.max(worst, Math.abs(a.at - b.at));
  }
  expect(worst).toBeLessThan(1e-6);
});
