/* What the silk's and the rosette's Shadertoy texts share (silk-shadertoy.ts, rosette-shadertoy.ts): the players'
   clock (ui/effect-loop.ts, ui/pace.ts) as a program of JavaScript's double arithmetic (double-program.ts), which each
   text's Buffer A runs every frame on Shadertoy's time with glsl-double.ts's exact doubles, so every frame's time is
   the player's to the last bit; the state Buffer A keeps those doubles in; and pairs of floats (hi + lo, about 48
   bits) for the numbers a frame or a layout works out from that time, which land on the player's floats as each is
   rounded to one. Loaded with the Shader tab's Shadertoy spelling alone. */
import { DoubleProgram, type Value } from "./double-program.ts";

/** The time grid Shadertoy's float time is read on: a frame on a 30, 60, 120 or 240 Hz screen counted from its first
    falls on a whole number of 240ths of a second (blob-program.ts reads the blob's time alike). */
export const FX_GRID_HZ = 240;

/** The inputs the clock's program reads, by name: Shadertoy's time as the nearest whole number of 240ths of a second,
    as it is (seconds) and whether it is that whole number's float; whether this is the first frame and whether the
    canvas or the settings changed; the clock as the frame before left it (the loop's seconds, the ease's, the frame
    before's time and the pace's last frame in ms and whether it has one, the time drawn last); and the settings: the
    speed and the ease in hundredths, as an address writes them, and the frames a second. */
export const FX_CLOCK_INPUTS = [
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
  "speed100",
  "ease100",
  "fps"
] as const;
/** The clock's doubles a text keeps from frame to frame, each by its input's name and the program's name for it as it
    comes out. */
export const FX_CLOCK_DOUBLES = [
  ["t", "tOut"],
  ["warm", "warmOut"],
  ["before", "beforeOut"],
  ["paceLast", "paceLastOut"],
  ["drawn", "drawnOut"]
] as const;

/** The players' tick (ui/effect-loop.ts) as a program, its operations in its order: from the frame's time and the
    state the frame before left, the clock's state this frame, the time drawn (the time a frame that draws draws, else
    the time drawn last) and whether the frame draws. `more` adds what a kind works out from the time drawn. */
export function fxClock(more?: (p: DoubleProgram, drawn: Value) => void): DoubleProgram {
  const p = new DoubleProgram();
  const { c } = p;
  const I = Object.fromEntries(FX_CLOCK_INPUTS.map(name => [name, p.input(name)])) as Record<
    (typeof FX_CLOCK_INPUTS)[number],
    Value
  >;
  /* the frame's time in ms: where Shadertoy's float time is the float of a whole number of 240ths of a second, that
     many 240ths as a double (requestAnimationFrame's time for a frame on a 30, 60, 120 or 240 Hz screen counted from
     its first), elsewhere the float as it is */
  const now = p.mul(
    p.choose(I.onGrid, I.grid, I.time),
    p.choose(I.onGrid, c(1000 / FX_GRID_HZ), c(1000))
  );
  /* the settings as the address reads them: the speed's and the ease's two decimals as the doubles they read as, and
     the pace's frame time and how early a frame may come (pace.ts) */
  const speed = p.div(I.speed100, c(100));
  const ease = p.div(I.ease100, c(100));
  const every = p.div(c(1000), I.fps);
  const early = p.sub(every, p.min(c(4), p.mul(every, c(0.2))));
  /* the tick: the motion eased in from rest once the first frame is drawn */
  const dt = p.min(c(0.1), p.choose(I.first, c(0), p.div(p.sub(now, I.before), c(1000))));
  const moving = p.lt(c(0), speed);
  const warm1 = p.min(ease, p.add(I.warm, dt));
  const e = p.choose(p.lt(c(0), ease), p.div(warm1, ease), c(1));
  const step = p.mul(p.mul(p.mul(p.mul(dt, speed), e), e), p.sub(c(3), p.mul(c(2), e)));
  const t = p.choose(p.choose(moving, p.sub(c(1), I.first), c(0)), p.add(I.t, step), I.t);
  p.pin("tOut", t);
  p.pin("warmOut", p.choose(moving, p.choose(I.first, I.warm, warm1), c(0)));
  p.pin("beforeOut", now);
  /* changed || (t !== drawn && pace.due(now, fps)): the pace consulted only where the frame has not changed */
  const differs = p.max(p.lt(t, I.drawn), p.lt(I.drawn, t));
  const gap = p.sub(now, I.paceLast);
  const due = p.choose(I.paceSet, p.sub(c(1), p.lt(gap, early)), c(1));
  const far = p.lt(p.mul(c(2), every), gap);
  const next = p.choose(I.paceSet, p.choose(far, now, p.add(I.paceLast, every)), now);
  const consult = p.choose(I.changed, c(0), differs);
  const draw = p.choose(I.changed, c(1), p.choose(differs, due, c(0)));
  p.pin("paceLastOut", p.choose(consult, p.choose(due, next, I.paceLast), I.paceLast));
  p.pin("paceSetOut", p.choose(consult, c(1), I.paceSet));
  const drawn = p.pin("drawnOut", p.choose(draw, t, I.drawn));
  p.pin("draw", draw);
  more?.(p, drawn);
  return p;
}

/** The state's texels in Buffer A's first row a text starts with, before its own: its mark and the canvas, the
    settings' signature and the clock's flags, then a texel a clock double. */
export const FX_T = { mark: 0, flags: 1, clock: 2, own: 2 + FX_CLOCK_DOUBLES.length } as const;

/** The GLSL that keeps the state: a double as four 16-bit pieces in a texel, read back whole. */
export const FX_STATE = `// Buffer A's first row keeps the state: its mark, the text's scene and the canvas in texel ${FX_T.mark}; the settings' signature
// and the clock's flags (whether this frame draws, whether the pace has begun) in texel ${FX_T.flags}; then the clock's doubles,
// each as four 16-bit pieces in a texel of its own.
const int T_MARK = ${FX_T.mark};
const int T_FLAGS = ${FX_T.flags};
const int T_CLOCK = ${FX_T.clock};
vec4 state(sampler2D a, int i) { return texelFetch(a, ivec2(i, 0), 0); }
uvec2 readDouble(sampler2D a, int i) {
  vec4 v = state(a, i);
  return uvec2((uint(v.x) << 16) | uint(v.y), (uint(v.z) << 16) | uint(v.w));
}
vec4 pieces(uvec2 d) { return vec4(d.x >> 16, d.x & 0xffffu, d.y >> 16, d.y & 0xffffu); }
// n as a count no compiler can see (iResolution.z is 1), so it keeps a long loop a loop rather than writing its body
// out step by step
int steps(int n) { return n * int(iResolution.z); }
uvec2 hundredths(float x) { return dFromInt(int(floor(max(x, 0.0) * 100.0 + 0.5))); }`;

/** The pairs of floats: each sum and product keeps its rounding error, so a pair holds a double to about 48 bits and
    rounds to the double's float. */
export const FX_PAIRS = `// Pairs of floats, hi + lo (about 48 bits), for the numbers worked out from the clock: each rounds to the float the
// player's double rounds to. Each sum and product keeps its rounding error, which a compiler that rearranges the steps
// would drop ((a + b) - a is b only in exact numbers): keep() passes a float through an integer XOR with a 0 the
// compiler cannot see (iResolution.z is 1.0), so no step is moved, fused or cancelled across it. Every step is guarded:
// with the sums and the product's split alone, an NVIDIA RTX's compiler cancelled enough to put a dozen of the silk's
// floats one apart from the player's.
float keep(float x) { return uintBitsToFloat(floatBitsToUint(x) ^ (uint(iResolution.z) - 1u)); }
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
vec2 pf(float a) { return vec2(a, 0.0); }
vec2 pAdd(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x);
  vec2 t = twoSum(a.y, b.y);
  s = quickSum(s.x, s.y + t.x);
  return quickSum(s.x, s.y + t.y);
}
vec2 pSub(vec2 a, vec2 b) { return pAdd(a, -b); }
vec2 pMul(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  return quickSum(p.x, p.y + (a.x * b.y + a.y * b.x));
}
vec2 pDiv(vec2 a, vec2 b) {
  float q1 = keep(a.x / b.x);
  vec2 r = pSub(a, pMul(b, pf(q1)));
  float q2 = keep(r.x / b.x);
  r = pSub(r, pMul(b, pf(q2)));
  return pAdd(quickSum(q1, q2), pf(keep(r.x / b.x)));
}
vec2 pSqrt(vec2 a) {
  if (a.x <= 0.0) return vec2(0.0);
  float x = keep(sqrt(a.x));
  vec2 r = pSub(a, twoProd(x, x));
  return quickSum(x, r.x / (2.0 * x));
}
bool pLess(vec2 a, vec2 b) { return a.x < b.x || (a.x == b.x && a.y < b.y); }
vec2 pMin(vec2 a, vec2 b) { return pLess(b, a) ? b : a; }
vec2 pMax(vec2 a, vec2 b) { return pLess(a, b) ? b : a; }
vec2 pAbs(vec2 a) { return a.x < 0.0 ? -a : a; }
vec2 pFloor(vec2 a) {
  float f = floor(a.x);
  return f == a.x ? quickSum(f, floor(a.y)) : pf(f);
}
// JavaScript's Math.round: the nearest whole number, halves up
vec2 pRound(vec2 a) { return pFloor(pAdd(a, pf(0.5))); }
// a double as a pair
vec2 pOf(uvec2 d) {
  float hi = dToFloat(d);
  return vec2(hi, dToFloat(dAdd(d, dNeg(dFromFloat(hi)))));
}`;

/** The pairs' exp, log, sine and cosine, for a text that needs them: Taylor's series after reducing the argument by
    pairs of ln 2 and pi / 2, a Newton step for the log. */
export function fxPairsTrig(pair: (x: number) => string): string {
  const fact = (n: number) => {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  };
  const list = (values: readonly string[]) =>
    values.map((v, i) => `${i % 2 === 0 ? "\n  " : " "}${v}`).join(",");
  return `const vec2 P_LN2 = ${pair(Math.LN2)};
const vec2 P_HALF_PI = ${pair(Math.PI / 2)};
const vec2 EXP_C[11] = vec2[](${list(Array.from({ length: 11 }, (_, n) => pair(1 / fact(n))))}
);
// e^a = 2^k (e^(r / 16))^16, r = a - k ln 2
vec2 pExp(vec2 a) {
  float k = floor(a.x / P_LN2.x + 0.5);
  vec2 r = pSub(a, pMul(P_LN2, pf(k))) * 0.0625;
  vec2 s = EXP_C[10];
  for (int i = 9; i >= 0; i--) s = pAdd(pMul(s, r), EXP_C[i]);
  for (int i = 0; i < 4; i++) s = pMul(s, s);
  return s * uintBitsToFloat(uint(int(k) + 127) << 23);
}
// a Newton step on e^y = a from the float's own log, whose error it squares, to within a pair's
vec2 pLog(vec2 a) {
  vec2 y = pf(keep(log(a.x)));
  return pAdd(y, pSub(pMul(a, pExp(-y)), pf(1.0)));
}
const vec2 SIN_C[9] = vec2[](${list(Array.from({ length: 9 }, (_, n) => pair((n % 2 ? -1 : 1) / fact(2 * n + 1))))}
);
const vec2 COS_C[10] = vec2[](${list(Array.from({ length: 10 }, (_, n) => pair((n % 2 ? -1 : 1) / fact(2 * n))))}
);
// the sine and the cosine: hi and lo of each
vec4 pSinCos(vec2 a) {
  float k = floor(a.x / P_HALF_PI.x + 0.5);
  vec2 r = pSub(a, pMul(P_HALF_PI, pf(k)));
  vec2 rr = pMul(r, r);
  vec2 s = SIN_C[8];
  for (int i = 7; i >= 0; i--) s = pAdd(pMul(s, rr), SIN_C[i]);
  s = pMul(s, r);
  vec2 c = COS_C[9];
  for (int i = 8; i >= 0; i--) c = pAdd(pMul(c, rr), COS_C[i]);
  int q = int(k) & 3;
  return q == 0 ? vec4(s, c) : q == 1 ? vec4(c, -s) : q == 2 ? vec4(-s, -c) : vec4(-c, s);
}`;
}

/** A number as a pair of floats in GLSL: the float nearest it and the float nearest what is left. */
export function glslPair(value: number, float: (x: number) => string): string {
  const hi = Math.fround(value);
  return `vec2(${float(hi)}, ${float(Math.fround(value - hi))})`;
}

/** A text's scene as a number a float holds exactly, so one text's state is never taken for another's. */
export function sceneMark(data: unknown): number {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(data)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h & 0xffffff;
}

/** A float as GLSL: the fewest digits that read back as the same float, always a float literal. */
export function glslFloat(value: number): string {
  const v = Math.fround(value);
  if (Object.is(v, -0) || v === 0) return "0.0";
  for (let digits = 1; digits <= 9; digits++) {
    const s = v.toPrecision(digits);
    if (Math.fround(Number(s)) !== v) continue;
    if (/e/.test(s)) return s.replace(/^(-?\d)e/, "$1.0e").replace("e+", "e");
    return s.includes(".") ? s : `${s}.0`;
  }
  throw new Error(`no float for ${value}`);
}

/** A player's fragment shader as a Shadertoy pass's code: its version and precision lines left out, its uniforms
    plain globals the pass sets from Buffer A's texels before it runs the player's main (now `effectMain`), those Common
    holds as constant arrays (`common`) and its samplers left out, a call to a sampler `textureLod(S, ...)` a call to
    `lookup(n, ...)`, n the sampler's place in `samplers`, gl_FragCoord the global `fragPlace` and its output a global.
    The player's own arithmetic, character for character, so the pass computes what the player's shader computes. */
export function shadertoyPass(
  fs: string,
  { common = [], samplers = [] }: { common?: readonly string[]; samplers?: readonly string[] } = {}
): string {
  const out = fs
    .split("\n")
    .filter(line => !/^#version|^precision /.test(line))
    .map(line => {
      const uniform = /^uniform (\w+) (\w+)(\[[^\]]+\])?;(.*)$/.exec(line);
      if (uniform) {
        const [, type, name, size = "", rest] = uniform;
        if (type === "sampler2D" || common.includes(name)) return null;
        return `${type} ${name}${size};${rest}`;
      }
      return line.replace(/^out (vec4 \w+);/, "$1;");
    })
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\bvoid main\(\)/, "void effectMain()")
    .replace(/\bgl_FragCoord\b/g, "fragPlace");
  return samplers.reduce(
    (text, name, i) => text.replace(new RegExp(`\\btextureLod\\(${name}, `, "g"), `lookup(${i}, `),
    `vec4 fragPlace;\n${out}`
  );
}
