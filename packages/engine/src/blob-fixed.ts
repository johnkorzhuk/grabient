/* The blob's balls' places each frame in 64-bit fixed point, for its Shadertoy text (blob-shadertoy.ts): integers,
   which every GPU computes exactly and none reorders or fuses, where the player's script computes in doubles
   (blob.ts's blobPlaces). From the share of the loop the player's clock gives (blob-program.ts's, in soft doubles),
   the places are within about 2^-52 of the player's doubles, so each lands on the float the player's Float32Array
   holds but at odds of about one in a hundred million. Run by the balls' texels on the frames that draw, it costs a
   GPU a few thousand integer operations a ball, where soft doubles cost several times that.
     the share, sines and cosines and places in the design: 52 bits of fraction (Q52); places in the melt's texels: 48
   blobFixedMirror computes the same bits in JavaScript, with BigInt, for the tests. */
import { BLOB_DEPTH } from "./blob.ts";

/** A number as a Q52 (or Qf) fixed-point literal: its two's complement words, high first, rounded to nearest. */
export function fixedLit(x: number, f = 52): string {
  const v = BigInt.asUintN(64, fixedOf(x, f));
  const hex = (n: bigint) => `0x${n.toString(16).padStart(8, "0")}u`;
  return `uvec2(${hex(v >> 32n)}, ${hex(v & 0xffffffffn)})`;
}
/** x times 2^f, rounded to nearest (ties away from zero), exactly from the double's bits. */
export function fixedOf(x: number, f = 52): bigint {
  if (x === 0) return 0n;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const e = ((hi >>> 20) & 0x7ff) - 1023;
  const m = (BigInt((hi & 0xfffff) | 0x100000) << 32n) | BigInt(lo);
  const shift = e - 52 + f;
  const v = shift >= 0 ? m << BigInt(shift) : (m + (1n << BigInt(-shift - 1))) >> BigInt(-shift);
  return x < 0 ? -v : v;
}

export const GLSL_FIXED = `// Fixed point: signed 64-bit integers as two words, high first, with F bits of fraction. No branch: a compiler that
// inlines every call (SwiftShader's and D3D's do) gets straight code it compiles quickly.
// a, or its negative where s is 1
uvec2 fsign(uvec2 a, uint s) { return add64(a ^ uvec2(0u - s), uvec2(0u, s)); }
uvec2 fabs(uvec2 a) { return fsign(a, a.x >> 31); }
// a times b, F bits of fraction, rounded to nearest with ties away from zero
uvec2 fmul(uvec2 a, uvec2 b, int F) {
  uvec2 x = fabs(a), y = fabs(b);
  uvec2 p00 = mul32(x.y, y.y), p01 = mul32(x.y, y.x), p10 = mul32(x.x, y.y), p11 = mul32(x.x, y.x);
  // the 128-bit product's words, w0 the lowest
  uint w0 = p00.y;
  uint w1 = p00.x + p01.y;
  uint c1 = uint(w1 < p00.x);
  w1 += p10.y;
  c1 += uint(w1 < p10.y);
  uint w2 = p01.x + p10.x;
  uint c2 = uint(w2 < p01.x);
  w2 += p11.y;
  c2 += uint(w2 < p11.y);
  w2 += c1;
  c2 += uint(w2 < c1);
  uint w3 = p11.x + c2;
  // plus half of the last bit kept, then bits F to F + 63
  uvec2 low = add64(uvec2(w1, w0), shl64(uvec2(0u, 1u), F - 1));
  uvec2 high = add64(uvec2(w3, w2), uvec2(0u, lt64(low, uvec2(w1, w0))));
  return fsign(shl64(high, 64 - F) | shr64(low, F), (a.x ^ b.x) >> 31);
}
// a float exactly (to F bits), as its bits say
uvec2 ffloat(float v, int F) {
  uint b = floatBitsToUint(v);
  int e = int((b >> 23) & 0xffu) - 150 + F;
  uvec2 m = uvec2(0u, ((b & 0x7fffffu) | 0x800000u) * uint((b << 1) != 0u));
  return fsign(sel(uint(e >= 0), shl64(m, e), shr64(m, -e)), b >> 31);
}
// a double (its two words) to F bits, rounded to nearest
uvec2 fdouble(uvec2 d, int F) {
  int e = int((d.x >> 20) & 0x7ffu) - 1075 + F;
  uvec2 m = uvec2((d.x & 0xfffffu) | 0x100000u, d.y) * uint(((d.x << 1) | d.y) != 0u);
  uvec2 r = sel(uint(e >= 0), shl64(m, e), shr64(add64(m, shl64(uvec2(0u, 1u), -e - 1)), -e));
  return fsign(r, d.x >> 31);
}
// the float nearest, ties to even, as a Float32Array keeps it
float ftofloat(uvec2 a, int F) {
  uvec2 m = fabs(a);
  int top = 63 - clz64(m);
  uvec2 kept = shl64(shr64(m, max(top - 23, 0)), max(23 - top, 0));
  uint k = kept.y;
  // where bits were dropped, up past half of the last kept, or at half to even
  int drop = top - 23;
  uvec2 rest = m & ~shl64(uvec2(0xffffffffu), drop);
  uvec2 halfway = shl64(uvec2(0u, 1u), drop - 1);
  k += (lt64(halfway, rest) | (uint(rest == halfway) & (k & 1u))) * uint(drop > 0);
  uint carry = k >> 24;
  uint bits = (a.x & 0x80000000u) | (uint(top - F + 127 + int(carry)) << 23) | ((k >> carry) & 0x7fffffu);
  return uintBitsToFloat(bits * uint(m != uvec2(0u)));
}`;

/** sin and cos of x on [-pi/4, pi/4] by Taylor's series: x^(2k+1) / (2k+1)! and x^2k / (2k)!, eight terms each. */
export const SIN_TERMS = Array.from({ length: 8 }, (_, k) => (-1) ** k / factorial(2 * k + 1));
export const COS_TERMS = Array.from({ length: 9 }, (_, k) => (-1) ** k / factorial(2 * k));
function factorial(n: number): number {
  let p = 1;
  for (let i = 2; i <= n; i++) p *= i;
  return p;
}

/* ---- the mirror: the same arithmetic in JavaScript, bit for bit ---- */
const M64 = (1n << 64n) - 1n;
const wrap = (v: bigint) => BigInt.asIntN(64, v);
/** a times b, F bits of fraction, as fmul rounds it */
export function fmulMirror(a: bigint, b: bigint, f: number): bigint {
  const negative = a < 0n !== b < 0n;
  const p = (a < 0n ? -a : a) * (b < 0n ? -b : b);
  const r = ((p + (1n << BigInt(f - 1))) >> BigInt(f)) & M64;
  return wrap(negative ? -r : r);
}
/** the float a fixed number rounds to, ties to even */
export function ftofloatMirror(a: bigint, f: number): number {
  if (a === 0n) return 0;
  const m = a < 0n ? -a : a;
  const top = m.toString(2).length - 1;
  let k: bigint;
  let e = top - f;
  if (top > 23) {
    const shift = BigInt(top - 23);
    k = m >> shift;
    const rest = m & ((1n << shift) - 1n);
    const half = 1n << (shift - 1n);
    if (rest > half || (rest === half && (k & 1n) === 1n)) k += 1n;
    if (k >> 24n) {
      k >>= 1n;
      e += 1;
    }
  } else k = m << BigInt(23 - top);
  const v = Number(k) * 2 ** (e - 23);
  return Math.fround(a < 0n ? -v : v);
}
/** a float exactly, to F bits, toward zero past them, as ffloat */
export function ffloatMirror(v: number, f: number): bigint {
  if (v === 0) return 0n;
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, v);
  const bits = b.getUint32(0);
  const e = ((bits >>> 23) & 0xff) - 150 + f;
  const m = BigInt((bits & 0x7fffff) | 0x800000);
  const r = e >= 0 ? m << BigInt(e) : m >> BigInt(-e);
  return v < 0 ? -r : r;
}
export { fixedOf as fdoubleMirror };

/* ---- a ball's place as a program ---- */
/** placeFrame's operations: products at 52 and 48 bits of fraction, sums, differences, a Q52 number to the float the
    player keeps and back at 48 bits, and a Q48 number to its float's bits. */
const PLACE_OP = { mul: 0, mul48: 1, add: 2, sub: 3, round: 4, float: 5 } as const;
/** What the program starts from, in its first registers in this order: the share less its nearest quarter turn, that
    turn's cosine and sine (1, 0 or -1), the blob as BLOBS holds it (its middle, radius and reach), the ball as BALLS
    does (its place, radius, swing and phase), and at 48 bits the layout's map, the melt's corner and the texel's
    inverse. */
export const PLACE_INPUTS = [
  "atr",
  "cq",
  "sq",
  "blobX",
  "blobY",
  "blobR",
  "reachX",
  "reachY",
  "ballX",
  "ballY",
  "ballR",
  "swing",
  "phaseCos",
  "phaseSin",
  "sx",
  "sy",
  "tx",
  "ty",
  "mx",
  "my",
  "inv"
];
const SINES = ["s1", "s2", "s3", "n1", "n2", "n3"];
/** The values a ball's laps choose among, an operand written @name: a sine by laps (n, a negative laps' negative
    sine), a cosine, the ring's turn, and the place turned with the ring or not. */
export const PLACE_ALIASES: Record<string, string[]> = {
  sinZ: SINES,
  sinX: SINES,
  sinY: SINES,
  lapCos: ["c1", "c2", "c3"],
  lapSin: SINES,
  turnSin: ["s1", "n1"],
  X: ["Xr", "x"],
  Y: ["Yr", "y"]
};
export const PLACE_CONSTANTS: [string, number][] = [
  ["zero", 0],
  ["one", 1],
  ["twoPi", 2 * Math.PI],
  ["depth", (BLOB_DEPTH.near - BLOB_DEPTH.far) / 2],
  ...SIN_TERMS.map((x, k): [string, number] => [`sin${k}`, x]),
  ...COS_TERMS.map((x, k): [string, number] => [`cos${k}`, x])
];
interface PlaceStep {
  op: number;
  d: string;
  a: string;
  b: string;
}
/** blobPlaces for one ball at a share, and the player's draw into the melt's texels, step by step: the arithmetic of
    the player's doubles in fixed point. A name is a value, #name a constant, @name an alias. */
function placeSteps(): PlaceStep[] {
  const steps: PlaceStep[] = [];
  let n = 0;
  const step = (op: number, a: string, b: string, d = `v${n++}`) => {
    steps.push({ op, d, a, b });
    return d;
  };
  const mul = (a: string, b: string, d?: string) => step(PLACE_OP.mul, a, b, d);
  const mul48 = (a: string, b: string, d?: string) => step(PLACE_OP.mul48, a, b, d);
  const add = (a: string, b: string, d?: string) => step(PLACE_OP.add, a, b, d);
  const sub = (a: string, b: string, d?: string) => step(PLACE_OP.sub, a, b, d);
  // sin and cos of 2 pi times the share less its quarter turn, by their series, then turned by the quarter turn
  const th = mul("atr", "#twoPi");
  const z = mul(th, th);
  let ps = `#sin${SIN_TERMS.length - 1}`;
  for (let k = SIN_TERMS.length - 2; k >= 0; k--) ps = add(`#sin${k}`, mul(z, ps));
  let pc = `#cos${COS_TERMS.length - 1}`;
  for (let k = COS_TERMS.length - 2; k >= 0; k--) pc = add(`#cos${k}`, mul(z, pc));
  const s = mul(th, ps);
  add(mul(s, "cq"), mul(pc, "sq"), "s1");
  sub(mul(pc, "cq"), mul(s, "sq"), "c1");
  // two and three laps, and the sines' negatives
  mul(sub("c1", "s1"), add("c1", "s1"), "c2");
  const sc = mul("s1", "c1");
  add(sc, sc, "s2");
  sub(mul("c2", "c1"), mul("s2", "s1"), "c3");
  add(mul("s2", "c1"), mul("c2", "s1"), "s3");
  for (const k of [1, 2, 3]) sub("#zero", `s${k}`, `n${k}`);
  // the ball's blob: its breath and its wander
  const scale = mul(add("#one", mul("#depth", "@sinZ")), "blobR");
  const cx = add("blobX", mul("reachX", "@sinX"));
  const cy = add("blobY", mul("reachY", "@sinY"));
  // the ball's own swing, cos and sin of its phase plus its laps by the angle sum formulas, and its ring's turn
  const a = sub(mul("phaseCos", "@lapCos"), mul("phaseSin", "@lapSin"));
  const b = add(mul("phaseSin", "@lapCos"), mul("phaseCos", "@lapSin"));
  add("ballX", mul("swing", a), "x");
  add("ballY", mul("swing", b), "y");
  sub(mul("x", "c1"), mul("y", "@turnSin"), "Xr");
  add(mul("x", "@turnSin"), mul("y", "c1"), "Yr");
  // as the player's Float32Array holds them, then into the melt's texels
  const px = step(PLACE_OP.round, add(cx, mul("@X", scale)), "#zero");
  const py = step(PLACE_OP.round, add(cy, mul("@Y", scale)), "#zero");
  const pr = step(PLACE_OP.round, mul("ballR", scale), "#zero");
  step(PLACE_OP.float, mul48(sub(add(mul48(px, "sx"), "tx"), "mx"), "inv"), "#zero", "outX");
  step(PLACE_OP.float, mul48(sub(add(mul48(py, "sy"), "ty"), "my"), "inv"), "#zero", "outY");
  step(PLACE_OP.float, mul48(mul48(pr, "sx"), "inv"), "#zero", "outR");
  return steps;
}
/** The program as placeFrame reads it: each step its operation (3 bits), target, a and b (7 bits each), an operand
    under 64 a register, from 64 a constant (PLACE_K), from 112 an alias; and the register each named value takes,
    reused once no step reads it again. */
export const PLACE = (() => {
  const steps = placeSteps();
  const aliases = Object.keys(PLACE_ALIASES);
  const constants = PLACE_CONSTANTS.map(([name]) => name);
  // each value's last read, an alias reading all it may name; the outputs are read after the last step
  const last = new Map<string, number>();
  steps.forEach((s, i) => {
    for (const o of [s.a, s.b])
      if (o.startsWith("@")) for (const t of PLACE_ALIASES[o.slice(1)]) last.set(t, i);
      else if (!o.startsWith("#")) last.set(o, i);
  });
  for (const o of ["outX", "outY", "outR"]) last.set(o, steps.length);
  const reg: Record<string, number> = {};
  for (const [k, name] of PLACE_INPUTS.entries()) reg[name] = k;
  let registers = PLACE_INPUTS.length;
  const live = new Set(PLACE_INPUTS);
  const free: number[] = [];
  const code = steps.map((s, i) => {
    const operand = (o: string) =>
      o.startsWith("#")
        ? 64 + constants.indexOf(o.slice(1))
        : o.startsWith("@")
          ? 112 + aliases.indexOf(o.slice(1))
          : reg[o];
    const a = operand(s.a);
    const b = operand(s.b);
    // a value read for the last time here is read before the target is written: its register can take the target
    for (const name of [...live])
      if ((last.get(name) ?? -1) <= i) {
        free.push(reg[name]);
        live.delete(name);
      }
    free.sort((x, y) => x - y);
    const d = free.shift() ?? registers++;
    reg[s.d] = d;
    live.add(s.d);
    return s.op | (d << 3) | (a << 10) | (b << 17);
  });
  if (registers > 64 || constants.length > 48 || aliases.length > 16)
    throw new Error("the place program overflows");
  return { code, registers, reg, constants: PLACE_CONSTANTS.map(([, x]) => x) };
})();

/** A ball's place in fixed point, as GLSL: blobPlaces with the player's draw into the melt's texels, from the share of
    the loop as a Q52 number. Reads the scene's numbers from BLOBS, BLOB_LAPS, BALLS and BALL_LAPS (Q52), and runs its
    steps by steps(n), a count the compiler cannot see (Common's in the Shadertoy text). */
export function glslFixedPlace(lit: (x: number, f?: number) => string = fixedLit): string {
  const R = PLACE.reg;
  const rows = (items: string[], per: number) =>
    Array.from(
      { length: Math.ceil(items.length / per) },
      (_, k) => `  ${items.slice(k * per, k * per + per).join(", ")}`
    ).join(",\n");
  return `// A ball's place each frame, in fixed point: 52 bits of fraction (Q).
const int Q = 52;
const uvec2 Q_ONE = ${lit(1)}, Q_MINUS_ONE = ${lit(-1)};

// A ball's place as a program, which one loop runs: blobPlaces at the share, sin and cos by their series, and the
// player's draw into the melt's texels, each operation written once (a compiler inlines every call, and written out
// the forty-odd products took SwiftShader's minutes). Each step: its operation (a product at Q or 48 bits, a sum, a
// difference, a float the player keeps back at 48 bits, a float's bits), a target, a and b, 3 and 7 bits each. An
// operand under 64 is a register; from 64 a constant of PLACE_K; from 112 what the ball's laps choose.
const uvec2 PLACE_K[${PLACE.constants.length}] = uvec2[](
${rows(
  PLACE.constants.map(x => lit(x)),
  3
)}
);
const uint PLACE_CODE[${PLACE.code.length}] = uint[](
${rows(
  PLACE.code.map(c => `${c}u`),
  12
)}
);
const ivec3 PLACE_SINES = ivec3(${R.s1}, ${R.s2}, ${R.s3}), PLACE_NEGATIVES = ivec3(${R.n1}, ${R.n2}, ${R.n3});
const ivec3 PLACE_COSINES = ivec3(${R.c1}, ${R.c2}, ${R.c3});
// the register of the sine of laps laps a loop, the negative's for negative laps
int sineOf(int laps) {
  int k = abs(laps) - 1;
  return laps > 0 ? PLACE_SINES[k] : PLACE_NEGATIVES[k];
}
// blobPlaces for ball \`which\` at the share \`at\`, then the player's draw into the melt's texels, as floats; made
// holds the layout's doubles: the map (sx, sy, tx, ty), the melt's corner and the texel's inverse
vec3 placeFrame(uvec2 at, int which, uvec2 made[7]) {
  uvec2 V[${PLACE.registers}];
  // the share's nearest quarter turn, the share less it, and the turn's cosine and sine
  int quarter = int(shr64(add64(shl64(at, 2), shl64(uvec2(0u, 1u), Q - 1)), Q).y);
  int turn = quarter & 3;
  V[0] = sub64(at, shl64(uvec2(0u, uint(quarter)), Q - 2));
  V[1] = turn == 0 ? Q_ONE : turn == 2 ? Q_MINUS_ONE : uvec2(0u);
  V[2] = turn == 1 ? Q_ONE : turn == 3 ? Q_MINUS_ONE : uvec2(0u);
  int blob = which / 8;
  for (int k = 0; k < 5; k++) V[3 + k] = BLOBS[blob * 5 + k];
  for (int k = 0; k < 6; k++) V[8 + k] = BALLS[which * 6 + k];
  // the map, the melt's corner and the texel's inverse at 48 bits
  for (int k = 0; k < 7; k++) V[14 + k] = fdouble(made[k], 48);
  // what the ball's laps choose: sines by its blob's laps in depth, across and down, the cosine and sine of its own
  // laps, the ring's turn, and its place turned with the ring where it rides one
  ivec4 laps = BLOB_LAPS[blob];
  ivec2 own = BALL_LAPS[which];
  ivec4 to0 = ivec4(sineOf(laps.z), sineOf(laps.x), sineOf(laps.y), PLACE_COSINES[abs(own.x) - 1]);
  ivec4 to1 = ivec4(sineOf(own.x), laps.w < 0 ? ${R.n1} : ${R.s1}, own.y != 0 ? ${R.Xr} : ${R.x}, own.y != 0 ? ${R.Yr} : ${R.y});
  for (int pc = 0; pc < steps(${PLACE.code.length}); pc++) {
    uint ins = PLACE_CODE[pc];
    uint op = ins & 7u;
    int a = int((ins >> 10) & 127u), b = int(ins >> 17);
    a = a < 112 ? a : a < 116 ? to0[(a - 112) & 3] : to1[(a - 116) & 3];
    b = b < 112 ? b : b < 116 ? to0[(b - 112) & 3] : to1[(b - 116) & 3];
    uvec2 x = a < 64 ? V[min(a, ${PLACE.registers - 1})] : PLACE_K[clamp(a - 64, 0, ${PLACE.constants.length - 1})];
    uvec2 y = b < 64 ? V[min(b, ${PLACE.registers - 1})] : PLACE_K[clamp(b - 64, 0, ${PLACE.constants.length - 1})];
    // every operation, then the one the step names: no branch
    uvec2 product = fmul(x, y, op == 0u ? Q : 48), sum = add64(x, y), difference = sub64(x, y);
    float f = ftofloat(x, op == 4u ? Q : 48);
    uvec2 back = ffloat(f, 48);
    V[int((ins >> 3) & 127u)] = op < 2u ? product : op == 2u ? sum : op == 3u ? difference : op == 4u ? back : uvec2(floatBitsToUint(f), 0u);
  }
  return vec3(uintBitsToFloat(V[${R.outX}].x), uintBitsToFloat(V[${R.outY}].x), uintBitsToFloat(V[${R.outR}].x));
}`;
}

export interface FixedScene {
  blobs: {
    x: number;
    y: number;
    R: number;
    reachX: number;
    reachY: number;
    lapsX: number;
    lapsY: number;
    depth: number;
    spin: number;
  }[];
  balls: {
    x: number;
    y: number;
    r: number;
    swing: number;
    phaseCos: number;
    phaseSin: number;
    laps: number;
    ring: boolean;
  }[];
}
/** placeFrame in JavaScript, bit for bit, for the tests. */
export function blobFixedMirror() {
  const Q = 52;
  const q = (x: number, f = Q) => fixedOf(x, f);
  const place = (
    at: bigint,
    scene: FixedScene,
    which: number,
    layout: {
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      meltX: number;
      meltY: number;
      invTexel: number;
    }
  ): [number, number, number] => {
    // placeFrame: its inputs, what the laps choose, and the program run as its loop runs it
    const quarter = Number(((at << 2n) + (1n << BigInt(Q - 1))) >> BigInt(Q));
    const turn = quarter & 3;
    const blob = scene.blobs[Math.floor(which / 8)];
    const ball = scene.balls[which];
    const D = 48;
    const V: bigint[] = [
      at - (BigInt(quarter) << BigInt(Q - 2)),
      q([1, 0, -1, 0][turn]),
      q([0, 1, 0, -1][turn]),
      ...[blob.x, blob.y, blob.R, blob.reachX, blob.reachY].map(x => q(x)),
      ...[ball.x, ball.y, ball.r, ball.swing, ball.phaseCos, ball.phaseSin].map(x => q(x)),
      ...[
        layout.sx,
        layout.sy,
        layout.tx,
        layout.ty,
        layout.meltX,
        layout.meltY,
        layout.invTexel
      ].map(x => q(x, D))
    ];
    const floats: number[] = [];
    const R = PLACE.reg;
    const sine = (laps: number) => (laps > 0 ? R[`s${laps}`] : R[`n${-laps}`]);
    const to = [
      sine(blob.depth),
      sine(blob.lapsX),
      sine(blob.lapsY),
      R[`c${Math.abs(ball.laps)}`],
      sine(ball.laps),
      blob.spin < 0 ? R.n1 : R.s1,
      ball.ring ? R.Xr : R.x,
      ball.ring ? R.Yr : R.y
    ];
    const K = PLACE.constants.map(x => q(x));
    const value = (o: number) => {
      const r = o >= 112 ? to[o - 112] : o;
      return r < 64 ? V[r] : K[r - 64];
    };
    for (const ins of PLACE.code) {
      const op = ins & 7;
      const x = value((ins >> 10) & 127);
      const y = value(ins >>> 17);
      const d = (ins >> 3) & 127;
      if (op >= 4) floats[d] = ftofloatMirror(x, op === 4 ? Q : D);
      V[d] =
        op < 2
          ? fmulMirror(x, y, op === 0 ? Q : D)
          : op === 2
            ? wrap(x + y)
            : op === 3
              ? wrap(x - y)
              : op === 4
                ? ffloatMirror(floats[d], D)
                : 0n;
    }
    return [floats[R.outX], floats[R.outY], floats[R.outR]];
  };
  return { place };
}
