/* The silk for Shadertoy, in its tabs (silk-shader.ts writes them out): what the site's WebGL player draws
   (ui/silk-player.ts) with no JavaScript.
     Common    the settings a reader edits, the design's numbers for the angle and the shape it was written for (another
               angle or shape is another text), the dye's and the profiles' tables, and the arithmetic
     Buffer A  the state, in its first row: the players' clock (ui/effect-loop.ts) every frame as JavaScript's doubles
               make it (fx-shadertoy.ts's program on glsl-double.ts), the layout for the canvas in pairs of floats as
               the canvas or the settings change, and each fold's middle at the time drawn, which land on the player's
               floats
     Buffer B  the frame: the player's own fragment shader (silk-gl.ts), its uniforms Buffer A's texels and its two
               textures read by hand as a GPU filters them (the dye's 8-bit texels, the profiles' half floats); between
               the frames the pace draws, the frame drawn last. The place a finish (a soft blur, a grain) would take it
     Image     the frame on the canvas
   The state is the text's own only while its first texel holds the text's mark and scene, so a buffer that held
   something else when the text was pasted in starts it afresh, as a rewind does; an edit to the settings, which the
   state keeps a signature of, lays it out again at once, as the player's set() does. Its time is Shadertoy's iTime:
   where it is the float of a whole number of 240ths of a second, the time a frame has on a 30, 60, 120 or 240 Hz screen
   counted from the first, the clock reads that many 240ths in double precision, the time the player's
   requestAnimationFrame gives the frame, so each frame is the player's own where the GPU filters textures as the text
   does (SwiftShader does; an NVIDIA RTX filters with weights of its own). */
import { compile, doubleRun } from "./double-program.ts";
import type { Effect } from "./effect.ts";
import {
  FX_CLOCK_DOUBLES,
  FX_PAIRS,
  FX_STATE,
  FX_T,
  fxClock,
  fxPairsTrig,
  glslFloat,
  glslPair,
  sceneMark,
  shadertoyPass
} from "./fx-shadertoy.ts";
import { dlit, GLSL_DOUBLE } from "./glsl-double.ts";
import type { Palette } from "./palette.ts";
import { effectShaderCredit } from "./shader-shell.ts";
import {
  bakeDye,
  clothFrame,
  crestCurve,
  LUT_N,
  MAX_FOLDS,
  PROF_N,
  profileOf,
  SILK_DESIGN,
  SILK_LOOP,
  SILK_SPAN,
  silkDesign,
  swingTrack,
  valleyCurve
} from "./silk.ts";
import { SILK_FS } from "./silk-gl.ts";

const DEG = Math.PI / 180;
const pair = (x: number) => glslPair(x, glslFloat);
const rows = (items: readonly string[], per: number, indent = "  ") => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push(`${indent}${items.slice(i, i + per).join(", ")}`);
  return out.join(",\n");
};
const hex = (n: number, digits: number) => `0x${n.toString(16).padStart(digits, "0")}`;

/** A float as the browser keeps it in the player's RG16F texture: rounded to the half float nearest, ties to even. */
export function halfOf(v: number): number {
  const f = new Float32Array([v]);
  const x = new Uint32Array(f.buffer)[0];
  const sign = (x >>> 16) & 0x8000;
  const abs = x & 0x7fffffff;
  let h: number;
  if (abs > 0x47ffefff) h = sign | 0x7c00;
  else if (abs < 0x38800000) {
    const e = 113 - (abs >>> 23);
    const m = e < 24 ? ((abs & 0x7fffff) | 0x800000) >>> e : 0;
    h = sign | ((m + 0xfff + ((m >>> 13) & 1)) >>> 13);
  } else h = sign | (((abs + 0xc8000000 + 0xfff + ((abs >>> 13) & 1)) >>> 0) >>> 13);
  const e = (h >>> 10) & 31;
  const m = h & 1023;
  const s = h & 0x8000 ? -1 : 1;
  return s * (e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15));
}

/* Buffer A's first row after the clock's: the dye's line, each ring's band and profile mapping, the gather, each
   fold's arm from it, each fold's middle at the time drawn */
const T = (() => {
  const dye = FX_T.own;
  const ring = dye + 1;
  const gather = ring + MAX_FOLDS;
  const arm = gather + 1;
  const centre = arm + MAX_FOLDS;
  return { dye, ring, gather, arm, centre, state: centre + MAX_FOLDS };
})();
/** The state's mark: a number no half float holds, which a later form of the state would change. */
const MAGIC = 4101.5;

/** The silk's Shadertoy tabs for its palette, effect and angle, under the credit's lines. */
export function silkShadertoy(
  P: Palette,
  effect: Effect,
  angle: number,
  credit: readonly string[]
): string {
  const shape = effect.look.shape;
  const d = silkDesign(shape);
  const { ex, ey } = clothFrame(d.clothTurn + angle - 90);
  const a = (angle + d.tilt) * DEG;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const folds = d.folds.map((f, i) => {
    const psi = Math.atan2(f.y - d.gy, -d.gx) + d.bias * DEG;
    const nxc = -Math.sin(psi);
    const nyc = Math.cos(psi);
    const s = f.c >= 0 ? 1 : -1;
    return {
      kx0: 0 * ex[0] + f.y * ey[0],
      kx1: 0 * ex[1] + f.y * ey[1],
      nx: s * (nxc * ex[0] + nyc * ey[0]),
      ny: s * (nxc * ex[1] + nyc * ey[1]),
      twoW: 2 * f.w,
      cMax: Math.max(Math.abs(f.c), 1e-3),
      track: swingTrack(f, 0x5111c + 977 * i, d.ease)
    };
  });
  const keys = folds.flatMap(f => f.track);
  const from = [0];
  for (const f of folds) from.push(from[from.length - 1] + f.track.length);
  const dye = bakeDye(P, SILK_DESIGN);
  const dyeRows = [dye.baseB, dye.shadeB, dye.liftB];
  const dyeWords = dyeRows.flatMap(row =>
    Array.from({ length: LUT_N }, (_, i) =>
      hex((row[3 * i] << 16) | (row[3 * i + 1] << 8) | row[3 * i + 2], 6)
    )
  );
  const valley = profileOf(x => valleyCurve(SILK_DESIGN, x)).table;
  const crest = profileOf(x => crestCurve(SILK_DESIGN, x)).table;
  const profile = Array.from(
    { length: PROF_N },
    (_, k) => `vec2(${glslFloat(halfOf(valley[k]))}, ${glslFloat(halfOf(crest[k]))})`
  );
  const scene = glslFloat(sceneMark([angle, shape ?? 0, d, dyeWords]));
  const clock = compile(fxClock());
  const run = doubleRun(clock, dlit, "C");
  const reg = (name: string) => {
    const r = clock.inputs.get(name) ?? clock.pinned.get(name);
    if (r === undefined) throw new Error(`no register ${name}`);
    return r;
  };
  const head = credit.map(line => `// ${line}`).join("\n");
  const look = shape ? `shape ${shape}` : "as designed";

  const common = `// ==== Common ====
// The silk's settings, as its address writes them: edit them here. An edit shows at once.
const float SPEED = ${glslFloat(effect.speed)};   // the loop's pace, two decimals: it lasts ${SILK_LOOP} s over this; 0 holds the frame it is on
const float FPS = ${glslFloat(effect.fps)};    // frames a second at most, 1 to 120
const float EASE = ${glslFloat(1.6)};    // seconds from rest to its pace, two decimals
// The rest is the silk at angle ${angle}, ${look}, worked out by the site's own code from the palette's curve and the
// shape's numbers: another angle or shape is another text.

// The dye: the palette's ${LUT_N} colors along its line, as dyed, in the folds' shade and in their light, 0xRRGGBB.
const int DYE[${3 * LUT_N}] = int[](
${rows(dyeWords, 8)}
);
// The folds' two profiles across a band, valley and crest, at each of ${PROF_N} grid points, as the player's half-float
// texture holds them.
const vec2 PROFILE[${PROF_N}] = vec2[](
${rows(profile, 4)}
);
// The folds: how many, and each one's place across the cloth's middle line, its swing's turn (in pairs of floats, as the
// site's doubles hold them: the layout scales them to the canvas each time it changes).
const int FOLDS = ${folds.length};
const vec2 SPAN = ${pair(SILK_SPAN)};   // the cloth's scale over the canvas's longer side
const vec2 KG0 = ${pair(d.gx * ex[0] + d.gy * ey[0])};   // the gather, in the cloth's scale, from the middle
const vec2 KG1 = ${pair(d.gx * ex[1] + d.gy * ey[1])};
const vec2 DX = ${pair(dx)};   // the dye's line's way, and its reach over the canvas's longer side
const vec2 DY = ${pair(dy)};
const vec2 REACH = ${pair(Math.abs(dx) + Math.abs(dy))};
const vec2 KX0[${folds.length}] = vec2[](${folds.map(f => pair(f.kx0)).join(", ")});   // where each crosses the middle line
const vec2 KX1[${folds.length}] = vec2[](${folds.map(f => pair(f.kx1)).join(", ")});
const vec2 NX[${folds.length}] = vec2[](${folds.map(f => pair(f.nx)).join(", ")});   // its ring's middle's way from there
const vec2 NY[${folds.length}] = vec2[](${folds.map(f => pair(f.ny)).join(", ")});
const vec2 TWO_W[${folds.length}] = vec2[](${folds.map(f => pair(f.twoW)).join(", ")});   // its band's width, and how much it bends
const vec2 BEND[${folds.length}] = vec2[](${folds.map(f => pair(f.cMax)).join(", ")});
// Each fold's swing: its keys from KEY_FROM[fold], their times in the loop, their turns (degrees) and the timing curve
// that arrives at each (x1, y1, x2, y2: hi, then lo).
const int KEY_FROM[${from.length}] = int[](${from.join(", ")});
const vec2 KEY_T[${keys.length}] = vec2[](
${rows(
  keys.map(k => pair(k.t)),
  4
)}
);
const vec2 KEY_V[${keys.length}] = vec2[](
${rows(
  keys.map(k => pair(k.v)),
  4
)}
);
const vec4 KEY_E[${keys.length}] = vec4[](
${rows(
  keys.map(k => `vec4(${(k.e ?? [0, 0, 0, 0]).map(v => glslFloat(v)).join(", ")})`),
  2
)}
);
const vec4 KEY_EL[${keys.length}] = vec4[](
${rows(
  keys.map(
    k => `vec4(${(k.e ?? [0, 0, 0, 0]).map(v => glslFloat(v - Math.fround(v))).join(", ")})`
  ),
  2
)}
);
const float LOOP = ${glslFloat(SILK_LOOP)};
const vec2 DEG = ${pair(DEG)};
const vec2 G_PROF = ${pair((PROF_N - 1) / PROF_N)};   // the profile's grid over its texture, and half a texel
const vec2 HALF_PROF = ${pair(0.5 / PROF_N)};

${GLSL_DOUBLE}

${FX_PAIRS}

${fxPairsTrig(pair)}

${run.globals.replace("// The program's constants and its instructions", "// The clock's program: its constants and its instructions")}

${FX_STATE}
const float MAGIC = ${glslFloat(MAGIC)};   // the state's mark, which no half float holds
const float SCENE = ${scene};   // this text's scene, beside the mark
const int T_DYE = ${T.dye};    // the dye's line as a texel coordinate, and the canvas's height: the player's D
const int T_RING = ${T.ring};   // each ring's profile mapping and its band's squared radii: the player's F.zw, G
const int T_GATHER = ${T.gather}; // the gather, x and y as pairs
const int T_ARM = ${T.arm};    // each ring's middle at rest from the gather, as pairs
const int T_CENTRE = ${T.centre}; // each ring's middle at the time drawn: the player's F.xy
const int STATE = ${T.state};

// Common's settings as one number, in two 16-bit halves
vec2 signature() {
  uint h = 2166136261u;
  for (int k = 0; k < 3; k++) h = (h ^ floatBitsToUint(k == 0 ? SPEED : k == 1 ? FPS : EASE)) * 16777619u;
  return vec2(h >> 16, h & 0xffffu);
}

// The players' tick on Shadertoy's time, from the state the frame before left: the clock's doubles, whether this frame
// draws and whether the pace has begun.
struct Tick { uvec2 d[${FX_CLOCK_DOUBLES.length}]; bool draw; bool paceSet; };
Tick tick(sampler2D a, bool fresh, bool kept) {
  float x = iTime * 240.0, grid = floor(x + 0.5);
  ${run.registers.split("\n").join("\n  ")}
  CR[${reg("grid")}] = dFromInt(int(grid));
  CR[${reg("time")}] = dFromFloat(iTime);
  CR[${reg("onGrid")}] = abs(x - grid) <= max(1e-4, grid * 2.4e-7) ? D_ONE : D_ZERO;
  CR[${reg("first")}] = fresh ? D_ONE : D_ZERO;
  CR[${reg("changed")}] = kept ? D_ZERO : D_ONE;
${FX_CLOCK_DOUBLES.map(
  ([name], k) =>
    `  CR[${reg(name)}] = fresh ? ${name === "drawn" ? "dNeg(D_ONE)" : "D_ZERO"} : readDouble(a, T_CLOCK + ${k});`
).join("\n")}
  CR[${reg("paceSet")}] = !fresh && state(a, T_FLAGS).w != 0.0 ? D_ONE : D_ZERO;
  CR[${reg("speed100")}] = hundredths(SPEED);
  CR[${reg("ease100")}] = hundredths(EASE);
  CR[${reg("fps")}] = dFromInt(clamp(int(floor(FPS + 0.5)), 1, 120));
  ${run.loop("0", `steps(${clock.code.length})`).split("\n").join("\n  ")}
  Tick k;
${FX_CLOCK_DOUBLES.map(([, out], j) => `  k.d[${j}] = CR[${reg(out)}];`).join("\n")}
  k.draw = !dZero(CR[${reg("draw")}]);
  k.paceSet = !dZero(CR[${reg("paceSetOut")}]);
  return k;
}

// The layout, as silk.ts works it out for a canvas of W by H pixels: the cloth's scale D, its numbers to hundredths
// and ten-thousandths of a pixel as the site rounds them.
vec2 r2(vec2 v) { return pDiv(pRound(pMul(v, pf(100.0))), pf(100.0)); }
vec2 r4(vec2 v) { return pDiv(pRound(pMul(v, pf(10000.0))), pf(10000.0)); }
vec2 scaleOf() { return pMul(SPAN, pf(max(iResolution.x, iResolution.y))); }
vec4 gatherOf(vec2 D) {
  return vec4(r2(pAdd(pf(iResolution.x * 0.5), pMul(D, KG0))), r2(pAdd(pf(iResolution.y * 0.5), pMul(D, KG1))));
}
// ring i: its radius, its band's half-width and its middle at rest
struct Ring { vec2 R; vec2 w; vec2 cx; vec2 cy; };
Ring ringOf(int i, vec2 D) {
  vec2 X0 = pAdd(pf(iResolution.x * 0.5), pMul(D, KX0[i]));
  vec2 X1 = pAdd(pf(iResolution.y * 0.5), pMul(D, KX1[i]));
  vec2 P = r4(pMul(TWO_W[i], D));
  vec2 w = pMul(P, pf(0.5));
  float n = max(1.0, pRound(pSub(pDiv(pDiv(D, BEND[i]), P), pf(0.5))).x);
  vec2 R = pMul(pf(n + 0.5), P);
  return Ring(R, w, r2(pAdd(X0, pMul(NX[i], R))), r2(pAdd(X1, pMul(NY[i], R))));
}
// the player's D: the dye's line, from the canvas's middle across its covering square, as a texel coordinate
vec4 dyeLine(vec2 D) {
  float side = max(iResolution.x, iResolution.y);
  vec2 half_ = pMul(pMul(pf(side), REACH), pf(0.5));
  vec2 W2 = pf(iResolution.x * 0.5);
  vec2 H2 = pf(iResolution.y * 0.5);
  vec2 x1 = r2(pSub(W2, pMul(DX, half_)));
  vec2 y1 = r2(pSub(H2, pMul(DY, half_)));
  vec2 lx = pSub(r2(pAdd(W2, pMul(DX, half_))), x1);
  vec2 ly = pSub(r2(pAdd(H2, pMul(DY, half_))), y1);
  vec2 k = pDiv(pf(${glslFloat(LUT_N - 1)}), pMul(pf(${glslFloat(LUT_N)}), pAdd(pMul(lx, lx), pMul(ly, ly))));
  vec2 z = pAdd(pMul(-pAdd(pMul(x1, lx), pMul(y1, ly)), k), pf(${glslFloat(0.5 / LUT_N)}));
  return vec4(pMul(lx, k).x, pMul(ly, k).x, z.x, iResolution.y);
}

// A fold's swing at t: its keys' timing curve's progress found by bisection, as the site's bezierAt, between the keys
// either side of t in the loop.
vec2 bezierAt(vec4 hi, vec4 lo, vec2 x) {
  if (!pLess(pf(0.0), x)) return pf(0.0);
  if (!pLess(x, pf(1.0))) return pf(1.0);
  vec2 x1 = vec2(hi.x, lo.x), y1 = vec2(hi.y, lo.y), x2 = vec2(hi.z, lo.z), y2 = vec2(hi.w, lo.w);
  vec2 a = pf(0.0), b = pf(1.0);
  for (int i = 0; i < steps(40); i++) {
    vec2 u = pMul(pAdd(a, b), pf(0.5));
    vec2 v = pSub(pf(1.0), u);
    vec2 three = pMul(pf(3.0), v);
    vec2 xu = pAdd(pAdd(pMul(pMul(pMul(three, v), u), x1), pMul(pMul(pMul(three, u), u), x2)), pMul(pMul(u, u), u));
    if (pLess(xu, x)) a = u;
    else b = u;
  }
  vec2 u = pMul(pAdd(a, b), pf(0.5));
  vec2 v = pSub(pf(1.0), u);
  vec2 three = pMul(pf(3.0), v);
  return pAdd(pAdd(pMul(pMul(pMul(three, v), u), y1), pMul(pMul(pMul(three, u), u), y2)), pMul(pMul(u, u), u));
}
vec2 trackAt(int fold, vec2 t) {
  vec2 loop = pf(LOOP);
  vec2 tt = pSub(t, pMul(loop, pFloor(pDiv(t, loop))));
  int last = KEY_FROM[fold + 1] - 1;
  int j = KEY_FROM[fold] + 1;
  for (int k = 0; k < steps(24); k++) {
    if (j >= last || !pLess(KEY_T[j], tt)) break;
    j++;
  }
  vec2 t0 = KEY_T[j - 1];
  vec2 span = pSub(KEY_T[j], t0);
  vec2 p = pLess(pf(0.0), span) ? pMin(pf(1.0), pMax(pf(0.0), pDiv(pSub(tt, t0), span))) : pf(1.0);
  return pAdd(KEY_V[j - 1], pMul(pSub(KEY_V[j], KEY_V[j - 1]), bezierAt(KEY_E[j], KEY_EL[j], p)));
}

// The GPU's linear filters by hand, as SwiftShader reads the player's textures, clamped to the edge: the coordinate's
// whole part picking the texels, its fraction weighing them, across then down. The dye's 8-bit texels as whole
// numbers, times 1 / 255 at the end; the profiles' half floats as they are.
const float ONE_BELOW = 0.99999994;
const float INV255 = ${glslFloat(1 / 255)};
vec3 dyeTexel(ivec2 p) {
  int c = DYE[p.y * ${LUT_N} + p.x];
  return vec3(float((c >> 16) & 255), float((c >> 8) & 255), float(c & 255));
}
vec4 lookup(int table, vec2 uv, float lod) {
  if (table == 0) {
    vec2 coord = min(max(uv, 0.0), ONE_BELOW) * vec2(${glslFloat(LUT_N)}, 3.0) - 0.5;
    vec2 f = floor(coord);
    vec2 w = coord - f;
    ivec2 a = max(ivec2(f), 0);
    ivec2 b = min(ivec2(f) + 1, ivec2(${LUT_N - 1}, 2));
    vec3 c00 = dyeTexel(a);
    vec3 c10 = dyeTexel(ivec2(b.x, a.y));
    vec3 c01 = dyeTexel(ivec2(a.x, b.y));
    vec3 c11 = dyeTexel(b);
    vec3 top = c00 + w.x * (c10 - c00);
    vec3 bottom = c01 + w.x * (c11 - c01);
    return vec4((top + w.y * (bottom - top)) * INV255, 1.0);
  }
  float t = uv.x * ${glslFloat(PROF_N)} - 0.5;
  float i = floor(t);
  float f = t - i;
  vec2 c0 = PROFILE[clamp(int(i), 0, ${PROF_N - 1})];
  vec2 c1 = PROFILE[clamp(int(i) + 1, 0, ${PROF_N - 1})];
  return vec4(c0 + f * (c1 - c0), 0.0, 1.0);
}`;

  const bufferA = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The state, in the first row: the mark, the settings' signature and the clock's flags, the clock's doubles, the
// layout for the canvas (kept while the canvas and the settings are), and each fold's middle at the time drawn.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord);
  if (p.y != 0 || p.x >= STATE) discard;
  int i = p.x;
  // the state is this text's, from an earlier frame of this run, for this canvas and these settings
  vec4 mark = state(iChannel0, T_MARK);
  bool fresh = iFrame == 0 || mark.xy != vec2(MAGIC, SCENE);
  vec2 sign = signature();
  bool kept = !fresh && mark.zw == iResolution.xy && state(iChannel0, T_FLAGS).xy == sign;
  if (i == T_MARK) {
    fragColor = vec4(MAGIC, SCENE, iResolution.xy);
    return;
  }
  if (i < T_DYE || i >= T_CENTRE) {
    // every frame: the clock, and each fold's middle at the time drawn
    Tick k = tick(iChannel0, fresh, kept);
    if (i == T_FLAGS) fragColor = vec4(sign, k.draw ? 1.0 : 0.0, k.paceSet ? 1.0 : 0.0);
    else if (i < T_DYE) fragColor = pieces(k.d[i - T_CLOCK]);
    else {
      int fold = i - T_CENTRE;
      if (fold >= FOLDS) {
        fragColor = vec4(0.0);
        return;
      }
      vec4 g;
      vec4 arm;
      if (kept) {
        g = state(iChannel0, T_GATHER);
        arm = state(iChannel0, T_ARM + fold);
      } else {
        vec2 D = scaleOf();
        g = gatherOf(D);
        Ring r = ringOf(fold, D);
        arm = vec4(pSub(r.cx, g.xy), pSub(r.cy, g.zw));
      }
      vec4 sc = pSinCos(pMul(trackAt(fold, pOf(k.d[${FX_CLOCK_DOUBLES.findIndex(([n]) => n === "drawn")}])), DEG));
      vec2 X = pSub(pAdd(g.xy, pMul(sc.zw, arm.xy)), pMul(sc.xy, arm.zw));
      vec2 Y = pAdd(pAdd(g.zw, pMul(sc.xy, arm.xy)), pMul(sc.zw, arm.zw));
      fragColor = vec4(X.x, Y.x, 0.0, 0.0);
    }
    return;
  }
  if (kept) {
    fragColor = state(iChannel0, i);
    return;
  }
  // the layout for this canvas
  vec2 D = scaleOf();
  if (i == T_DYE) fragColor = dyeLine(D);
  else if (i == T_GATHER) fragColor = gatherOf(D);
  else if (i < T_GATHER) {
    int fold = i - T_RING;
    if (fold >= FOLDS) {
      fragColor = vec4(0.0);
      return;
    }
    Ring r = ringOf(fold, D);
    vec2 inner = pSub(r.R, r.w);
    vec2 outer = pAdd(r.R, r.w);
    vec2 z = pAdd(pMul(pMul(pSub(pf(1.0), pDiv(r.R, r.w)), pf(0.5)), G_PROF), HALF_PROF);
    fragColor = vec4(pDiv(G_PROF, pMul(pf(2.0), r.w)).x, z.x, pMul(inner, inner).x, pMul(outer, outer).x);
  } else {
    int fold = i - T_ARM;
    if (fold >= FOLDS) {
      fragColor = vec4(0.0);
      return;
    }
    vec4 g = gatherOf(D);
    Ring r = ringOf(fold, D);
    fragColor = vec4(pSub(r.cx, g.xy), pSub(r.cy, g.zw));
  }
}`;

  const bufferB = `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)
// The frame: the player's fragment shader as it is, its uniforms from Buffer A, its textures read by hand (lookup);
// between the frames the pace draws, the frame drawn last. A finish (a soft blur, a grain) would take it from here.
${shadertoyPass(SILK_FS, { samplers: ["T", "S"] })}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  if (state(iChannel0, T_FLAGS).z == 0.0) {
    fragColor = texelFetch(iChannel1, ivec2(fragCoord), 0);
    return;
  }
  fragPlace = vec4(fragCoord, 0.0, 1.0);
  D = state(iChannel0, T_DYE);
  N = FOLDS;
  for (int i = 0; i < ${MAX_FOLDS}; i++) {
    vec4 ring = state(iChannel0, T_RING + i);
    F[i] = vec4(state(iChannel0, T_CENTRE + i).xy, ring.xy);
    G[i] = ring.zw;
  }
  effectMain();
  fragColor = outColor;
}`;

  const image = `// ==== Image ==== iChannel0: Buffer B (filter: nearest, wrap: clamp)
// The frame on the canvas.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(texelFetch(iChannel0, ivec2(fragCoord), 0).rgb, 1.0);
}`;

  return `${head}
//
// Buffers A and B each in Shadertoy's tab of the name, the Image in Image, each tab's channels as its header says. It
// needs Shadertoy's 32-bit float buffers (its fallback, half floats, cannot hold its numbers) and a canvas at least
// ${T.state} pixels wide. An edit to Common's settings shows at once; rewind plays it again from its first frame.

${common}

${bufferA}

${bufferB}

${image}
`;
}

/** The silk as Shadertoy's tabs, for its palette, effect and angle: the credit, then the tabs, each under its header.
    `origin` adds the effect's address to the credit. The editor loads this module with the Shader tab's Shadertoy
    spelling. */
export function silkShadertoyText(
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
    "the silk, the palette dyed into folded cloth, for Shadertoy: paste each section into the tab it names and set its channels as its header says",
    origin
  );
  return silkShadertoy(P, effect, angle, credit);
}
