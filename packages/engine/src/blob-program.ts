/* The blob's double arithmetic as a program (double-program.ts), for its Shadertoy text, whose shader has no script to
   compute what the player's script computes (ui/blob-player.ts, blob-gl.ts, blob.ts's blobPlaces): the same
   operations on the same doubles in the same order, so a shader running it lands on the player's numbers. Three
   sections, each a range a texel runs:
     layout   the canvas's map, the filter region, the melt's box and the blur's taps, from its size; and the look's
              numbers that hang on the frost (the scatter, k1, k2, whether the noise is drawn) and the ground's
     clock    the player's tick: the frame's time, the ease from rest, the speed, the frame rate's pace
     place    one ball's place in the melt's texels at the frame's share of the loop, and its color
     weights  the blur's weights: a Gaussian truncated at three deviations, each kept as a float, over their sum
   The program is the same for every palette: the scene's numbers, the settings and the canvas are its inputs.
   Sines and cosines come from one of 2 pi f, the loop's share, turned through whole laps by the angle sum formulas,
   where the player takes each of its own argument: within an ulp or two, which a float32 place never shows. */

import { BLOB_DEPTH, BLOB_DESIGN, BLOB_LOOP } from "./blob.ts";
import { BLOB_GANESH_WIDTH, BLOB_RADIUS, BLOB_TEXELS } from "./blob-gl.ts";
import { DoubleProgram, type Value } from "./double-program.ts";

/** fdlibm's kernel polynomials for sin and cos on [-pi/4, pi/4]. */
const S = [
  -0.16666666666666632, 0.00833333333332249, -0.0001984126982985795, 0.0000027557313707070068,
  -2.5050760253406863e-8, 1.58969099521155e-10
];
const C = [
  0.0416666666666666, -0.001388888888887411, 0.00002480158728947673, -2.7557314351390663e-7,
  2.087572321298175e-9, -1.1359647557788195e-11
];
/** fdlibm's exp: ln 2 in two parts, 1 / ln 2, and its polynomial. */
const LN2HI = 0.6931471803691238;
const LN2LO = 1.9082149292705877e-10;
const INVLN2 = Math.LOG2E;
const P = [
  0.16666666666666602, -0.0027777777777015593, 0.00006613756321437934, -0.0000016533902205465252,
  4.1381367970572385e-8
];
export const BLOB_WEIGHTS = BLOB_RADIUS + 1;

/** The inputs a texel writes before it runs the program, by name. */
export const BLOB_INPUTS = {
  /* the canvas, device pixels */
  size: ["W", "H"],
  /* the settings, as whole numbers: hundredths of the speed, the frost and the ease; frames a second; the ground's
     bytes and whether there is one */
  settings: ["speed100", "fps", "frost100", "ease100", "bgR", "bgG", "bgB", "bgA", "bgOn"],
  /* the scene's numbers the layout needs */
  look: ["melt", "pad"],
  /* the frame: its gap and its time in seconds (or its count, for a clock of exact frames), and the clock's state
     from the frame before */
  frame: ["dtIn", "timeIn", "frameIn", "t", "warm", "last", "paceSet", "drawn", "first", "changed"],
  /* the blob of the ball this texel places: its middle, its radius midway, the reach of its wander across and down,
     its wander's laps across and down, its depth's laps, its spin */
  blob: ["blobX", "blobY", "blobR", "reachX", "reachY", "lapsX", "lapsY", "depth", "spin"],
  /* the ball: its place at rest and radius, in its blob's radii, its swing, the cosine and sine of its phase's turn,
     its laps, whether it rides the ring, and its color's bytes */
  ball: [
    "ballX",
    "ballY",
    "ballR",
    "swing",
    "phaseCos",
    "phaseSin",
    "laps",
    "ring",
    "red",
    "green",
    "blue"
  ]
} as const;

/** Values the layout leaves for the frame and for the other passes, by name. */
export const BLOB_LAYOUT_OUT = [
  "sx",
  "sy",
  "tx",
  "ty",
  "meltX",
  "meltY",
  "texel",
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
  "groundAF",
  "invTexel",
  "at"
] as const;
export const BLOB_FRAME_OUT = [
  "tOut",
  "warmOut",
  "lastOut",
  "paceSetOut",
  "drawnOut",
  "draw",
  "x",
  "y",
  "r"
] as const;

export interface BlobProgramOptions {
  /** false leaves out the clock and the places, which the shipped Shadertoy text computes in fixed point
      (blob-fixed.ts): the program then runs only as the canvas takes a size */
  frame?: boolean;
  /** "uniforms": the frame's time from Shadertoy's iTimeDelta and iTime, floats; "frames": from the frame's count at
      60 a second, as the lab's clock gives the player its time exactly (a check of everything but the clock) */
  clock?: "uniforms" | "frames";
}

export function blobProgram(options: BlobProgramOptions = {}): DoubleProgram {
  const p = new DoubleProgram();
  const { c } = p;
  const I = Object.fromEntries(
    Object.values(BLOB_INPUTS)
      .flat()
      .map(name => [name, p.input(name)])
  ) as Record<(typeof BLOB_INPUTS)[keyof typeof BLOB_INPUTS][number], Value>;
  /* layout values the frame reads, filled from the cache where the layout does not run */
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

  if (options.frame === false) return p;

  p.section("clock", () => {
    /* the player's tick */
    let dtRaw: Value;
    let now: Value;
    if (options.clock === "frames") {
      /* the lab's clock: frame k at k * (1000 / 60) ms */
      const interval = c(1000 / 60);
      now = p.mul(I.frameIn, interval);
      dtRaw = p.choose(
        I.first,
        c(0),
        p.div(p.sub(now, p.mul(p.sub(I.frameIn, c(1)), interval)), c(1000))
      );
    } else {
      now = p.mul(I.timeIn, c(1000));
      dtRaw = I.dtIn;
    }
    const dt = p.min(c(0.1), dtRaw);
    const speed = p.div(I.speed100, c(100));
    const ease = p.div(I.ease100, c(100));
    const moving = p.lt(c(0), speed);
    const warm1 = p.min(ease, p.add(I.warm, dt));
    const e = p.choose(p.lt(c(0), ease), p.div(warm1, ease), c(1));
    const step = p.mul(p.mul(p.mul(p.mul(dt, speed), e), e), p.sub(c(3), p.mul(c(2), e)));
    const advance = p.choose(moving, p.sub(c(1), I.first), c(0));
    const t = p.choose(advance, p.add(I.t, step), I.t);
    p.pin("tOut", t);
    p.pin("warmOut", p.choose(moving, p.choose(I.first, I.warm, warm1), c(0)));
    const loops = p.div(t, c(BLOB_LOOP));
    const at = p.sub(loops, p.trunc(loops));
    /* changed || (at !== drawn && pace.due(now, fps)): the pace consulted only where the frame has not changed */
    const differs = p.max(p.lt(at, I.drawn), p.lt(I.drawn, at));
    const every = p.div(c(1000), I.fps);
    const early = p.lt(p.sub(now, I.last), p.sub(every, p.min(c(4), p.mul(every, c(0.2)))));
    const due = p.choose(I.paceSet, p.sub(c(1), early), c(1));
    const far = p.lt(p.mul(c(2), every), p.sub(now, I.last));
    const next = p.choose(I.paceSet, p.choose(far, now, p.add(I.last, every)), now);
    const consult = p.choose(I.changed, c(0), differs);
    const draw = p.choose(I.changed, c(1), p.choose(differs, due, c(0)));
    p.pin("lastOut", p.choose(consult, p.choose(due, next, I.last), I.last));
    p.pin("paceSetOut", p.choose(consult, c(1), I.paceSet));
    p.pin("drawnOut", p.choose(draw, at, I.drawn));
    p.pin("draw", draw);
    p.pin("at", at);
  });

  p.section("place", () => {
    const at = slot.at;
    /* sin and cos of 2 pi at, at reduced to its nearest quarter turn, by fdlibm's kernels */
    const quarter = p.floor(p.add(p.mul(at, c(4)), c(0.5)));
    const theta = p.mul(c(2 * Math.PI), p.sub(at, p.mul(quarter, c(0.25))));
    const z = p.mul(theta, theta);
    const v = p.mul(z, theta);
    let ps = c(S[5]);
    for (let i = 4; i >= 1; i--) ps = p.add(c(S[i]), p.mul(z, ps));
    const ks = p.add(theta, p.mul(v, p.add(c(S[0]), p.mul(z, ps))));
    let pc = c(C[5]);
    for (let i = 4; i >= 0; i--) pc = p.add(c(C[i]), p.mul(z, pc));
    const hz = p.mul(c(0.5), z);
    const w = p.sub(c(1), hz);
    const kc = p.add(w, p.add(p.sub(p.sub(c(1), w), hz), p.mul(z, p.mul(z, pc))));
    const turn = p.choose(p.lt(quarter, c(3.5)), quarter, c(0));
    const is = (k: number) => p.lt(turn, c(k + 0.5));
    const s1 = p.choose(is(0), ks, p.choose(is(1), kc, p.choose(is(2), neg(ks), neg(kc))));
    const c1 = p.choose(is(0), kc, p.choose(is(1), neg(ks), p.choose(is(2), neg(kc), ks)));
    /* two and three laps by the angle sum formulas */
    const c2 = p.mul(p.sub(c1, s1), p.add(c1, s1));
    const s2 = p.mul(p.mul(c(2), s1), c1);
    const c3 = p.sub(p.mul(c2, c1), p.mul(s2, s1));
    const s3 = p.add(p.mul(s2, c1), p.mul(c2, s1));
    /* sin and cos of 2 pi laps at, for laps of -3 to 3 */
    const sinOf = (laps: Value) => {
      const k = p.choose(p.lt(laps, c(0)), neg(laps), laps);
      const s = p.choose(p.lt(k, c(1.5)), s1, p.choose(p.lt(k, c(2.5)), s2, s3));
      return p.choose(p.lt(laps, c(0)), neg(s), s);
    };
    const cosOf = (laps: Value) => {
      const k = p.choose(p.lt(laps, c(0)), neg(laps), laps);
      return p.choose(p.lt(k, c(1.5)), c1, p.choose(p.lt(k, c(2.5)), c2, c3));
    };

    /* blobPlaces for one ball: its blob's wander and breath, its ring's turn, its own swing */
    const depthScale = p.mul(
      p.add(c(1), p.mul(c((BLOB_DEPTH.near - BLOB_DEPTH.far) / 2), sinOf(I.depth))),
      I.blobR
    );
    const x0 = p.add(I.blobX, p.mul(I.reachX, sinOf(I.lapsX)));
    const y0 = p.add(I.blobY, p.mul(I.reachY, sinOf(I.lapsY)));
    const turnCos = c1;
    const turnSin = p.mul(I.spin, s1);
    const lapCos = cosOf(I.laps);
    const lapSin = sinOf(I.laps);
    const swingCos = p.sub(p.mul(I.phaseCos, lapCos), p.mul(I.phaseSin, lapSin));
    const swingSin = p.add(p.mul(I.phaseSin, lapCos), p.mul(I.phaseCos, lapSin));
    const x = p.add(I.ballX, p.mul(I.swing, swingCos));
    const y = p.add(I.ballY, p.mul(I.swing, swingSin));
    const X = p.choose(I.ring, p.sub(p.mul(x, turnCos), p.mul(y, turnSin)), x);
    const Y = p.choose(I.ring, p.add(p.mul(x, turnSin), p.mul(y, turnCos)), y);
    const px = p.f32(p.add(x0, p.mul(X, depthScale)));
    const py = p.f32(p.add(y0, p.mul(Y, depthScale)));
    const pr = p.f32(p.mul(I.ballR, depthScale));
    /* the player's draw: into the melt's texels */
    const { sx: msx, sy: msy, tx: mtx, ty: mty, meltX, meltY, texel } = slot;
    p.pin("x", p.f32(p.div(p.sub(p.add(p.mul(px, msx), mtx), meltX), texel)));
    p.pin("y", p.f32(p.div(p.sub(p.add(p.mul(py, msy), mty), meltY), texel)));
    p.pin("r", p.f32(p.div(p.mul(pr, msx), texel)));
  });

  return p;
}
