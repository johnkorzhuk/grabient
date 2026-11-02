/* The blob's clock and its balls' places each frame in 64-bit fixed point, for its Shadertoy text (blob-shadertoy.ts):
   integers, which every GPU computes exactly and none reorders or fuses, where the player's script computes in doubles
   (ui/blob-player.ts, blob.ts's blobPlaces). The places are within about 2^-52 of the player's doubles, so each lands
   on the float the player's Float32Array holds but at odds of about one in a hundred million. Run every frame by a few
   texels, it costs a GPU a few thousand integer operations, where the double program (blob-program.ts) runs only as
   the canvas takes a size.
     t, the clock's seconds (kept modulo the loop, which is all its share depends on), the ease, the speed, the share,
     sines and cosines and places in the design: 52 bits of fraction (Q52)
     the frame rate's milliseconds: 32 (Q32); places in the melt's texels: 48 (Q48)
   blobFixedMirror computes the same bits in JavaScript, with BigInt, for the tests. */
import { BLOB_DEPTH, BLOB_LOOP } from "./blob.ts";

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

export const GLSL_FIXED = `// Fixed point: signed 64-bit integers as two words, high first, with F bits of fraction.
uvec2 fneg(uvec2 a) { return sub64(uvec2(0u), a); }
uvec2 fabs(uvec2 a) { return (a.x >> 31) != 0u ? fneg(a) : a; }
bool flt(uvec2 a, uvec2 b) { return int(a.x) < int(b.x) || (a.x == b.x && a.y < b.y); }
uvec2 fmin(uvec2 a, uvec2 b) { return flt(b, a) ? b : a; }
// a times b, F bits of fraction, rounded to nearest with ties away from zero
uvec2 fmul(uvec2 a, uvec2 b, int F) {
  uint sign = (a.x ^ b.x) >> 31;
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
  uvec2 high = add64(uvec2(w3, w2), uvec2(0u, uint(lt64(low, uvec2(w1, w0)))));
  uvec2 r = shl64(high, 64 - F) | shr64(low, F);
  return sign != 0u ? fneg(r) : r;
}
uvec2 fint(int i, int F) { return shl64(uvec2(i < 0 ? 0xffffffffu : 0u, uint(i)), F); }
// a float exactly (to F bits), as its bits say
uvec2 ffloat(float v, int F) {
  uint b = floatBitsToUint(v);
  if ((b << 1) == 0u) return uvec2(0u);
  int e = int((b >> 23) & 0xffu) - 150 + F;
  uvec2 m = uvec2(0u, (b & 0x7fffffu) | 0x800000u);
  uvec2 r = e >= 0 ? shl64(m, e) : shr64(m, -e);
  return (b >> 31) != 0u ? fneg(r) : r;
}
// a double (its two words) to F bits, rounded to nearest
uvec2 fdouble(uvec2 d, int F) {
  if (((d.x << 1) | d.y) == 0u) return uvec2(0u);
  int e = int((d.x >> 20) & 0x7ffu) - 1075 + F;
  uvec2 m = uvec2((d.x & 0xfffffu) | 0x100000u, d.y);
  uvec2 r = e >= 0 ? shl64(m, e) : shr64(add64(m, shl64(uvec2(0u, 1u), -e - 1)), -e);
  return (d.x >> 31) != 0u ? fneg(r) : r;
}
// the float nearest, ties to even, as a Float32Array keeps it
float ftofloat(uvec2 a, int F) {
  uint sign = a.x & 0x80000000u;
  uvec2 m = fabs(a);
  if (m == uvec2(0u)) return 0.0;
  int top = 63 - clz64(m);
  uvec2 kept = shr64(m, max(top - 23, 0));
  kept = shl64(kept, max(23 - top, 0));
  uint k = kept.y;
  if (top > 23) {
    uvec2 rest = m & ~shl64(uvec2(0xffffffffu), top - 23);
    uvec2 halfway = shl64(uvec2(0u, 1u), top - 24);
    k += uint(lt64(halfway, rest)) | (uint(rest == halfway) & (k & 1u));
  }
  int e = top - F + 127;
  if ((k >> 24) != 0u) { k >>= 1; e += 1; }
  return uintBitsToFloat(sign | (uint(e) << 23) | (k & 0x7fffffu));
}`;

/** The constants the frame's fixed point reads, by the names it reads them under. */
export const FIXED_CONSTANTS = {
  ONE: 1,
  THREE: 3,
  LOOP: BLOB_LOOP,
  INV_LOOP: 1 / BLOB_LOOP,
  TWO_PI: 2 * Math.PI,
  DEPTH: (BLOB_DEPTH.near - BLOB_DEPTH.far) / 2,
  TENTH: 0.1
};
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
export function fdivMirror(a: bigint, b: bigint, f: number): bigint {
  const negative = a < 0n !== b < 0n;
  const q = ((a < 0n ? -a : a) << BigInt(f)) / (b < 0n ? -b : b);
  return wrap(negative ? -q : q);
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

/** The clock and a ball's place in fixed point, as GLSL: the player's tick (ui/blob-player.ts) on Shadertoy's frame
    time, and blobPlaces with the player's draw into the melt's texels. Reads the scene's numbers from BLOBS, BLOB_LAPS,
    BALLS and BALL_LAPS (Q52), and the settings SPEED, FPS and EASE. */
export function glslFixedFrame(lit: (x: number, f?: number) => string = fixedLit): string {
  const C = FIXED_CONSTANTS;
  return `// The clock and a ball's place each frame, in fixed point: 52 bits of fraction (Q), the pace's milliseconds 32.
const int Q = 52;
const uvec2 Q_ONE = ${lit(C.ONE)}, Q_THREE = ${lit(C.THREE)}, Q_LOOP = ${lit(C.LOOP)}, Q_PER_LOOP = ${lit(C.INV_LOOP)};
const uvec2 Q_TWO_PI = ${lit(C.TWO_PI)}, Q_DEPTH = ${lit(C.DEPTH)};
// sin and cos about 0 by Taylor's series, x^(2k+1) / (2k+1)! and x^2k / (2k)!
const uvec2 SIN_Q[${SIN_TERMS.length}] = uvec2[](${SIN_TERMS.map(x => lit(x)).join(", ")});
const uvec2 COS_Q[${COS_TERMS.length}] = uvec2[](${COS_TERMS.map(x => lit(x)).join(", ")});
struct Clock {
  uvec2 t, warm, last, drawn, at;
  bool draw, paceSet;
};
// the player's tick: from the frame before's clock, with Shadertoy's frame time
Clock clockFrame(uvec2 t, uvec2 warm, uvec2 last, uvec2 drawn, bool paceSet, bool first, bool changed) {
  // the frame's time, the speed, the ease and the pace from their floats: within a float's 2^-24 of the player's
  // doubles, as close as Shadertoy's float time lets the clock be anyway
  uvec2 dt = first ? uvec2(0u) : ffloat(min(${C.TENTH.toFixed(1)}, iTimeDelta), Q);
  uvec2 speed = ffloat(SPEED, Q), ease = ffloat(EASE, Q);
  bool moving = SPEED > 0.0;
  uvec2 warm1 = fmin(ease, add64(warm, dt));
  uvec2 e = EASE > 0.0 ? fmul(warm1, ffloat(1.0 / max(EASE, 1e-6), Q), Q) : Q_ONE;
  uvec2 step = fmul(fmul(fmul(fmul(dt, speed, Q), e, Q), e, Q), sub64(Q_THREE, add64(e, e)), Q);
  // the loop's seconds, kept within the loop, which is all its share depends on
  uvec2 t1 = add64(t, step);
  if (!flt(t1, Q_LOOP)) t1 = sub64(t1, Q_LOOP);
  Clock c;
  c.t = moving && !first ? t1 : t;
  c.warm = moving ? (first ? warm : warm1) : uvec2(0u);
  c.at = fmul(c.t, Q_PER_LOOP, Q);
  // the frame rate's pace: a frame due once each 1 / FPS, a little early rather than a frame late
  uvec2 now = fmul(ffloat(iTime, 32), fint(1000, 32), 32);
  uvec2 every = ffloat(1000.0 / FPS, 32);
  uvec2 early = sub64(every, fmin(fint(4, 32), fmul(every, ${lit(0.2, 32)}, 32)));
  uvec2 gap = sub64(now, last);
  bool due = !paceSet || !flt(gap, early);
  uvec2 next = paceSet ? (flt(add64(every, every), gap) ? now : add64(last, every)) : now;
  bool differs = c.at != drawn;
  bool consult = !changed && differs;
  c.draw = changed || (differs && due);
  c.last = consult && due ? next : last;
  c.paceSet = consult || paceSet;
  c.drawn = c.draw ? c.at : drawn;
  return c;
}
uvec2 sinLaps(int laps, uvec2 s1, uvec2 s2, uvec2 s3) {
  int k = abs(laps);
  uvec2 s = k == 1 ? s1 : k == 2 ? s2 : s3;
  return laps < 0 ? fneg(s) : s;
}
uvec2 cosLaps(int laps, uvec2 c1, uvec2 c2, uvec2 c3) {
  int k = abs(laps);
  return k == 1 ? c1 : k == 2 ? c2 : c3;
}
// blobPlaces for ball \`which\` at the share \`at\`, then the player's draw into the melt's texels (Q48), as floats
vec3 placeFrame(uvec2 at, int which, uvec2 sx, uvec2 sy, uvec2 tx, uvec2 ty, uvec2 mx, uvec2 my, uvec2 inv) {
  // sin and cos of 2 pi at, about its nearest quarter turn
  int quarter = int(shr64(add64(shl64(at, 2), shl64(uvec2(0u, 1u), Q - 1)), Q).y);
  uvec2 th = fmul(sub64(at, shl64(uvec2(0u, uint(quarter)), Q - 2)), Q_TWO_PI, Q);
  uvec2 z = fmul(th, th, Q);
  uvec2 ps = SIN_Q[${SIN_TERMS.length - 1}], pc = COS_Q[${COS_TERMS.length - 1}];
  for (int k = ${SIN_TERMS.length - 2}; k >= 0; k--) ps = add64(SIN_Q[k], fmul(z, ps, Q));
  for (int k = ${COS_TERMS.length - 2}; k >= 0; k--) pc = add64(COS_Q[k], fmul(z, pc, Q));
  uvec2 s = fmul(th, ps, Q);
  int turn = quarter & 3;
  uvec2 s1 = turn == 0 ? s : turn == 1 ? pc : turn == 2 ? fneg(s) : fneg(pc);
  uvec2 c1 = turn == 0 ? pc : turn == 1 ? fneg(s) : turn == 2 ? fneg(pc) : s;
  // two and three laps
  uvec2 c2 = fmul(sub64(c1, s1), add64(c1, s1), Q), s2 = shl64(fmul(s1, c1, Q), 1);
  uvec2 c3 = sub64(fmul(c2, c1, Q), fmul(s2, s1, Q)), s3 = add64(fmul(s2, c1, Q), fmul(c2, s1, Q));
  // the ball's blob: its wander, its breath, its ring's turn
  int blob = which / 8;
  ivec4 laps = BLOB_LAPS[blob];
  uvec2 scale = fmul(add64(Q_ONE, fmul(Q_DEPTH, sinLaps(laps.z, s1, s2, s3), Q)), BLOBS[blob * 5 + 2], Q);
  uvec2 x0 = add64(BLOBS[blob * 5], fmul(BLOBS[blob * 5 + 3], sinLaps(laps.x, s1, s2, s3), Q));
  uvec2 y0 = add64(BLOBS[blob * 5 + 1], fmul(BLOBS[blob * 5 + 4], sinLaps(laps.y, s1, s2, s3), Q));
  uvec2 turnSin = laps.w < 0 ? fneg(s1) : s1;
  // the ball's own swing: cos and sin of its phase plus its laps, by the angle sum formulas
  ivec2 own = BALL_LAPS[which];
  uvec2 lapCos = cosLaps(own.x, c1, c2, c3), lapSin = sinLaps(own.x, s1, s2, s3);
  uvec2 phaseCos = BALLS[which * 6 + 4], phaseSin = BALLS[which * 6 + 5], swing = BALLS[which * 6 + 3];
  uvec2 x = add64(BALLS[which * 6], fmul(swing, sub64(fmul(phaseCos, lapCos, Q), fmul(phaseSin, lapSin, Q)), Q));
  uvec2 y = add64(BALLS[which * 6 + 1], fmul(swing, add64(fmul(phaseSin, lapCos, Q), fmul(phaseCos, lapSin, Q)), Q));
  uvec2 X = own.y != 0 ? sub64(fmul(x, c1, Q), fmul(y, turnSin, Q)) : x;
  uvec2 Y = own.y != 0 ? add64(fmul(x, turnSin, Q), fmul(y, c1, Q)) : y;
  // as the player's Float32Array holds them, then into the melt's texels
  float px = ftofloat(add64(x0, fmul(X, scale, Q)), Q);
  float py = ftofloat(add64(y0, fmul(Y, scale, Q)), Q);
  float pr = ftofloat(fmul(BALLS[which * 6 + 2], scale, Q), Q);
  return vec3(
    ftofloat(fmul(sub64(add64(fmul(ffloat(px, 48), sx, 48), tx), mx), inv, 48), 48),
    ftofloat(fmul(sub64(add64(fmul(ffloat(py, 48), sy, 48), ty), my), inv, 48), 48),
    ftofloat(fmul(fmul(ffloat(pr, 48), sx, 48), inv, 48), 48)
  );
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
export interface FixedClock {
  t: bigint;
  warm: bigint;
  last: bigint;
  drawn: bigint;
  at: bigint;
  draw: boolean;
  paceSet: boolean;
}

/** clockFrame and placeFrame in JavaScript, bit for bit, for the tests. */
export function blobFixedMirror(settings: { speed: number; fps: number; ease: number }) {
  const Q = 52;
  const q = (x: number, f = Q) => fixedOf(x, f);
  const int = (i: number, f = Q) => BigInt(i) << BigInt(f);
  const C = FIXED_CONSTANTS;
  const min = (a: bigint, b: bigint) => (b < a ? b : a);
  const clock = (
    s: { t: bigint; warm: bigint; last: bigint; drawn: bigint; paceSet: boolean },
    first: boolean,
    changed: boolean,
    iTimeDelta: number,
    iTime: number
  ): FixedClock => {
    const f32 = Math.fround;
    const dt = first ? 0n : ffloatMirror(Math.min(f32(0.1), f32(iTimeDelta)), Q);
    const speed = ffloatMirror(f32(settings.speed), Q);
    const ease = ffloatMirror(f32(settings.ease), Q);
    const moving = f32(settings.speed) > 0;
    const warm1 = min(ease, s.warm + dt);
    const e =
      f32(settings.ease) > 0
        ? fmulMirror(warm1, ffloatMirror(f32(1 / Math.max(f32(settings.ease), f32(1e-6))), Q), Q)
        : q(C.ONE);
    const step = fmulMirror(
      fmulMirror(fmulMirror(fmulMirror(dt, speed, Q), e, Q), e, Q),
      q(C.THREE) - (e + e),
      Q
    );
    let t1 = s.t + step;
    if (!(t1 < q(C.LOOP))) t1 -= q(C.LOOP);
    const t = moving && !first ? t1 : s.t;
    const warm = moving ? (first ? s.warm : warm1) : 0n;
    const at = fmulMirror(t, q(C.INV_LOOP), Q);
    const now = fmulMirror(ffloatMirror(Math.fround(iTime), 32), int(1000, 32), 32);
    const every = ffloatMirror(f32(1000 / f32(settings.fps)), 32);
    const early = every - min(int(4, 32), fmulMirror(every, q(0.2, 32), 32));
    const gap = now - s.last;
    const due = !s.paceSet || !(gap < early);
    const next = s.paceSet ? (every + every < gap ? now : s.last + every) : now;
    const differs = at !== s.drawn;
    const consult = !changed && differs;
    const draw = changed || (differs && due);
    return {
      t,
      warm,
      at,
      draw,
      last: consult && due ? next : s.last,
      paceSet: consult || s.paceSet,
      drawn: draw ? at : s.drawn
    };
  };
  const sinLaps = (laps: number, s: bigint[]) =>
    laps < 0 ? -s[Math.abs(laps) - 1] : s[Math.abs(laps) - 1];
  const cosLaps = (laps: number, c: bigint[]) => c[Math.abs(laps) - 1];
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
    const quarter = Number(((at << 2n) + (1n << BigInt(Q - 1))) >> BigInt(Q));
    const th = fmulMirror(at - (BigInt(quarter) << BigInt(Q - 2)), q(C.TWO_PI), Q);
    const z = fmulMirror(th, th, Q);
    let ps = q(SIN_TERMS[SIN_TERMS.length - 1]);
    let pc = q(COS_TERMS[COS_TERMS.length - 1]);
    for (let k = SIN_TERMS.length - 2; k >= 0; k--) ps = q(SIN_TERMS[k]) + fmulMirror(z, ps, Q);
    for (let k = COS_TERMS.length - 2; k >= 0; k--) pc = q(COS_TERMS[k]) + fmulMirror(z, pc, Q);
    const s = fmulMirror(th, ps, Q);
    const turn = quarter & 3;
    const s1 = [s, pc, -s, -pc][turn];
    const c1 = [pc, -s, -pc, s][turn];
    const c2 = fmulMirror(c1 - s1, c1 + s1, Q);
    const s2 = wrap(fmulMirror(s1, c1, Q) << 1n);
    const c3 = fmulMirror(c2, c1, Q) - fmulMirror(s2, s1, Q);
    const s3 = fmulMirror(s2, c1, Q) + fmulMirror(c2, s1, Q);
    const S = [s1, s2, s3];
    const Cs = [c1, c2, c3];
    const blob = scene.blobs[Math.floor(which / 8)];
    const ball = scene.balls[which];
    const scale = fmulMirror(
      q(C.ONE) + fmulMirror(q(C.DEPTH), sinLaps(blob.depth, S), Q),
      q(blob.R),
      Q
    );
    const x0 = q(blob.x) + fmulMirror(q(blob.reachX), sinLaps(blob.lapsX, S), Q);
    const y0 = q(blob.y) + fmulMirror(q(blob.reachY), sinLaps(blob.lapsY, S), Q);
    const turnSin = blob.spin < 0 ? -s1 : s1;
    const lapCos = cosLaps(ball.laps, Cs);
    const lapSin = sinLaps(ball.laps, S);
    const pcos = q(ball.phaseCos);
    const psin = q(ball.phaseSin);
    const swing = q(ball.swing);
    const x =
      q(ball.x) + fmulMirror(swing, fmulMirror(pcos, lapCos, Q) - fmulMirror(psin, lapSin, Q), Q);
    const y =
      q(ball.y) + fmulMirror(swing, fmulMirror(psin, lapCos, Q) + fmulMirror(pcos, lapSin, Q), Q);
    const X = ball.ring ? fmulMirror(x, c1, Q) - fmulMirror(y, turnSin, Q) : x;
    const Y = ball.ring ? fmulMirror(x, turnSin, Q) + fmulMirror(y, c1, Q) : y;
    const px = ftofloatMirror(x0 + fmulMirror(X, scale, Q), Q);
    const py = ftofloatMirror(y0 + fmulMirror(Y, scale, Q), Q);
    const pr = ftofloatMirror(fmulMirror(q(ball.r), scale, Q), Q);
    const D = 48;
    const inv = q(layout.invTexel, D);
    return [
      ftofloatMirror(
        fmulMirror(
          fmulMirror(ffloatMirror(px, D), q(layout.sx, D), D) +
            q(layout.tx, D) -
            q(layout.meltX, D),
          inv,
          D
        ),
        D
      ),
      ftofloatMirror(
        fmulMirror(
          fmulMirror(ffloatMirror(py, D), q(layout.sy, D), D) +
            q(layout.ty, D) -
            q(layout.meltY, D),
          inv,
          D
        ),
        D
      ),
      ftofloatMirror(fmulMirror(fmulMirror(ffloatMirror(pr, D), q(layout.sx, D), D), inv, D), D)
    ];
  };
  return { clock, place };
}
