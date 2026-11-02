/* The blob's double arithmetic as programs (double-program.ts), for its Shadertoy text, whose shader has no script to
   compute what the player's script computes (ui/blob-player.ts, blob-gl.ts): the same operations on the same doubles
   in the same order, so a shader running them lands on the player's numbers.
     blobProgram  run as the canvas or the settings change, in two sections, each a range a texel runs:
       layout   the canvas's map, the filter region, the melt's box and the blur's taps, from its size; the look's
                numbers that hang on the frost (the scatter, k1, k2, whether the noise is drawn), the ground's and a
                ball's color; and the clock's settings: the speed, the ease and the frame rate's pace
       weights  the blur's weights: a Gaussian truncated at three deviations, each kept as a float, over their sum
     blobClock    run every frame: the player's tick, the frame's time, the ease from rest, the speed, the share of the
                  loop and the frame rate's pace, which decides whether the frame draws. A program of its own, so the
                  shader runs it each frame over a register file a sixth the size of the layout's, which a GPU indexes
                  far faster (an RTX 2080 Ti took 3 ms a frame over the layout's)
   The programs are the same for every palette: the scene's numbers, the settings and the canvas are their inputs. A
   ball's place each frame is blob-fixed.ts's, in fixed point, from the clock's share. */

import { BLOB_DESIGN, BLOB_LOOP } from "./blob.ts";
import { BLOB_GANESH_WIDTH, BLOB_RADIUS, BLOB_TEXELS } from "./blob-gl.ts";
import { DoubleProgram, type Value } from "./double-program.ts";

/** fdlibm's exp: ln 2 in two parts, 1 / ln 2, and its polynomial. */
const LN2HI = 0.6931471803691238;
const LN2LO = 1.9082149292705877e-10;
const INVLN2 = Math.LOG2E;
const P = [
  0.16666666666666602, -0.0027777777777015593, 0.00006613756321437934, -0.0000016533902205465252,
  4.1381367970572385e-8
];
export const BLOB_WEIGHTS = BLOB_RADIUS + 1;
/** The time grid Shadertoy's float time is read on: a frame on a 30, 60, 120 or 240 Hz screen counted from its first
    falls on a whole number of 240ths of a second. */
export const BLOB_GRID_HZ = 240;

/** The inputs a texel writes before it runs the layout, by name. */
export const BLOB_INPUTS = {
  /* the canvas, device pixels */
  size: ["W", "H"],
  /* the settings, as whole numbers: hundredths of the speed, the frost and the ease; frames a second; the ground's
     bytes and whether there is one */
  settings: ["speed100", "fps", "frost100", "ease100", "bgR", "bgG", "bgB", "bgA", "bgOn"],
  /* the scene's numbers the layout needs, and the bytes of the ball's color this texel keeps */
  look: ["melt", "pad", "red", "green", "blue"]
} as const;
/** The inputs a texel writes before it runs the clock, by name: Shadertoy's time as the nearest whole number of 240ths
    of a second, as it is (seconds) and whether it is that whole number's float; whether this is the first frame and
    whether the canvas or the settings changed; the clock as the frame before left it (the loop's seconds, the ease's,
    the frame before's time in ms, the pace's last frame in ms and whether it has one, the share of the loop drawn
    last); and the layout's settings for it. */
export const BLOB_CLOCK_INPUTS = [
  "grid",
  "time",
  "onGrid",
  "first",
  "changed",
  "t",
  "warm",
  "before",
  "paceLast",
  "paceSet",
  "drawn",
  "speed",
  "ease",
  "every",
  "early"
] as const;

/** Values the layout leaves for the clock and the frame, and for the other passes, by name. */
export const BLOB_LAYOUT_OUT = [
  "sx",
  "sy",
  "tx",
  "ty",
  "meltX",
  "meltY",
  "texel",
  "invTexel",
  "speed",
  "ease",
  "every",
  "early",
  "meltW",
  "meltH",
  "taps",
  "region0",
  "region1",
  "region2",
  "region3",
  "scatter",
  "k1",
  "k2",
  "noise",
  "groundR",
  "groundG",
  "groundB",
  "groundA",
  "spread",
  "originX",
  "originY",
  "texelF",
  "scatterX",
  "scatterY",
  "k1F",
  "k2F",
  "groundRF",
  "groundGF",
  "groundBF",
  "groundAF"
] as const;

export function blobProgram(): DoubleProgram {
  const p = new DoubleProgram();
  const { c } = p;
  const I = Object.fromEntries(
    Object.values(BLOB_INPUTS)
      .flat()
      .map(name => [name, p.input(name)])
  ) as Record<(typeof BLOB_INPUTS)[keyof typeof BLOB_INPUTS][number], Value>;
  /* layout values a later section reads, filled from the kept state where the layout does not run */
  const slot = Object.fromEntries(BLOB_LAYOUT_OUT.map(name => [name, p.slot(name)])) as Record<
    (typeof BLOB_LAYOUT_OUT)[number],
    Value
  >;
  const neg = (v: Value) => p.sub(c(0), v);
  /* a decimal number as written(v, digits) writes it: toFixed's whole number over 10^digits */
  const written = (v: Value, digits: number) => p.div(p.decimal(v, digits), c(10 ** digits));

  p.section("layout", () => {
    const { W, H } = I;
    /* blobMap: the design scaled to cover the box, centered, at density 1 */
    const D = BLOB_DESIGN.width;
    const scale = p.max(p.div(W, c(D)), p.div(H, c(BLOB_DESIGN.height)));
    const tx = p.div(p.sub(W, p.mul(scale, c(D))), c(2));
    const ty = p.div(p.sub(H, p.mul(scale, c(BLOB_DESIGN.height))), c(2));
    const sx = scale;
    const sy = scale;
    /* the look's numbers that hang on the frost (blobFilter): the scatter written to 2 decimals, k1 and k2 to 3 */
    const frost = p.div(I.frost100, c(100));
    const scatterRaw = p.mul(c(0.075), frost);
    const speckle = p.min(c(0.4), p.mul(c(0.1), frost));
    const scatter = written(p.mul(scatterRaw, c(D)), 2);
    p.pin("scatter", scatter);
    p.pin("k1", written(p.mul(c(2), speckle), 3));
    p.pin("k2", written(p.sub(c(1), speckle), 3));
    p.pin("noise", p.max(p.lt(c(0), scatterRaw), p.lt(c(0), speckle)));
    /* blobMelt */
    const { melt, pad } = I;
    const negPad = neg(pad);
    const wide = p.add(c(D), pad);
    const region = [
      p.floor(p.add(p.add(p.mul(negPad, sx), tx), c(0.5))),
      p.floor(p.add(p.add(p.mul(negPad, sy), ty), c(0.5))),
      p.floor(p.add(p.add(p.mul(wide, sx), tx), c(0.5))),
      p.floor(p.add(p.add(p.mul(wide, sy), ty), c(0.5)))
    ];
    const most = p.max(sx, sy);
    const sigma = p.mul(p.mul(melt, most), c(BLOB_GANESH_WIDTH));
    const texel = p.max(c(0.5), p.div(sigma, c(BLOB_TEXELS)));
    const reach = p.add(p.ceil(p.mul(scatter, most)), c(2));
    const x0 = p.max(region[0], neg(reach));
    const y0 = p.max(region[1], neg(reach));
    const x1 = p.min(region[2], p.add(W, reach));
    const y1 = p.min(region[3], p.add(H, reach));
    const margin = p.add(p.mul(c(3), sigma), p.mul(c(2), texel));
    const twoMargin = p.mul(c(2), margin);
    p.pin("meltX", p.sub(x0, margin));
    p.pin("meltY", p.sub(y0, margin));
    p.pin("meltW", p.max(c(1), p.ceil(p.div(p.add(p.sub(p.max(x1, x0), x0), twoMargin), texel))));
    p.pin("meltH", p.max(c(1), p.ceil(p.div(p.add(p.sub(p.max(y1, y0), y0), twoMargin), texel))));
    const q = p.div(sigma, texel);
    const ss = p.max(c(0.25), p.sub(p.mul(q, q), c(0.25)));
    /* Math.sqrt by Newton's from the float's root: within an ulp, which the weights' floats never show */
    let s = p.sqrt0(ss);
    for (let i = 0; i < 3; i++) s = p.mul(c(0.5), p.add(s, p.div(ss, s)));
    p.pin("taps", p.min(c(BLOB_RADIUS), p.ceil(p.mul(c(3), q))));
    p.pin("spread", p.mul(p.mul(c(2), s), s));
    p.pin("sx", sx);
    p.pin("sy", sy);
    p.pin("tx", tx);
    p.pin("ty", ty);
    p.pin("texel", texel);
    region.forEach((r, i) => {
      p.pin(`region${i}`, r);
    });
    /* the ground, premultiplied: its bytes over 255 times its alpha; 0s for none */
    const alpha = p.div(I.bgA, c(255));
    const on = I.bgOn;
    for (const [name, byte] of [
      ["groundR", I.bgR],
      ["groundG", I.bgG],
      ["groundB", I.bgB]
    ] as const)
      p.pin(name, p.choose(on, p.mul(p.div(byte, c(255)), alpha), c(0)));
    p.pin("groundA", p.choose(on, alpha, c(0)));
    /* as the player's uniforms keep them: floats */
    p.pin("originX", p.f32(slot.meltX));
    p.pin("originY", p.f32(slot.meltY));
    p.pin("texelF", p.f32(texel));
    p.pin("scatterX", p.f32(p.mul(scatter, sx)));
    p.pin("scatterY", p.f32(p.mul(scatter, sy)));
    p.pin("k1F", p.f32(slot.k1));
    p.pin("k2F", p.f32(slot.k2));
    for (const name of ["groundR", "groundG", "groundB", "groundA"] as const)
      p.pin(`${name}F`, p.f32(slot[name]));
    p.pin("invTexel", p.div(c(1), texel));
    /* the ball's color as the player's Float32Array keeps it */
    p.pin("tintR", p.f32(p.div(I.red, c(255))));
    p.pin("tintG", p.f32(p.div(I.green, c(255))));
    p.pin("tintB", p.f32(p.div(I.blue, c(255))));
    /* the clock's settings: the address's two decimals as the double they read as, and the pace's frame time and
       how early a frame may come (pace.ts), as each frame's due() computes them */
    p.pin("speed", p.div(I.speed100, c(100)));
    p.pin("ease", p.div(I.ease100, c(100)));
    const every = p.div(c(1000), I.fps);
    p.pin("every", every);
    p.pin("early", p.sub(every, p.min(c(4), p.mul(every, c(0.2)))));
  });

  p.section("weights", () => {
    const { taps, spread } = slot;
    /* exp as fdlibm computes it, for x at most 0 */
    const exp = (x0: Value) => {
      const k = p.trunc(p.add(p.mul(c(INVLN2), x0), c(-0.5)));
      const hi = p.sub(x0, p.mul(k, c(LN2HI)));
      const lo = p.mul(k, c(LN2LO));
      const x = p.sub(hi, lo);
      const xx = p.mul(x, x);
      let poly = c(P[4]);
      for (let i = 3; i >= 0; i--) poly = p.add(c(P[i]), p.mul(xx, poly));
      const cc = p.sub(x, p.mul(xx, poly));
      const y = p.sub(c(1), p.sub(p.sub(lo, p.div(p.mul(x, cc), p.sub(c(2), cc))), hi));
      return p.scale2(y, k);
    };
    const weights: Value[] = [];
    let total = c(0);
    for (let i = 0; i < BLOB_WEIGHTS; i++) {
      const w = p.f32(p.choose(p.lt(taps, c(i)), c(0), exp(p.div(c(-(i * i)), spread))));
      weights.push(w);
      total = p.add(total, i ? p.mul(c(2), w) : w);
    }
    weights.forEach((w, i) => {
      p.pin(`weight${i}`, p.f32(p.div(w, total)));
    });
  });

  return p;
}

/** The player's tick as a program of its own: from the frame's time and the state the frame before left, the clock's
    state this frame, the share of the loop and whether the frame draws. */
export function blobClock(): DoubleProgram {
  const p = new DoubleProgram();
  const { c } = p;
  const I = Object.fromEntries(BLOB_CLOCK_INPUTS.map(name => [name, p.input(name)])) as Record<
    (typeof BLOB_CLOCK_INPUTS)[number],
    Value
  >;
  /* the frame's time in ms: where Shadertoy's float time is the float of a whole number of 240ths of a second, that
     many 240ths as a double (requestAnimationFrame's time for a frame on a 30, 60, 120 or 240 Hz screen counted from
     its first), elsewhere the float as it is */
  const now = p.mul(
    p.choose(I.onGrid, I.grid, I.time),
    p.choose(I.onGrid, c(1000 / BLOB_GRID_HZ), c(1000))
  );
  /* the player's tick (ui/blob-player.ts), its operations in its order */
  const dt = p.min(c(0.1), p.choose(I.first, c(0), p.div(p.sub(now, I.before), c(1000))));
  const { speed, ease } = I;
  const moving = p.lt(c(0), speed);
  const warm1 = p.min(ease, p.add(I.warm, dt));
  const e = p.choose(p.lt(c(0), ease), p.div(warm1, ease), c(1));
  const step = p.mul(p.mul(p.mul(p.mul(dt, speed), e), e), p.sub(c(3), p.mul(c(2), e)));
  const t = p.choose(p.choose(moving, p.sub(c(1), I.first), c(0)), p.add(I.t, step), I.t);
  p.pin("tOut", t);
  p.pin("warmOut", p.choose(moving, p.choose(I.first, I.warm, warm1), c(0)));
  p.pin("beforeOut", now);
  const loops = p.div(t, c(BLOB_LOOP));
  const at = p.sub(loops, p.trunc(loops));
  /* changed || (at !== drawn && pace.due(now, fps)): the pace consulted only where the frame has not changed */
  const differs = p.max(p.lt(at, I.drawn), p.lt(I.drawn, at));
  const gap = p.sub(now, I.paceLast);
  const due = p.choose(I.paceSet, p.sub(c(1), p.lt(gap, I.early)), c(1));
  const far = p.lt(p.mul(c(2), I.every), gap);
  const next = p.choose(I.paceSet, p.choose(far, now, p.add(I.paceLast, I.every)), now);
  const consult = p.choose(I.changed, c(0), differs);
  const draw = p.choose(I.changed, c(1), p.choose(differs, due, c(0)));
  p.pin("paceLastOut", p.choose(consult, p.choose(due, next, I.paceLast), I.paceLast));
  p.pin("paceSetOut", p.choose(consult, c(1), I.paceSet));
  p.pin("drawnOut", p.choose(draw, at, I.drawn));
  p.pin("draw", draw);
  p.pin("at", at);
  return p;
}
