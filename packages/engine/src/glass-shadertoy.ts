/* The fluted glass as Shadertoy tabs (glass-shader.ts writes them out): Common, Buffer A to D and Image, which draw what
   the site's WebGL player draws (ui/glass-player.ts) with no JavaScript. The player works its numbers out in doubles:
   Buffer A works the same ones out with pairs of floats (about 48 bits, so each rounds to the player's float), once
   for each canvas size, angle and shape, and the clock and the discs' places each frame. Shadertoy has no blending, no
   instancing and no 8-bit textures, so Buffer B draws the discs over the field as WebGL's rasterizer sets up the
   player's quads (on SwiftShader: corners snapped to 16ths of a pixel, each varying from its triangle's plane), blends
   them in floats and keeps 8 bits, and every bilinear read is the 8-bit filter worked out by hand. Buffer B also keeps
   the rib map, baked whenever Buffer A makes a layout.
   shadertoy.com counts each tab's frames apart (a tab counts from when it was made; only rewind starts them all at
   0, and clears every buffer) and keeps its buffers through a compile, so no tab reads another's iFrame: Buffer A
   knows a layout of its own by a serial it keeps beside it, and makes another for a new size, ANGLE or SHAPE, and
   Buffer B bakes the map for each serial it has not baked. A resize hands each buffer its frame before last half the
   time (ResizeBuffer starts each ping-pong over), which Buffer A sees by its own frame count and makes up. */
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import { GLASS_ANGLE, GLASS_LOOP, GLASS_REF_D, GLASS_TUNING } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import type { Palette } from "./palette.ts";
import { effectShaderCredit } from "./shader-shell.ts";

const F = Math.fround;

/** A float32 as GLSL writes it: the fewest digits that read back as the same float, always a float literal. */
export function glslFloat(value: number): string {
  const v = F(value);
  if (Object.is(v, -0) || v === 0) return "0.0";
  for (let digits = 1; digits <= 9; digits++) {
    const s = v.toPrecision(digits);
    if (F(Number(s)) !== v) continue;
    if (/e/.test(s)) return s.replace(/^(-?\d)e/, "$1.0e").replace("e+", "e");
    return s.includes(".") ? s : `${s}.0`;
  }
  throw new Error(`no float for ${value}`);
}

/** A double as two floats, hi + lo: a GLSL vec2 that holds it to about 48 bits. */
export function glslDouble(value: number): string {
  const hi = F(value);
  const lo = F(value - hi);
  return `vec2(${glslFloat(hi)}, ${glslFloat(lo)})`;
}

const T = GLASS_TUNING;
const factorials = (n: number) => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
};
/* the lens's stops across a rib, denser toward both edges: glass.ts's x for each j */
const STOPS = Array.from(
  { length: T.lensStops + 1 },
  (_, j) => 0.5 - 0.5 * Math.cos((Math.PI * j) / T.lensStops)
);
/* the ribs' light: glass.ts's shadeTable, the same for every size */
const SHADE = Array.from({ length: 17 }, (_, i) => {
  const x = (2 * i) / 16 - 1;
  return (
    Math.round(
      Math.min(1, Math.max(0, 0.5 * (1 + T.shade * (T.shadeSkew * x - x * x + 1 / 3)))) * 10000
    ) / 10000
  );
});

const list = (values: readonly string[], per = 3) =>
  values
    .map((v, i) => `${i % per === 0 ? "\n  " : " "}${v}${i < values.length - 1 ? "," : ""}`)
    .join("");

/** The Common tab after the settings: the doubles, the design and its arithmetic, Buffer A's texels, the 8-bit
    filter. */
const COMMON = `// ---- Doubles. The site works the glass out in doubles; a pair of floats, hi + lo (about 48 bits), rounds to the same
// float, so every pass draws from the site's numbers. Each sum and product keeps its rounding error, which a compiler
// that rearranges the steps would drop ((a + b) - a is b only in exact numbers): keep() passes a float through an
// integer XOR with a 0 the compiler cannot see (ONE is iResolution.z, 1.0), so no step is moved, fused or cancelled
// across it, as an NVIDIA RTX's compiler did without it.
#define ONE iResolution.z
float keep(float x) { return uintBitsToFloat(floatBitsToUint(x) ^ (uint(ONE) - 1u)); }
vec2 twoSum(float a, float b) {
  float s = keep(a + b);
  float v = keep(s - a);
  return vec2(s, keep(keep(a - keep(s - v)) + keep(b - v)));
}
vec2 quickSum(float a, float b) {
  float s = keep(a + b);
  return vec2(s, keep(b - keep(s - a)));
}
vec2 twoProd(float a, float b) {
  float p = keep(a * b);
  float ta = keep(4097.0 * a);
  float ah = keep(ta - keep(ta - a));
  float al = keep(a - ah);
  float tb = keep(4097.0 * b);
  float bh = keep(tb - keep(tb - b));
  float bl = keep(b - bh);
  return vec2(p, keep(keep(keep(keep(ah * bh - p) + keep(ah * bl)) + keep(al * bh)) + keep(al * bl)));
}
vec2 dd(float a) { return vec2(a, 0.0); }
vec2 dAdd(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x);
  vec2 t = twoSum(a.y, b.y);
  s = quickSum(s.x, s.y + t.x);
  return quickSum(s.x, s.y + t.y);
}
vec2 dSub(vec2 a, vec2 b) { return dAdd(a, -b); }
vec2 dMul(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  return quickSum(p.x, p.y + (a.x * b.y + a.y * b.x));
}
vec2 dDiv(vec2 a, vec2 b) {
  float q1 = keep(a.x / b.x);
  vec2 r = dSub(a, dMul(b, dd(q1)));
  float q2 = keep(r.x / b.x);
  r = dSub(r, dMul(b, dd(q2)));
  return dAdd(quickSum(q1, q2), dd(keep(r.x / b.x)));
}
vec2 dSqrt(vec2 a) {
  if (a.x <= 0.0) return vec2(0.0);
  float x = keep(sqrt(a.x));
  vec2 r = dSub(a, twoProd(x, x));
  return quickSum(x, r.x / (2.0 * x));
}
bool dLess(vec2 a, vec2 b) { return a.x < b.x || (a.x == b.x && a.y < b.y); }
vec2 dMin(vec2 a, vec2 b) { return dLess(b, a) ? b : a; }
vec2 dMax(vec2 a, vec2 b) { return dLess(a, b) ? b : a; }
vec2 dAbs(vec2 a) { return a.x < 0.0 ? -a : a; }
vec2 dFloor(vec2 a) {
  float f = floor(a.x);
  return f == a.x ? quickSum(f, floor(a.y)) : dd(f);
}
// JavaScript's Math.round: the nearest whole number, halves up
float dRound(vec2 a) { return dFloor(dAdd(a, dd(0.5))).x; }
// the site's roundings to hundredths, thousandths and ten-thousandths
vec2 r2(vec2 a) { return dDiv(dd(dRound(dMul(a, dd(100.0)))), dd(100.0)); }
vec2 r3(vec2 a) { return dDiv(dd(dRound(dMul(a, dd(1000.0)))), dd(1000.0)); }
vec2 r4(vec2 a) { return dDiv(dd(dRound(dMul(a, dd(10000.0)))), dd(10000.0)); }
const vec2 LN2 = ${glslDouble(Math.LN2)};
const vec2 PI = ${glslDouble(Math.PI)};
const vec2 HALF_PI = ${glslDouble(Math.PI / 2)};
const vec2 EXP_C[11] = vec2[](${list(
  Array.from({ length: 11 }, (_, n) => glslDouble(1 / factorials(n))),
  2
)}
);
// e^a = 2^k (e^(r / 16))^16, r = a - k ln 2
vec2 dExp(vec2 a) {
  float k = floor(a.x / LN2.x + 0.5);
  vec2 r = dSub(a, dMul(LN2, dd(k))) * 0.0625;
  vec2 s = EXP_C[10];
  for (int i = 9; i >= 0; i--) s = dAdd(dMul(s, r), EXP_C[i]);
  for (int i = 0; i < 4; i++) s = dMul(s, s);
  return s * uintBitsToFloat(uint(int(k) + 127) << 23);
}
// Newton's steps on e^y = a from the float's own log
vec2 dLog(vec2 a) {
  vec2 y = dd(keep(log(a.x)));
  y = dAdd(y, dSub(dMul(a, dExp(-y)), dd(1.0)));
  return dAdd(y, dSub(dMul(a, dExp(-y)), dd(1.0)));
}
const vec2 SIN_C[9] = vec2[](${list(
  Array.from({ length: 9 }, (_, n) => glslDouble((n % 2 ? -1 : 1) / factorials(2 * n + 1))),
  2
)}
);
const vec2 COS_C[10] = vec2[](${list(
  Array.from({ length: 10 }, (_, n) => glslDouble((n % 2 ? -1 : 1) / factorials(2 * n))),
  2
)}
);
// sine and cosine: hi and lo of each
vec4 dSinCos(vec2 a) {
  float k = floor(a.x / HALF_PI.x + 0.5);
  vec2 r = dSub(a, dMul(HALF_PI, dd(k)));
  vec2 rr = dMul(r, r);
  vec2 s = SIN_C[8];
  for (int i = 7; i >= 0; i--) s = dAdd(dMul(s, rr), SIN_C[i]);
  s = dMul(s, r);
  vec2 c = COS_C[9];
  for (int i = 8; i >= 0; i--) c = dAdd(dMul(c, rr), COS_C[i]);
  int q = int(k) & 3;
  return q == 0 ? vec4(s, c) : q == 1 ? vec4(c, -s) : q == 2 ? vec4(-s, -c) : vec4(-c, s);
}
vec2 dAtan2(vec2 y, vec2 x) {
  vec2 t = dd(atan(y.x, x.x));
  for (int i = 0; i < 2; i++) {
    vec4 sc = dSinCos(t);
    t = dAdd(t, dDiv(dSub(dMul(y, sc.zw), dMul(x, sc.xy)), dAdd(dMul(x, sc.zw), dMul(y, sc.xy))));
  }
  return t;
}
vec2 dHypot(vec2 a, vec2 b) { return dSqrt(dAdd(dMul(a, a), dMul(b, b))); }

// ---- The design: the hill climb's numbers, doubles as the site holds them.
const vec2 ARC_C0 = ${glslDouble(T.geo.arcC[0])};
const vec2 ARC_C1 = ${glslDouble(T.geo.arcC[1])};
const vec2 ARC_DIR0 = ${glslDouble(T.geo.arcDir[0])};
const vec2 ARC_DIR1 = ${glslDouble(T.geo.arcDir[1])};
const vec2 ARC_R0 = ${glslDouble(T.geo.arcR0)};
const vec2 ARC_G = ${glslDouble(T.geo.arcG)};
const vec2 S0 = ${glslDouble(T.geo.s0)};
const vec2 P0 = ${glslDouble(T.geo.p0)};
const vec2 BETA_P = ${glslDouble(T.geo.betaP)};
const vec2 BETA_M = ${glslDouble(T.geo.betaM)};
const vec2 PHASE = ${glslDouble(T.geo.phase)};
const vec2 LENS_A = ${glslDouble(T.lensA)};
const vec2 LENS_B = ${glslDouble(T.lensB)};
const vec2 LENS_E = ${glslDouble(T.lensE)};
const vec2 LENS_KAPPA = ${glslDouble(T.lensKappa)};
const vec2 LENS_SHIFT = ${glslDouble(T.lensShift)};
const vec2 SEAM_W = ${glslDouble(T.seamW)};
const vec2 DISP = ${glslDouble(T.disp)};
const vec2 SPREAD = ${glslDouble(T.spread)};
const vec2 JITTER = ${glslDouble(T.jitter)};
const vec2 DISC_SIGMA = ${glslDouble(T.sigma)};
const vec2 ORBIT_ALONG = ${glslDouble(T.orbitAlong)};
const vec2 ORBIT_ACROSS = ${glslDouble(T.orbitAcross)};
const vec2 DISC_SCALE = ${glslDouble(T.discScale)};
const vec2 BLUR = ${glslDouble(T.blur)};
const vec2 REF_D = ${glslDouble(GLASS_REF_D)};
const vec2 SQRT2 = ${glslDouble(Math.SQRT2)};
const vec2 SQRT_2PI = ${glslDouble(Math.sqrt(2 * Math.PI))};
const float CORE = ${glslFloat(Math.round(T.core * 10000) / 10000)};
// the discs: how many, on a grid this many across and ROWS down, the base color among COLORS, the design's seed
const int NPTS = ${T.nPts};
const int GRID_X = ${T.gridX};
const int ROWS = ${Math.ceil(T.nPts / T.gridX)};
const int BASE = ${T.base};
const uint DESIGN_SEED = ${T.seed}u;
// a lap's seconds at speed 1, and the angle the ribs run at as designed
const float LOOP = ${glslFloat(GLASS_LOOP)};
const int DESIGN_ANGLE = ${GLASS_ANGLE};
// the lens's stops across a rib, denser toward both edges
const vec2 STOP_X[${STOPS.length}] = vec2[](${list(STOPS.map(glslDouble), 2)}
);
// the ribs' light, half the factor, at 16ths of the lens gray
const float SHADE[17] = float[](${list(SHADE.map(glslFloat), 6)}
);

// mulberry32, the design's random numbers: the same everywhere
uint diceState;
uint diceNext() {
  diceState += 0x6d2b79f5u;
  uint t = (diceState ^ (diceState >> 15u)) * (1u | diceState);
  t = (t + (t ^ (t >> 7u)) * (61u | t)) ^ t;
  return t ^ (t >> 14u);
}
vec2 diceValue(uint t) { return quickSum(float(t >> 8u) * 5.96046448e-8, float(t & 255u) * 2.32830644e-10); }
vec2 rand() { return diceValue(diceNext()); }
uint seedOf(int shape) { return (uint(shape + 1) * 0x9e3779b1u) ^ 0x5bd1e995u; }
vec2 between(vec2 least, vec2 most) { return dAdd(least, dMul(dSub(most, least), rand())); }

// The ribs' curve: circles |p - (C + s dir)| = R0 + g s around the middle, in diagonals, turned to the angle; the pitch
// in s grows away from s0 by beta a step, so a rib's index k(s) is a logarithm. A shape varies p0, beta and phase.
struct Geo { vec2 c0, c1, d0, d1, p0, betaP, betaM, phase; };
Geo geoOf(int shape, vec2 turn) {
  Geo g = Geo(ARC_C0, ARC_C1, ARC_DIR0, ARC_DIR1, P0, BETA_P, BETA_M, PHASE);
  if (shape != 0) {
    diceState = seedOf(shape) ^ 0x2545f491u;
    rand();
    vec2 widen = between(${glslDouble(0.8)}, ${glslDouble(1.25)});
    g.p0 = dMul(P0, between(${glslDouble(0.8)}, ${glslDouble(1.3)}));
    g.betaP = dMul(BETA_P, widen);
    g.betaM = dMul(BETA_M, widen);
    g.phase = dAdd(PHASE, rand());
  }
  vec4 sc = dSinCos(turn);
  g.c0 = dSub(dMul(ARC_C0, sc.zw), dMul(ARC_C1, sc.xy));
  g.c1 = dAdd(dMul(ARC_C0, sc.xy), dMul(ARC_C1, sc.zw));
  g.d0 = dSub(dMul(ARC_DIR0, sc.zw), dMul(ARC_DIR1, sc.xy));
  g.d1 = dAdd(dMul(ARC_DIR0, sc.xy), dMul(ARC_DIR1, sc.zw));
  return g;
}
// the level s of the circle through a point of the design (side W, diagonal D)
vec2 levelAt(Geo g, float W, vec2 D, vec2 X, vec2 Y) {
  vec2 q0 = dSub(dDiv(dSub(X, dd(W * 0.5)), D), g.c0);
  vec2 q1 = dSub(dDiv(dSub(Y, dd(W * 0.5)), D), g.c1);
  vec2 a2 = dSub(dd(1.0), dMul(ARC_G, ARC_G));
  vec2 b2 = dMul(dd(-2.0), dAdd(dAdd(dMul(q0, g.d0), dMul(q1, g.d1)), dMul(ARC_G, ARC_R0)));
  vec2 c2 = dSub(dAdd(dMul(q0, q0), dMul(q1, q1)), dMul(ARC_R0, ARC_R0));
  vec2 disc = dMax(dSub(dMul(b2, b2), dMul(dMul(dd(4.0), a2), c2)), vec2(0.0));
  return dDiv(dSub(-b2, dSqrt(disc)), dMul(dd(2.0), a2));
}
// a level's rib index
vec2 kOf(Geo g, vec2 s) {
  vec2 ds = dSub(s, S0);
  vec2 b = dLess(ds, vec2(0.0)) ? g.betaM : g.betaP;
  vec2 l = dLog(dAdd(dd(1.0), dDiv(dMul(b, dAbs(ds)), g.p0)));
  return dAdd(dDiv(dLess(ds, vec2(0.0)) ? -l : (ds.x == 0.0 ? vec2(0.0) : l), b), g.phase);
}
// a rib index's level, the inverse of kOf, within the site's search range
vec2 sOf(Geo g, float k) {
  vec2 y = dSub(dd(k), g.phase);
  bool up = !dLess(y, vec2(0.0));
  vec2 b = up ? g.betaP : g.betaM;
  vec2 m = dDiv(dMul(dSub(dExp(dMul(b, dAbs(y))), dd(1.0)), g.p0), b);
  return dMax(dd(-5.0), dMin(dd(5.0), dAdd(S0, up ? m : -m)));
}
// the lens across a rib, in pitches, v from -1 (its inner edge) to 1 (its outer)
vec2 lensF(vec2 v) {
  vec2 root = dSqrt(dMax(dSub(dd(1.0), dMul(dMul(dMul(LENS_KAPPA, LENS_KAPPA), v), v)), ${glslDouble(1e-3)}));
  vec2 sum = dAdd(dAdd(dMul(LENS_A, v), dMul(LENS_B, dMul(dMul(v, v), v))), dMul(LENS_E, dSub(dDiv(v, root), v)));
  return dAdd(-sum, LENS_SHIFT);
}
// a stop's displacement across a rib of this pitch, its fold eased over the seam
vec2 lensAt(vec2 x, vec2 seam, vec2 pitch) {
  vec2 e = dSub(dAbs(dSub(x, dd(0.5))), dd(0.5));
  vec2 tt = dMin(dd(1.0), dMax(vec2(0.0), dDiv(dAdd(e, seam), dMul(dd(2.0), seam))));
  vec2 band = dMul(dMul(tt, tt), dSub(dd(3.0), dMul(dd(2.0), tt)));
  vec2 uf = dAdd(dMul(x, dSub(dd(1.0), band)), dMul(dSub(dd(1.0), x), band));
  return dMul(dMul(lensF(dSub(dMul(dd(2.0), uf), dd(1.0))), pitch), DISP);
}

// What a canvas's size draws, whatever the colors: the design covering it (side S, the canvas's corner in it), the
// ribs, the displacement's scale, the blur and the filter's region, and the field's texture (1/q of the region).
struct Layout {
  float S;
  vec2 win;
  vec2 D;
  Geo g;
  float k0;
  int count;
  vec2 seamPx;
  vec2 scale;
  vec2 alpha;
  float dBox;
  vec2 sigmaEff;
  float regionX;
  float regionW;
  vec2 q;
  float fw;
};
Layout layoutOf(vec2 res) {
  Layout L;
  L.S = max(res.x, res.y);
  L.win = floor((vec2(L.S) - res) * 0.5 + 0.5);
  vec2 turn = dDiv(dMul(dd(float(ANGLE - DESIGN_ANGLE)), PI), dd(180.0));
  L.g = geoOf(SHAPE, turn);
  L.D = dMul(dd(L.S), SQRT2);
  vec2 u = dDiv(L.D, REF_D);
  // the ribs the box shows: their indexes along its edges
  vec2 lo = dd(1e30);
  vec2 hi = dd(-1e30);
  for (int i = 0; i <= 16; i++) {
    for (int e = 0; e < 4; e++) {
      vec2 along = dDiv(dd(float(i) * L.S), dd(16.0));
      vec2 X = e < 2 ? along : dd(e == 2 ? 0.0 : L.S);
      vec2 Y = e < 2 ? dd(e == 0 ? 0.0 : L.S) : along;
      vec2 k = kOf(L.g, levelAt(L.g, L.S, L.D, X, Y));
      lo = dMin(lo, k);
      hi = dMax(hi, k);
    }
  }
  L.k0 = dFloor(lo).x - 1.0;
  L.count = int(-dFloor(-hi).x + 1.0 - L.k0);
  L.seamPx = dMax(dMul(SEAM_W, u), ${glslDouble(1.2)});
  // the displacement's scale: twice the largest, and a little room
  vec2 dmax = dd(1.0);
  vec2 sIn = sOf(L.g, L.k0);
  for (int k = 0; k < 64; k++) {
    if (k >= L.count) break;
    vec2 sOut = sOf(L.g, L.k0 + float(k + 1));
    vec2 pitch = dMul(dMul(dSub(sOut, sIn), dAdd(dd(1.0), ARC_G)), L.D);
    vec2 seam = dDiv(L.seamPx, pitch);
    for (int j = 0; j < ${STOPS.length}; j++) dmax = dMax(dmax, dAbs(lensAt(STOP_X[j], seam, pitch)));
    sIn = sOut;
  }
  L.scale = r2(dMul(dd(2.0), dMul(dmax, ${glslDouble(1.02)})));
  // the discs' orbits lie along the ribs' tangent at the middle
  vec4 sc = dSinCos(turn);
  vec2 cxA = -dSub(dMul(ARC_C0, sc.zw), dMul(ARC_C1, sc.xy));
  vec2 cyA = -dAdd(dMul(ARC_C0, sc.xy), dMul(ARC_C1, sc.zw));
  vec2 nA = dHypot(cxA, cyA);
  L.alpha = r3(dDiv(dMul(dAtan2(dDiv(-cxA, nA), dDiv(cyA, nA)), dd(180.0)), PI));
  vec2 sigma = r2(dMul(BLUR, u));
  L.dBox = dFloor(dAdd(dDiv(dMul(dMul(sigma, dd(3.0)), SQRT_2PI), dd(4.0)), dd(0.5))).x;
  float b = L.dBox;
  L.sigmaEff = dSqrt(mod(b, 2.0) == 1.0 ? dDiv(dd(b * b - 1.0), dd(4.0)) : dDiv(dd(3.0 * b * b + 2.0 * b - 2.0), dd(12.0)));
  float move = -dFloor(-dDiv(L.scale, dd(2.0))).x + 1.0;
  float reach = ceil(1.5 * L.dBox) + 1.0;
  L.regionX = -move - reach;
  L.regionW = L.S + 2.0 * (move + reach);
  L.q = dMax(dd(1.0), dDiv(L.sigmaEff, dd(3.0)));
  L.fw = -dFloor(-dDiv(dd(L.regionW), L.q)).x + 1.0;
  return L;
}

// ---- Buffer A's texels, at the bottom left.
const ivec2 A_CLOCK = ivec2(0, 0);    // t and warm, each hi and lo
const ivec2 A_SHOWN = ivec2(1, 0);    // the time drawn, the pace's last frame in ms
const ivec2 A_BUILT = ivec2(2, 0);    // the canvas's size, ANGLE and SHAPE the layout is for, and its serial
const ivec2 A_LAYOUT = ivec2(3, 0);   // the design's side, the canvas's corner in it, the displacement's scale
const ivec2 A_REGION = ivec2(4, 0);   // the filter region's corner and side, q (hi, lo)
const ivec2 A_FIELD = ivec2(5, 0);    // the field's side, ribs and stops a rib
const ivec2 A_GLASS = ivec2(6, 0);    // 1 / (q fw), 1 / (q fh), the orbits' angle (hi, lo)
const int A_TAPS = 7;                  // 7 to 12: the blur's offsets and weights
const ivec2 A_LINE = ivec2(13, 0);    // the normal's line: x1, y1, x2 - x1, y2 - y1
const int A_NORMALS = 14;              // 14 to 30: the normal's stops: offset, red, green
const ivec2 A_STAMP = ivec2(31, 0);   // Buffer A's own iFrame as it wrote the clock
const int A_DISC = 1;                  // row 1: each disc's middle, radius and core in field texels, this frame
const int A_ORBIT = 2;                 // rows 2 and 3: each disc's orbit as the site rounds it
const int A_RIBS = 4;                  // row 4 on: a rib (middle, radius squared), then its stops (offset, gray)
// Whether the canvas holds the tabs' numbers, which they keep in their buffers: Buffer A's table (32 texels across,
// four rows and a row a rib, 28 rows at most) and the field (\`side\` texels square, three to a texel of Buffer B and
// one texel over for its record). 143 by 143 pixels holds any angle and shape; Shadertoy's canvas is far larger, and
// a smaller one shows the base color.
bool fits(float side, float ribs) {
  return iResolution.x >= 32.0 && iResolution.y >= float(A_RIBS) + ribs &&
    3.0 * (iResolution.x * iResolution.y - 1.0) >= side * side;
}

// ---- The field's 8-bit texels, packed: a texel's three bytes in one number, several to a buffer's texel (three in
// Buffer B's y, z and w, four in Buffers C and D), in rows from the bottom left, so the field fits a small canvas.
float pack(vec3 bytes) { return bytes.r * 65536.0 + bytes.g * 256.0 + bytes.b; }
vec3 unpack(float v) {
  int i = int(v);
  return vec3(float(i >> 16), float((i >> 8) & 255), float(i & 255));
}
// the field texel at p, in a buffer holding \`per\` a texel from channel \`first\`
vec3 fieldAt(sampler2D s, ivec2 p, int size, int per, int first) {
  int n = p.y * size + p.x;
  int k = n / per;
  int w = int(iResolution.x);
  return unpack(texelFetch(s, ivec2(k % w, k / w), 0)[first + n % per]);
}
// GPU's linear filter on an 8-bit texture, by hand: Shadertoy's buffers hold floats, so the bytes are kept as whole
// numbers and read as WebGL reads them clamped to the edge, the texel grid's coordinate's whole part picking four
// texels and its fraction weighing them, across then down, times 1/255
const float ONE_BELOW = 0.99999994;
const float INV255 = ${glslFloat(1 / 255)};
vec3 bilinear(sampler2D s, vec2 uv, float size, int per, int first) {
  vec2 coord = min(max(uv, 0.0), ONE_BELOW) * size - 0.5;
  vec2 f = floor(coord);
  vec2 w = coord - f;
  int side = int(size);
  ivec2 a = max(ivec2(f), 0);
  ivec2 b = min(ivec2(f) + 1, side - 1);
  vec3 c00 = fieldAt(s, a, side, per, first);
  vec3 c10 = fieldAt(s, ivec2(b.x, a.y), side, per, first);
  vec3 c01 = fieldAt(s, ivec2(a.x, b.y), side, per, first);
  vec3 c11 = fieldAt(s, b, side, per, first);
  vec3 top = c00 + w.x * (c10 - c00);
  vec3 bottom = c01 + w.x * (c11 - c01);
  return (top + w.y * (bottom - top)) * INV255;
}
// One pass of the field's blur at a field texel along \`step\` (the middle and five bilinear pairs either side), kept
// as 8 bits.
vec3 blurPass(sampler2D s, sampler2D a, vec2 fragCoord, vec2 step, float size, int per, int first) {
  vec2 uv = fragCoord / vec2(size);
  vec3 c = bilinear(s, uv, size, per, first) * texelFetch(a, ivec2(A_TAPS, 0), 0).y;
  for (int i = 1; i < 6; i++) {
    vec2 tap = texelFetch(a, ivec2(A_TAPS + i, 0), 0).xy;
    vec2 off = step * tap.x;
    c += (bilinear(s, uv + off, size, per, first) + bilinear(s, uv - off, size, per, first)) * tap.y;
  }
  return roundEven(clamp(c, 0.0, 1.0) * 255.0);
}
// a blur pass's texel: the four field texels it holds, blurred along \`step\` from a buffer holding \`per\` a texel
vec4 blurTexel(sampler2D s, sampler2D a, vec2 fragCoord, vec2 step, int per, int first) {
  float size = texelFetch(a, A_FIELD, 0).x;
  int side = int(size);
  int k = int(fragCoord.y) * int(iResolution.x) + int(fragCoord.x);
  vec4 o = vec4(0.0);
  for (int c = 0; c < 4; c++) {
    int n = 4 * k + c;
    if (n < side * side) o[c] = pack(blurPass(s, a, vec2(n % side, n / side) + 0.5, step, size, per, first));
  }
  return o;
}`;

/** The settings a reader edits, at the top of Common. */
function settings(
  colors: readonly string[],
  angle: number,
  shape: number,
  speed: number,
  fps: number
): string {
  return `// The glass's colors (the site takes six along the palette; any number will do), the angle its ribs run at
// (${GLASS_ANGLE} as designed), its shape (0 as designed, up to 999), how fast it plays (1 as designed, 0 holds the first
// frame), frames a second at most, and the seconds it takes to ease in. A new ANGLE or SHAPE lays the ribs out again
// as it compiles; after editing the design's numbers further down, press rewind (|<< under the picture).
const int COLORS[] = int[](${colors.map(c => `0x${c.slice(1)}`).join(", ")});
const int ANGLE = ${angle};
const int SHAPE = ${shape};
const float SPEED = ${glslFloat(speed)};
const int FPS = ${fps};
const float EASE = ${glslFloat(EFFECT_EASE_S)};`;
}

const BUFFER_A = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The layout for the canvas's size, ANGLE and SHAPE, made in the first frame and again whenever one changes, and each
// frame the clock and the discs' places, all as the site's player works them out.
vec4 kept(ivec2 p) { return texelFetch(iChannel0, p, 0); }
// what the layout is for, beside the canvas's size: a new one is made as either changes
const float KEY = float(ANGLE * 1000 + SHAPE);

// The clock, as the player keeps it: t, the loop's seconds at speed 1, advances by SPEED, easing in from rest over EASE
// seconds after the first frame; a frame is drawn once each 1 / FPS at most, and the picture holds the last one drawn.
struct Clock { vec2 t; vec2 warm; vec2 shown; vec2 paced; };
// a two-decimal setting, as the site's address keeps it
vec2 decimal(float v) { return dDiv(dd(floor(v * 100.0 + 0.5)), dd(100.0)); }
// a frame dt seconds after the last, at \`now\` seconds; a new layout is drawn at once
Clock tick(Clock c, float dt0, vec2 now, bool fresh) {
  vec2 dt = dMin(${glslDouble(0.1)}, dd(dt0));
  vec2 ease = decimal(EASE);
  if (SPEED == 0.0) c.warm = vec2(0.0);
  else {
    c.warm = dMin(ease, dAdd(c.warm, dt));
    vec2 e = EASE > 0.0 ? dDiv(c.warm, ease) : dd(1.0);
    vec2 step = dMul(dMul(dMul(dMul(dt, decimal(SPEED)), e), e), dSub(dd(3.0), dMul(dd(2.0), e)));
    c.t = dAdd(c.t, step);
  }
  if (fresh) c.shown = c.t;
  else if (c.t != c.shown) {
    // the pace: due once each 1 / FPS, a little early rather than a frame late, counted from the last due time
    vec2 ms = dMul(now, dd(1000.0));
    vec2 every = dDiv(dd(1000.0), dd(float(max(FPS, 1))));
    vec2 gap = dSub(ms, c.paced);
    if (FPS <= 0 || !dLess(gap, dSub(every, dMin(dd(4.0), dMul(every, ${glslDouble(0.2)}))))) {
      c.paced = dLess(dMul(dd(2.0), every), gap) ? ms : dAdd(c.paced, every);
      c.shown = c.t;
    }
  }
  return c;
}
Clock clockNow(bool fresh, bool restart) {
  // the first frame, the still's moment
  if (restart) return Clock(vec2(0.0), vec2(0.0), vec2(0.0), vec2(-1e30, 0.0));
  vec4 a = kept(A_CLOCK);
  vec4 b = kept(A_SHOWN);
  Clock c = Clock(a.xy, a.zw, b.xy, b.zw);
  // a resize may hand this buffer its frame before last: the frame lost is taken again, as long as this one
  if (kept(A_STAMP).x == float(iFrame - 2)) c = tick(c, iTimeDelta, dSub(dd(iTime), dd(iTimeDelta)), false);
  return tick(c, iTimeDelta, dd(iTime), fresh);
}

// A disc's orbit, as the site draws and rounds it: its middle, the ellipse's half axes along the ribs and across, its
// radius, a lap's seconds, its start and its way round.
struct Orbit { vec2 cx; vec2 cy; vec2 a; vec2 b; vec2 R; float dur; vec2 delay; float dir; };
Orbit orbitOf(Layout L, int i) {
  diceState = SHAPE != 0 ? seedOf(SHAPE) : DESIGN_SEED;
  Orbit d;
  for (int k = 0; k < NPTS; k++) {
    vec2 gx = dDiv(dd(float(k % GRID_X) + 0.5), dd(float(GRID_X)));
    vec2 gy = dDiv(dd(float(k / GRID_X) + 0.5), dd(float(ROWS)));
    vec2 W = dd(L.S);
    vec2 bx = dAdd(dMul(dMul(dSub(gx, dd(0.5)), W), SPREAD), dMul(dMul(dSub(rand(), dd(0.5)), W), JITTER));
    vec2 by = dAdd(dMul(dMul(dSub(gy, dd(0.5)), W), SPREAD), dMul(dMul(dSub(rand(), dd(0.5)), W), JITTER));
    float turns = diceNext() < 0x80000000u ? 1.0 : 2.0;
    float laps = turns * (diceNext() < 0x80000000u ? -1.0 : 1.0);
    vec2 th0 = rand();
    diceNext();
    vec2 a = r2(dMax(dd(0.5), dMul(dMul(ORBIT_ALONG, L.D), dAdd(${glslDouble(0.7)}, dMul(${glslDouble(0.6)}, rand())))));
    vec2 b = r2(dMax(dd(0.5), dMul(dMul(ORBIT_ACROSS, L.D), dAdd(${glslDouble(0.7)}, dMul(${glslDouble(0.6)}, rand())))));
    vec2 R = r2(dMul(dMul(dMul(DISC_SIGMA, L.D), dAdd(${glslDouble(0.85)}, dMul(${glslDouble(0.3)}, rand()))), DISC_SCALE));
    if (k == i) {
      float dur = LOOP / abs(laps);
      d = Orbit(r2(dAdd(dd(L.S * 0.5), bx)), r2(dAdd(dd(L.S * 0.5), by)), a, b, R, dur, r3(dMul(-th0, dd(dur))), sign(laps));
    }
  }
  return d;
}
// the orbit as kept, in hundredths and thousandths
vec4 orbitKept(Orbit d, int row) {
  return row == 0
    ? vec4(dRound(dMul(d.cx, dd(100.0))), dRound(dMul(d.cy, dd(100.0))), dRound(dMul(d.a, dd(100.0))), dRound(dMul(d.b, dd(100.0))))
    : vec4(dRound(dMul(d.R, dd(100.0))), d.dur, dRound(dMul(d.delay, dd(1000.0))), d.dir);
}
Orbit orbitRead(int i) {
  vec4 m = kept(ivec2(i, A_ORBIT));
  vec4 n = kept(ivec2(i, A_ORBIT + 1));
  vec2 h = dd(100.0);
  return Orbit(dDiv(dd(m.x), h), dDiv(dd(m.y), h), dDiv(dd(m.z), h), dDiv(dd(m.w), h), dDiv(dd(n.x), h), n.y, dDiv(dd(n.z), dd(1000.0)), n.w);
}
// a disc's middle at t, where its two turns put it, as floats
vec2 discAt(Orbit d, vec2 alpha, vec2 t) {
  vec4 ang = dSinCos(dDiv(dMul(dMul(dd(d.dir * 2.0), PI), dSub(t, d.delay)), dd(d.dur)));
  vec4 al = dSinCos(dDiv(dMul(alpha, PI), dd(180.0)));
  vec2 ex = dMul(d.a, ang.zw);
  vec2 ey = dMul(d.b, ang.xy);
  return vec2(dSub(dAdd(d.cx, dMul(ex, al.zw)), dMul(ey, al.xy)).x, dAdd(dAdd(d.cy, dMul(ex, al.xy)), dMul(ey, al.zw)).x);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord);
  fragColor = vec4(0.0);
  // nothing reads the rest
  if (p.x > 31 || p.y > A_RIBS + 63) discard;
  vec4 built = kept(A_BUILT);
  // a layout of this tab's: its serial a half (0.5, 1.5, ...), which neither a cleared buffer nor a tab's first code
  // leaves there, so a tab pasted into a running shader makes its own whatever its iFrame
  bool made = fract(built.w) == 0.5;
  bool fresh = !made || built.xyz != vec3(iResolution.xy, KEY);
  // the clock starts again where no layout is kept: the first frame, and after rewind, which clears the buffers
  bool restart = !made || iFrame == 0;
  // each frame: the clock, and the discs at the time drawn
  if (p == A_CLOCK || p == A_SHOWN || p == A_STAMP || (p.y == A_DISC && p.x < NPTS)) {
    Clock c = clockNow(fresh, restart);
    if (p == A_CLOCK) fragColor = vec4(c.t, c.warm);
    else if (p == A_SHOWN) fragColor = vec4(c.shown, c.paced);
    else if (p == A_STAMP) fragColor = vec4(float(iFrame), 0.0, 0.0, 0.0);
    else {
      Orbit d;
      vec2 alpha;
      vec2 q;
      float regionX;
      if (fresh) {
        Layout L = layoutOf(iResolution.xy);
        d = orbitOf(L, p.x);
        alpha = L.alpha;
        q = L.q;
        regionX = L.regionX;
      } else {
        d = orbitRead(p.x);
        alpha = kept(A_GLASS).zw;
        q = kept(A_REGION).zw;
        regionX = kept(A_REGION).x;
      }
      vec2 at = discAt(d, alpha, c.shown);
      fragColor = vec4(dDiv(dSub(dd(at.x), dd(regionX)), q).x, dDiv(dSub(dd(at.y), dd(regionX)), q).x, dDiv(d.R, q).x, CORE);
    }
    return;
  }
  // the layout holds until the canvas's size, ANGLE or SHAPE changes
  if (!fresh) {
    fragColor = kept(p);
    return;
  }
  Layout L = layoutOf(iResolution.xy);
  if (p == A_BUILT) fragColor = vec4(iResolution.xy, KEY, made ? built.w + 1.0 : 0.5);
  else if (p == A_LAYOUT) fragColor = vec4(L.S, L.win, L.scale.x);
  else if (p == A_REGION) fragColor = vec4(L.regionX, L.regionW, L.q);
  // the field is square, as the design is: glassCover lays out a square of the canvas's longer side
  else if (p == A_FIELD) fragColor = vec4(L.fw, L.fw, float(L.count), ${glslFloat(STOPS.length)});
  else if (p == A_GLASS) {
    vec2 inv = dDiv(dd(1.0), dMul(L.q, dd(L.fw)));
    fragColor = vec4(inv.x, inv.x, L.alpha);
  } else if (p.y == 0 && p.x >= A_TAPS && p.x < A_TAPS + 6) {
    // the blur: a Gaussian of the three boxes' variance, eleven taps, the middle and five bilinear pairs
    vec2 s = dDiv(L.sigmaEff, L.q);
    vec2 w[11];
    vec2 tot = vec2(0.0);
    for (int i = 0; i <= 10; i++) {
      w[i] = dExp(dDiv(dd(-float(i * i)), dMul(dMul(dd(2.0), s), s)));
      if (i > 0) tot = dAdd(tot, w[i]);
    }
    tot = dAdd(w[0], dMul(dd(2.0), tot));
    int i = p.x - A_TAPS;
    if (i == 0) fragColor = vec4(0.0, dDiv(w[0], tot).x, 0.0, 0.0);
    else {
      vec2 a = dDiv(w[2 * i - 1], tot);
      vec2 b = dDiv(w[2 * i], tot);
      fragColor = vec4(dAdd(dd(float(2 * i - 1)), dDiv(b, dAdd(a, b))).x, dAdd(a, b).x, 0.0, 0.0);
    }
  } else if (p == A_LINE || (p.y == 0 && p.x >= A_NORMALS && p.x < A_NORMALS + 17)) {
    // the normal: along a line through the middle across the ribs, the direction from each level's center
    vec2 half_ = dd(L.S * 0.5);
    vec2 sMid = levelAt(L.g, L.S, L.D, half_, half_);
    vec2 cm0 = dAdd(half_, dMul(dAdd(L.g.c0, dMul(sMid, L.g.d0)), L.D));
    vec2 cm1 = dAdd(half_, dMul(dAdd(L.g.c1, dMul(sMid, L.g.d1)), L.D));
    vec2 nl = dHypot(dSub(half_, cm0), dSub(half_, cm1));
    vec2 n0 = dDiv(dSub(half_, cm0), nl);
    vec2 n1 = dDiv(dSub(half_, cm1), nl);
    vec2 t0 = -n1;
    vec2 t1 = n0;
    vec2 Ln = dAdd(dAbs(dMul(dd(L.S), t0)), dAbs(dMul(dd(L.S), t1)));
    if (p == A_LINE) {
      vec2 x1 = r2(dSub(half_, dDiv(dMul(t0, Ln), dd(2.0))));
      vec2 y1 = r2(dSub(half_, dDiv(dMul(t1, Ln), dd(2.0))));
      vec2 x2 = r2(dAdd(half_, dDiv(dMul(t0, Ln), dd(2.0))));
      vec2 y2 = r2(dAdd(half_, dDiv(dMul(t1, Ln), dd(2.0))));
      fragColor = vec4(x1.x, y1.x, dSub(x2, x1).x, dSub(y2, y1).x);
    } else {
      float j = float(p.x - A_NORMALS);
      vec2 x = dAdd(dDiv(-Ln, dd(2.0)), dDiv(dMul(Ln, dd(j)), dd(16.0)));
      vec2 X = dAdd(half_, dMul(t0, x));
      vec2 Y = dAdd(half_, dMul(t1, x));
      vec2 s = levelAt(L.g, L.S, L.D, X, Y);
      vec2 c0 = dSub(X, dAdd(half_, dMul(dAdd(L.g.c0, dMul(s, L.g.d0)), L.D)));
      vec2 c1 = dSub(Y, dAdd(half_, dMul(dAdd(L.g.c1, dMul(s, L.g.d1)), L.D)));
      vec2 l = dHypot(c0, c1);
      fragColor = vec4(r4(dd(j / 16.0)).x,
        dRound(dMul(dd(255.0), dAdd(dd(0.5), dDiv(dMul(dd(0.5), c0), l)))),
        dRound(dMul(dd(255.0), dAdd(dd(0.5), dDiv(dMul(dd(0.5), c1), l)))), 0.0);
    }
  } else if ((p.y == A_ORBIT || p.y == A_ORBIT + 1) && p.x < NPTS) {
    fragColor = orbitKept(orbitOf(L, p.x), p.y - A_ORBIT);
  } else if (p.y >= A_RIBS && p.y < A_RIBS + L.count && p.x <= ${STOPS.length}) {
    // a rib: its circle, and the lens gray at each of its stops
    float k = L.k0 + float(p.y - A_RIBS);
    vec2 sIn = sOf(L.g, k);
    vec2 sOut = sOf(L.g, k + 1.0);
    vec2 R = dMul(dAdd(ARC_R0, dMul(ARC_G, sOut)), L.D);
    if (p.x == 0) {
      vec2 cx = r2(dAdd(dd(L.S * 0.5), dMul(dAdd(L.g.c0, dMul(sOut, L.g.d0)), L.D)));
      vec2 cy = r2(dAdd(dd(L.S * 0.5), dMul(dAdd(L.g.c1, dMul(sOut, L.g.d1)), L.D)));
      vec2 r = r2(R);
      fragColor = vec4(cx.x, cy.x, dMul(r, r).x, 0.0);
    } else {
      vec2 pitch = dMul(dMul(dSub(sOut, sIn), dAdd(dd(1.0), ARC_G)), L.D);
      vec2 x = STOP_X[p.x - 1];
      vec2 d = lensAt(x, dDiv(L.seamPx, pitch), pitch);
      vec2 o = dDiv(dAdd(dSub(R, pitch), dMul(x, pitch)), R);
      float gray = dRound(dMul(dd(255.0), dAdd(dd(0.5), dDiv(dMul(dd(0.5), d), dDiv(L.scale, dd(2.0))))));
      fragColor = vec4(r4(dMin(dd(1.0), dMax(vec2(0.0), o))).x, gray, 0.0, 0.0);
    }
  }
}`;

const BUFFER_B = `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)
// x: the rib map, baked for each layout Buffer A makes and kept, its three bytes in one number; y, z, w: the field, the
// discs drawn over the base color as the player's WebGL draws them, kept as 8 bits, three field texels a texel. The
// top right texel keeps, beside its map, the serial of the layout baked and the frames written since (y, z).
vec4 fromA(ivec2 p) { return texelFetch(iChannel0, p, 0); }
vec2 stopAt(int rib, int k) { return fromA(ivec2(1 + k, A_RIBS + rib)).xy; }

// the player's bake: the smallest rib disc holding the pixel, its lens gray from that rib's stops, the normal's two
// channels, the arithmetic composite and the ribs' light, each rounded to 8 bits where it is
float ribMap(vec2 fragCoord) {
  vec2 uOrigin = fromA(A_LAYOUT).yz;
  vec4 uLine = fromA(A_LINE);
  int uCount = int(fromA(A_FIELD).z);
  int uStops = int(fromA(A_FIELD).w);
  vec2 p = fragCoord + uOrigin;
  int rib = -1;
  for (int k = 0; k < 256; k++) {
    if (k >= uCount) break;
    vec4 r = fromA(ivec2(0, A_RIBS + k));
    vec2 d = p - r.xy;
    if (dot(d, d) <= r.z) { rib = k; break; }
  }
  float A = 128.0;
  if (rib >= 0) {
    vec4 r = fromA(ivec2(0, A_RIBS + rib));
    vec2 d = p - r.xy;
    float t = sqrt(dot(d, d) / r.z);
    vec2 first = stopAt(rib, 0);
    vec2 last = stopAt(rib, uStops - 1);
    if (t <= first.x) A = first.y;
    else if (t > last.x) A = last.y;
    else {
      int lo = 0;
      int hi = uStops - 1;
      for (int i = 0; i < 12; i++) {
        if (hi - lo <= 1) break;
        int mid = (lo + hi) / 2;
        if (t <= stopAt(rib, mid).x) hi = mid; else lo = mid;
      }
      vec2 s0 = stopAt(rib, lo);
      vec2 s1 = stopAt(rib, lo + 1);
      float f = s1.x > s0.x ? (t - s0.x) / (s1.x - s0.x) : 1.0;
      A = s0.y + f * (s1.y - s0.y);
    }
    A = floor(A + 0.5);
  }
  float tn = clamp(dot(p - uLine.xy, uLine.zw) / dot(uLine.zw, uLine.zw), 0.0, 1.0);
  vec3 first = fromA(ivec2(A_NORMALS, 0)).xyz;
  vec3 last = fromA(ivec2(A_NORMALS + 16, 0)).xyz;
  vec2 n;
  if (tn <= first.x) n = first.yz;
  else if (tn > last.x) n = last.yz;
  else {
    int k = 0;
    for (int i = 0; i < 16; i++) { if (tn > fromA(ivec2(A_NORMALS + i + 1, 0)).x) k = i + 1; }
    vec3 n0 = fromA(ivec2(A_NORMALS + k, 0)).xyz;
    vec3 n1 = fromA(ivec2(A_NORMALS + k + 1, 0)).xyz;
    float f = n1.x > n0.x ? (tn - n0.x) / (n1.x - n0.x) : 1.0;
    n = n0.yz + f * (n1.yz - n0.yz);
  }
  n = floor(n + 0.5);
  float a = A / 255.0;
  vec2 an = n / 255.0;
  vec2 v = clamp(2.0 * a * an - a - an + 1.0, 0.0, 1.0);
  float c = a * 16.0;
  int kk = min(15, int(floor(c)));
  float light = SHADE[kk] + (c - float(kk)) * (SHADE[kk + 1] - SHADE[kk]);
  return floor(255.0 * v.x + 0.5) * 65536.0 + floor(255.0 * v.y + 0.5) * 256.0 + floor(255.0 * light + 0.5);
}

// A disc's varyings at a pixel, as the rasterizer gives them: its triangle set up from the corners in 16ths of a
// pixel, the first corner the origin, each varying from the triangle's plane, divided by the interpolated w.
float plane(vec3 M0, vec3 M1, vec3 M2, vec3 v, vec2 xy, float rhw) {
  float A = v.x * M0.x + v.y * M1.x + v.z * M2.x;
  float B = v.x * M0.y + v.y * M1.y + v.z * M2.y;
  return (xy.x * A + (v.x + xy.y * B)) * rhw;
}
void varyings(vec2 c0, vec2 c1, vec2 c2, vec3 lx, vec3 ly, vec3 color, ivec2 px, out vec2 local, out vec3 rgb) {
  float x1 = 0.0625 * (c1.x - c0.x);
  float y1 = 0.0625 * (c1.y - c0.y);
  float x2 = 0.0625 * (c2.x - c0.x);
  float y2 = 0.0625 * (c2.y - c0.y);
  float A = 1.0 / (x1 * y2 - x2 * y1);
  vec3 M0 = vec3((y1 - y2) * A, (x2 - x1) * A, 1.0);
  vec3 M1 = vec3(y2 * A, -x2 * A, 0.0);
  vec3 M2 = vec3(-y1 * A, x1 * A, 0.0);
  vec2 xy = vec2(px) - c0 * 0.0625;
  float w = xy.x * (M0.x + M1.x + M2.x) + (1.0 + xy.y * (M0.y + M1.y + M2.y));
  float rhw = 1.0 / w;
  local = vec2(plane(M0, M1, M2, lx, xy, rhw), plane(M0, M1, M2, ly, xy, rhw));
  // the color's three corners as three numbers, so no compiler factors the color out of the plane's sums
  vec3 k1 = color * ONE;
  vec3 k2 = k1 * ONE;
  rgb = vec3(plane(M0, M1, M2, vec3(color.r, k1.r, k2.r), xy, rhw), plane(M0, M1, M2, vec3(color.g, k1.g, k2.g), xy, rhw),
    plane(M0, M1, M2, vec3(color.b, k1.b, k2.b), xy, rhw));
}
// the clip x or y the player's vertex shader gives a field coordinate, snapped to 16ths of a pixel
float snap(float clip, float size) { return roundEven((0.5 * size * 16.0 - 8.0) + clip * (0.5 * size * 16.0)); }
vec3 field(ivec2 px) {
  // the field's side, across and down alike: the field is square
  float size = fromA(A_FIELD).x;
  int base = COLORS[BASE % COLORS.length()];
  vec3 dst = vec3(float((base >> 16) & 255), float((base >> 8) & 255), float(base & 255));
  for (int i = 0; i < NPTS; i++) {
    vec4 d = fromA(ivec2(i, A_DISC));
    // the quad's corners: v0 (-1, -1) and v1 (1, -1) at yA, v2 (-1, 1) and v3 (1, 1) at yB, left at xL, right at xR
    float xL = snap((d.x - d.z) / size * 2.0 - 1.0, size);
    float xR = snap((d.x + d.z) / size * 2.0 - 1.0, size);
    float yA = snap(1.0 - (d.y - d.z) / size * 2.0, size);
    float yB = snap(1.0 - (d.y + d.z) / size * 2.0, size);
    float X = 16.0 * float(px.x);
    float Y = 16.0 * float(px.y);
    if (X < xL || X >= xR || Y < yB || Y >= yA) continue;
    int c = COLORS[i % COLORS.length()];
    // a true division, as the player's JavaScript makes the color: a compiler would multiply by 1/255 for a constant
    vec3 color = vec3(float((c >> 16) & 255), float((c >> 8) & 255), float(c & 255)) / (255.0 * ONE);
    vec2 local;
    vec3 rgb;
    // the strip's two triangles as WebGL hands them over, (v2, v0, v1) and (v2, v1, v3), split along v1 to v2
    int h = int(yA - yB);
    if (16 * px.x * h < int(xL) * h + int(xR - xL) * (16 * px.y - int(yB)))
      varyings(vec2(xL, yB), vec2(xL, yA), vec2(xR, yA), vec3(-1.0, -1.0, 1.0), vec3(1.0, -1.0, -1.0), color, px, local, rgb);
    else
      varyings(vec2(xL, yB), vec2(xR, yA), vec2(xR, yB), vec3(-1.0, 1.0, 1.0), vec3(1.0, -1.0, 1.0), color, px, local, rgb);
    // the player's soft circle, blended ONE, ONE_MINUS_SRC_ALPHA over the field's bytes and kept as 8 bits
    float r = length(local);
    if (r >= 1.0) continue;
    float a = r <= d.w ? 1.0 : (1.0 - r) / (1.0 - d.w);
    vec3 below = (dst * 257.0) * ${glslFloat(1 / 65535)};
    dst = roundEven(clamp(rgb * a + below * (1.0 - a), 0.0, 1.0) * 255.0);
  }
  return dst;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord);
  int side = int(fromA(A_FIELD).x);
  int k = p.y * int(iResolution.x) + p.x;
  ivec2 corner = ivec2(iResolution.xy) - 1;
  vec4 record = texelFetch(iChannel1, corner, 0);
  float serial = fromA(A_BUILT).w;
  // frames written since this tab baked Buffer A's layout, 0 where it has not: a new layout, or this tab newly pasted
  // (a serial is a half, which no field texel's number is)
  float since = record.y == serial ? record.z : 0.0;
  bool inField = 3 * k < side * side;
  // from the second frame after a bake both of the buffer's textures hold the map: a texel with no field keeps it
  if (!inField && p != corner && since >= 2.0) discard;
  float map = since == 0.0 ? ribMap(fragCoord) : texelFetch(iChannel1, p, 0).x;
  vec3 f = vec3(0.0);
  for (int c = 0; c < 3; c++) {
    int n = 3 * k + c;
    if (n < side * side) f[c] = pack(field(ivec2(n % side, n / side)));
  }
  fragColor = p == corner ? vec4(map, serial, min(since + 1.0, 2.0), 0.0) : vec4(map, f);
}`;

const BUFFER_C = `// ==== Buffer C ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)
// The field blurred across, kept as 8 bits, four field texels a texel.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  int side = int(texelFetch(iChannel0, A_FIELD, 0).x);
  if (4 * (int(fragCoord.y) * int(iResolution.x) + int(fragCoord.x)) >= side * side) discard;
  fragColor = blurTexel(iChannel1, iChannel0, fragCoord, vec2(1.0 / float(side), 0.0), 3, 1);
}`;

const BUFFER_D = `// ==== Buffer D ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer C (filter: nearest, wrap: clamp)
// The field blurred down, kept as 8 bits, four field texels a texel.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  int side = int(texelFetch(iChannel0, A_FIELD, 0).x);
  if (4 * (int(fragCoord.y) * int(iResolution.x) + int(fragCoord.x)) >= side * side) discard;
  fragColor = blurTexel(iChannel1, iChannel0, fragCoord, vec2(0.0, 1.0 / float(side)), 4, 0);
}`;

const IMAGE = `// ==== Image ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp); iChannel2: Buffer D (filter: nearest, wrap: clamp)
// The glass: the rib map at the pixel, the blurred field read where its displacement points, and the ribs' light.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec4 place = texelFetch(iChannel0, A_LAYOUT, 0);
  float origin = texelFetch(iChannel0, A_REGION, 0).x;
  vec2 inv = texelFetch(iChannel0, A_GLASS, 0).xy;
  vec4 sizes = texelFetch(iChannel0, A_FIELD, 0);
  float size = sizes.x;
  if (!fits(size, sizes.z)) {
    int c = COLORS[BASE % COLORS.length()];
    fragColor = vec4(vec3(float((c >> 16) & 255), float((c >> 8) & 255), float(c & 255)) / 255.0, 1.0);
    return;
  }
  float uH = iResolution.y;
  ivec2 p = ivec2(fragCoord.x, uH - fragCoord.y);
  int bytes = int(texelFetch(iChannel1, p, 0).x);
  vec3 m = vec3(float(bytes >> 16), float((bytes >> 8) & 255), float(bytes & 255)) * INV255;
  vec2 s = vec2(p) + place.yz + floor(place.w * (m.rg - 0.5) + 0.5);
  vec2 f = (s + 0.5 - vec2(origin)) * inv;
  vec3 c = bilinear(iChannel2, vec2(f.x, 1.0 - f.y), size, 4, 0);
  fragColor = vec4(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);
}`;

/** The Shadertoy text after its credit: the tabs, each under its header. */
export function glassShadertoy(
  colors: readonly string[],
  angle: number,
  shape: number,
  speed: number,
  fps: number
): string {
  return `// ==== Common ====
${settings(colors, angle, shape, speed, fps)}

${COMMON}

${BUFFER_A}

${BUFFER_B}

${BUFFER_C}

${BUFFER_D}

${IMAGE}
`;
}

/** The glass as Shadertoy's tabs, for its palette, effect and angle: the credit, then the tabs, each under its header.
    `origin` adds the effect's address to the credit. The editor loads this module with the Shader tab's Shadertoy
    spelling. */
export function glassShadertoyText(
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    "fluted glass in Shadertoy: paste each section into the tab it names and set its channels as its header says",
    origin
  );
  return `${credit.map(line => `// ${line}`).join("\n")}

${glassShadertoy(glassColors(P), angle, effect.look.shape ?? 0, effect.speed, effect.fps)}`;
}
