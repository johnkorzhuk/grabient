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
import { glassColors } from "./glass.ts";
import {
  GLASS_BAKE_FS,
  GLASS_BLUR_FS,
  GLASS_DISC_FS,
  GLASS_DISC_VS,
  GLASS_FINAL_FS,
  GLASS_FULL_VS
} from "./glass-gl.ts";
import { GLASS_SHADER_KINDS, glassShader } from "./glass-shader.ts";
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

test("the glass's four texts are as before, near grays and every setting among them", () => {
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
  expect(credit("glsl").slice(0, 2)).toEqual([`// grabient ${SEED}`, `// ${address}`]);
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
