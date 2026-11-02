/* The blob for Shadertoy, in its tabs: the player's passes (ui/blob-player.ts) as Shadertoy's buffers run them, every
   buffer a float texture the canvas's size and every frame each tab's whole buffer, so a pass draws in a corner and
   keeps in its own texels what the player keeps in a script.
     Common    the settings a reader edits, the colors, and the texels Buffer A keeps its state in
     Buffer A  the frost's noise, baked once a size as 8-bit bytes two to a channel (red and green); and in its first
               row (blue and alpha) the player's numbers: its layout, the blur's weights and its clock as JavaScript's
               doubles make them, by a program of double arithmetic (blob-program.ts,
               glsl-double.ts), the layout as the canvas or the settings change and the clock every frame; and each
               frame that draws, each ball's place in the melt in fixed point (blob-fixed.ts), which lands on the
               player's floats. Only the first row's texels run either, in a loop the others never enter
     Buffer B  the balls into the melt, in Common's colors as the player's floats hold them, blended and kept as half
               floats as the player's RGBA16F texture keeps them
     Buffer C  the blur across, Buffer D the blur down, D holding the frame drawn last between frames the pace draws
     Image     every pixel: the player's last pass, the melt read bilinearly by hand as a GPU reads half floats
   Buffers write only what is read: past the melt, and the noise once both of a buffer's copies hold it, a texel is
   discarded. The state is the text's own only while its first texel holds the text's mark (a version and the scene),
   so a buffer that held something else when the text was pasted in starts it afresh, as a rewind does; and an edit to
   the settings, which the state keeps a signature of, makes the layout again at once, as the player's set() does.
   Its time is Shadertoy's iTime, a float: where it is the float of a whole number of 240ths of a second, the time a
   frame has on a 30, 60, 120 or 240 Hz screen counted from the first, the clock reads that many 240ths in double
   precision, which is the time the player's requestAnimationFrame gives the frame, so every frame is the player's own
   (the shader lab's frames are so timed) where the GPU rounds the player's 8-bit noise and half-float melt as the
   float buffers do (SwiftShader does; the RTX 2080 Ti does not); any other time is read as the float it is. */
import {
  BLOB_DESIGN,
  BLOB_LOOP,
  type BlobScene,
  blobFilter,
  blobNoiseTables,
  blobScene
} from "./blob.ts";
import { fixedLit, GLSL_FIXED, glslFixedPlace } from "./blob-fixed.ts";
import { BLOB_GRID_HZ, BLOB_WEIGHTS, blobClock, blobProgram } from "./blob-program.ts";
import { hexBytes } from "./color.ts";
import { compile, doubleRun } from "./double-program.ts";
import { EFFECT_EASE_S, type Effect } from "./effect.ts";
import { dlit, GLSL_DOUBLE } from "./glsl-double.ts";
import type { Palette } from "./palette.ts";

/** A float as GLSL: the fewest digits that read back as the same float. */
export function glslFloat(x: number): string {
  const f = Math.fround(x);
  let s = String(f);
  for (let p = 1; p <= 9; p++) {
    const t = f.toPrecision(p);
    if (Math.fround(Number(t)) === f) {
      s = String(Number(t));
      break;
    }
  }
  return /[.e]/.test(s) ? s : `${s}.0`;
}
/** Lines of GLSL indented by `by`, blank lines left empty. */
const pad = (text: string, by: string) =>
  text
    .split("\n")
    .map(line => (line ? `${by}${line}` : line))
    .join("\n");
const hex = (n: number, digits = 8) => `0x${(n >>> 0).toString(16).padStart(digits, "0")}u`;
const rows = (items: string[], per: number, indent = "  ") => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push(`${indent}${items.slice(i, i + per).join(", ")}`);
  return out.join(",\n");
};

const BALLS = 24;
/* the layout's doubles the clock and the places read, kept in their texels in this order: the map (its scale the same
   across and down, as the text draws at the canvas's own pixels), the melt's corner, a texel's inverse, and the clock's
   settings */
const LAYOUT_DOUBLES = [
  "sx",
  "tx",
  "ty",
  "meltX",
  "meltY",
  "invTexel",
  "speed",
  "ease",
  "every",
  "early"
] as const;
/* the clock's doubles, kept in their texels in this order, each by the program's name for it as it comes out */
const CLOCK_DOUBLES = [
  ["t", "tOut"],
  ["warm", "warmOut"],
  ["before", "beforeOut"],
  ["paceLast", "paceLastOut"],
  ["drawn", "drawnOut"]
] as const;
/* Buffer A's first row, blue and alpha: two floats a texel. A double is four 16-bit pieces in two texels. */
const T = (() => {
  const t = { mark: 0, stamp: 1, sign: 2, seen: 3, flags: 4, clock: 5 };
  const layout = t.clock + 2 * CLOCK_DOUBLES.length;
  const melt = layout + 2 * LAYOUT_DOUBLES.length;
  const weights = melt + 10;
  return {
    ...t,
    layout,
    melt,
    taps: melt + 1,
    region: melt + 2,
    origin: melt + 4,
    texel: melt + 5,
    scatter: melt + 6,
    k: melt + 7,
    ground: melt + 8,
    weights,
    balls: weights + BLOB_WEIGHTS / 2
  };
})();
const STATE = T.balls + 2 * BALLS;
/** The state's mark: a number no half float holds, so a buffer of half floats never passes for the state, and which
    a later form of the state would change. */
const MAGIC = 4097.5;

/** A scene's number: its noise's seed and its blobs, so one text's state is never taken for another's. A float
    holds it exactly. */
function sceneMark(scene: BlobScene, seed: number): number {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify([seed, scene.blobs]))
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h & 0xffffff;
}

/** The blob's Shadertoy tabs as one text, a section a tab under a header naming its channels. */
export function blobShadertoy(P: Palette, effect: Effect, credit: string[]): string {
  const scene = blobScene(P, BLOB_DESIGN, effect.look);
  const look = blobFilter(effect.look, BLOB_DESIGN, scene);
  const blobs = scene.blobs;
  const balls = blobs.flatMap(blob => blob.balls);
  if (balls.length !== BALLS) throw new Error(`the blob has ${balls.length} balls`);
  const c = compile(blobProgram());
  const run = doubleRun(c, dlit);
  const ticks = compile(blobClock());
  const tick = doubleRun(ticks, dlit, "C");
  const register = (p: typeof c) => (name: string) => {
    const r = p.inputs.get(name) ?? p.pinned.get(name);
    if (r === undefined) throw new Error(`no register ${name}`);
    return r;
  };
  const at = register(c);
  const atClock = register(ticks);
  const range = (name: string) => {
    const s = c.sections.get(name);
    if (!s) throw new Error(`no section ${name}`);
    return s;
  };
  const { lattice, gradients } = blobNoiseTables(look.seed);
  const words = (bytes: Uint8Array) =>
    Array.from({ length: bytes.length / 4 }, (_, i) =>
      hex(
        bytes[4 * i] | (bytes[4 * i + 1] << 8) | (bytes[4 * i + 2] << 16) | (bytes[4 * i + 3] << 24)
      )
    );
  const colors = balls.map(b => {
    const [r, g, bl] = hexBytes(scene.color(b.at));
    return hex((r << 16) | (g << 8) | bl, 6);
  });
  const bg = effect.look.bg;
  const bgWord = bg
    ? (parseInt(bg.slice(1, 7), 16) * 256 + (bg.length === 9 ? parseInt(bg.slice(7), 16) : 255)) >>>
      0
    : 0;
  const head = credit.map(line => `// ${line}`).join("\n");
  const shape = effect.look.shape === null ? "the palette's own" : `shape ${effect.look.shape}`;

  const common = `// ==== Common ====
// The blob's settings, as its address writes them: edit them here. An edit shows at once.
const float SPEED = ${glslFloat(effect.speed)};   // the loop's pace, two decimals: it lasts ${BLOB_LOOP} s over this; 0 holds the frame it is on
const float FPS = ${glslFloat(effect.fps)};    // frames a second at most, 1 to 120
const float FROST = ${glslFloat(effect.look.frost)};   // the frost, two decimals: 1 as designed, 0 none, 2 twice
const uint BG = ${hex(bgWord)};   // the ground as 0xRRGGBBAA, its alpha last; 0u for none, which shows black here
const float EASE = ${glslFloat(EFFECT_EASE_S)};    // seconds from rest to its pace, two decimals
// The colors the balls are painted in, 0xRRGGBB, one a ball, far blob to near: the palette across each blob from
// left to right. The blobs' forms and wanderings (${shape}) are Buffer A's BLOBS and BALLS.
// Both are worked out from the palette's curve and the shape's numbers by the site's own code: another shape is
// another text.
const uint COLORS[${BALLS}] = uint[](
${rows(colors, 8)}
);

// Buffer A's first row keeps the player's numbers in its blue and alpha, two to a texel; a double in two texels.
const float MAGIC = ${glslFloat(MAGIC)};   // the state's mark, which no half float holds
const int T_MARK = ${T.mark};     // the mark and the scene: the state is this text's
const int T_STAMP = ${T.stamp};    // the canvas the layout was made for
const int T_SIGN = ${T.sign};     // the settings the layout was made for, as one number in two halves
const int T_SEEN = ${T.seen};     // the canvas a frame before T_STAMP's, or -1 where that frame began afresh
const int T_FLAGS = ${T.flags};    // whether this frame draws, whether the pace has begun
const int T_CLOCK = ${T.clock};    // the clock: the loop's seconds, the ease's, the frame's time and the pace's in ms, the share drawn
const int T_LAYOUT = ${T.layout};  // the design's map (its scale, tx, ty), the melt's corner, a texel's inverse, the clock's settings
const int T_MELT = ${T.melt};    // the melt's texels across and down
const int T_TAPS = ${T.taps};    // the blur's taps, and whether the frost is drawn
const int T_REGION = ${T.region};  // the filter region in whole pixels, x0, y0, x1, y1
const int T_ORIGIN = ${T.origin};  // the melt's corner in pixels
const int T_TEXEL = ${T.texel};   // pixels a texel spans, and the scatter across
const int T_SCATTER = ${T.scatter}; // the scatter down, and the speckle's k1
const int T_K = ${T.k};       // the speckle's k2
const int T_GROUND = ${T.ground};  // the ground, premultiplied
const int T_WEIGHTS = ${T.weights}; // the blur's ${BLOB_WEIGHTS} weights
const int T_BALLS = ${T.balls};   // each ball: its middle in the melt's texels, and its radius
const int STATE = ${STATE};
vec2 state(sampler2D a, int i) { return texelFetch(a, ivec2(i, 0), 0).ba; }
// n as a count no compiler can see (iResolution.z is 1), so it keeps a program's long loop a loop rather than
// writing its body out step by step: D3D11's compiler took longer over Buffer A with the counts in sight
int steps(int n) { return n * int(iResolution.z); }
// as the player's half-float texture keeps it
vec4 half4(vec4 v) { return vec4(unpackHalf2x16(packHalf2x16(v.xy)), unpackHalf2x16(packHalf2x16(v.zw))); }
float weight(sampler2D a, int i) {
  vec2 w = state(a, T_WEIGHTS + i / 2);
  return (i & 1) == 0 ? w.x : w.y;
}
// the player's blur: a Gaussian across or down the melt, its taps from the middle out
vec4 blur(sampler2D source, sampler2D a, ivec2 at, ivec2 size, ivec2 step_by) {
  int taps = int(state(a, T_TAPS).x);
  vec4 sum = texelFetch(source, at, 0) * weight(a, 0);
  for (int i = 1; i <= ${BLOB_WEIGHTS - 1}; i++) {
    if (i > taps) break;
    ivec2 p = at + step_by * i;
    ivec2 q = at - step_by * i;
    if (p.x < size.x && p.y < size.y) sum += texelFetch(source, p, 0) * weight(a, i);
    if (q.x >= 0 && q.y >= 0) sum += texelFetch(source, q, 0) * weight(a, i);
  }
  return sum;
}
bool inMelt(sampler2D a, vec2 fragCoord) {
  vec2 size = state(a, T_MELT);
  return fragCoord.x < size.x && fragCoord.y < size.y;
}
bool drawing(sampler2D a) { return state(a, T_FLAGS).x != 0.0; }
// a byte as the GPU reads an 8-bit texel: times the float nearest 1 / 255
const float BYTE = ${glslFloat(1 / 255)};
`;

  const blobData = blobs.flatMap(b => [b.x, b.y, b.R, b.wander[0].reach, b.wander[1].reach]);
  const ballData = balls.flatMap(b => [
    b.x,
    b.y,
    b.r,
    b.swing,
    Math.cos(2 * Math.PI * b.phase),
    Math.sin(2 * Math.PI * b.phase)
  ]);
  const input = (name: string, value: string) => `R[${at(name)}] = ${value};`;
  /* the layout's inputs: the canvas, the settings, the look and its ball's color */
  const inputs = [
    input("W", "dFromFloat(iResolution.x)"),
    input("H", "dFromFloat(iResolution.y)"),
    input("speed100", "hundredths(SPEED)"),
    input("fps", "dFromInt(clamp(int(floor(FPS + 0.5)), 1, 120))"),
    input("frost100", "hundredths(FROST)"),
    input("ease100", "hundredths(EASE)"),
    input("bgR", "dFromInt(int(BG >> 24))"),
    input("bgG", "dFromInt(int((BG >> 16) & 255u))"),
    input("bgB", "dFromInt(int((BG >> 8) & 255u))"),
    input("bgA", "dFromInt(int(BG & 255u))"),
    input("bgOn", "(BG & 255u) != 0u ? D_ONE : D_ZERO"),
    input("melt", "MELT"),
    input("pad", "PAD")
  ].join("\n");
  const clockInput = (name: string, value: string) => `CR[${atClock(name)}] = ${value};`;
  /* the clock's inputs: the frame's time, the clock as the frame before left it, and the layout's settings for it */
  const clockInputs = [
    clockInput("grid", "dFromInt(int(grid))"),
    clockInput("time", "dFromFloat(iTime)"),
    clockInput("onGrid", `abs(x - grid) <= max(1e-4, grid * 2.4e-7) ? D_ONE : D_ZERO`),
    clockInput("first", "fresh ? D_ONE : D_ZERO"),
    clockInput("changed", "kept ? D_ZERO : D_ONE"),
    ...CLOCK_DOUBLES.map(([name], k) =>
      clockInput(
        name,
        `fresh ? ${name === "drawn" ? "dNeg(D_ONE)" : "D_ZERO"} : readDouble(T_CLOCK + ${2 * k})`
      )
    ),
    clockInput("paceSet", "!fresh && state(iChannel0, T_FLAGS).y != 0.0 ? D_ONE : D_ZERO"),
    ...LAYOUT_DOUBLES.slice(6).map((name, k) => clockInput(name, `made[${6 + k}]`))
  ].join("\n");
  /* the layout's and the weights' texels, from the registers */
  const layoutOut = `if (i < T_MELT) {
  int k = (i - T_LAYOUT) / 2;
  return pieces(R[${LAYOUT_DOUBLES.map((name, k) => (k < LAYOUT_DOUBLES.length - 1 ? `k == ${k} ? ${at(name)} : ` : `${at(name)}`)).join("")}], (i - T_LAYOUT) % 2);
}
// the two registers this texel shows, as floats: picked first, so each conversion is written once
int a = ${at("meltW")}, b = -1;
${[
  ["T_MELT", "meltW", "meltH"],
  ["T_TAPS", "taps", "noise"],
  ["T_REGION", "region0", "region1"],
  ["T_REGION + 1", "region2", "region3"],
  ["T_ORIGIN", "originX", "originY"],
  ["T_TEXEL", "texelF", "scatterX"],
  ["T_SCATTER", "scatterY", "k1F"],
  ["T_K", "k2F", null],
  ["T_GROUND", "groundRF", "groundGF"],
  ["T_GROUND + 1", "groundBF", "groundAF"]
]
  .map(([texel, x, y]) => `if (i == ${texel}) { a = ${at(x as string)}; b = ${y ? at(y) : -1}; }`)
  .join("\n")}
int w = i - T_WEIGHTS;
${Array.from({ length: BLOB_WEIGHTS / 2 }, (_, k) => `if (w == ${k}) { a = ${at(`weight${2 * k}`)}; b = ${at(`weight${2 * k + 1}`)}; }`).join("\n")}
return vec2(dToFloat(R[a]), b < 0 ? 0.0 : dToFloat(R[b]));`;
  const stateTexel = `// the player's numbers for texel i of the first row
vec2 stateTexel(int i) {
  // the state is this text's, from an earlier frame of this run, for this canvas and these settings
  bool fresh = iFrame == 0 || state(iChannel0, T_MARK) != vec2(MAGIC, SCENE);
  vec2 sign = signature();
  bool kept = !fresh && state(iChannel0, T_STAMP) == iResolution.xy && state(iChannel0, T_SIGN) == sign;
  if (i == T_MARK) return vec2(MAGIC, SCENE);
  if (i == T_STAMP) return iResolution.xy;
  if (i == T_SIGN) return sign;
  if (i == T_SEEN) return fresh ? vec2(-1.0) : state(iChannel0, T_STAMP);
  // a ball's two texels: its middle, and its radius
  bool ball = i >= T_BALLS, clock = i < T_LAYOUT;
  int which = ball ? (i - T_BALLS) / 2 : 0;
  // the layout and the weights are kept while the canvas and the settings are
  if (kept && !ball && !clock) return state(iChannel0, i);
  // the layout's doubles the places and the clock read: kept, or made again as JavaScript's doubles make them where
  // the canvas or the settings are new
  uvec2 made[${LAYOUT_DOUBLES.length}];
  if (kept) {
    for (int k = 0; k < ${LAYOUT_DOUBLES.length}; k++) made[k] = readDouble(T_LAYOUT + 2 * k);
  } else {
${pad(run.registers, "    ")}
${pad(inputs, "    ")}
    int to = steps(!ball && !clock && i >= T_WEIGHTS ? ${range("weights").to} : ${range("layout").to});
${pad(run.loop(`${range("layout").from}`, "to"), "    ")}
    if (!ball && !clock) {
${pad(layoutOut, "      ")}
    }
${LAYOUT_DOUBLES.map((name, k) => `    made[${k}] = R[${at(name)}];`).join("\n")}
  }
  // the player's tick, every frame, on Shadertoy's time read as the nearest whole 240th where it is one
  float x = iTime * ${glslFloat(BLOB_GRID_HZ)}, grid = floor(x + 0.5);
${pad(tick.registers, "  ")}
${pad(clockInputs, "  ")}
${pad(tick.loop("0", `steps(${ticks.code.length})`), "  ")}
  if (i == T_FLAGS) return vec2(dToFloat(CR[${atClock("draw")}]), dToFloat(CR[${atClock("paceSetOut")}]));
  if (clock) {
    int k = (i - T_CLOCK) / 2;
    uvec2 d = CR[${CLOCK_DOUBLES.map(([, out], j) => (j < CLOCK_DOUBLES.length - 1 ? `k == ${j} ? ${atClock(out)} : ` : `${atClock(out)}`)).join("")}];
    return pieces(d, (i - T_CLOCK) % 2);
  }
  // a ball's place, made only in a frame that draws; the map's scale is the same across and down
  if (kept && dZero(CR[${atClock("draw")}])) return state(iChannel0, i);
  uvec2 map[7] = uvec2[](made[0], made[0], made[1], made[2], made[3], made[4], made[5]);
  vec3 p = placeFrame(fdouble(CR[${atClock("at")}], Q), which, map);
  return (i - T_BALLS) % 2 == 0 ? p.xy : vec2(p.z, 0.0);
}`;

  const bufferA = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The frost's noise, feTurbulence as Chromium's Skia computes it, baked once a size into red and green as its four
// bytes; and in the first row's blue and alpha, the player's numbers: Skia's tables for the noise's seed ${look.seed}, the
// blobs and balls of the shape in fixed point, 52 bits of fraction, and JavaScript's double arithmetic for the layout
// and the clock.
const float SCENE = ${glslFloat(sceneMark(scene, look.seed))};   // this text's scene, beside the mark
const uint LATTICE[64] = uint[](
${rows(words(lattice), 8)}
);
const uint GRADIENTS[1024] = uint[](
${rows(words(gradients), 8)}
);
// each blob: its middle, its radius midway, its wander's reach across and down
const uvec2 BLOBS[${blobData.length}] = uvec2[](
${rows(
  blobData.map(x => fixedLit(x)),
  2
)}
);
// each blob's wander laps across and down, its depth's laps, its spin
const ivec4 BLOB_LAPS[${blobs.length}] = ivec4[](${blobs.map(b => `ivec4(${b.wander[0].laps}, ${b.wander[1].laps}, ${b.depth}, ${b.spin})`).join(", ")});
// each ball: its place at rest and its radius in its blob's radii, its swing, the cosine and sine of its phase's turn
const uvec2 BALLS[${ballData.length}] = uvec2[](
${rows(
  ballData.map(x => fixedLit(x)),
  2
)}
);
// each ball's laps a loop and whether it rides the ring
const ivec2 BALL_LAPS[${BALLS}] = ivec2[](${balls.map(b => `ivec2(${b.laps}, ${b.ring ? 1 : 0})`).join(", ")});
const uvec2 MELT = ${dlit(look.melt)};   // the melt's deviation, in the design's units
const uvec2 PAD = ${dlit(look.pad)};    // how far past the design the filter reads

${GLSL_DOUBLE}

${GLSL_FIXED}

${glslFixedPlace()}

${run.globals}
${tick.globals.replace("// The program's constants and its instructions", "// The clock's program: its constants and its instructions")}

uvec2 readDouble(int i) {
  vec2 a = state(iChannel0, i), b = state(iChannel0, i + 1);
  return uvec2((uint(a.x) << 16) | uint(a.y), (uint(b.x) << 16) | uint(b.y));
}
// a double's half in a texel: two 16-bit pieces
vec2 pieces(uvec2 d, int part) {
  uint w = part == 0 ? d.x : d.y;
  return vec2(w >> 16, w & 0xffffu);
}
uvec2 hundredths(float x) { return dFromInt(int(floor(max(x, 0.0) * 100.0 + 0.5))); }
// Common's settings as one number, in two 16-bit halves
vec2 signature() {
  uint h = 2166136261u;
  for (int k = 0; k < ${BALLS + 5}; k++) {
    uint w = k < ${BALLS} ? COLORS[k] : k == ${BALLS} ? BG : floatBitsToUint(k == ${BALLS + 1} ? SPEED : k == ${BALLS + 2} ? FPS : k == ${BALLS + 3} ? FROST : EASE);
    h = (h ^ w) * 16777619u;
  }
  return vec2(h >> 16, h & 0xffffu);
}

${stateTexel}

// feTurbulence fractalNoise, two octaves, as Ganesh computes it (the player's bake), at a pixel's middle
vec2 gradient(int index, int channel) {
  uint g = GRADIENTS[channel * 256 + (index & 255)];
  vec4 b = vec4(g & 255u, (g >> 8) & 255u, (g >> 16) & 255u, g >> 24) * BYTE;
  return (b.ga + b.rb * 0.00390625) * 2.0 - 1.0;
}
int selector(float x) {
  int at = int(x) & 255;
  uint l = (LATTICE[at >> 2] >> (8 * (at & 3))) & 255u;
  return l == 255u ? 256 : int(l);
}
vec4 turbulence(vec2 fragCoord) {
  // the design's map as the player's floats hold it: scaled to cover the canvas, centered. Its side times
  // iResolution.z, which is 1, so no compiler divides by a constant's reciprocal instead (as SwiftShader's does)
  vec2 R2 = iResolution.xy;
  float scale = max(R2.x, R2.y) / (${glslFloat(BLOB_DESIGN.width)} * iResolution.z);
  vec2 offset = R2.x >= R2.y ? vec2(0.0, (R2.y - R2.x) * 0.5) : vec2((R2.x - R2.y) * 0.5, 0.0);
  vec2 v = ((fragCoord - offset) / scale + 0.5) * ${glslFloat(look.frequency)};
  vec4 sum = vec4(0.0);
  float ratio = 1.0;
  for (int octave = 0; octave < 2; octave++) {
    vec2 f0 = floor(v);
    vec2 f = v - f0;
    vec2 s = f * f * (3.0 - 2.0 * f);
    int i = selector(f0.x);
    int j = selector(f0.x + 1.0);
    int y = int(f0.y);
    int b00 = i + y, b10 = j + y, b01 = i + y + 1, b11 = j + y + 1;
    vec4 n;
    for (int c = 0; c < 4; c++) {
      float u = dot(gradient(b00, c), f);
      float w = dot(gradient(b10, c), f - vec2(1.0, 0.0));
      float a = mix(u, w, s.x);
      w = dot(gradient(b11, c), f - vec2(1.0));
      u = dot(gradient(b01, c), f - vec2(0.0, 1.0));
      float b = mix(u, w, s.x);
      n[c] = mix(a, b, s.y);
    }
    sum += n * ratio;
    v *= 2.0;
    ratio *= 0.5;
  }
  vec4 c = clamp(sum * 0.5 + 0.5, 0.0, 1.0);
  return vec4(c.rgb * c.a, c.a);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  ivec2 p = ivec2(fragCoord);
  bool keeps = p.y == 0 && p.x < STATE;
  // the noise is baked where the state begins afresh or the canvas has a new size, and kept from the frame before
  // elsewhere; a texel of the noise alone keeps what its buffer held two frames before, the same noise, once both of
  // the buffer's two copies hold it: nothing to write
  bool bake = iFrame == 0 || state(iChannel0, T_MARK) != vec2(MAGIC, SCENE) || state(iChannel0, T_STAMP) != iResolution.xy;
  if (!keeps && !bake && state(iChannel0, T_SEEN) == iResolution.xy) discard;
  vec2 noise = texelFetch(iChannel0, p, 0).rg;
  if (bake) {
    // as an 8-bit texture keeps it: each channel to the nearest of 255 levels, ties to even
    vec4 k = roundEven(turbulence(fragCoord) * 255.0);
    noise = vec2(k.r + 256.0 * k.g, k.b + 256.0 * k.a);
  }
  // the player's numbers in the first row's texels, run only there: a loop the other texels never enter costs them
  // nothing on most GPUs
  vec2 numbers = vec2(0.0);
  for (int once = 0; once < (keeps ? 1 : 0); once++) numbers = stateTexel(p.x);
  fragColor = vec4(noise, numbers);
}
`;

  const bufferB = `// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The balls, small: each texel of the melt as much as each ball covers it, in the scene's order, in Common's colors,
// blended over what is under it (one, one minus the ball's alpha) and kept as half floats, as the player's RGBA16F
// texture blends them.
// A byte's float, as the player's Float32Array holds the byte over 255.
const float BYTES[256] = float[](
${rows(
  Array.from({ length: 256 }, (_, b) => glslFloat(b / 255)),
  8
)}
);
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // nothing reads this buffer past the melt, nor in a frame the pace does not draw
  if (!inMelt(iChannel0, fragCoord) || !drawing(iChannel0)) discard;
  vec4 color = vec4(0.0);
  for (int i = 0; i < ${BALLS}; i++) {
    vec2 xy = state(iChannel0, T_BALLS + 2 * i);
    float r = state(iChannel0, T_BALLS + 2 * i + 1).x;
    // the quad the player draws the ball on reaches a texel past its radius
    if (any(greaterThan(abs(fragCoord - xy), vec2(r + 1.0)))) continue;
    float cover = clamp(r - distance(fragCoord, xy) + 0.5, 0.0, 1.0);
    uint c = COLORS[i];
    vec4 tint = vec4(vec3(BYTES[c >> 16], BYTES[(c >> 8) & 255u], BYTES[c & 255u]) * cover, cover);
    color = half4(tint + color * (1.0 - tint.a));
  }
  fragColor = color;
}
`;
  const bufferC = `// ==== Buffer C ==== iChannel0: Buffer B (filter: nearest, wrap: clamp); iChannel1: Buffer A (filter: nearest, wrap: clamp)
// The melt blurred across, kept as half floats.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  if (!inMelt(iChannel1, fragCoord) || !drawing(iChannel1)) discard;
  fragColor = half4(blur(iChannel0, iChannel1, ivec2(fragCoord), ivec2(state(iChannel1, T_MELT)), ivec2(1, 0)));
}
`;
  const bufferD = `// ==== Buffer D ==== iChannel0: Buffer C (filter: nearest, wrap: clamp); iChannel1: Buffer A (filter: nearest, wrap: clamp); iChannel2: Buffer D (filter: nearest, wrap: clamp)
// The melt blurred down, kept as half floats; between the frames the pace draws, the frame drawn last.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  if (!inMelt(iChannel1, fragCoord)) discard;
  if (!drawing(iChannel1)) {
    fragColor = texelFetch(iChannel2, ivec2(fragCoord), 0);
    return;
  }
  fragColor = half4(blur(iChannel0, iChannel1, ivec2(fragCoord), ivec2(state(iChannel1, T_MELT)), ivec2(0, 1)));
}
`;
  const image = `// ==== Image ==== iChannel0: Buffer D (filter: nearest, wrap: clamp); iChannel1: Buffer A (filter: nearest, wrap: clamp)
// Every pixel, the player's last pass: the frost's scatter (feDisplacementMap at the nearest pixel), the lift of the
// edge and the speckle, each as Chromium computes them on 8-bit values; then the ground.
vec4 bytes(vec4 v) { return floor(clamp(v, 0.0, 1.0) * 255.0 + 0.5) / 255.0; }
// the melt between its texels, as a GPU filters a half-float texture: across, then down. Its size comes through
// whole numbers, so no compiler cancels the division the coordinate was made with (as SwiftShader's does), which the
// GPU's filter never sees
vec4 meltAt(vec2 uv, ivec2 size) {
  vec2 t = uv * vec2(size) - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  ivec2 a = ivec2(i), top = size - 1;
  vec4 c00 = texelFetch(iChannel0, clamp(a, ivec2(0), top), 0);
  vec4 c10 = texelFetch(iChannel0, clamp(a + ivec2(1, 0), ivec2(0), top), 0);
  vec4 c01 = texelFetch(iChannel0, clamp(a + ivec2(0, 1), ivec2(0), top), 0);
  vec4 c11 = texelFetch(iChannel0, clamp(a + ivec2(1, 1), ivec2(0), top), 0);
  vec4 x0 = c00 + f.x * (c10 - c00);
  vec4 x1 = c01 + f.x * (c11 - c01);
  return x0 + f.y * (x1 - x0);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // without 32-bit float buffers the state cannot hold its numbers, nor a canvas narrower than its first row:
  // magenta says so
  if (iResolution.x < float(STATE) || state(iChannel1, T_MARK).x != MAGIC) {
    fragColor = vec4(1.0, 0.0, 1.0, 1.0);
    return;
  }
  vec2 size = state(iChannel1, T_MELT);
  vec4 region = vec4(state(iChannel1, T_REGION), state(iChannel1, T_REGION + 1));
  vec2 origin = state(iChannel1, T_ORIGIN);
  vec2 texelScatter = state(iChannel1, T_TEXEL);
  vec2 scatterK1 = state(iChannel1, T_SCATTER);
  vec2 scatter = vec2(texelScatter.y, scatterK1.x);
  vec2 k = vec2(scatterK1.y, state(iChannel1, T_K).x);
  vec4 ground = vec4(state(iChannel1, T_GROUND), state(iChannel1, T_GROUND + 1));
  bool frosted = state(iChannel1, T_TAPS).y != 0.0;
  ivec2 p = ivec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 at = vec2(p);
  // the noise's four bytes, as an 8-bit texture gives them
  uvec2 w = uvec2(texelFetch(iChannel1, p, 0).rg);
  vec4 n = frosted ? vec4(w.x & 255u, w.x >> 8, w.y & 255u, w.y >> 8) * BYTE : vec4(0.0);
  vec3 un = clamp(n.rgb / max(n.a, 0.0001), 0.0, 1.0);
  vec2 q = frosted ? floor(at + 0.5 + scatter * (un.rg - 0.5)) : at;
  bool inside = all(greaterThanEqual(q, region.xy)) && all(lessThan(q, region.zw));
  vec4 d = inside ? bytes(meltAt((q + 0.5 - origin) / texelScatter.x / size, ivec2(size))) : vec4(0.0);
  float a = clamp(d.a * ${glslFloat(look.slope)} + ${glslFloat(look.lift)}, 0.0, 1.0);
  vec4 g = vec4(clamp(d.rgb / max(d.a, 0.0001), 0.0, 1.0) * a, a);
  vec4 s = g;
  if (frosted) {
    float grain = clamp(un.b * ${glslFloat(look.contrast)} + ${glslFloat(look.gray)}, 0.0, 1.0);
    s = clamp(k.x * g * vec4(vec3(grain), 1.0) + k.y * g, 0.0, 1.0);
    s.rgb = min(s.rgb, s.a);
  }
  bool shown = all(greaterThanEqual(at, region.xy)) && all(lessThan(at, region.zw));
  s = shown ? bytes(s) : vec4(0.0);
  fragColor = vec4((s + ground * (1.0 - s.a)).rgb, 1.0);
}
`;
  return `${head}
//
// Buffers A to D each in Shadertoy's tab of the name, the Image in Image, each tab's channels as its header says.
// It needs Shadertoy's 32-bit float buffers (its fallback, half floats, cannot hold its numbers) and a canvas at least
// ${STATE} pixels wide: without either it shows magenta. An edit to Common's settings shows at once; rewind plays it
// again from its first frame.
// Its time is Shadertoy's iTime. Where iTime is the float of a whole number of 240ths of a second, a frame's time on a
// 30, 60, 120 or 240 Hz screen whose clock counts from the first frame, it reads that many 240ths exactly, the time the
// site's player has for the frame; any other time it reads as the float it is. So timed, its frames are the player's
// own, pixel for pixel, where the GPU rounds the player's 8-bit noise and half-float melt as Shadertoy's float buffers
// do here (SwiftShader does). This text cannot know how a GPU rounds them: where it rounds them its own way (an NVIDIA
// RTX 2080 Ti does), the player draws 4 to 47% of the pixels otherwise, most by a level and a few by up to 18 where a
// byte of the frost moves the melt's edge a pixel.

${common}
${bufferA}
${bufferB}
${bufferC}
${bufferD}
${image}`;
}
