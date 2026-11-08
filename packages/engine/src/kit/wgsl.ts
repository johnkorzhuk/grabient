/* A field effect's pass in WGSL, for its WebGPU page (kit/webgpu.ts): the player's GLSL (kit/gl.ts) line for line,
   around the kernel's WGSL (kit/compile.ts: the struct KitKernel of its constant lists and phases, its helpers,
   `fn kfield(x: f32, y: f32) -> f32`). The canvas's rows run down from the top, as the pixel's place does in the
   player (it turns gl_FragCoord's y over), so the fragment's position is that place plus a half. The scene's uniforms
   are one struct at group 0, binding 0, laid out as KIT_WGSL_UNIFORMS says; the kernel's at binding 1, as
   kitKernelLayout says (a frame writes its phases there and the moves here); a uniform array's elements are 16 bytes
   apart, so each stop is a vector of its own. */
import {
  kitFloat,
  kitLevelLocals,
  kitLineFixed,
  kitRecipeConstants,
  kitShadowInk,
  kitShadowLayers,
  kitStepped,
  shadeLevels
} from "./gl.ts";
import { KIT_EDGE, KIT_STOPS, KIT_TIE } from "./scene.ts";
import { KIT_SHADOWS } from "./shade.ts";
import type { ColorMap, FieldEffect } from "./types.ts";

/** Where each of the scene's uniforms lies in its struct, in bytes, as WGSL lays a uniform struct out, and the
    struct's bytes: the WebGPU page writes its block by these. The levels (kit/gl.ts kitLevels, two vectors) close the
    struct of an effect the view's steps space alone, which is kitWgslBytes long. */
export const KIT_WGSL_UNIFORMS = {
  size: 0,
  turn: 8,
  D: 16,
  moves: 32,
  ground: 48,
  shade: 64,
  line: 80,
  stops: 96,
  levels: 96 + 16 * KIT_STOPS,
  bytes: 96 + 16 * KIT_STOPS
} as const;
/** The scene's struct's bytes for an effect: the levels' two vectors past the stops where the view's steps space its
    levels. */
export const kitWgslBytes = (def: FieldEffect): number =>
  KIT_WGSL_UNIFORMS.bytes + (kitStepped(def) ? 32 : 0);

/** Where the kernel's struct holds each constant list (four numbers to a vector) and the phases (`f`), and its bytes,
    as the compiler writes the struct: the lists in the order of the effect's `uniforms`, then the phases. */
export function kitKernelLayout(def: FieldEffect): {
  lists: Record<string, number>;
  phases: number;
  bytes: number;
} {
  const lists: Record<string, number> = {};
  let at = 0;
  for (const [name, length] of Object.entries(def.uniforms)) {
    lists[name] = at;
    at += 16 * Math.ceil(length / 4);
  }
  return { lists, phases: at, bytes: at + 16 * Math.ceil(def.tracks / 4) };
}

/* level k's color by a map, as kit/scene.ts kitPlace and kitStop read it, its hop the scene's where the view's steps
   space the levels */
const mapWgsl = (def: FieldEffect, name: string, map: ColorMap, prefix: "SHEET" | "LINE") => {
  const u = `  let u = f32(k) * ${prefix}_HOP + ${prefix}_OFFSET;`;
  const body =
    map.wrap === "clamp"
      ? [u, "  return stopAt(clamp(u, 0.0, 1.0));"]
      : map.wrap === "cycle"
        ? [u, "  return stopAt(u - floor(u));"]
        : [
            u,
            "  let w = u - 2.0 * floor(u / 2.0);",
            "  return stopAt(select(2.0 - w, w, w <= 1.0));"
          ];
  return [
    `fn ${name}(k: i32) -> vec3f {`,
    ...kitLevelLocals(def, [`${prefix}_HOP` as const], true),
    ...body,
    "}"
  ].join("\n");
};

/* sheet k's shadow, which its first layer reaches (a0, its cover at the level, above 0), in its color, the ink or its
   own: where it is soft, each further layer the level raised by the rise, up to the first that misses the pixel, past
   which every higher one misses it too (the rise is 0 or more: kitRecipeConstants) */
const shadowWgsl = (def: FieldEffect, pad: string): string[] => {
  const ink = kitShadowInk(def);
  const color = ink ? "S.shade.rgb" : "sc";
  return [
    ...(ink ? [] : [`${pad}let sc = shadowColor(k);`]),
    `${pad}c += (${color} - c) * (SHADOW_SHARE * a0);`,
    ...(kitShadowLayers(def).steps > 1
      ? [
          `${pad}for (var s = 1; s < SHADOW_STEPS; s++) {`,
          `${pad}  let b = cover(fs, level + f32(s) * SHADOW_RISE, g);`,
          `${pad}  if (b <= 0.0) {`,
          `${pad}    break;`,
          `${pad}  }`,
          `${pad}  c += (${color} - c) * (SHADOW_SHARE * b);`,
          `${pad}}`
        ]
      : [])
  ];
};

/* sheet k's shadow's color where each sheet's is its own, and its rim's where each is lit in its own color: shade.ts
   kitShadowColor and kitRimColor, their arithmetic in the same order */
const tintsWgsl = (def: FieldEffect): string[] => {
  const S = def.sheets;
  return [
    ...(S?.shadow && !kitShadowInk(def)
      ? [
          `// sheet k's shadow's color: the sheet below it${S.count === null ? "" : " (the ground under the first)"} darkened`,
          "fn shadowColor(k: i32) -> vec3f {",
          ...(S.count === null
            ? []
            : ["  if (k <= 0) {", "    return S.ground.rgb * SHADOW_DEPTH;", "  }"]),
          "  return sheetColor(k - 1) * SHADOW_DEPTH;",
          "}"
        ]
      : []),
    ...(S?.rim?.tint === "own"
      ? [
          "// sheet k's rim's color: its own lifted toward white",
          "fn rimColor(k: i32) -> vec3f {",
          "  let s = sheetColor(k);",
          "  return s + (1.0 - s) * RIM_LIFT;",
          "}"
        ]
      : [])
  ];
};

/* the pixel's color, shade.ts's kitShade for this recipe: px is the pixel's place from the top left */
function shadeWgsl(def: FieldEffect): string {
  const soft = kitShadowLayers(def).steps > 1;
  const ink = kitShadowInk(def);
  const S = def.sheets;
  const L = def.lines;
  const out = [
    "fn shade(px: vec2f) -> vec3f {",
    "  let q = (px + 0.5 - 0.5 * S.size) / S.D;",
    "  let f = kat(q);",
    "  let gx = kat((px + vec2f(1.5, 0.5) - 0.5 * S.size) / S.D) - f;",
    "  let gy = kat((px + vec2f(0.5, 1.5) - 0.5 * S.size) / S.D) - f;",
    "  let g = max(1e-9, sqrt(gx * gx + gy * gy));",
    ...(S?.shadow ? ["  let fs = kat(q - S.moves.xy);"] : []),
    ...(S?.rim ? ["  let fr = kat(q - S.moves.zw);"] : []),
    ...kitLevelLocals(def, shadeLevels(def), true),
    "  var c = S.ground.rgb;"
  ];
  if (S) {
    const counted = S.count !== null;
    const below = "i32(floor((f - hw - SHEET_BASE) / SHEET_STEP))";
    out.push(
      "  // the highest sheet that covers the pixel whole (-1 where none does), then the next ones, each with its shadow",
      "  // and its rim under it",
      "  let hw = 0.5 * g;",
      `  let k0 = ${counted ? `clamp(${below}, -1, SHEET_TOP)` : below};`,
      ...(counted
        ? ["  if (k0 >= 0) {", "    c = sheetColor(k0);", "  }"]
        : ["  c = sheetColor(k0);"]),
      `  for (var i = 1; i <= ${KIT_EDGE}; i++) {`,
      "    let k = k0 + i;",
      ...(counted ? ["    if (k > SHEET_TOP) {", "      break;", "    }"] : []),
      "    let level = SHEET_BASE + f32(k) * SHEET_STEP;",
      ...(S.shadow ? ["    let a0 = cover(fs, level, g);"] : []),
      ...(S.rim ? ["    let ar = cover(fr, level, g);"] : []),
      "    let a = cover(f, level, g);",
      "    // covers fall as the level rises (SHEET_STEP is above 0): where nothing of this sheet reaches the pixel,",
      "    // nothing of those above does",
      `    if (${[S.shadow && "a0 <= 0.0", S.rim && "ar <= 0.0", "a <= 0.0"].filter(Boolean).join(" && ")}) {`,
      "      break;",
      "    }",
      ...(S.shadow ? ["    if (a0 > 0.0) {", ...shadowWgsl(def, "      "), "    }"] : []),
      ...(S.rim
        ? [
            "    if (ar > 0.0) {",
            `      c += (${S.rim.tint === "own" ? "rimColor(k)" : "1.0"} - c) * (RIM_ALPHA * ar);`,
            "    }"
          ]
        : []),
      "    if (a > 0.0) {",
      "      c += (sheetColor(k) - c) * a;",
      "    }",
      "  }"
    );
    if (S.shadow) {
      const k1 = "i32(floor((fs + hw - SHEET_BASE) / SHEET_STEP))";
      out.push(
        ink
          ? "  // the shadows of the sheets past those: the ones whose every layer covers the pixel whole at once, multiplied"
          : "  // the shadows of the sheets past those: the ones whose every layer covers the pixel whole, each in its own color",
        `  // ${ink ? "out" : "in turn"}, then the last ${soft ? "three" : "two"} by their layers' covers`,
        `  let first = k0 + ${KIT_EDGE + 1};`,
        `  let k1 = ${counted ? `min(SHEET_TOP, ${k1})` : k1};`,
        "  if (k1 >= first) {",
        `    let whole = min(k1, i32(floor((fs - hw${soft ? " - SHADOW_REACH" : ""} - SHEET_BASE) / SHEET_STEP)));`,
        "    let n = whole - first + 1;",
        "    if (n > 0) {",
        ...(ink
          ? [
              "      var keep = 1.0;",
              `      for (var i = 0; i < ${KIT_SHADOWS}; i++) {`,
              "        if (i < n) {",
              "          keep *= SHADOW_KEEP;",
              "        }",
              "      }",
              "      c = S.shade.rgb + (c - S.shade.rgb) * keep;"
            ]
          : [
              `      // the topmost ${KIT_SHADOWS}, whose cover leaves the rest under a thousandth`,
              `      let start = max(first, whole - ${KIT_SHADOWS - 1});`,
              `      for (var i = 0; i < ${KIT_SHADOWS}; i++) {`,
              "        let k = start + i;",
              "        if (k > whole) {",
              "          break;",
              "        }",
              "        let sc = shadowColor(k);",
              "        c = sc + (c - sc) * SHADOW_KEEP;",
              "      }"
            ]),
        "    }",
        "    let k2 = max(first, whole + 1);",
        `    for (var i = 0; i < ${soft ? 3 : 2}; i++) {`,
        "      let k = k2 + i;",
        "      if (k > k1) {",
        "        break;",
        "      }",
        "      let level = SHEET_BASE + f32(k) * SHEET_STEP;",
        "      let a0 = cover(fs, level, g);",
        "      if (a0 <= 0.0) {",
        "        break;",
        "      }",
        ...shadowWgsl(def, "      "),
        "    }",
        "  }"
      );
    }
  }
  if (L)
    out.push(
      "  // the three lines nearest the pixel, each the band within LINE_HALF of its level",
      "  let j1 = i32(floor((f - LINE_BASE) / LINE_STEP + 0.5));",
      "  for (var i = -1; i <= 1; i++) {",
      "    let j = j1 + i;",
      "    let level = LINE_BASE + f32(j) * LINE_STEP;",
      "    let a = LINE_ALPHA * (cover(f, level - LINE_HALF, g) - cover(f, level + LINE_HALF, g));",
      "    if (a > 0.0) {",
      `      c += (${kitLineFixed(def) ? "S.line.rgb" : "lineColor(j)"} - c) * a;`,
      "    }",
      "  }"
    );
  out.push("  return c;", "}");
  return out.join("\n");
}

/** The pass's color taken to bytes, 0 to 255, as kit/scene.ts kitByte takes a channel (kit/gl.ts KIT_BYTES_GLSL): the
    module's last line and the grained page's (kit/webgpu.ts) round by it. */
export const KIT_BYTES_WGSL = `clamp(floor(shade(px) * 255.0 + ${kitFloat(0.5 + KIT_TIE)}), vec3f(0.0), vec3f(255.0))`;

/** The pass as a WGSL module for an effect around its kernel's WGSL: each pixel's color, its place from the top
    left. */
export function kitWgsl(def: FieldEffect, kernelWgsl: string): string {
  if (
    !/\bfn kfield\(x: f32, y: f32\) -> f32/.test(kernelWgsl) ||
    !/\bstruct KitKernel\b/.test(kernelWgsl)
  )
    throw new Error(
      `kitWgsl: ${def.kind}'s kernel has no struct KitKernel or fn kfield(x: f32, y: f32) -> f32`
    );
  const S = def.sheets;
  const L = def.lines;
  return `struct Kit {
  size: vec2f,                  // the canvas's pixels
  turn: vec2f,                  // the view's turn: the cosine and the sine of its angle less 90 degrees
  D: f32,                       // D: the pixels a design unit spans
  moves: vec4f,                 // this frame's shadow's move and rim's: D units on the screen, toward where each falls
  ground: vec4f,                // the ground
  shade: vec4f,                 // the shadows' color, where they take the ink
  line: vec4f,                  // the lines' one color
  stops: array<vec4f, ${KIT_STOPS}>,      // the palette's stops${kitStepped(def) ? "\n  levels: array<vec4f, 2>,      // the levels as the view's steps space them (kit/gl.ts KIT_LEVELS)" : ""}
}
@group(0) @binding(0) var<uniform> S: Kit;
${kernelWgsl}
@group(0) @binding(1) var<uniform> kk: KitKernel;
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
${kitRecipeConstants(def)
  .map(([name, v, int]) => `const ${name} = ${int ? v : kitFloat(v)};`)
  .join("\n")}
// the field at a screen point q (D units from the middle, y down), turned out of the view's angle
fn kat(q: vec2f) -> f32 {
  return kfield(S.turn.x * q.x + S.turn.y * q.y, -S.turn.y * q.x + S.turn.x * q.y);
}
// how much of the pixel lies where the field is at least level: an edge's box filter, a pixel wide
fn cover(f: f32, level: f32, g: f32) -> f32 {
  return clamp(0.5 + (f - level) / g, 0.0, 1.0);
}
// the stops' color at a place 0..1, between the two either side
fn stopAt(place: f32) -> vec3f {
  let x = clamp(place, 0.0, 1.0) * ${(KIT_STOPS - 1).toFixed(1)};
  let i = min(${KIT_STOPS - 2}, i32(floor(x)));
  let t = x - f32(i);
  return S.stops[i].rgb + (S.stops[i + 1].rgb - S.stops[i].rgb) * t;
}
${[
  ...(S ? [mapWgsl(def, "sheetColor", S.colors, "SHEET")] : []),
  ...(L && typeof L.colors === "object" ? [mapWgsl(def, "lineColor", L.colors, "LINE")] : []),
  ...tintsWgsl(def)
].join("\n")}
${shadeWgsl(def)}
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  // the kernel's struct is used here whatever the kernel reads: a pipeline's layout "auto" holds only the bindings
  // its shaders use, and a bind group that names one it lacks is invalid
  _ = kk.f[0];
  let px = position.xy - 0.5;
  // the bytes rounded as the CPU rounds them (kitByte: a tie up), never by the target's own rounding
  return vec4f(${KIT_BYTES_WGSL} / 255.0, 1.0);
}`;
}
