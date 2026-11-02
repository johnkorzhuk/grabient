import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import {
  EFFECT_EASE_S,
  EFFECT_PIXELS_MAX,
  EFFECT_SETTLE_MS,
  type Effect,
  parseEffect
} from "./effect.ts";
import {
  GLASS_ANGLE,
  GLASS_LOOP,
  GLASS_REF_D,
  GLASS_TUNING,
  glassColors,
  glassGeometry
} from "./glass.ts";
import {
  GLASS_BAKE_FS,
  GLASS_BLUR_FS,
  GLASS_DISC_FS,
  GLASS_DISC_VS,
  GLASS_FINAL_FS,
  GLASS_FULL_VS
} from "./glass-gl.ts";
import { GLASS_SHADER_KINDS, glassShader } from "./glass-shader.ts";
import { glassShadertoy, glslDouble, glslFloat } from "./glass-shadertoy.ts";
import {
  GLASS_BAKE_WGSL,
  GLASS_BLUR_WGSL,
  GLASS_DISC_WGSL,
  GLASS_FINAL_WGSL
} from "./glass-wgsl.ts";
import type { Palette } from "./palette.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";
import { parseView } from "./view.ts";

const { origin, entries } = golden<{
  origin: string;
  entries: { id: string; seed: string; address: string; texts: Record<ShaderKind, string> }[];
}>("glass-shaders");

const read = (address: string): { effect: Effect; angle: number } => {
  const params = new URLSearchParams(address);
  return { effect: parseEffect(params) as Effect, angle: parseView(params).angle };
};
const SEED = "kY4mpDazO-mUuu_fuLqXU49dvVP6";
const P = decodePalette(SEED) as Palette;
const GLASS = read("style=glass&angle=137&speed=3&fps=24&shape=7");

test("the glass's five texts are as before, near grays and every setting among them", () => {
  expect(entries.length).toBe(6);
  for (const e of entries) {
    const { effect, angle } = read(e.address);
    for (const kind of GLASS_SHADER_KINDS)
      expect(
        glassShader(kind, decodePalette(e.seed) as Palette, effect, angle, e.seed, origin),
        `${e.id} ${kind}`
      ).toBe(e.texts[kind]);
  }
});

test("each text credits the seed, the effect's address and what it is", () => {
  const credit = (kind: ShaderKind) =>
    glassShader(kind, P, GLASS.effect, GLASS.angle, SEED, origin).split("\n").slice(0, 3);
  const address = `${origin}/${SEED}?style=glass&angle=137&speed=3&fps=24&shape=7`;
  expect(credit("shadertoy").slice(0, 2)).toEqual([`// grabient ${SEED}`, `// ${address}`]);
  expect(credit("glsl")[2]).toBe("// fluted glass: the GLSL ES 3.00 passes its WebGL page runs");
  expect(
    glassShader("webgpu", P, GLASS.effect, GLASS.angle, SEED, origin).split("\n").slice(0, 6)
  ).toEqual([
    "<!doctype html>",
    "<!--",
    `  grabient ${SEED}`,
    `  ${address}`,
    "  fluted glass, drawn by WebGPU",
    "-->"
  ]);
  /* without an origin, the seed alone */
  expect(glassShader("wgsl", P, GLASS.effect, GLASS.angle, SEED).split("\n").slice(0, 2)).toEqual([
    `// grabient ${SEED}`,
    "// fluted glass: the WGSL passes its WebGPU page runs"
  ]);
});

test("the GLSL is the player's own, and the WebGL page runs each shader as the text writes it", () => {
  const glsl = glassShader("glsl", P, GLASS.effect, GLASS.angle, SEED, origin);
  const page = glassShader("webgl", P, GLASS.effect, GLASS.angle, SEED, origin);
  const shaders: [string, string][] = [
    ["disc-vs", GLASS_DISC_VS],
    ["disc-fs", GLASS_DISC_FS],
    ["full-vs", GLASS_FULL_VS],
    ["blur-fs", GLASS_BLUR_FS],
    ["final-fs", GLASS_FINAL_FS],
    ["bake-fs", GLASS_BAKE_FS]
  ];
  for (const [id, source] of shaders) {
    expect(glsl).toContain(`${source}\n`);
    expect(page).toContain(`id="${id}">${source}</script>`);
  }
});

test("the WebGPU page runs each module as the WGSL text writes it", () => {
  const wgsl = glassShader("wgsl", P, GLASS.effect, GLASS.angle, SEED, origin);
  const page = glassShader("webgpu", P, GLASS.effect, GLASS.angle, SEED, origin);
  for (const [id, source] of [
    ["disc", GLASS_DISC_WGSL],
    ["blur", GLASS_BLUR_WGSL],
    ["glass", GLASS_FINAL_WGSL],
    ["bake", GLASS_BAKE_WGSL]
  ]) {
    expect(wgsl).toContain(source);
    expect(page).toContain(`id="${id}">${source}</script>`);
  }
});

test("the glass offers the Shader tab's kinds", () => {
  expect(GLASS_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("nothing in a page's shaders or code could end its script element", () => {
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = glassShader(kind, P, GLASS.effect, GLASS.angle, SEED, origin);
    const scripts = [...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    expect(scripts.length).toBe(kind === "webgl" ? 8 : 6);
    for (const s of scripts) expect(s).not.toMatch(/<\/|<!--/);
  }
});

test("a page's settings are its first script, where a reader finds them", () => {
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = glassShader(kind, P, GLASS.effect, GLASS.angle, SEED, origin);
    const first = /<canvas><\/canvas>\n<script>\n([\s\S]*?)\n<\/script>/.exec(page)?.[1] ?? "";
    expect(first).toMatch(/^\/\/ The glass's colors/);
    expect(first).toContain(
      "const ANGLE = 137;\nconst SHAPE = 7;\nconst SPEED = 3;\nconst FPS = 24;"
    );
    expect(first).toContain(`const EASE = ${EFFECT_EASE_S};`);
  }
});

test("a page plays by the players' numbers and goes on after its GPU is lost and found", () => {
  const webgl = glassShader("webgl", P, GLASS.effect, GLASS.angle, SEED);
  const webgpu = glassShader("webgpu", P, GLASS.effect, GLASS.angle, SEED);
  for (const page of [webgl, webgpu]) {
    expect(page).toContain(`const PIXELS_MAX = ${EFFECT_PIXELS_MAX};`);
    expect(page).toContain(`laidOut ? ${EFFECT_SETTLE_MS} : 0`);
  }
  expect(webgl).toMatch(
    /"webglcontextlost", event => \{\n\s+event\.preventDefault\(\);\n\s+lose\(\);/
  );
  expect(webgl).toMatch(
    /"webglcontextrestored", \(\) => \{\n\s+drawn = drawing\(\);\n\s+found\(\);/
  );
  expect(webgpu).toContain("one.lost.then(async () => {");
  expect(webgpu).toContain('"This page lost its GPU device, and the browser gave it no other."');
});

test("a page says so where the browser lacks what it needs, and holds still for less motion", () => {
  const webgl = glassShader("webgl", P, GLASS.effect, GLASS.angle, SEED);
  const webgpu = glassShader("webgpu", P, GLASS.effect, GLASS.angle, SEED);
  expect(webgl).toContain('"This page needs WebGL 2, which this browser does not have."');
  expect(webgpu).toContain('"This page needs WebGPU, which this browser does not have."');
  for (const page of [webgl, webgpu]) {
    expect(page).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(page).toContain(
      `const COLORS = [${glassColors(P)
        .map(c => `"${c}"`)
        .join(", ")}];`
    );
    expect(page).toContain(
      "const ANGLE = 137;\nconst SHAPE = 7;\nconst SPEED = 3;\nconst FPS = 24;"
    );
  }
});

test("the Shadertoy text is Shadertoy's tabs in order, its settings at the top of Common", () => {
  const text = glassShader("shadertoy", P, GLASS.effect, GLASS.angle, SEED, origin);
  const headers = text.split("\n").filter(line => line.startsWith("// ===="));
  expect(headers.map(line => /^\/\/ ==== (.+?) ====/.exec(line)?.[1])).toEqual([
    "Common",
    "Buffer A",
    "Buffer B",
    "Buffer C",
    "Buffer D",
    "Image"
  ]);
  expect(headers[2]).toBe(
    "// ==== Buffer B ==== iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)"
  );
  const colors = glassColors(P)
    .map(c => `0x${c.slice(1)}`)
    .join(", ");
  expect(text).toContain(
    `const int COLORS[] = int[](${colors});\nconst int ANGLE = 137;\nconst int SHAPE = 7;\nconst float SPEED = 3.0;\nconst int FPS = 24;\nconst float EASE = ${glslFloat(EFFECT_EASE_S)};`
  );
  /* every channel reads a buffer as it is: no tab filters a buffer, every read by hand */
  expect(text).not.toMatch(/filter: (linear|mipmap)/);
});

test("the Shadertoy text holds the design's light and core as the engine draws them", () => {
  const text = glassShadertoy(glassColors(P), 90, 0, 1, 60);
  const table = glassGeometry({ width: 1000, height: 1000 }).shadeTable.map(glslFloat).join(",");
  expect(text.replace(/\s+/g, "")).toContain(`constfloatSHADE[17]=float[](${table});`);
  expect(text).toContain("const float CORE = 0.3626;");
});

test("the Shadertoy text takes the design's numbers from the engine, none written in by hand", () => {
  const text = glassShadertoy(glassColors(P), 90, 0, 1, 60);
  const T = GLASS_TUNING;
  for (const line of [
    `const vec2 REF_D = ${glslDouble(GLASS_REF_D)};`,
    `const int NPTS = ${T.nPts};`,
    `const int GRID_X = ${T.gridX};`,
    `const int ROWS = ${Math.ceil(T.nPts / T.gridX)};`,
    `const int BASE = ${T.base};`,
    `const uint DESIGN_SEED = ${T.seed}u;`,
    `const float LOOP = ${glslFloat(GLASS_LOOP)};`,
    `const int DESIGN_ANGLE = ${GLASS_ANGLE};`
  ])
    expect(text).toContain(line);
  /* the counts and the loop only by name past their definitions */
  const body = text.slice(text.indexOf("const int DESIGN_ANGLE"));
  expect(body).not.toMatch(/\b56\.0\b|: 7u\b|1152\.56|k % 4\b|k < 12;|\/ 3\.0\)|ANGLE - 90\b/);
  /* every color by the array's length: a reader may write any number of them */
  expect(body).not.toMatch(/COLORS\[(\d|i % \d)/);
});

test("the Shadertoy tabs keep no tab's frames for another's, and remake the layout for a new ANGLE or SHAPE", () => {
  const text = glassShadertoy(glassColors(P), 90, 0, 1, 60);
  const tab = (name: string) => {
    const from = text.indexOf(`// ==== ${name} ====`);
    const to = text.indexOf("// ==== ", from + 10);
    return text.slice(from, to < 0 ? undefined : to);
  };
  /* only Buffer A reads iFrame, its own */
  for (const name of ["Buffer B", "Buffer C", "Buffer D", "Image"])
    expect(tab(name)).not.toContain("iFrame");
  expect(tab("Buffer A")).toContain("const float KEY = float(ANGLE * 1000 + SHAPE);");
  expect(tab("Buffer A")).toContain(
    "bool fresh = !made || built.xyz != vec3(iResolution.xy, KEY);"
  );
  /* every step of the exact sums and products, and each quotient, behind the integer guard */
  expect(text).toContain(
    "float keep(float x) { return uintBitsToFloat(floatBitsToUint(x) ^ (uint(ONE) - 1u)); }"
  );
  for (const step of [
    "float s = keep(a + b);\n  float v = keep(s - a);\n  return vec2(s, keep(keep(a - keep(s - v)) + keep(b - v)));",
    "return vec2(s, keep(b - keep(s - a)));",
    "float ah = keep(ta - keep(ta - a));\n  float al = keep(a - ah);",
    "float q1 = keep(a.x / b.x);"
  ])
    expect(text).toContain(step);
});

test("a float and a double are written so GLSL reads back the same numbers", () => {
  for (const v of [0, 1, -2.5, 0.1, 1 / 255, 1 / 65535, Math.PI, 1e-30, 6.2201, 1152.56, -47.336]) {
    expect(Math.fround(Number(glslFloat(v).replace(/\.0e/, "e")))).toBe(Math.fround(v));
    expect(glslFloat(v)).toMatch(/^-?\d+\.\d+(e-?\d+)?$/);
    const parts = /vec2\((\S+), (\S+)\)/.exec(glslDouble(v)) ?? [];
    const [hi, lo] = parts.slice(1).map(s => Math.fround(Number(s)));
    expect(Math.abs(hi + lo - v)).toBeLessThanOrEqual(Math.abs(v) * 2 ** -46);
  }
});
