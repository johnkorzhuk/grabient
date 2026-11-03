/* The rosette for Shadertoy, in its tabs (rosette-shader.ts writes them out): what the site's WebGL player draws
   (ui/rosette-player.ts) with no JavaScript.
     Common    the settings a reader edits, the design's numbers for the angle and the shape it was written for (another
               angle or shape is another text), each ring's gradient, and the arithmetic
     Buffer A  the state, in its first row: the players' clock (ui/effect-loop.ts) every frame as JavaScript's doubles
               make it (fx-shadertoy.ts's program on glsl-double.ts), with the loop's zoom and turn at the time drawn;
               and the flower's scale as a double and the outermost petal a canvas shows any time of the loop, in pairs
               of floats, as the canvas or the settings change
     Buffer B  the frame: the player's own fragment shader (rosette-gl.ts), its uniforms Buffer A's texels and Common's
               numbers; between the frames the pace draws, the frame drawn last. The place a finish (a soft blur, a
               grain) would take it
     Image     the frame on the canvas
   The state is the text's own only while its first texel holds the text's mark and scene, so a buffer that held
   something else when the text was pasted in starts it afresh, as a rewind does; an edit to the settings, which the
   state keeps a signature of, lays it out again at once, as the player's set() does. Its time is Shadertoy's iTime:
   where it is the float of a whole number of 240ths of a second, the time a frame has on a 30, 60, 120 or 240 Hz screen
   counted from the first, the clock reads that many 240ths in double precision, the time the player's
   requestAnimationFrame gives the frame, so each frame is the player's own. */
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
import { ROSETTE_SPAN, rosetteGroupAt, rosetteScene } from "./rosette.ts";
import { ROSETTE_FS, ROSETTE_MAX_KEYS, rosetteUniforms } from "./rosette-gl.ts";
import { effectShaderCredit } from "./shader-shell.ts";

const pair = (x: number) => glslPair(x, glslFloat);
const rows = (items: readonly string[], per: number, indent = "  ") => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push(`${indent}${items.slice(i, i + per).join(", ")}`);
  return out.join(",\n");
};
const vec = (values: readonly number[]) =>
  `vec${values.length}(${values.map(v => glslFloat(v)).join(", ")})`;

/* Buffer A's first row after the clock's: the canvas, the flower's scale and the outermost petal; the loop's zoom and
   turn at the time drawn */
const T = { box: FX_T.own, group: FX_T.own + 1, state: FX_T.own + 2 } as const;
/** The state's mark: a number no half float holds, which a later form of the state would change. */
const MAGIC = 4103.5;
/** The times of the loop the player tries a petal at for whether it shows: 25, its start to its end. */
const SAMPLES = 24;

/** The rosette's Shadertoy tabs for its palette, effect and angle, under the credit's lines. */
export function rosetteShadertoy(
  P: Palette,
  effect: Effect,
  angle: number,
  credit: readonly string[]
): string {
  const shape = effect.look.shape;
  /* the design's numbers, the same for every canvas: those of any box */
  const sc = rosetteScene(P, { angle, shape }, { width: 1, height: 1 });
  const u = rosetteUniforms(sc);
  const d = sc.design;
  const L = sc.lens;
  const k = sc.lattice.k;
  /* the innermost petal, its tip just out of the heart's opaque middle at the loop's end: the same for every canvas
     (the scale cancels; rosette-shader.test.ts holds it so for every shape) */
  const innermost = u.uRange[0];
  const groups = Array.from({ length: SAMPLES + 1 }, (_, s) => rosetteGroupAt(sc, s / SAMPLES));
  const clock = compile(
    fxClock((p, drawn) => {
      /* the loop's zoom and turn at the time drawn (rosette-gl.ts rosetteGroup), as the player's floats */
      const loop = p.c(d.loop);
      const tau = p.sub(p.div(drawn, loop), p.floor(p.div(drawn, loop)));
      p.pin("zoomF", p.f32(p.mul(p.c(k * d.flow), tau)));
      p.pin("turnF", p.f32(p.mul(p.c(sc.lattice.beta), tau)));
    })
  );
  const run = doubleRun(clock, dlit, "C");
  const reg = (name: string) => {
    const r = clock.inputs.get(name) ?? clock.pinned.get(name);
    if (r === undefined) throw new Error(`no register ${name}`);
    return r;
  };
  const stops = Array.from({ length: ROSETTE_MAX_KEYS * 4 }, (_, i) =>
    vec(Array.from(u.uStop.subarray(3 * i, 3 * i + 3)))
  );
  const scene = glslFloat(
    sceneMark([angle, shape ?? 0, u.uK, u.uTurn0, u.uLens, Array.from(u.uStop)])
  );
  const head = credit.map(line => `// ${line}`).join("\n");
  const look = shape ? `shape ${shape}` : "as designed";

  const common = `// ==== Common ====
// The rosette's settings, as its address writes them: edit them here. An edit shows at once.
const float SPEED = ${glslFloat(effect.speed)};   // the loop's pace, two decimals: it lasts ${d.loop} s over this; 0 holds the frame it is on
const float FPS = ${glslFloat(effect.fps)};    // frames a second at most, 1 to 120
const float EASE = ${glslFloat(1.6)};    // seconds from rest to its pace, two decimals
// The rest is the rosette at angle ${angle}, ${look}, worked out by the site's own code from the palette's curve and the
// shape's numbers: another angle or shape is another text.

// Each ring's gradient: ${d.stops.length} stops a key, from the petal's deep base to its lit tip; each slot's key. The player's uStop and
// uKeyOfSlot.
const vec3 uStop[${ROSETTE_MAX_KEYS * 4}] = vec3[](
${rows(stops, 3)}
);
const int uKeyOfSlot[${ROSETTE_MAX_KEYS}] = int[](${Array.from(u.uKeyOfSlot).join(", ")});
// The player's other uniforms, the same for every canvas. The frame takes each times iResolution.z, which is 1, so no
// compiler folds them into its arithmetic (it would divide by a reciprocal where the player divides by a uniform).
const vec4 TURN = ${vec([u.uK, u.uEk, u.uAlpha, u.uTurn0])};   // uK, uEk, uAlpha, uTurn0
const vec2 FLOW = vec2(${glslFloat(u.uFlow)}, ${glslFloat(u.uPhase)});   // uFlow, uPhase
const vec4 LENS = ${vec(u.uLens)};
const vec4 LENS_MID = ${vec([...u.uLensMid, u.uAngMax, 0])};   // uLensMid, uAngMax
const vec4 GRAD = ${vec(u.uGrad)};
const vec4 STOP_AT = ${vec(u.uStopAt)};
const vec4 GROUND = ${vec([...u.uGround, 0])};
const vec4 HEART = ${vec([...u.uHeart, 0])};
const vec2 HEART_R = ${vec(u.uHeartR)};
// The petals that show: the innermost, whose tip reaches out of the heart's opaque middle at the loop's end, and,
// for each canvas, the outermost whose reach meets it at one of the loop's ${SAMPLES + 1} times (zoom and turn each, in pairs of
// floats), as the site works them out.
const int INNERMOST = ${innermost};
const vec2 SPAN = ${pair(ROSETTE_SPAN)};
const uvec2 SPAN_D = ${dlit(ROSETTE_SPAN)};
const vec2 K = ${pair(k)};
const vec2 ALPHA = ${pair(sc.lattice.alpha)};
const vec2 TURN0 = ${pair(d.turn0)};
const vec2 REACH = ${pair(L.reach)};
const vec2 NEAR = ${pair(Math.max(0.02, 1 - L.reach))};
const vec2 ZOOM_AT[${SAMPLES + 1}] = vec2[](
${rows(
  groups.map(g => pair(g.zoom)),
  3
)}
);
const vec2 TURN_AT[${SAMPLES + 1}] = vec2[](
${rows(
  groups.map(g => pair(g.turn)),
  3
)}
);

${GLSL_DOUBLE}

${FX_PAIRS}

${fxPairsTrig(pair)}

${run.globals.replace("// The program's constants and its instructions", "// The clock's program: its constants and its instructions")}

${FX_STATE}
const float MAGIC = ${glslFloat(MAGIC)};   // the state's mark, which no half float holds
const float SCENE = ${scene};   // this text's scene, beside the mark
const int T_BOX = ${T.box};     // the canvas and the flower's scale, uBox and uS, and the outermost petal
const int T_GROUP = ${T.group};   // uGroup at the time drawn: the loop's zoom (its log) and turn
const int STATE = ${T.state};

// Common's settings as one number, in two 16-bit halves
vec2 signature() {
  uint h = 2166136261u;
  for (int k = 0; k < 3; k++) h = (h ^ floatBitsToUint(k == 0 ? SPEED : k == 1 ? FPS : EASE)) * 16777619u;
  return vec2(h >> 16, h & 0xffffu);
}

// The players' tick on Shadertoy's time, from the state the frame before left: the clock's doubles, whether this frame
// draws, whether the pace has begun, and the loop's zoom and turn at the time drawn.
struct Tick { uvec2 d[${FX_CLOCK_DOUBLES.length}]; bool draw; bool paceSet; vec2 group; };
Tick tick(sampler2D a, bool fresh, bool kept) {
  float x = iTime * 240.0, grid = floor(x + 0.5);
  ${run.registers.split("\n").join("\n  ")}
  CR[${reg("grid")}] = dFromInt(int(grid));
  CR[${reg("time")}] = dFromFloat(iTime);
  CR[${reg("onGrid")}] = abs(x - grid) <= max(1e-4, grid * 2.4e-7) ? D_ONE : D_ZERO;
  CR[${reg("first")}] = fresh ? D_ONE : D_ZERO;
  CR[${reg("changed")}] = kept ? D_ZERO : D_ONE;
${FX_CLOCK_DOUBLES.map(
  ([name], j) =>
    `  CR[${reg(name)}] = fresh ? ${name === "drawn" ? "dNeg(D_ONE)" : "D_ZERO"} : readDouble(a, T_CLOCK + ${j});`
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
  k.group = vec2(dToFloat(CR[${reg("zoomF")}]), dToFloat(CR[${reg("turnF")}]));
  return k;
}

// The outermost petal any time of the loop shows in a canvas of W by H pixels at scale S, as rosette.ts's
// rosettePetals finds it: from the last whose nearest point could lie in the box's corner, inward, the first whose
// circle of reach about its anchor meets the box at one of the loop's times.
bool inBox(vec2 r, vec2 th) {
  vec4 sc = pSinCos(th);
  vec2 gx = pMax(pf(0.0), pSub(pAbs(pMul(r, sc.zw)), pf(iResolution.x * 0.5)));
  vec2 gy = pMax(pf(0.0), pSub(pAbs(pMul(r, sc.xy)), pf(iResolution.y * 0.5)));
  vec2 reach = pAdd(pMul(r, REACH), pf(4.0));
  return !pLess(pMul(reach, reach), pAdd(pMul(gx, gx), pMul(gy, gy)));
}
float outermost(vec2 S) {
  vec2 W = pf(iResolution.x);
  vec2 H = pf(iResolution.y);
  vec2 corner = pDiv(pMul(pSqrt(pAdd(pMul(W, W), pMul(H, H))), pf(0.5)), S);
  float n = pFloor(pDiv(pLog(pDiv(corner, NEAR)), K)).x + 1.0;
  for (int i = 0; i < steps(512); i++) {
    if (n <= float(INNERMOST)) break;
    vec2 r = pMul(S, pExp(pMul(K, pf(n))));
    vec2 th = pAdd(pMul(ALPHA, pf(n)), TURN0);
    for (int s = 0; s <= ${SAMPLES}; s++)
      if (inBox(pMul(r, ZOOM_AT[s]), pAdd(th, TURN_AT[s]))) return n;
    n -= 1.0;
  }
  return float(INNERMOST);
}`;

  const bufferA = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The state, in the first row: the mark, the settings' signature and the clock's flags, the clock's doubles, the
// canvas's scale and outermost petal (kept while the canvas and the settings are), and the loop's zoom and turn at the
// time drawn.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord);
  if (p.y != 0 || p.x >= STATE) discard;
  int i = p.x;
  // the state is this text's, from an earlier frame of this run, for this canvas and these settings
  vec4 mark = state(iChannel0, T_MARK);
  bool fresh = iFrame == 0 || mark.xy != vec2(MAGIC, SCENE);
  vec2 sign = signature();
  bool kept = !fresh && mark.zw == iResolution.xy && state(iChannel0, T_FLAGS).xy == sign;
  if (i == T_MARK) fragColor = vec4(MAGIC, SCENE, iResolution.xy);
  else if (i < T_BOX || i == T_GROUP) {
    // every frame: the clock, and the loop's zoom and turn at the time drawn
    Tick k = tick(iChannel0, fresh, kept);
    if (i == T_FLAGS) fragColor = vec4(sign, k.draw ? 1.0 : 0.0, k.paceSet ? 1.0 : 0.0);
    else if (i == T_GROUP) fragColor = vec4(k.group, 0.0, 0.0);
    else fragColor = pieces(k.d[i - T_CLOCK]);
  } else if (kept) fragColor = state(iChannel0, i);
  else {
    // the scale, as the player's float holds the double, and the outermost petal
    uvec2 S = dMul(SPAN_D, dFromFloat(max(iResolution.x, iResolution.y)));
    fragColor = vec4(iResolution.xy, dToFloat(S), outermost(pOf(S)));
  }
}`;

  const bufferB = `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)
// The frame: the player's fragment shader as it is, its uniforms from Buffer A; between the frames the pace draws, the
// frame drawn last. A finish (a soft blur, a grain) would take it from here.
${shadertoyPass(ROSETTE_FS, { common: ["uStop", "uKeyOfSlot"] })}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  if (state(iChannel0, T_FLAGS).z == 0.0) {
    fragColor = texelFetch(iChannel1, ivec2(fragCoord), 0);
    return;
  }
  fragPlace = vec4(fragCoord, 0.0, 1.0);
  vec4 box = state(iChannel0, T_BOX);
  float one = iResolution.z;
  uBox = box.xy;
  uS = box.z;
  uRange = ivec2(INNERMOST, int(box.w));
  uGroup = state(iChannel0, T_GROUP).xy;
  uK = TURN.x * one;
  uEk = TURN.y * one;
  uAlpha = TURN.z * one;
  uTurn0 = TURN.w * one;
  uFlow = int(FLOW.x * one);
  uPhase = int(FLOW.y * one);
  uLens = LENS * one;
  uLensMid = LENS_MID.xy * one;
  uAngMax = LENS_MID.z * one;
  uGrad = GRAD * one;
  uStopAt = STOP_AT * one;
  uGround = GROUND.rgb * one;
  uHeart = HEART.rgb * one;
  uHeartR = HEART_R * one;
  effectMain();
  fragColor = o;
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

/** The rosette as Shadertoy's tabs, for its palette, effect and angle: the credit, then the tabs, each under its
    header. `origin` adds the effect's address to the credit. The editor loads this module with the Shader tab's
    Shadertoy spelling. */
export function rosetteShadertoyText(
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
    "the rosette, the palette in rings of petals on a golden spiral, for Shadertoy: paste each section into the tab it names and set its channels as its header says",
    origin
  );
  return rosetteShadertoy(P, effect, angle, credit);
}
