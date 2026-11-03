/* The papercut for Shadertoy, in its tabs (papercut-shader.ts writes them out): what the site's WebGL player draws
   (ui/papercut-player.ts) with no JavaScript.
     Common    the settings a reader edits, the papercut's numbers for the angle and the shape it was written for
               (another angle or shape is another text): the levels, the sheets' colors, the relief, and the arithmetic
     Buffer A  the state, in its first row: the players' clock (ui/effect-loop.ts) every frame as JavaScript's doubles
               make it (fx-shadertoy.ts's program on glsl-double.ts), with the loop's seconds at the time drawn; the
               shadows' sizes for the canvas in the same exact doubles by a program of their own, as the canvas or the
               settings change (a canvas whose longer side is an odd ten pixels puts the drop shadows' offsets on a
               half, which the doubles alone round as the player does); and the frame's numbers at the time drawn (the
               hills, the waves' phases, the light) in pairs of floats, which land on the player's floats
     Buffer B  the field: the player's own field pass (papercut-gl.ts), its uniforms Buffer A's texels, a texel every
               fourth pixel each way in the buffer's corner, its floats kept whole as the player's integer texture keeps
               their bits. A soft text's frame instead, which works out the four samples of the field about each pixel
               with the player's own field function, so the soft's blur keeps two buffers
     Buffer C  the frame: the player's own shading pass, the field read from Buffer B as the player reads its texture;
               between the frames the pace draws, the frame drawn last. A soft text's grid from the frame instead, and
               Buffer D its blur (fx-shadertoy.ts), as the silk's and the rosette's texts take them
     Image     the frame on the canvas, or a soft text's grid over the palette's gradient where the blur thins the
               paper toward its edges; a grained text's grain over all
   The state is the text's own only while its first texel holds the text's mark and scene, so a buffer that held
   something else when the text was pasted in starts it afresh, as a rewind does; an edit to the settings, which the
   state keeps a signature of, lays it out again at once, as the player's set() does. Its time is Shadertoy's iTime:
   where it is the float of a whole number of 240ths of a second, the time a frame has on a 30, 60, 120 or 240 Hz screen
   counted from the first, the clock reads that many 240ths in double precision, the time the player's
   requestAnimationFrame gives the frame, so each frame is the player's own. The finish is the site's over the player
   (fx-finish.ts), drawn as the shader pages draw it (shader-finish.ts). */
import { type Compiled, compile, DoubleProgram, doubleRun, type Value } from "./double-program.ts";
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import {
  FX_BUFFER_C,
  FX_BUFFER_D,
  FX_CLOCK_DOUBLES,
  FX_PAIRS,
  FX_STATE,
  FX_T,
  type FxShadertoyFinish,
  fxBufferB,
  fxClock,
  fxFinishCommon,
  fxImage,
  fxPairsTrig,
  glslFloat,
  glslPair,
  sceneMark,
  shadertoyPass
} from "./fx-shadertoy.ts";
import { dlit, GLSL_DOUBLE } from "./glsl-double.ts";
import type { Palette } from "./palette.ts";
import {
  PAPERCUT_LOOK,
  PAPERCUT_LOOP,
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_MAX_SHEETS,
  PAPERCUT_REACH,
  PAPERCUT_SPAN,
  papercutScene
} from "./papercut.ts";
import {
  PAPERCUT_FIELD,
  PAPERCUT_FIELD_FS,
  PAPERCUT_FIELD_UNIFORMS,
  PAPERCUT_SHADE_FS,
  papercutSceneUniforms
} from "./papercut-gl.ts";
import { PAPERCUT_QUARTER } from "./papercut-render.ts";
import type { EffectShaderFinish } from "./shader-finish.ts";
import { effectShaderCredit } from "./shader-shell.ts";
import { effectSoftShare } from "./view.ts";

const pair = (x: number) => glslPair(x, glslFloat);
const rows = (items: readonly string[], per: number, indent = "  ") => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push(`${indent}${items.slice(i, i + per).join(", ")}`);
  return out.join(",\n");
};
const vec3 = (values: ArrayLike<number>, at: number) =>
  `vec3(${[0, 1, 2].map(k => glslFloat(values[at + k])).join(", ")})`;

/* Buffer A's first row after the clock's: the canvas's D and contact shadow, the thin and the thick sheets' drop
   shadows, the waves' phases and the light at the time drawn, then each hill's at the time drawn */
const T = (() => {
  const canvas = FX_T.own;
  const sheet = canvas + 1;
  const waves = sheet + 2;
  const light = waves + 1;
  const bump = light + 1;
  return { canvas, sheet, waves, light, bump };
})();
/** The state's mark: a number no half float holds, which a later form of the state would change. */
const MAGIC = 4105.5;

/** The players' clock with the loop's own seconds at the time drawn (papercut.ts papercutFrameAt: every motion is whole
    cycles of the loop): the program Buffer A runs every frame. */
export const papercutClock = (): DoubleProgram =>
  fxClock((p, drawn) => {
    const loop = p.c(PAPERCUT_LOOP);
    p.pin("loopT", p.sub(drawn, p.mul(loop, p.floor(p.div(drawn, loop)))));
  });

/** The canvas's numbers from its W and H, as papercut.ts papercutModelSteps works them out in doubles: D, and for a thin
    and a thick sheet the drop shadow's 1 / sigma, offset and reach, then the contact's 1 / sigma and the lit cut's
    width, each rounded to the player's float. A program of its own, over registers of its own (a clock run over a
    larger program's registers slows an RTX's every frame), which Buffer A runs as the canvas or the settings change. */
export function papercutLayout(): DoubleProgram {
  const p = new DoubleProgram();
  const { c } = p;
  const L = PAPERCUT_LOOK;
  /* JavaScript's Math.round: the nearest whole number, halves up; v / step rounded, times step */
  const round = (v: Value, step: number) => {
    const y = p.div(v, c(step));
    const up = p.ceil(y);
    return p.mul(p.choose(p.lt(y, p.sub(up, c(0.5))), p.sub(up, c(1)), up), c(step));
  };
  const D = p.mul(c(PAPERCUT_SPAN), p.max(p.input("W"), p.input("H")));
  p.pin("D", p.f32(D));
  for (const [name, thick] of [
    ["thin", 1],
    ["thick", L.indexScale]
  ] as const) {
    const sigma = p.max(
      c(0.01),
      round(p.mul(p.mul(c(L.shadowBlur), D), c(Math.sqrt(thick))), 0.01)
    );
    const offset = round(p.mul(p.mul(c(L.shadowOffset), D), c(thick)), 0.01);
    p.pin(`${name}Isigma`, p.f32(p.div(c(1), sigma)));
    p.pin(`${name}Offset`, p.f32(offset));
    p.pin(
      `${name}Reach`,
      p.f32(round(p.mul(c(1.5), p.add(offset, p.mul(c(PAPERCUT_REACH), sigma))), 0.01))
    );
  }
  const csigma = p.max(c(0.01), round(p.mul(c(L.contactBlur), D), 0.01));
  p.pin("icsigma", p.f32(p.div(c(1), csigma)));
  p.pin("wall", p.f32(round(p.mul(c(L.wall), D), 0.01)));
  return p;
}

/** The papercut's Shadertoy tabs for its palette, effect and angle, under the credit's lines, and its finish where it
    has one. */
export function papercutShadertoy(
  P: Palette,
  effect: Effect,
  angle: number,
  credit: readonly string[],
  finish: FxShadertoyFinish = { share: 0, underlay: null, angle, grain: 0 }
): string {
  const soft = finish.share > 0;
  const shape = effect.look.shape;
  /* the look's numbers, the same for every canvas: those of any box */
  const m = papercutScene(P, { angle, shape }, { width: 1, height: 1 });
  const u = papercutSceneUniforms(m);
  const L = PAPERCUT_LOOK;
  const nb = m.bumps.length;
  const w = (Math.PI * 2) / PAPERCUT_LOOP;
  const clock = compile(papercutClock());
  const laid = compile(papercutLayout());
  const run = doubleRun(clock, dlit, "C");
  const lay = doubleRun(laid, dlit, "L");
  const regOf = (program: Compiled) => (name: string) => {
    const r = program.inputs.get(name) ?? program.pinned.get(name);
    if (r === undefined) throw new Error(`no register ${name}`);
    return r;
  };
  const reg = regOf(clock);
  const lreg = regOf(laid);
  const state = T.bump + nb;
  const scene = glslFloat(
    sceneMark([angle, shape ?? 0, Array.from(u.level), Array.from(u.face), m.bumps])
  );
  const head = credit.map(line => `// ${line}`).join("\n");
  const look = shape ? `shape ${shape}` : "as designed";
  const field = (key: "x" | "ax" | "y" | "ay" | "a" | "b" | "px" | "py" | "pb") =>
    m.bumps.map(b => pair(b[key])).join(", ");
  const turns = (key: "kx" | "ky" | "kb") => m.bumps.map(b => pair(w * b[key])).join(", ");

  const common = `// ==== Common ====
// The papercut's settings, as its address writes them: edit them here. An edit shows at once.
const float SPEED = ${glslFloat(effect.speed)};   // the loop's pace, two decimals: it lasts ${PAPERCUT_LOOP} s over this; 0 holds the frame it is on
const float FPS = ${glslFloat(effect.fps)};    // frames a second at most, 1 to 120
const float EASE = ${glslFloat(EFFECT_EASE_S)};    // seconds from rest to its pace, two decimals
// The rest is the papercut at angle ${angle}, ${look}, worked out by the site's own code from the palette's curve and the
// shape's numbers: another angle or shape is another text.

// The sheets: ${m.n} of them, each one of the palette's colors, its field's level, its color, its lit cut's and the shadow it
// casts on the sheet below, as the player's floats (uSheets, uLevel, uFace, uWallC, uShade); every ${L.index}th sheet from the
// first is thicker card.
const int SHEETS = ${m.n};
const int INDEX = ${L.index};
const float uLevel[${PAPERCUT_MAX_SHEETS}] = float[](
${rows(
  Array.from(u.level, v => glslFloat(v)),
  6
)}
);
const vec3 uFace[${PAPERCUT_MAX_SHEETS}] = vec3[](
${rows(
  Array.from({ length: PAPERCUT_MAX_SHEETS }, (_, k) => vec3(u.face, 3 * k)),
  3
)}
);
const vec3 uWallC[${PAPERCUT_MAX_SHEETS}] = vec3[](
${rows(
  Array.from({ length: PAPERCUT_MAX_SHEETS }, (_, k) => vec3(u.wall, 3 * k)),
  3
)}
);
const vec3 uShade[${PAPERCUT_MAX_SHEETS}] = vec3[](
${rows(
  Array.from({ length: PAPERCUT_MAX_SHEETS }, (_, k) => vec3(u.shadow, 3 * k)),
  3
)}
);
// A drop shadow's opacity, thin and thick (sheet 1's, and sheet 0's, card as every ${L.index}th is), and the contact
// shadow's (uMisc.x).
const vec2 ALPHA = vec2(${glslFloat(u.sheet[4 + 2])}, ${glslFloat(u.sheet[2])});
const float CONTACT = ${glslFloat(u.misc[0])};
// The player's field uniforms, the same for every canvas: the ramp along the angle, the two waves' reach and frequency,
// the hills and hollows. A pass takes each times iResolution.z, which is 1, so no compiler folds them into its
// arithmetic.
const vec2 RAMP = vec2(${glslFloat(m.rx)}, ${glslFloat(m.ry)});
const vec4 WARP = vec4(${[m.wa, m.wf, m.wa2, m.wf2].map(glslFloat).join(", ")});
const int BUMPS = ${nb};
// Each hill (a > 0) or hollow (a < 0), in pairs of floats as the site's doubles hold them: its middle in the design's
// box's own units and its drift, its turns a second (the loop's cycles over its seconds) and phases across and down, its
// height, its breathing's share, turn and phase, and 1 / r^2 as the player's float.
const vec2 B_X[${nb}] = vec2[](${field("x")});
const vec2 B_AX[${nb}] = vec2[](${field("ax")});
const vec2 B_WX[${nb}] = vec2[](${turns("kx")});
const vec2 B_PX[${nb}] = vec2[](${field("px")});
const vec2 B_Y[${nb}] = vec2[](${field("y")});
const vec2 B_AY[${nb}] = vec2[](${field("ay")});
const vec2 B_WY[${nb}] = vec2[](${turns("ky")});
const vec2 B_PY[${nb}] = vec2[](${field("py")});
const vec2 B_A[${nb}] = vec2[](${field("a")});
const vec2 B_B[${nb}] = vec2[](${field("b")});
const vec2 B_WB[${nb}] = vec2[](${turns("kb")});
const vec2 B_PB[${nb}] = vec2[](${field("pb")});
const float B_IR2[${nb}] = float[](${m.bumps.map(b => glslFloat(1 / (b.r * b.r))).join(", ")});
// The design's box's half width and height, the waves' phases at the loop's start and their turns a second, the light's
// way at the start (x, y) and its swing, and a loop's turn a second.
const vec2 FRAME_HW = ${pair(0.5 / PAPERCUT_SPAN)};
const vec2 FRAME_HH = ${pair(0.28125 / PAPERCUT_SPAN)};
const vec2 PHASE[4] = vec2[](${m.phase.map(pair).join(", ")});
const vec2 WAVE_W[4] = vec2[](${m.cycles.map(k => pair(w * k)).join(", ")});
const vec2 LIGHT_X = ${pair(m.lx)};
const vec2 LIGHT_Y = ${pair(m.ly)};
const vec2 SWING = ${pair(m.swing)};
const vec2 LOOP_W = ${pair(w)};

${GLSL_DOUBLE}

${FX_PAIRS}

${fxPairsTrig(pair)}

${run.globals.replace("// The program's constants and its instructions", "// The clock's program: its constants and its instructions")}
${lay.globals.replace("// The program's constants and its instructions", "// The layout's program, the canvas's numbers: its constants and its instructions")}
${soft ? `\n${fxFinishCommon(finish, glslFloat)}\n` : ""}
${FX_STATE}
const float MAGIC = ${glslFloat(MAGIC)};   // the state's mark, which no half float holds
const float SCENE = ${scene};   // this text's scene, beside the mark
const int T_CANVAS = ${T.canvas};  // the canvas's D, the contact shadow's 1 / sigma and the lit cut's width: uD, uSheet[k].w, uMisc.y
const int T_SHEET = ${T.sheet};   // a thin sheet's drop shadow and a thick one's: 1 / sigma, offset, opacity, reach (uSheet, uReach)
const int T_WAVES = ${T.waves};  // the waves' phases at the time drawn: uPhase
const int T_LIGHT = ${T.light};  // toward the light at the time drawn: uLight
const int T_BUMP = ${T.bump};   // each hill's middle, 1 / r^2 and height at the time drawn: uBump
const int STATE = ${state};

// Common's settings as one number, in two 16-bit halves
vec2 signature() {
  uint h = 2166136261u;
  for (int k = 0; k < ${soft ? 4 : 3}; k++) h = (h ^ floatBitsToUint(k == 0 ? SPEED : k == 1 ? FPS : ${soft ? "k == 2 ? EASE : SOFT" : "EASE"})) * 16777619u;
  return vec2(h >> 16, h & 0xffffu);
}

// The players' tick on Shadertoy's time, from the state the frame before left: the clock's doubles, whether this frame
// draws, whether the pace has begun, and the loop's seconds at the time drawn.
struct Tick { uvec2 d[${FX_CLOCK_DOUBLES.length}]; bool draw; bool paceSet; uvec2 loopT; };
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
  k.loopT = CR[${reg("loopT")}];
  return k;
}

// The canvas's numbers, as papercut.ts works them out for a canvas of W by H pixels in doubles: texel i of the layout's
// three, as the player's floats.
vec4 layoutOf(int i) {
  ${lay.registers.split("\n").join("\n  ")}
  LR[${lreg("W")}] = dFromInt(int(iResolution.x));
  LR[${lreg("H")}] = dFromInt(int(iResolution.y));
  ${lay.loop("0", `steps(${laid.code.length})`).split("\n").join("\n  ")}
  if (i == T_CANVAS) return vec4(dToFloat(LR[${lreg("D")}]), dToFloat(LR[${lreg("icsigma")}]), dToFloat(LR[${lreg("wall")}]), CONTACT);
  if (i == T_SHEET) return vec4(dToFloat(LR[${lreg("thinIsigma")}]), dToFloat(LR[${lreg("thinOffset")}]), ALPHA.x, dToFloat(LR[${lreg("thinReach")}]));
  return vec4(dToFloat(LR[${lreg("thickIsigma")}]), dToFloat(LR[${lreg("thickOffset")}]), ALPHA.y, dToFloat(LR[${lreg("thickReach")}]));
}

// The frame's numbers at t, the loop's seconds, as papercut.ts's papercutFrameAt works them out: texel i's, each as the
// player's float. A hill's middle and height take the sines and cosines of six angles, the light's way two, one taken
// from the other: all in one loop, so the series is written in one place.
vec4 frameOf(int i, vec2 t) {
  if (i == T_WAVES) {
    vec4 p;
    for (int j = 0; j < 4; j++) p[j] = pAdd(PHASE[j], pMul(WAVE_W[j], t)).x;
    return p;
  }
  bool light = i == T_LIGHT;
  int b = light ? 0 : i - T_BUMP;
  vec2 angle[6] = vec2[](
    light ? pMul(LOOP_W, t) : pAdd(pMul(B_WX[b], t), B_PX[b]), B_PX[b],
    pAdd(pMul(B_WY[b], t), B_PY[b]), B_PY[b],
    pAdd(pMul(B_WB[b], t), B_PB[b]), B_PB[b]
  );
  vec4 sc[6];
  for (int k = 0; k < steps(light ? 2 : 6); k++) {
    sc[k] = pSinCos(angle[k]);
    // the light's swing: a sine, so it leaves the designed light at t = 0 at its fastest and turns back at the ends
    if (light && k == 0) angle[1] = pMul(SWING, sc[0].xy);
  }
  if (light)
    return vec4(pSub(pMul(sc[1].zw, LIGHT_X), pMul(sc[1].xy, LIGHT_Y)).x, pAdd(pMul(sc[1].xy, LIGHT_X), pMul(sc[1].zw, LIGHT_Y)).x, 0.0, 0.0);
  vec2 x = pMul(pAdd(B_X[b], pMul(B_AX[b], pSub(sc[0].zw, sc[1].zw))), FRAME_HW);
  vec2 y = pMul(pAdd(B_Y[b], pMul(B_AY[b], pSub(sc[2].xy, sc[3].xy))), FRAME_HH);
  vec2 a = pMul(B_A[b], pAdd(pf(1.0), pMul(B_B[b], pSub(sc[4].xy, sc[5].xy))));
  return vec4(x.x, y.x, B_IR2[b], a.x);
}`;

  const bufferA = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The state, in the first row: the mark, the settings' signature and the clock's flags, the clock's doubles, the
// canvas's shadows (kept while the canvas and the settings are), and the frame's numbers at the time drawn. Each part
// is worked out in one place (a GPU's compiler writes a function out again at each call).
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
  else if (i >= T_CANVAS && i < T_WAVES) fragColor = kept ? state(iChannel0, i) : layoutOf(i);
  else {
    // every frame: the clock, and the frame's numbers at the time drawn
    Tick k = tick(iChannel0, fresh, kept);
    if (i == T_FLAGS) fragColor = vec4(sign, k.draw ? 1.0 : 0.0, k.paceSet ? 1.0 : 0.0);
    else if (i < T_CANVAS) fragColor = pieces(k.d[i - T_CLOCK]);
    else fragColor = frameOf(i, pOf(k.loopT));
  }
}`;

  /* the field's uniforms and the shading pass's, set from Buffer A's texels and Common's numbers */
  const fieldSetup = `  float one = iResolution.z;
  uSize = iResolution.xy;
  uD = state(iChannel0, T_CANVAS).x;
  uRamp = RAMP * one;
  uWarp = WARP * one;
  uPhase = state(iChannel0, T_WAVES);
  uBumps = BUMPS;
  for (int i = 0; i < ${PAPERCUT_MAX_BUMPS}; i++) uBump[i] = i < BUMPS ? state(iChannel0, T_BUMP + i) : vec4(0.0);`;
  const shadeSetup = `  vec4 canvas = state(iChannel0, T_CANVAS);
  vec4 thin = state(iChannel0, T_SHEET);
  vec4 thick = state(iChannel0, T_SHEET + 1);
  uSize = iResolution.xy;
  uD = canvas.x;
  uLight = state(iChannel0, T_LIGHT).xy;
  uSheets = SHEETS;
  for (int k = 0; k < ${PAPERCUT_MAX_SHEETS}; k++) {
    vec4 s = INDEX > 0 && k % INDEX == 0 ? thick : thin;
    uSheet[k] = vec4(s.xyz, canvas.y);
    uReach[k] = s.w;
  }
  uMisc = canvas.wz;`;
  /* the shading pass as a Shadertoy pass: its field's samples read as the player reads its integer texture, the bits
     of each float (fieldBits), and the levels and colors Common's */
  const shadePass = shadertoyPass(
    PAPERCUT_SHADE_FS.replace("\nuniform highp usampler2D uField;", "").replace(
      /texelFetch\(uField, /g,
      "fieldBits("
    ),
    { common: ["uLevel", "uFace", "uWallC", "uShade"] }
  );

  /* a plain or grained text: the field pass in Buffer B, as the player draws it into its texture, its output a global
     the buffer writes as floats; the shading pass in Buffer C */
  const fieldBuffer = `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The field: the player's field pass as it is, its uniforms from Buffer A, a texel every fourth pixel each way and one
// past each edge, in the buffer's corner; its floats kept whole, as the player's integer texture keeps their bits. Only
// in a frame the pace draws.
${shadertoyPass(PAPERCUT_FIELD_FS.replace("\nout uvec4 o;", "\nuvec4 o;"))}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 b = ivec2(fragCoord);
  // the field's texels: (W - 1) / ${PAPERCUT_QUARTER} rounded up and three more, each way
  ivec2 size = (ivec2(iResolution.xy) + ${PAPERCUT_QUARTER - 2}) / ${PAPERCUT_QUARTER} + 3;
  if (any(greaterThanEqual(b, size)) || state(iChannel0, T_FLAGS).z == 0.0) {
    fragColor = vec4(0.0);
    return;
  }
${fieldSetup}
  fragPlace = vec4(fragCoord, 0.0, 1.0);
  effectMain();
  fragColor = uintBitsToFloat(o);
}`;
  const frameBuffer = fxBufferB(
    `// ==== Buffer C ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer C (filter: nearest, wrap: clamp); iChannel2: Buffer B (filter: nearest, wrap: clamp)
// The frame: the player's shading pass as it is, its uniforms from Buffer A, the field Buffer B's texels as the player
// reads its texture's (fieldBits); between the frames the pace draws, the frame drawn last.
uvec4 fieldBits(ivec2 i, int lod) { return floatBitsToUint(texelFetch(iChannel2, i, lod)); }`,
    shadePass,
    shadeSetup,
    "o"
  );

  /* a soft text: the frame in Buffer B, which works the field out itself at the four samples about the pixel with the
     player's own field function, as its field pass works each out at its texel (in one loop, so the function is written
     once), leaving Buffers C and D to the soft's blur as the silk's and the rosette's texts take them */
  const softFrameBuffer = fxBufferB(
    `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)
// The frame: the player's shading pass as it is, its uniforms from Buffer A, and the four samples of the field about the
// pixel worked out here by the player's own field function, each as its field pass works it out at its texel and keeps
// its bits (fieldBits); between the frames the pace draws, the frame drawn last.`,
    shadePass.replace(
      "\nvoid effectMain()",
      `\n${PAPERCUT_FIELD_UNIFORMS.trim().replace(/^uniform /gm, "")}\n${PAPERCUT_FIELD}
// the field's samples about the pixel, the first at texel \`sampled\`, then across and up
uvec4 samples[4];
ivec2 sampled;
uvec4 fieldBits(ivec2 i, int lod) {
  ivec2 d = i - sampled;
  return samples[d.y * 2 + d.x];
}
void effectMain()`
    ),
    `${shadeSetup}
${fieldSetup.replace("  uSize = iResolution.xy;\n  uD = state(iChannel0, T_CANVAS).x;\n", "")}
  // the pixel's first sample, as the shading pass finds it, and the four worked out as the field pass works each out
  sampled = ivec2(vec2(fragCoord.x - 0.5, iResolution.y - fragCoord.y - 0.5) / ${PAPERCUT_QUARTER.toFixed(1)} + 1.0);
  for (int k = 0; k < steps(4); k++) {
    vec2 at = (vec2(sampled + ivec2(k & 1, k >> 1)) - 1.0) * ${PAPERCUT_QUARTER.toFixed(1)} + 0.5;
    samples[k] = floatBitsToUint(field((at - 0.5 * uSize) / uD));
  }`,
    "o"
  );

  return `${head}
//
// ${soft ? "Buffers A to D" : "Buffers A to C"} each in Shadertoy's tab of the name, the Image in Image, each tab's channels as its header says. It
// needs Shadertoy's 32-bit float buffers (its fallback, half floats, cannot hold its numbers) and a canvas at least
// ${state} pixels wide: without either it shows magenta. An edit to Common's settings shows at once; rewind plays it
// again from its first frame.

${common}

${bufferA}

${soft ? `${softFrameBuffer}\n\n${FX_BUFFER_C}\n\n${FX_BUFFER_D}` : `${fieldBuffer}\n\n${frameBuffer}`}

${fxImage(soft, finish.grain, "C")}
`;
}

/** The papercut as Shadertoy's tabs, for its palette, effect and angle: the credit, then the tabs, each under its
    header, with its finish where it has one (its soft in Buffers B to D and the Image, its grain in the Image).
    `origin` adds the effect's address to the credit. The editor loads this module with the Shader tab's Shadertoy spelling. */
export function papercutShadertoyText(
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    "the papercut, the palette cut into sheets of paper, for Shadertoy: paste each section into the tab it names and set its channels as its header says",
    origin,
    finish
  );
  return papercutShadertoy(P, effect, angle, credit, {
    share: finish.soft ? effectSoftShare(finish.soft) : 0,
    underlay: finish.soft ? (finish.underlay ?? null) : null,
    angle: finish.underlay?.angle ?? angle,
    grain: finish.grain ?? 0
  });
}
