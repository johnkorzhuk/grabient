import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import type { Palette } from "./palette.ts";
import { isShaderPage, SHADER_KINDS, type ShaderPageKind, shaderText } from "./shader.ts";
import { shaderPage } from "./shader-page.ts";
import type { Style } from "./view.ts";

const { origin, entries } = golden<{
  origin: string;
  entries: {
    id: string;
    seed: string;
    steps: number;
    angle: number;
    style: Style;
    pages: Record<ShaderPageKind, string>;
  }[];
}>("shader-pages");

const SEED = "kS7Q8Yy5S_SChv0";
const P = decodePalette(SEED) as Palette;
const STYLES: Style[] = [
  "linearGradient",
  "linearSwatches",
  "angularGradient",
  "angularSwatches",
  "radialGradient",
  "radialSwatches"
];

test("the WebGL and WebGPU pages are as before, tinted near grays included", () => {
  expect(entries.length).toBe(6);
  for (const e of entries) {
    const palette = decodePalette(e.seed) as Palette;
    for (const kind of ["webgl", "webgpu"] as const)
      expect(
        shaderPage(kind, palette, { style: e.style, angle: e.angle }, e.steps, e.seed, origin),
        `${e.id} ${e.style} ${kind}`
      ).toBe(e.pages[kind]);
  }
});

test("the Shader tab offers the pages that play it first, then the texts they run", () => {
  expect(SHADER_KINDS.map(([kind]) => kind)).toEqual(["webgl", "webgpu", "glsl", "wgsl"]);
  expect(SHADER_KINDS.filter(([kind]) => isShaderPage(kind)).map(([, label]) => label)).toEqual([
    "WebGL",
    "WebGPU"
  ]);
});

test("each page runs the tab's own shader text whole, from its script element's first character", () => {
  for (const style of STYLES) {
    const view = { style, angle: 137 };
    const glsl = shaderText("glsl", P, view, 6, SEED, origin);
    const wgsl = shaderText("wgsl", P, view, 6, SEED, origin);
    expect(shaderPage("webgl", P, view, 6, SEED, origin)).toContain(
      `<script type="x-shader/x-fragment" id="shader">${glsl}</script>`
    );
    expect(shaderPage("webgpu", P, view, 6, SEED, origin)).toContain(
      `<script type="text/wgsl" id="shader">${wgsl}</script>`
    );
    /* nothing in a shader could end its script element */
    expect(`${glsl}${wgsl}`).not.toMatch(/<\/|<!--/);
  }
});

test("a page credits the palette as its shader does, and says what draws it", () => {
  const page = shaderPage("webgpu", P, { style: "linearSwatches", angle: 90 }, 5, SEED, origin);
  expect(page.split("\n").slice(0, 6)).toEqual([
    "<!doctype html>",
    "<!--",
    `  grabient ${SEED}`,
    `  ${origin}/${SEED}?style=linearSwatches&steps=5`,
    "  5 hard bands, drawn by WebGPU",
    "-->"
  ]);
  const plain = shaderPage("webgl", P, { style: "radialGradient", angle: 90 }, 5, SEED);
  expect(plain.split("\n").slice(1, 5)).toEqual([
    "<!--",
    `  grabient ${SEED}`,
    "  5 stops along the curve, drawn by WebGL 2",
    "-->"
  ]);
});

test("a page says so where the browser lacks what it needs", () => {
  const view = { style: "linearGradient" as const, angle: 90 };
  expect(shaderPage("webgl", P, view, 5, SEED)).toContain(
    '"This page needs WebGL 2, which this browser does not have."'
  );
  expect(shaderPage("webgpu", P, view, 5, SEED)).toContain(
    '"This page needs WebGPU, which this browser does not have."'
  );
});
