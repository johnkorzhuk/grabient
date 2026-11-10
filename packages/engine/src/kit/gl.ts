/* A field effect's live drawing, WebGL 2, in one pass, the same arithmetic as the CPU drawing (render.ts, shade.ts) at
   every pixel: the effect's kernel (its compiled GLSL, `kfield`) where the pixel's middle lies, turned out of the
   view's angle, and at the middles of the pixels right of it and below it, whose differences are how much the field
   changes a pixel; where the shadow and the rim come from; then shade.ts branch for branch: the ground, each sheet's
   shadow, rim and itself, the shadows past them, the lines. The recipe's numbers are the effect's own (a tinted
   shadow's depth and a lit rim's lift among them), written into the shader as constants. The scene's numbers
   (kitSceneUniforms, once a palette, a view or a box changes) and the frame's (kitFrameUniforms: the phases and the
   shadow's and the rim's moves) are uniforms, for the player (packages/ui kit-player.ts) and the pages
   (kit/webgl.ts). The WGSL (kit/wgsl.ts) is this pass line for line.

   The GPU reads the field five times a pixel (its middle, the two neighbours, the shadow's and the rim's points) where
   the CPU reads it once on a grid and twice more. By the kernel's cost model a pixel of the demo (kernel 112) is about
   820 operations, 1,170 at most: the five kernels 560, their turns and points 60, the shading 200 to 550. The edge
   loop stops at the first sheet nothing of which reaches the pixel, and a soft shadow's layers at the first that
   misses it: a cover falls as its level rises, which the sheets' step above 0 and a soft shadow's spread of 0 or more
   make so (kitRecipeConstants refuses any other recipe), so every byte is the same, and the demo's frame costs 17%
   less, its soft shadow's 26%. A shadow's color is the ink (uShade) or, tinted, the sheet below it darkened
   (shadowColor), a rim's white or its own sheet's lit (rimColor), each looked up from the stops as shade.ts looks it
   up, about 25 operations, and only where its layer reaches the pixel; a tinted run of whole shadows past the edge
   window is laid a sheet at a time, the topmost KIT_SHADOWS, where the ink's is multiplied out and laid at once.

   The pass rounds its own bytes as render.ts does (kitByte, KIT_BYTES_GLSL), never leaving it to the target's
   conversion, which breaks a half its own way: left to it, the RTX put 22% of the demo's pixels a level off the CPU's.
   A tie goes up by KIT_TIE, as every format's does: where a sheet's color lands on a stop's midpoint, float32 and the
   CPU's doubles broke the half opposite ways, 8,799 pixels of 230,400 a level off on the RTX at 640 by 360 in the zen
   garden, a field effect the site played from 8 to 10 Nov 2026 (palette kQ9hLj-wW4g, t 0, as its file stood at 03:16
   on 8 Nov 2026, its kernel's cost 158); with the tie, 13 (21 at t 23.7), and the demo and its variants
   (shader.test.ts RECIPES) 6 to 33 of 57,600 at 320 by 180, a stack whose every sheet lies on a stop's midpoint 5,
   each a level.

   Measured 8 Nov 2026 on the RTX 2080 Ti with no browser (a headless Chromium reaches only SwiftShader or llvmpipe):
   EGL surfaceless on Mesa's d3d12 driver, a GLES 3.1 context running the player's shaders with the player's
   uniforms, R draws then glFinish: the demo 0.48 ms a 3840 by 2160 frame, 0.15 at 1920 by 1080, with a soft shadow
   of three layers 0.50; the strings' pass by the same harness 0.44 (0.46 in Chrome, the skill's). The tints cost
   nothing the RTX shows, within its rounds' spread (200 draws a round, six rounds, twelve for the zen garden): the
   soft demo tinted 0.46 to 0.50 ms, in ink 0.47 to 0.50; the zen garden as the site played it, a kernel at the kit's
   budget of 160 under tinted shadows and rims (the same day, the demo 0.46 to 0.72 in those runs), 0.75 to 1.07, with
   its tints swapped for the ink and white 0.87 to 1.04, and 0.85 to 1.08 in three later runs of twelve rounds (the
   demo 0.45 to 0.71 in them); the sandstone, plain sheets with neither shadow nor rim and its steps' levels read from
   uLevels, 0.35 to 0.56 in three runs of twelve rounds the same day (the demo 0.45 to 0.63 and the zen garden 0.74 to
   1.09 in them). */
import { KIT_EDGE, KIT_STOPS, KIT_TIE, type KitScene, kitFrameAt } from "./scene.ts";
import { KIT_SHADOW_STEPS, KIT_SHADOWS, kitShadowSteps } from "./shade.ts";
import { type ColorMap, type FieldEffect, kitFrameSize } from "./types.ts";

export const KIT_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** A number as a float literal that GLSL and WGSL both read as written: with a point or an exponent. */
export function kitFloat(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`kit: ${n} is no number a shader can write`);
  const s = String(n);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

/** A shadow's layers as shade.ts draws them, from the recipe alone (kitShadowSteps at the recipe's own step, as an
    effect the view's steps leave alone draws them; one they space takes its rise from the scene: kitLevels): how
    many, the rise from one to the next, each layer's share of the alpha, and what one whole shadow keeps of what lies
    under it, (1 - share) multiplied out a layer at a time, in doubles as kitShade multiplies it. */
export function kitShadowLayers(def: FieldEffect) {
  const { steps, rise } = kitShadowSteps({ def });
  const share = def.sheets?.shadow ? def.sheets.shadow.alpha / steps : 0;
  let keep = 1;
  for (let s = 0; s < KIT_SHADOW_STEPS; s++) if (s < steps) keep *= 1 - share;
  return { steps, rise, share, keep };
}

/** The numbers the view's steps set, for an effect that takes them (FieldEffect.steps), in the order the pass's
    uLevels holds them (two vectors: the sheets' step and hop, the lines' step and hop, then a soft shadow's rise and
    its reach, the rise times its layers less one): uniforms the scene sets (kitSceneUniforms), where every other
    effect's are the recipe's constants (kitRecipeConstants), so its pass's text and its pixels stay as they were. */
export const KIT_LEVELS = [
  "SHEET_STEP",
  "SHEET_HOP",
  "LINE_STEP",
  "LINE_HOP",
  "SHADOW_RISE",
  "SHADOW_REACH"
] as const;
/** Whether the view's steps space an effect's levels: its pass then reads KIT_LEVELS from uLevels. */
export const kitStepped = (def: FieldEffect): boolean => !!def.steps;
/** The scene's KIT_LEVELS, in uLevels' order, eight numbers, as kitShade reads them (kitScene's sheetStep, sheetHop,
    lineStep and lineHop, kitShadowSteps's rise, and the reach as kitRecipeConstants works it out). */
export function kitLevels(m: KitScene): Float32Array {
  const { steps, rise } = kitShadowSteps(m);
  return Float32Array.of(
    m.sheetStep,
    m.sheetHop,
    m.lineStep,
    m.lineHop,
    rise,
    (Math.max(1, steps) - 1) * rise,
    0,
    0
  );
}
/* where in uLevels each of KIT_LEVELS lies, as each language writes it */
const LEVEL_AT: Readonly<Record<(typeof KIT_LEVELS)[number], string>> = {
  SHEET_STEP: "[0].x",
  SHEET_HOP: "[0].y",
  LINE_STEP: "[0].z",
  LINE_HOP: "[0].w",
  SHADOW_RISE: "[1].x",
  SHADOW_REACH: "[1].y"
};
/** Each of KIT_LEVELS a function of the pass reads, as a local of that function for an effect the view's steps space,
    read from the scene's uLevels (S.levels in WGSL), so the shading's lines are the same words whichever holds them;
    nothing for any other effect, whose are constants. */
export function kitLevelLocals(
  def: FieldEffect,
  names: readonly (typeof KIT_LEVELS)[number][],
  wgsl: boolean,
  pad = "  "
): string[] {
  if (!kitStepped(def)) return [];
  return names.map(name =>
    wgsl
      ? `${pad}let ${name} = S.levels${LEVEL_AT[name]};`
      : `${pad}float ${name} = uLevels${LEVEL_AT[name]};`
  );
}

/** Whether the shadows take the ink, the palette's darkest hue near black (kitScene's shade, the pass's uShade): where
    they take the sheet below each darkened (`tint: "below"`), each sheet's shadow has a color of its own, which the
    pass works out from the stops as shade.ts kitShadowColor does. */
export const kitShadowInk = (def: FieldEffect): boolean =>
  !!def.sheets?.shadow && def.sheets.shadow.tint !== "below";

/** The recipe's numbers a pass is written with, by the names both languages give them: floats (the tints' depth and
    lift among them, each where left out as shade.ts reads it), and integers (the top sheet's index where the sheets
    are counted, a soft shadow's layers and the partial shadows a pixel takes). A recipe whose sheets step down or
    stand still, or whose soft shadow's layers sink, is refused: the pass's early exits hold only while a cover falls
    as its level rises, which any steps keep (kitScene scales the step by a positive ratio). An effect the view's steps
    space has none of KIT_LEVELS among them: its scene sets them (kitLevels). */
export function kitRecipeConstants(
  def: FieldEffect
): [name: string, value: number, int: boolean][] {
  const all = kitRecipeNumbers(def);
  if (!kitStepped(def)) return all;
  const levels: readonly string[] = KIT_LEVELS;
  return all.filter(([name]) => !levels.includes(name));
}
function kitRecipeNumbers(def: FieldEffect): [name: string, value: number, int: boolean][] {
  const out: [string, number, boolean][] = [];
  const S = def.sheets;
  if (S) {
    if (!(S.step > 0)) throw new Error(`${def.kind}: its sheets' step is ${S.step}, not above 0`);
    const spread = S.shadow?.spread ?? 0;
    if (!(spread >= 0))
      throw new Error(`${def.kind}: its shadow's spread is ${spread}, not 0 or more`);
    out.push(["SHEET_BASE", S.base, false], ["SHEET_STEP", S.step, false]);
    if (S.count !== null) out.push(["SHEET_TOP", S.count - 1, true]);
    out.push(["SHEET_HOP", S.colors.hop, false], ["SHEET_OFFSET", S.colors.offset, false]);
    if (S.shadow) {
      const { steps, rise, share, keep } = kitShadowLayers(def);
      out.push(["SHADOW_SHARE", share, false], ["SHADOW_KEEP", keep, false]);
      if (steps > 1)
        out.push(
          ["SHADOW_STEPS", steps, true],
          ["SHADOW_RISE", rise, false],
          ["SHADOW_REACH", (steps - 1) * rise, false]
        );
      if (S.shadow.tint === "below") out.push(["SHADOW_DEPTH", S.shadow.depth ?? 0.55, false]);
    }
    if (S.rim) {
      out.push(["RIM_ALPHA", S.rim.alpha, false]);
      if (S.rim.tint === "own") out.push(["RIM_LIFT", S.rim.lift ?? 0.4, false]);
    }
  }
  const L = def.lines;
  if (L) {
    out.push(
      ["LINE_BASE", L.base, false],
      ["LINE_STEP", L.step, false],
      ["LINE_HALF", L.half, false],
      ["LINE_ALPHA", L.alpha, false]
    );
    if (typeof L.colors === "object")
      out.push(["LINE_HOP", L.colors.hop, false], ["LINE_OFFSET", L.colors.offset, false]);
  }
  return out;
}

/** Whether the lines take one color, the palette's lightest or darkest stop (kitScene's lineFixed). */
export const kitLineFixed = (def: FieldEffect): boolean =>
  !!def.lines && typeof def.lines.colors === "string";
/** Whether a frame moves anything: the shadow or the rim. */
export const kitMoves = (def: FieldEffect): boolean => !!(def.sheets?.shadow || def.sheets?.rim);

/** The pass's uniforms by name, as the player and the pages look them up: the scene's, then the frame's, then the
    design's constant lists (the kernel's `uK_<name>`), each where the effect reads it. */
export function kitUniformNames(def: FieldEffect): string[] {
  return [
    "uSize",
    "uD",
    "uTurn",
    "uGround",
    ...(kitShadowInk(def) ? ["uShade"] : []),
    ...(kitLineFixed(def) ? ["uLine"] : []),
    "uStops",
    ...(kitStepped(def) ? ["uLevels"] : []),
    "uKF",
    ...(kitMoves(def) ? ["uMove"] : []),
    ...Object.keys(def.uniforms).map(name => `uK_${name}`)
  ];
}

/* level k's color by a map, as kit/scene.ts kitPlace and kitStop read it, its hop the scene's where the view's steps
   space the levels */
const mapGlsl = (def: FieldEffect, name: string, map: ColorMap, prefix: "SHEET" | "LINE") => {
  const u = `  float u = float(k) * ${prefix}_HOP + ${prefix}_OFFSET;`;
  const body =
    map.wrap === "clamp"
      ? [u, "  return stopAt(clamp(u, 0.0, 1.0));"]
      : map.wrap === "cycle"
        ? [u, "  return stopAt(u - floor(u));"]
        : [u, "  float w = u - 2.0 * floor(u / 2.0);", "  return stopAt(w <= 1.0 ? w : 2.0 - w);"];
  return [
    `vec3 ${name}(int k) {`,
    ...kitLevelLocals(def, [`${prefix}_HOP` as const], false),
    ...body,
    "}"
  ].join("\n");
};

/* sheet k's shadow, which its first layer reaches (a0, its cover at the level, above 0), in its color, the ink or its
   own: where it is soft, each further layer the level raised by the rise, up to the first that misses the pixel, past
   which every higher one misses it too (the rise is 0 or more: kitRecipeConstants) */
const shadowGlsl = (def: FieldEffect, pad: string): string[] => {
  const ink = kitShadowInk(def);
  const color = ink ? "uShade" : "sc";
  return [
    ...(ink ? [] : [`${pad}vec3 sc = shadowColor(k);`]),
    `${pad}c += (${color} - c) * (SHADOW_SHARE * a0);`,
    ...(kitShadowLayers(def).steps > 1
      ? [
          `${pad}for (int s = 1; s < SHADOW_STEPS; s++) {`,
          `${pad}  float b = cover(fs, level + float(s) * SHADOW_RISE, g);`,
          `${pad}  if (b <= 0.0) break;`,
          `${pad}  c += (${color} - c) * (SHADOW_SHARE * b);`,
          `${pad}}`
        ]
      : [])
  ];
};

/* sheet k's shadow's color where each sheet's is its own, and its rim's where each is lit in its own color: shade.ts
   kitShadowColor and kitRimColor, their arithmetic in the same order */
const tintsGlsl = (def: FieldEffect): string[] => {
  const S = def.sheets;
  return [
    ...(S?.shadow && !kitShadowInk(def)
      ? [
          `// sheet k's shadow's color: the sheet below it${S.count === null ? "" : " (the ground under the first)"} darkened`,
          "vec3 shadowColor(int k) {",
          S.count === null
            ? "  return sheetColor(k - 1) * SHADOW_DEPTH;"
            : "  return (k > 0 ? sheetColor(k - 1) : uGround) * SHADOW_DEPTH;",
          "}"
        ]
      : []),
    ...(S?.rim?.tint === "own"
      ? [
          "// sheet k's rim's color: its own lifted toward white",
          "vec3 rimColor(int k) {",
          "  vec3 s = sheetColor(k);",
          "  return s + (1.0 - s) * RIM_LIFT;",
          "}"
        ]
      : [])
  ];
};

/** The KIT_LEVELS the pass's shade() reads: the sheets' step, the lines' step, and a soft shadow's rise and reach. */
export const shadeLevels = (def: FieldEffect): (typeof KIT_LEVELS)[number][] => [
  ...(def.sheets ? (["SHEET_STEP"] as const) : []),
  ...(def.lines ? (["LINE_STEP"] as const) : []),
  ...(kitShadowLayers(def).steps > 1 ? (["SHADOW_RISE", "SHADOW_REACH"] as const) : [])
];

/* the pixel's color, shade.ts's kitShade for this recipe: px is the pixel's place from the top left */
function shadeGlsl(def: FieldEffect): string {
  const soft = kitShadowLayers(def).steps > 1;
  const ink = kitShadowInk(def);
  const S = def.sheets;
  const L = def.lines;
  const out = [
    "vec3 shade(vec2 px) {",
    "  vec2 q = (px + 0.5 - 0.5 * uSize) / uD;",
    "  float f = kat(q);",
    "  float gx = kat((px + vec2(1.5, 0.5) - 0.5 * uSize) / uD) - f;",
    "  float gy = kat((px + vec2(0.5, 1.5) - 0.5 * uSize) / uD) - f;",
    "  float g = max(1e-9, sqrt(gx * gx + gy * gy));",
    ...(S?.shadow ? ["  float fs = kat(q - uMove.xy);"] : []),
    ...(S?.rim ? ["  float fr = kat(q - uMove.zw);"] : []),
    ...kitLevelLocals(def, shadeLevels(def), false),
    "  vec3 c = uGround;"
  ];
  if (S) {
    const counted = S.count !== null;
    const below = "int(floor((f - hw - SHEET_BASE) / SHEET_STEP))";
    out.push(
      "  // the highest sheet that covers the pixel whole (-1 where none does), then the next ones, each with its shadow",
      "  // and its rim under it",
      "  float hw = 0.5 * g;",
      `  int k0 = ${counted ? `clamp(${below}, -1, SHEET_TOP)` : below};`,
      counted ? "  if (k0 >= 0) c = sheetColor(k0);" : "  c = sheetColor(k0);",
      `  for (int i = 1; i <= ${KIT_EDGE}; i++) {`,
      "    int k = k0 + i;",
      ...(counted ? ["    if (k > SHEET_TOP) break;"] : []),
      "    float level = SHEET_BASE + float(k) * SHEET_STEP;",
      ...(S.shadow ? ["    float a0 = cover(fs, level, g);"] : []),
      ...(S.rim ? ["    float ar = cover(fr, level, g);"] : []),
      "    float a = cover(f, level, g);",
      "    // covers fall as the level rises (SHEET_STEP is above 0): where nothing of this sheet reaches the pixel,",
      "    // nothing of those above does",
      `    if (${[S.shadow && "a0 <= 0.0", S.rim && "ar <= 0.0", "a <= 0.0"].filter(Boolean).join(" && ")}) break;`,
      ...(S.shadow ? ["    if (a0 > 0.0) {", ...shadowGlsl(def, "      "), "    }"] : []),
      ...(S.rim
        ? [
            `    if (ar > 0.0) c += (${S.rim.tint === "own" ? "rimColor(k)" : "1.0"} - c) * (RIM_ALPHA * ar);`
          ]
        : []),
      "    if (a > 0.0) c += (sheetColor(k) - c) * a;",
      "  }"
    );
    if (S.shadow) {
      const k1 = "int(floor((fs + hw - SHEET_BASE) / SHEET_STEP))";
      out.push(
        ink
          ? "  // the shadows of the sheets past those: the ones whose every layer covers the pixel whole at once, multiplied"
          : "  // the shadows of the sheets past those: the ones whose every layer covers the pixel whole, each in its own color",
        `  // ${ink ? "out" : "in turn"}, then the last ${soft ? "three" : "two"} by their layers' covers`,
        `  int first = k0 + ${KIT_EDGE + 1};`,
        `  int k1 = ${counted ? `min(SHEET_TOP, ${k1})` : k1};`,
        "  if (k1 >= first) {",
        `    int whole = min(k1, int(floor((fs - hw${soft ? " - SHADOW_REACH" : ""} - SHEET_BASE) / SHEET_STEP)));`,
        "    int n = whole - first + 1;",
        "    if (n > 0) {",
        ...(ink
          ? [
              "      float keep = 1.0;",
              `      for (int i = 0; i < ${KIT_SHADOWS}; i++)`,
              "        if (i < n) keep *= SHADOW_KEEP;",
              "      c = uShade + (c - uShade) * keep;"
            ]
          : [
              `      // the topmost ${KIT_SHADOWS}, whose cover leaves the rest under a thousandth`,
              `      int start = max(first, whole - ${KIT_SHADOWS - 1});`,
              `      for (int i = 0; i < ${KIT_SHADOWS}; i++) {`,
              "        int k = start + i;",
              "        if (k > whole) break;",
              "        vec3 sc = shadowColor(k);",
              "        c = sc + (c - sc) * SHADOW_KEEP;",
              "      }"
            ]),
        "    }",
        "    int k2 = max(first, whole + 1);",
        `    for (int i = 0; i < ${soft ? 3 : 2}; i++) {`,
        "      int k = k2 + i;",
        "      if (k > k1) break;",
        "      float level = SHEET_BASE + float(k) * SHEET_STEP;",
        "      float a0 = cover(fs, level, g);",
        "      if (a0 <= 0.0) break;",
        ...shadowGlsl(def, "      "),
        "    }",
        "  }"
      );
    }
  }
  if (L)
    out.push(
      "  // the three lines nearest the pixel, each the band within LINE_HALF of its level",
      "  int j1 = int(floor((f - LINE_BASE) / LINE_STEP + 0.5));",
      "  for (int i = -1; i <= 1; i++) {",
      "    int j = j1 + i;",
      "    float level = LINE_BASE + float(j) * LINE_STEP;",
      "    float a = LINE_ALPHA * (cover(f, level - LINE_HALF, g) - cover(f, level + LINE_HALF, g));",
      `    if (a > 0.0) c += (${kitLineFixed(def) ? "uLine" : "lineColor(j)"} - c) * a;`,
      "  }"
    );
  out.push("  return c;", "}");
  return out.join("\n");
}

/** The pass's color taken to bytes, 0 to 255, as kit/scene.ts kitByte takes a channel: the nearest, a tie up by
    KIT_TIE, which float32 keeps (2^-10 is ten bits under a level, and float32's error at 255 about 2^-16). The pass's
    last line and the grained page's (kit/webgl.ts) round by it. */
export const KIT_BYTES_GLSL = `clamp(floor(shade(px) * 255.0 + ${kitFloat(0.5 + KIT_TIE)}), 0.0, 255.0)`;

/** The pass's fragment shader for an effect around its kernel's GLSL (kit/compile.ts: its constant lists and phases
    as uniforms, its helpers, `float kfield(float x, float y)`): each pixel's color, its place from the top left. */
export function kitFragment(def: FieldEffect, kernelGlsl: string): string {
  if (!/\bfloat kfield\(float x, float y\)/.test(kernelGlsl))
    throw new Error(`kitFragment: ${def.kind}'s kernel has no float kfield(float x, float y)`);
  const S = def.sheets;
  const L = def.lines;
  return `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;     // the canvas's pixels
uniform float uD;       // D: the pixels a design unit spans
uniform vec2 uTurn;     // the view's turn: the cosine and the sine of its angle less 90 degrees
uniform vec3 uGround;   // the ground${kitShadowInk(def) ? "\nuniform vec3 uShade;    // the shadows' color" : ""}${kitLineFixed(def) ? "\nuniform vec3 uLine;     // the lines' one color" : ""}
uniform vec3 uStops[${KIT_STOPS}];${kitMoves(def) ? "\nuniform vec4 uMove;     // this frame's shadow's move and rim's: D units on the screen, toward where each falls" : ""}${kitStepped(def) ? "\nuniform vec4 uLevels[2]; // the levels as the view's steps space them: the sheets' step and hop, the lines' step\n                        // and hop, a soft shadow's rise and its reach" : ""}
${kernelGlsl}
${kitRecipeConstants(def)
  .map(([name, v, int]) => `const ${int ? "int" : "float"} ${name} = ${int ? v : kitFloat(v)};`)
  .join("\n")}
out vec4 o;
// the field at a screen point q (D units from the middle, y down), turned out of the view's angle
float kat(vec2 q) {
  return kfield(uTurn.x * q.x + uTurn.y * q.y, -uTurn.y * q.x + uTurn.x * q.y);
}
// how much of the pixel lies where the field is at least level: an edge's box filter, a pixel wide
float cover(float f, float level, float g) {
  return clamp(0.5 + (f - level) / g, 0.0, 1.0);
}
// the stops' color at a place 0..1, between the two either side
vec3 stopAt(float place) {
  float x = clamp(place, 0.0, 1.0) * ${(KIT_STOPS - 1).toFixed(1)};
  int i = min(${KIT_STOPS - 2}, int(floor(x)));
  float t = x - float(i);
  return uStops[i] + (uStops[i + 1] - uStops[i]) * t;
}
${[
  ...(S ? [mapGlsl(def, "sheetColor", S.colors, "SHEET")] : []),
  ...(L && typeof L.colors === "object" ? [mapGlsl(def, "lineColor", L.colors, "LINE")] : []),
  ...tintsGlsl(def)
].join("\n")}
${shadeGlsl(def)}
void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  // the bytes rounded as the CPU rounds them (kitByte: a tie up), never by the target's own rounding
  o = vec4(${KIT_BYTES_GLSL} / 255.0, 1.0);
}`;
}

/** Four numbers to a vector, as the pass's uniform arrays hold a list. */
export function kitVec4s(list: ArrayLike<number>): Float32Array {
  const out = new Float32Array(4 * Math.ceil(list.length / 4));
  out.set(list);
  return out;
}

/** What the pass takes for a scene, set once a palette, a view or a box changes: the canvas, D, the view's turn, the
    colors (0..1; the shadows' zeros where they take no ink, the lines' where they take no one color), the levels as
    the view's steps space them where the effect takes steps (kitLevels) and the design's constant lists, four to a
    vector, by their names. */
export interface KitSceneUniforms {
  size: Float32Array;
  D: number;
  turn: Float32Array;
  ground: Float32Array;
  shade: Float32Array;
  line: Float32Array;
  stops: Float32Array;
  levels?: Float32Array;
  K: Record<string, Float32Array>;
}

export function kitSceneUniforms(m: KitScene): KitSceneUniforms {
  const def = m.def;
  return {
    size: Float32Array.of(m.width, m.height),
    D: m.D,
    turn: Float32Array.of(m.cos, m.sin),
    ground: Float32Array.from(m.ground),
    shade: kitShadowInk(def) ? Float32Array.from(m.shade) : new Float32Array(3),
    line: m.lineFixed ? Float32Array.from(m.lineFixed) : new Float32Array(3),
    stops: Float32Array.from(m.stops),
    ...(kitStepped(def) ? { levels: kitLevels(m) } : {}),
    K: Object.fromEntries(Object.keys(def.uniforms).map(name => [name, kitVec4s(m.U[name])]))
  };
}

/** A frame's uniforms: the phases four to a vector (uKF), the shadow's move and the rim's (uMove), and kitFrameAt's
    numbers they are read from. */
export interface KitFrameUniforms {
  phases: Float32Array;
  move: Float32Array;
  at: Float64Array;
}
export const kitFrameScratch = (def: FieldEffect): KitFrameUniforms => ({
  phases: new Float32Array(4 * Math.ceil(def.tracks / 4)),
  move: new Float32Array(4),
  at: new Float64Array(kitFrameSize(def))
});

/** A frame's uniforms at t (seconds of the loop at speed 1), into `into`, with nothing allocated where it is given. */
export function kitFrameUniforms(
  m: KitScene,
  t: number,
  into: KitFrameUniforms = kitFrameScratch(m.def)
): KitFrameUniforms {
  const n = m.def.tracks;
  kitFrameAt(m, t, into.at);
  for (let i = 0; i < n; i++) into.phases[i] = into.at[i];
  for (let i = 0; i < 4; i++) into.move[i] = into.at[n + i];
  return into;
}
