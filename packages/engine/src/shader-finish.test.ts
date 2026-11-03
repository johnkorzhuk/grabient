import { expect, test } from "vitest";
import { blobShader } from "./blob-shader.ts";
import { decodePalette } from "./codec.ts";
import { type Effect, parseEffect } from "./effect.ts";
import { effectUnderlay } from "./fx-finish.ts";
import { glassShader } from "./glass-shader.ts";
import { GRAIN_SIDE, grainTile } from "./grain.ts";
import type { Palette } from "./palette.ts";
import {
  FINISH_FS,
  FINISH_GLSL_SECTIONS,
  FINISH_MATH_JS,
  FINISH_WEBGL_JS,
  FINISH_WEBGL_SHADERS,
  FINISH_WEBGPU_JS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL,
  FINISH_WGSL_SECTIONS,
  finishSettingsJs,
  GRAIN_TILE_GLSL,
  GRAIN_TILE_JS,
  grainTileWgsl
} from "./shader-finish.ts";
import { effectSoftShare } from "./view.ts";

const SEED = "kS7Q8Yy5S_SChv0";
const P = decodePalette(SEED) as Palette;
const effectOf = (query: string): Effect => parseEffect(new URLSearchParams(query)) as Effect;

/* the page's own arithmetic, run as the page runs it, with its settings */
const pageMath = (settings: string) =>
  new Function(
    `${settings}\n${FINISH_MATH_JS}\nreturn { grainTile, softPlan, underStops, underLine };`
  )() as {
    grainTile: (grain: number) => Uint8Array;
    softPlan: (
      w: number,
      h: number
    ) => {
      t: number;
      first: number;
      rest: number;
      pairs: number;
      taps: Float32Array;
      lw: number;
      lh: number;
    } | null;
    underStops: () => Float32Array;
    underLine: (w: number, h: number) => [number, number];
  };

test("the page's grain tile is the engine's, a byte a speck: its alpha with the white in its lowest bit", () => {
  for (const grain of [1, 17, 40, 73, 100]) {
    const tile = pageMath(
      `const SOFT = 0; const UNDER = []; const UNDER_ANGLE = 90; const GRAIN = ${grain};`
    ).grainTile(grain);
    const want = grainTile(grain);
    for (let i = 0; i < GRAIN_SIDE * GRAIN_SIDE; i++) {
      expect(tile[i] & 254, `${grain} alpha at ${i}`).toBe(want[i * 4 + 3]);
      expect(tile[i] & 1, `${grain} white at ${i}`).toBe(want[i * 4] === 255 ? 1 : 0);
    }
  }
});

test("the soft's plan draws on texels a power of two wide, the sigma there 2 to 4 of them, its taps paired, summing to 1", () => {
  for (const [soft, w, h] of [
    [2, 3840, 2160],
    [8, 800, 400],
    [40, 800, 400],
    [100, 1920, 1080],
    [60, 390, 844]
  ]) {
    const share = effectSoftShare(soft);
    const plan = pageMath(
      `const SOFT = ${share}; const UNDER = []; const UNDER_ANGLE = 90; const GRAIN = 0;`
    ).softPlan(w, h);
    expect(plan).not.toBeNull();
    if (!plan) continue;
    const sigma = share * Math.max(w, h);
    expect(Math.log2(plan.t) % 1).toBe(0);
    if (sigma >= 2) {
      expect(sigma / plan.t).toBeGreaterThanOrEqual(2);
      expect(sigma / plan.t).toBeLessThan(4);
    } else expect(plan.t).toBe(1);
    /* the taps to three sigmas, 12 at most, read in pairs: each pair's offset between its two texels */
    expect(plan.pairs).toBeLessThanOrEqual(6);
    expect(plan.pairs).toBe(Math.ceil(Math.min(12, Math.ceil(3 * (sigma / plan.t))) / 2));
    let total = plan.taps[1];
    for (let i = 1; i <= plan.pairs; i++) {
      expect(plan.taps[2 * i]).toBeGreaterThanOrEqual(2 * i - 1);
      expect(plan.taps[2 * i]).toBeLessThanOrEqual(2 * i);
      total += 2 * plan.taps[2 * i + 1];
    }
    expect(total).toBeCloseTo(1, 6);
    /* the frame down to the grid in levels of at most 8 pixels a side */
    expect(plan.first).toBe(Math.min(plan.t, 8));
    expect(plan.first * plan.rest).toBe(plan.t);
    expect(plan.lw).toBe(Math.ceil(w / plan.t) + 2);
    expect(plan.lh).toBe(Math.ceil(h / plan.t) + 2);
  }
  expect(
    pageMath("const SOFT = 0; const UNDER = []; const UNDER_ANGLE = 90; const GRAIN = 0;").softPlan(
      800,
      400
    )
  ).toBeNull();
  /* a sigma under a quarter of a pixel moves no byte, so it draws no blur (soft 1 at 800 pixels is 0.03) */
  const tiny = `const SOFT = ${effectSoftShare(1)}; const UNDER = []; const UNDER_ANGLE = 90; const GRAIN = 0;`;
  expect(pageMath(tiny).softPlan(800, 400)).toBeNull();
  /* just past it, every tap is a number */
  const quarter = pageMath(
    `const SOFT = ${0.2501 / 800}; const UNDER = []; const UNDER_ANGLE = 90; const GRAIN = 0;`
  ).softPlan(800, 400);
  expect(quarter?.pairs).toBe(1);
  expect([...(quarter?.taps ?? [])].every(Number.isFinite)).toBe(true);
});

test("the gradient under a soft effect carries every stop, past the most a shader's array could hold", () => {
  /* eight keyframes a half turn apart, dark and light by turns: 83 stops under it at soft 60 */
  const busy = decodePalette("kcWdoAcu1VKztVTy7VUrO1VPLtVSs7VU8u1VI") as Palette;
  const glass = effectOf("style=glass&angle=40");
  const underlay = effectUnderlay(busy, glass, 40, 60)!;
  expect(underlay.stops.length).toBeGreaterThan(64);
  const settings = finishSettingsJs({ soft: 60, underlay }, "ANGLE");
  const stops = pageMath(`const ANGLE = 40;\n${settings}`).underStops();
  expect(stops.length).toBe(4 * underlay.stops.length);
  const last = underlay.stops.at(-1)!;
  const n = Number.parseInt(last.hex.slice(1), 16);
  expect([...stops.slice(-4, -1)]).toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  /* the shaders read them from a texture and a storage buffer, as many as there are */
  expect(FINISH_FS).toContain("uniform highp sampler2D under;");
  expect(FINISH_FS).toContain("for (int i = 1; i < unders; i++) {");
  expect(FINISH_WGSL.final).toContain("var<storage, read> under: array<vec4f>;");
  expect(`${FINISH_FS}${FINISH_WGSL.final}`).not.toMatch(/\b64\b/);
  expect(FINISH_WEBGL_JS).toContain(
    "gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, under.length / 4, 1, 0, gl.RGBA, gl.FLOAT, under);"
  );
  expect(FINISH_WEBGL_JS).toContain("gl.uniform1i(U.final.unders, plan ? UNDER.length : 0);");
  expect(FINISH_WEBGPU_JS).toContain("GPUBufferUsage.STORAGE");
  /* no underlay still binds a stop, so nothing is bound empty */
  expect(pageMath(finishSettingsJs({ grain: 30 }, "90")).underStops().length).toBe(4);
});

test("a speck spans the canvas's pixels to a CSS pixel, which every page hands its finish", () => {
  /* the page's own helper, on a canvas 400 CSS pixels wide */
  const scaleOf = new Function("canvas", `${GRAIN_TILE_JS}\nreturn grainScaleOf;`)({
    getBoundingClientRect: () => ({ width: 400 })
  }) as (w: number) => number;
  expect(scaleOf(800)).toBe(2);
  expect(scaleOf(600)).toBe(1.5);
  /* the speck the pixel shows, nearest, as the site's tile of CSS pixels */
  expect(GRAIN_TILE_GLSL).toContain("uniform float grainScale;");
  expect(GRAIN_TILE_GLSL).toContain(
    "texelFetch(grainTile, ivec2(floor((vec2(p) + 0.5) / max(grainScale, 1.0))) & 127, 0)"
  );
  expect(grainTileWgsl(3)).toContain("@group(0) @binding(4) var<uniform> grainScale: f32;");
  const glass = effectOf("style=glass&angle=40");
  const blob = effectOf("style=blob&bg=%23151315");
  const soft = { soft: 40, grain: 30, underlay: effectUnderlay(P, glass, 40, 40) };
  expect(glassShader("webgl", P, glass, 40, SEED, undefined, soft)).toContain(
    "finish.layout(w, h, grainScaleOf(w));"
  );
  expect(glassShader("webgpu", P, glass, 40, SEED, undefined, soft)).toContain(
    "finish.layout(w, h, grainScaleOf(w));"
  );
  const blobSoft = { soft: 40, grain: 30, underlay: effectUnderlay(P, blob, 90, 40) };
  expect(blobShader("webgl", P, blob, SEED, undefined, blobSoft)).toContain(
    "finish.layout(w, h, grainScaleOf(w));"
  );
  expect(blobShader("webgpu", P, blob, SEED, undefined, blobSoft)).toContain(
    "finish.layout(cw, ch, grainScaleOf(cw));"
  );
  expect(FINISH_WEBGL_JS).toContain("gl.uniform1f(U.final.grainScale, scale);");
  expect(FINISH_WEBGPU_JS).toContain(
    "device.queue.writeBuffer(uScale, 0, new Float32Array([cssScale]));"
  );
  /* a grain alone sets it in the effect's own last pass */
  const grain = { grain: 30 };
  expect(glassShader("webgl", P, glass, 40, SEED, undefined, grain)).toContain(
    "gl.uniform1f(U.fGrainScale, grainScale);"
  );
  expect(glassShader("webgpu", P, glass, 40, SEED, undefined, grain)).toContain(
    "device.queue.writeBuffer(uGrainScale, 0, new Float32Array([grainScaleOf(w)]));"
  );
  expect(blobShader("webgl", P, blob, SEED, undefined, grain)).toContain(
    "gl.uniform1f(u.grainScale, grainScale);"
  );
  expect(blobShader("webgpu", P, blob, SEED, undefined, grain)).toContain(
    "gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(cw)]));"
  );
});

test("a page's finish settings name the soft as its share, the gradient under it at its places, and the grain", () => {
  const glass = effectOf("style=glass&angle=40");
  const underlay = effectUnderlay(P, glass, 40, 50)!;
  const settings = finishSettingsJs({ soft: 50, grain: 30, underlay }, "ANGLE");
  expect(settings).toContain(`const SOFT = ${effectSoftShare(50)};`);
  expect(settings).toContain("const UNDER_ANGLE = ANGLE;");
  expect(settings).toContain("const GRAIN = 30;");
  const math = pageMath(`const ANGLE = 40;\n${settings}`);
  const stops = math.underStops();
  underlay.stops.forEach((s, i) => {
    const n = Number.parseInt(s.hex.slice(1), 16);
    expect([...stops.slice(4 * i, 4 * i + 3)]).toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    expect(stops[4 * i + 3]).toBeCloseTo(underlay.at![i], 5);
  });
  /* CSS's gradient line: the direction from the top left over its length */
  const [dx, dy] = math.underLine(800, 400);
  const a = (40 * Math.PI) / 180;
  const length = Math.abs(800 * Math.sin(a)) + Math.abs(400 * Math.cos(a));
  expect(dx).toBeCloseTo(Math.sin(a) / length, 12);
  expect(dy).toBeCloseTo(-Math.cos(a) / length, 12);
  /* a grain alone lays no gradient under */
  expect(finishSettingsJs({ grain: 30 }, "ANGLE")).toContain("const UNDER = [];");
});

test("a finished effect's pages carry the finish's shaders, settings and code, and its texts the finish's passes", () => {
  const glass = effectOf("style=glass&angle=40");
  const blob = effectOf("style=blob");
  const underlay = effectUnderlay(P, glass, 40, 50);
  const finish = { soft: 50, grain: 30, underlay };
  const webgl = glassShader("webgl", P, glass, 40, SEED, "https://grabient.com", finish);
  for (const [id, type, code] of FINISH_WEBGL_SHADERS)
    expect(webgl).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  expect(webgl).toContain("const finish = finishing(gl);");
  expect(webgl).toContain("gl.bindFramebuffer(gl.FRAMEBUFFER, finish.frame);");
  expect(webgl).toContain(`const SOFT = ${effectSoftShare(50)};`);
  expect(webgl.split("\n").slice(2, 5)).toEqual([
    `  grabient ${SEED}`,
    `  https://grabient.com/${SEED}?style=glass&angle=40&soft=50&grain=30`,
    "  fluted glass, drawn by WebGL 2, soft 50, grain 30"
  ]);
  expect(glassShader("glsl", P, glass, 40, SEED, undefined, finish)).toContain(
    FINISH_GLSL_SECTIONS
  );
  const webgpu = glassShader("webgpu", P, glass, 40, SEED, undefined, finish);
  for (const [id, type, code] of FINISH_WEBGPU_SHADERS)
    expect(webgpu).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  expect(webgpu).toContain('const pFinal = pipeline("glass", "rgba8unorm", QUAD);');
  expect(glassShader("wgsl", P, glass, 40, SEED, undefined, finish)).toContain(
    FINISH_WGSL_SECTIONS
  );
  /* a soft glass has no Shadertoy text; the grain alone lays itself over its Image */
  expect(() => glassShader("shadertoy", P, glass, 40, SEED, undefined, finish)).toThrow(/no soft/);
  expect(glassShader("shadertoy", P, glass, 40, SEED, undefined, { grain: 30 })).toContain(
    "fragColor = vec4(grainOver(floor(glass * 255.0 + 0.5), p) / 255.0, 1.0);"
  );
  /* the blob's pages lay theirs over a canvas with alpha, its gradient left to right */
  const blobFinish = { soft: 40, underlay: effectUnderlay(P, blob, 90, 40) };
  const blobPage = blobShader("webgl", P, blob, SEED, undefined, blobFinish);
  expect(blobPage).toContain("finish = finishing(gl);");
  expect(blobPage).toContain("const UNDER_ANGLE = 90;");
  expect(blobShader("webgpu", P, blob, SEED, undefined, blobFinish)).toContain(
    'final = pipeline("final", "rgba8unorm");'
  );
  expect(blobShader("glsl", P, blob, SEED, undefined, blobFinish)).toContain(FINISH_GLSL_SECTIONS);
  expect(blobShader("wgsl", P, blob, SEED, undefined, blobFinish)).toContain(FINISH_WGSL_SECTIONS);
});

test("a grained effect with no soft lays its grain in its own last pass, from a tile its page makes", () => {
  const glass = effectOf("style=glass&angle=40");
  const blob = effectOf("style=blob&bg=%23151315");
  const finish = { grain: 30 };
  const webgl = glassShader("webgl", P, glass, 40, SEED, undefined, finish);
  expect(webgl).not.toContain("finishing(gl)");
  expect(webgl).toContain("const grainTex = grainTexture(gl);");
  expect(webgl).toContain("const GRAIN = 30;");
  expect(webgl).not.toContain("const SOFT");
  const glsl = glassShader("glsl", P, glass, 40, SEED, undefined, finish);
  expect(glsl).toContain(GRAIN_TILE_GLSL);
  expect(glsl).not.toContain("==== Finish");
  expect(glsl).toContain(
    "o = grainOver(vec4(floor(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)) * 255.0 + 0.5), 255.0), p) / 255.0;"
  );
  const webgpu = glassShader("webgpu", P, glass, 40, SEED, undefined, finish);
  expect(webgpu).toContain("const grainTex = grainTexture(device);");
  expect(webgpu).toContain("{ buffer: uGlass }, grainTex.createView(), { buffer: uGrainScale }]");
  expect(webgpu).toContain('const pFinal = pipeline("glass", format, QUAD);');
  expect(glassShader("wgsl", P, glass, 40, SEED, undefined, finish)).toContain(grainTileWgsl(4));
  expect(blobShader("webgl", P, blob, SEED, undefined, finish)).toContain(
    "grainTex = grainTexture(gl);"
  );
  expect(blobShader("glsl", P, blob, SEED, undefined, finish)).toContain(
    "color = grainOver(floor((s + ground * (1.0 - s.a)) * 255.0 + 0.5), p) / 255.0;"
  );
  expect(blobShader("webgpu", P, blob, SEED, undefined, finish)).toContain(
    "grainTex.createView(), { buffer: grainScale }]"
  );
  expect(blobShader("wgsl", P, blob, SEED, undefined, finish)).toContain(
    "return grainOver(floor((s + uni.ground * (1.0 - s.a)) * 255.0 + 0.5), p) / 255.0;"
  );
});
