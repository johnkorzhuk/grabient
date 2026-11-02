/* The blob for Shadertoy, in its tabs: the player's passes (ui/blob-player.ts) as Shadertoy's buffers run them, every
   buffer a float texture the canvas's size and every frame each tab's whole buffer, so a pass draws in a corner and
   keeps in its own texels what the player keeps in a script.
     Common    the settings a reader edits, the colors, and the texels Buffer A keeps its state in
     Buffer A  the frost's noise, baked once a size as 8-bit bytes two to a channel (red and green); and in its first
               row (blue and alpha) the player's numbers: its layout, the blur's weights and the balls' colors as
               JavaScript's doubles make them, by a program of double arithmetic (blob-program.ts, glsl-double.ts) run
               as the canvas takes a size, since the melt's size and the blur's taps are whole numbers the player's
               doubles round to; and each frame its clock and each ball's place in the melt in fixed point
               (blob-fixed.ts), which lands on the player's floats. Only the first row's texels run either, in a
               loop the others never enter
     Buffer B  the balls into the melt, blended and kept as half floats as the player's RGBA16F texture keeps them
     Buffer C  the blur across, Buffer D the blur down, D holding the frame drawn last between frames the pace draws
     Image     every pixel: the player's last pass, the melt read bilinearly by hand as a GPU reads half floats
   Buffers write only what is read: past the melt, and the noise once both of a buffer's copies hold it, a texel is
   discarded. Its time is Shadertoy's iTimeDelta, a float, where the player's is a double: a frame of motion lands a
   hair from the player's (the first frame and a still are the player's own). The options' "frames" is the lab's
   check of all but the clock: every number by the double program, the frames' times exact. */
import { BLOB_DESIGN, BLOB_LOOP, blobFilter, blobNoiseTables, blobScene } from "./blob.ts";
import { fixedLit, GLSL_FIXED, glslFixedFrame } from "./blob-fixed.ts";
import { BLOB_WEIGHTS, blobProgram } from "./blob-program.ts";
import { hexBytes } from "./color.ts";
import { compile, doubleRun } from "./double-program.ts";
import type { Effect } from "./effect.ts";
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
const hex = (n: number, digits = 8) => `0x${(n >>> 0).toString(16).padStart(digits, "0")}u`;
const rows = (items: string[], per: number, indent = "  ") => {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push(`${indent}${items.slice(i, i + per).join(", ")}`);
  return out.join(",\n");
};

/* Buffer A's first row, blue and alpha: two floats a texel. A double is four 16-bit pieces in two texels. */
const T = {
  stamp: 0,
  flags: 1,
  t: 2,
  warm: 4,
  last: 6,
  drawn: 8,
  layout: 10,
  melt: 26,
  taps: 27,
  region: 28,
  origin: 30,
  texel: 31,
  scatter: 32,
  k: 33,
  ground: 34,
  weights: 36,
  balls: 46,
  seen: 46 + 3 * 24
};
const BALLS = 24;
const STATE = T.seen + 1;
/* the layout's doubles the frame reads back, in their texels' order */
const LAYOUT_DOUBLES = ["sx", "sy", "tx", "ty", "meltX", "meltY", "texel", "invTexel"] as const;

export interface BlobShadertoyOptions {
  /** "fixed", as shipped: the clock and the places each frame in fixed point (blob-fixed.ts) on Shadertoy's frame
      time; "frames", the lab's check of all but the clock: every number by the double program, the frames' times
      exact at 60 a second as the lab's clock gives the player its time */
  clock?: "fixed" | "frames";
}

/** The blob's Shadertoy tabs as one text, a section a tab under a header naming its channels. */
export function blobShadertoy(
  P: Palette,
  effect: Effect,
  angle: number,
  credit: string[],
  options: BlobShadertoyOptions = {}
): string {
  const view = { ...effect.look, angle };
  const scene = blobScene(P, BLOB_DESIGN, view);
  const look = blobFilter(view, BLOB_DESIGN, scene);
  const blobs = scene.blobs;
  const balls = blobs.flatMap(blob => blob.balls);
  if (balls.length !== BALLS) throw new Error(`the blob has ${balls.length} balls`);
  const fixed = options.clock !== "frames";
  const c = compile(blobProgram(fixed ? { frame: false } : { clock: "frames" }));
  const run = doubleRun(c, dlit);
  const at = (name: string) => {
    const r = c.inputs.get(name) ?? c.pinned.get(name);
    if (r === undefined) throw new Error(`no register ${name}`);
    return r;
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
    return { word: hex((r << 16) | (g << 8) | bl, 6), css: scene.color(b.at) };
  });
  const bg = effect.look.bg;
  const bgWord = bg
    ? (parseInt(bg.slice(1, 7), 16) * 256 + (bg.length === 9 ? parseInt(bg.slice(7), 16) : 255)) >>>
      0
    : 0;
  const sections = c.sections;
  const range = (name: string) => {
    const s = sections.get(name);
    if (!s) throw new Error(`no section ${name}`);
    return s;
  };
  const head = credit.map(line => `// ${line}`).join("\n");

  const common = `// ==== Common ====
// The blob's settings, as its address writes them: edit them here.
const float SPEED = ${glslFloat(effect.speed)};   // the loop's pace, two decimals: it lasts ${BLOB_LOOP} s over this; 0 holds the first frame
const float FPS = ${glslFloat(effect.fps)};    // frames a second at most
const float FROST = ${glslFloat(effect.look.frost)};   // the frost, two decimals: 1 as designed, 0 none, 2 twice
const uint BG = ${hex(bgWord)};   // the ground as 0xRRGGBBAA, its alpha last; 0u for none, which shows black here
const float EASE = 1.6;    // seconds from rest to its pace, two decimals
// The colors the balls are painted in, 0xRRGGBB, one a ball, far blob to near: the palette across each blob at ${angle}
// degrees. The blobs' shape${effect.look.shape === null ? ", the palette's own," : ` (${effect.look.shape})`} is drawn into Buffer A's BLOBS and BALLS.
const uint COLORS[${BALLS}] = uint[](
${rows(
  colors.map(x => x.word),
  8
)}
);

// Buffer A's first row keeps the player's numbers in its blue and alpha, two to a texel; a double in two texels.
const int T_STAMP = ${T.stamp};    // the canvas the layout was made for
const int T_FLAGS = ${T.flags};    // whether this frame draws, whether the pace has begun
const int T_T = ${T.t};        // the loop's seconds at speed 1
const int T_WARM = ${T.warm};     // seconds since the motion began, up to EASE
const int T_LAST = ${T.last};     // the pace's last frame, ms
const int T_DRAWN = ${T.drawn};    // the share of the loop drawn last
const int T_LAYOUT = ${T.layout};  // the design's map (sx, sy, tx, ty) and the melt's corner and texel, as doubles
const int T_MELT = ${T.melt};    // the melt's texels across and down
const int T_TAPS = ${T.taps};    // the blur's taps, and whether the frost is drawn
const int T_REGION = ${T.region};  // the filter region in whole pixels, x0, y0, x1, y1
const int T_ORIGIN = ${T.origin};  // the melt's corner in pixels
const int T_TEXEL = ${T.texel};   // pixels a texel spans, and the scatter across
const int T_SCATTER = ${T.scatter}; // the scatter down, and the speckle's k1
const int T_K = ${T.k};       // the speckle's k2
const int T_GROUND = ${T.ground};  // the ground, premultiplied
const int T_WEIGHTS = ${T.weights}; // the blur's ${BLOB_WEIGHTS} weights
const int T_BALLS = ${T.balls};   // each ball: its middle in the melt's texels, its radius and its color
const int T_SEEN = ${T.seen};   // the canvas a frame before T_STAMP's
const int STATE = ${STATE};
vec2 state(sampler2D a, int i) { return texelFetch(a, ivec2(i, 0), 0).ba; }
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
  const literal = fixed ? (x: number) => fixedLit(x) : dlit;
  const kind = fixed ? "fixed point, 52 bits of fraction" : "doubles (each its two 32-bit words)";
  const input = (name: string, value: string) => `  R[${at(name)}] = ${value};`;
  const readDouble = (texel: number | string) => `readDouble(${texel})`;
  /* the program's inputs every texel that runs it writes: the canvas, the settings, the look, its ball's color */
  const commonInputs = [
    input("W", "dFromFloat(iResolution.x)"),
    input("H", "dFromFloat(iResolution.y)"),
    input("speed100", "hundredths(SPEED)"),
    input("fps", "dFromInt(int(FPS))"),
    input("frost100", "hundredths(FROST)"),
    input("ease100", "hundredths(EASE)"),
    input("bgR", "dFromInt(int(BG >> 24))"),
    input("bgG", "dFromInt(int((BG >> 16) & 255u))"),
    input("bgB", "dFromInt(int((BG >> 8) & 255u))"),
    input("bgA", "dFromInt(int(BG & 255u))"),
    input("bgOn", "(BG & 255u) != 0u ? D_ONE : D_ZERO"),
    input("melt", "MELT"),
    input("pad", "PAD"),
    input("red", "dFromInt(int(COLORS[which] >> 16))"),
    input("green", "dFromInt(int((COLORS[which] >> 8) & 255u))"),
    input("blue", "dFromInt(int(COLORS[which] & 255u))")
  ].join("\n");
  /* the layout's and the weights' texels, from the registers */
  const layoutOut = `  if (i < T_MELT) {
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
  .map(([texel, x, y]) => `  if (i == ${texel}) { a = ${at(x as string)}; b = ${y ? at(y) : -1}; }`)
  .join("\n")}
  int w = i - T_WEIGHTS;
${Array.from({ length: BLOB_WEIGHTS / 2 }, (_, k) => `  if (w == ${k}) { a = ${at(`weight${2 * k}`)}; b = ${at(`weight${2 * k + 1}`)}; }`).join("\n")}
  return vec2(dToFloat(R[a]), b < 0 ? 0.0 : dToFloat(R[b]));`;
  const head0 = `bool fresh = iFrame == 0;
  bool kept = !fresh && state(iChannel0, T_STAMP) == iResolution.xy;
  if (i == T_STAMP) return iResolution.xy;
  if (i == T_SEEN) return state(iChannel0, T_STAMP);
  bool ball = i >= T_BALLS, clock = i < T_LAYOUT;
  // the layout and the weights are kept while the canvas keeps its size
  if (kept && !ball && !clock) return state(iChannel0, i);
  int which = clamp((i - T_BALLS) / 3, 0, ${BALLS - 1});`;
  /* as shipped: the double program only as the canvas takes a size; the clock and the places in fixed point */
  const fixedState = () => `// the player's numbers for texel i of the first row
vec2 stateTexel(int i) {
  ${head0}
  // a ball keeps its color while the canvas keeps its size
  if (kept && ball && (i - T_BALLS) % 3 == 2) return state(iChannel0, i);
  uvec2 made[${LAYOUT_DOUBLES.length}];
  vec3 tint = vec3(0.0);
  if (kept) {
    for (int k = 0; k < ${LAYOUT_DOUBLES.length}; k++) made[k] = readDouble(T_LAYOUT + 2 * k);
    tint.r = state(iChannel0, i).y;
  } else if (!clock) {
    // the layout as JavaScript's doubles make it, where the canvas is new or has a new size
    ${run.registers}
${commonInputs}
    int to = !ball && i >= T_WEIGHTS ? ${range("weights").to} : ${range("layout").to};
    ${run.loop(`${range("layout").from}`, "to")}
    if (!ball) {
    ${layoutOut.split("\n").join("\n  ")}
    }
${LAYOUT_DOUBLES.map((name, k) => `    made[${k}] = R[${at(name)}];`).join("\n")}
    tint = vec3(dToFloat(R[${at("tintR")}]), dToFloat(R[${at("tintG")}]), dToFloat(R[${at("tintB")}]));
  }
  // the clock, every frame, from the frame before's
  Clock c = clockFrame(
    fresh ? uvec2(0u) : readDouble(T_T),
    fresh ? uvec2(0u) : readDouble(T_WARM),
    fresh ? uvec2(0u) : readDouble(T_LAST),
    fresh ? Q_MINUS_ONE : readDouble(T_DRAWN),
    !fresh && state(iChannel0, T_FLAGS).y != 0.0,
    fresh,
    !kept
  );
  if (i == T_FLAGS) return vec2(c.draw ? 1.0 : 0.0, c.paceSet ? 1.0 : 0.0);
  if (clock) {
    int k = (i - T_T) / 2;
    return pieces(k == 0 ? c.t : k == 1 ? c.warm : k == 2 ? c.last : c.drawn, (i - T_T) % 2);
  }
  // a ball's place in the melt's texels
  vec3 p = placeFrame(c.at, which, made);
  int part = (i - T_BALLS) % 3;
  return part == 0 ? p.xy : part == 1 ? vec2(p.z, tint.r) : tint.gb;
}`;
  /* the lab's check: every number by the double program, the frames' times exact */
  const programState = () => `// the player's numbers for texel i of the first row
vec2 stateTexel(int i) {
  ${head0}
  ${run.registers}
${commonInputs}
${[
  input("dtIn", "fresh ? D_ZERO : dFromFloat(iTimeDelta)"),
  input("timeIn", "dFromFloat(iTime)"),
  input("frameIn", "dFromInt(iFrame)"),
  input("t", `fresh ? D_ZERO : ${readDouble("T_T")}`),
  input("warm", `fresh ? D_ZERO : ${readDouble("T_WARM")}`),
  input("last", `fresh ? D_ZERO : ${readDouble("T_LAST")}`),
  input("drawn", `fresh ? dNeg(D_ONE) : ${readDouble("T_DRAWN")}`),
  input("paceSet", "!fresh && state(iChannel0, T_FLAGS).y != 0.0 ? D_ONE : D_ZERO"),
  input("first", "fresh ? D_ONE : D_ZERO"),
  input("changed", "kept ? D_ZERO : D_ONE"),
  "  int blob = which / 8;",
  ...["blobX", "blobY", "blobR", "reachX", "reachY"].map((name, k) =>
    input(name, `BLOBS[blob * 5 + ${k}]`)
  ),
  ...["lapsX", "lapsY", "depth", "spin"].map((name, k) =>
    input(name, `dFromInt(BLOB_LAPS[blob][${k}])`)
  ),
  ...["ballX", "ballY", "ballR", "swing", "phaseCos", "phaseSin"].map((name, k) =>
    input(name, `BALLS[which * 6 + ${k}]`)
  ),
  input("laps", "dFromInt(BALL_LAPS[which].x)"),
  input("ring", "dFromInt(BALL_LAPS[which].y)")
].join("\n")}
  // where the canvas has kept its size, the layout made for it
  if (kept) {
${LAYOUT_DOUBLES.map((name, k) => `    R[${at(name)}] = ${readDouble(`T_LAYOUT + ${2 * k}`)};`).join("\n")}
  }
  int from = clock ? ${range("clock").from} : ball && kept ? ${range("clock").from} : ${range("layout").from};
  int to = clock ? ${range("clock").to} : ball ? ${range("place").to} : i >= T_WEIGHTS ? ${range("weights").to} : ${range("layout").to};
  ${run.loop("from", "to")}
  if (i == T_FLAGS) return vec2(dToFloat(R[${at("draw")}]), dToFloat(R[${at("paceSetOut")}]));
  if (clock) {
    int k = (i - T_T) / 2;
    uvec2 d = R[k == 0 ? ${at("tOut")} : k == 1 ? ${at("warmOut")} : k == 2 ? ${at("lastOut")} : ${at("drawnOut")}];
    return pieces(d, (i - T_T) % 2);
  }
  if (ball) {
    int part = (i - T_BALLS) % 3;
    if (kept && part == 2) return state(iChannel0, i);
    float tintR = kept ? state(iChannel0, i).y : dToFloat(R[${at("tintR")}]);
    vec2 xy = vec2(dToFloat(R[${at("x")}]), dToFloat(R[${at("y")}]));
    return part == 0 ? xy : part == 1 ? vec2(dToFloat(R[${at("r")}]), tintR) : vec2(dToFloat(R[${at("tintG")}]), dToFloat(R[${at("tintB")}]));
  }
${layoutOut}
}`;

  const bufferA = `// ==== Buffer A ==== iChannel0: Buffer A (filter: nearest, wrap: clamp)
// The frost's noise, feTurbulence as Chromium's Skia computes it, baked once a size into red and green as its four
// bytes; and in the first row's blue and alpha, the player's numbers: Skia's tables for the noise's seed ${look.seed}, the
// blobs and balls of the shape in ${kind}, JavaScript's double arithmetic for the layout and its program.
const uint LATTICE[64] = uint[](
${rows(words(lattice), 8)}
);
const uint GRADIENTS[1024] = uint[](
${rows(words(gradients), 8)}
);
// each blob: its middle, its radius midway, its wander's reach across and down
const uvec2 BLOBS[${blobData.length}] = uvec2[](
${rows(blobData.map(literal), 2)}
);
// each blob's wander laps across and down, its depth's laps, its spin
const ivec4 BLOB_LAPS[${blobs.length}] = ivec4[](${blobs.map(b => `ivec4(${b.wander[0].laps}, ${b.wander[1].laps}, ${b.depth}, ${b.spin})`).join(", ")});
// each ball: its place at rest and its radius in its blob's radii, its swing, the cosine and sine of its phase's turn
const uvec2 BALLS[${ballData.length}] = uvec2[](
${rows(ballData.map(literal), 2)}
);
// each ball's laps a loop and whether it rides the ring
const ivec2 BALL_LAPS[${BALLS}] = ivec2[](${balls.map(b => `ivec2(${b.laps}, ${b.ring ? 1 : 0})`).join(", ")});
const uvec2 MELT = ${dlit(look.melt)};   // the melt's deviation, in the design's units
const uvec2 PAD = ${dlit(look.pad)};    // how far past the design the filter reads

${GLSL_DOUBLE}
${fixed ? `\n${GLSL_FIXED}\n\n${glslFixedFrame()}\n` : ""}
${run.globals}

uvec2 readDouble(int i) {
  vec2 a = state(iChannel0, i), b = state(iChannel0, i + 1);
  return uvec2((uint(a.x) << 16) | uint(a.y), (uint(b.x) << 16) | uint(b.y));
}
// a double's half in a texel: two 16-bit pieces
vec2 pieces(uvec2 d, int part) {
  uint w = part == 0 ? d.x : d.y;
  return vec2(w >> 16, w & 0xffffu);
}
uvec2 hundredths(float x) { return dFromInt(int(floor(x * 100.0 + 0.5))); }

${fixed ? fixedState() : programState()}

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
  bool bake = iFrame == 0 || state(iChannel0, T_STAMP) != iResolution.xy;
  // a texel of the noise alone keeps what its buffer held two frames before, the same noise, once both of the
  // buffer's two copies hold it: nothing to write
  if (!keeps && !bake && iFrame >= 2 && state(iChannel0, T_SEEN) == iResolution.xy) discard;
  // the noise: baked where the canvas is new or has a new size, kept from the frame before elsewhere
  vec2 noise = texelFetch(iChannel0, p, 0).rg;
  if (FROST > 0.0 && bake) {
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
// The balls, small: each texel of the melt as much as each ball covers it, in the scene's order, blended over what is
// under it (one, one minus the ball's alpha) and kept as half floats, as the player's RGBA16F texture blends them.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // nothing reads this buffer past the melt, nor in a frame the pace does not draw
  if (!inMelt(iChannel0, fragCoord) || !drawing(iChannel0)) discard;
  vec4 color = vec4(0.0);
  for (int i = 0; i < ${BALLS}; i++) {
    vec2 xy = state(iChannel0, T_BALLS + 3 * i);
    vec2 rr = state(iChannel0, T_BALLS + 3 * i + 1);
    vec2 gb = state(iChannel0, T_BALLS + 3 * i + 2);
    // the quad the player draws the ball on reaches a texel past its radius
    if (any(greaterThan(abs(fragCoord - xy), vec2(rr.x + 1.0)))) continue;
    float cover = clamp(rr.x - distance(fragCoord, xy) + 0.5, 0.0, 1.0);
    vec4 tint = vec4(vec3(rr.y, gb) * cover, cover);
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
// Its frames' time is Shadertoy's iTimeDelta, a float, where the site's player keeps a double: the first frame is
// the site's own, and frames of motion land within a hair of it.

${common}
${bufferA}
${bufferB}
${bufferC}
${bufferD}
${image}`;
}
