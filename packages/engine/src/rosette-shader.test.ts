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
import { effectUnderlay } from "./fx-finish.ts";
import { glslFloat, shadertoyPass } from "./fx-shadertoy.ts";
import type { Palette } from "./palette.ts";
import { rosetteScene } from "./rosette.ts";
import { ROSETTE_FS, ROSETTE_VS, rosetteGroup, rosetteUniforms } from "./rosette-gl.ts";
import { rosetteModel, rosetteSettings } from "./rosette-page.ts";
import { ROSETTE_SHADER_KINDS, rosetteShader } from "./rosette-shader.ts";
import { ROSETTE_WGSL } from "./rosette-wgsl.ts";
import {
  FINISH_GLSL_SECTIONS,
  FINISH_WEBGL_SHADERS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL_SECTIONS,
  GRAIN_TILE_GLSL,
  grainTileWgsl
} from "./shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";
import { effectSoftShare, parseView } from "./view.ts";

const read = (address: string): { effect: Effect; angle: number } => {
  const params = new URLSearchParams(address);
  return { effect: parseEffect(params) as Effect, angle: parseView(params).angle };
};
/* the lab's palettes: a vivid six, an eight, a two-color isoluminant pastel near gray, an achromatic near gray, a near
   gray keeping its own tint, a pastel five */
const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kQ9hLj-wW4g",
  "kSMQbGJYI_q4CwC",
  "kCYD0ov39_J_0cKtM",
  "kW0B2lbAbMXISxv1E0NeJVCg"
];
const SIZES: [number, number][] = [
  [1, 1],
  [83, 61],
  [333, 777],
  [500, 500],
  [800, 400],
  [1080, 1],
  [1920, 1080],
  [3840, 2160]
];
/* the shapes that pick each density, period, coloring, hand and reading: 1 (90 petals, angular, the other hand), 3 and
   7 (21-petal rings read from the end), 8 (45, angular), 999 */
const SHAPES = [null, 1, 3, 7, 8, 999];
const ORIGIN = "https://grabient.com";

type Model = {
  rosetteScene: (angle: number, shape: number, w: number, h: number) => unknown;
  rosetteUniforms: (scene: unknown) => unknown;
  rosetteGroup: (scene: unknown, t: number) => [number, number];
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number): Model =>
  new Function(
    `${rosetteSettings(P, effect, angle)}\n${rosetteModel()}\nreturn { rosetteScene, rosetteUniforms, rosetteGroup };`
  )() as Model;

test("the rosette's five texts are as the shader lab checked them, for four palettes and looks", () => {
  const { origin, entries } = golden<{
    origin: string;
    entries: { id: string; seed: string; address: string; texts: Record<ShaderKind, string> }[];
  }>("rosette-shaders");
  expect(entries.length).toBe(4);
  for (const e of entries) {
    const { effect, angle } = read(e.address);
    for (const kind of ROSETTE_SHADER_KINDS)
      expect(
        rosetteShader(kind, decodePalette(e.seed) as Palette, effect, angle, e.seed, origin),
        `${e.id} ${kind}`
      ).toBe(e.texts[kind]);
  }
});

test("the pages work out the player's colors, design and uniforms to the last bit, for any palette, angle, shape and canvas", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const angle of [90, 0, 137, 300])
      for (const shape of SHAPES) {
        const P = decodePalette(seed) as Palette;
        const { effect } = read(`style=rosette${shape === null ? "" : `&shape=${shape}`}`);
        const model = modelOf(P, effect, angle);
        for (const [w, h] of SIZES.filter(([w], i) => (i + s) % 3 === 0 || w === 1920)) {
          const site = rosetteScene(P, { angle, shape }, { width: w, height: h });
          const page = model.rosetteScene(angle, shape ?? 0, w, h);
          expect(model.rosetteUniforms(page), `${seed} ${w}x${h} ${angle} ${shape}`).toEqual(
            rosetteUniforms(site)
          );
          const L = site.design.loop;
          for (const t of [0, 1 / 60, 0.4, 1.6, 7.3, L / 2, L - 1 / 60, L + 0.25, 3600.5])
            expect(model.rosetteGroup(page, t)).toEqual(
              rosetteGroup(site, t / L - Math.floor(t / L))
            );
        }
      }
}, 60_000);

test("the innermost petal drawn is the same in every canvas, for every shape, as the Shadertoy text takes it", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  for (let shape = 0; shape <= 999; shape++)
    for (const angle of [90, 300]) {
      const at = (w: number, h: number) =>
        rosetteUniforms(rosetteScene(P, { angle, shape }, { width: w, height: h })).uRange[0];
      const first = at(1, 1);
      for (const [w, h] of [
        [3840, 2160],
        [333, 777],
        [1080, 1],
        [7, 5000]
      ])
        expect(at(w, h), `shape ${shape} ${w}x${h}`).toBe(first);
    }
}, 60_000);

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read("style=rosette&angle=137&speed=3&fps=24&shape=7");
  for (const kind of ROSETTE_SHADER_KINDS) {
    const text = rosetteShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(
      `${ORIGIN}/${SEED}?style=rosette&angle=137&speed=3&fps=24&shape=7`
    );
    expect(text, kind).toContain("the rosette, the palette in rings of petals on a golden spiral");
  }
  expect(ROSETTE_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=rosette");
  const glsl = rosetteShader("glsl", P, effect, angle, SEEDS[1]);
  expect(glsl).toContain(ROSETTE_VS);
  expect(glsl).toContain(ROSETTE_FS);
  const webgl = rosetteShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(
    `<script type="x-shader/x-vertex" id="rosette-vs">${ROSETTE_VS}</script>`
  );
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="rosette-fs">${ROSETTE_FS}</script>`
  );
  const wgsl = rosetteShader("wgsl", P, effect, angle, SEEDS[1]);
  const webgpu = rosetteShader("webgpu", P, effect, angle, SEEDS[1]);
  expect(wgsl).toContain(ROSETTE_WGSL);
  expect(webgpu).toContain(`<script type="text/wgsl" id="rosette">${ROSETTE_WGSL}</script>`);
  /* a page with no finish draws the pass straight onto the canvas, as the player does */
  expect(webgl).toContain("gl.bindFramebuffer(gl.FRAMEBUFFER, null);");
  expect(webgl).not.toContain("blitFramebuffer");
  expect(webgpu).toContain('rosette = pipeline("rosette", format);');
  expect(webgpu).toContain(
    "pass(encoder, context.getCurrentTexture().createView(), rosette, groups.rosette);"
  );
});

test("nothing in a page's shaders or code could end its script element", () => {
  const P = decodePalette(SEEDS[4]) as Palette;
  const { effect, angle } = read("style=rosette&shape=999");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = rosetteShader(kind, P, effect, angle, SEEDS[4], ORIGIN);
    const inner = page.slice(page.indexOf("<body>"), page.lastIndexOf("</body>"));
    expect(inner.match(/<\/script/g)?.length).toBe(inner.match(/<script/g)?.length);
  }
});

test("a page's settings are its first script, and it plays by the players' clock and numbers", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=rosette&angle=45&speed=0.5&fps=120&shape=12");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = rosetteShader(kind, P, effect, angle, SEEDS[0]);
    const code = page.slice(page.lastIndexOf("<script"));
    expect(code).toMatch(/^<script[^>]*>\n\/\/ The palette \(its seed /);
    for (const line of [
      "const ANGLE = 45;",
      "const SHAPE = 12;",
      "const SPEED = 0.5;",
      "const FPS = 120;",
      `const EASE = ${EFFECT_EASE_S};`,
      `const PIXELS_MAX = ${EFFECT_PIXELS_MAX};`,
      `laidOut ? ${EFFECT_SETTLE_MS} : 0`
    ])
      expect(code, `${kind} ${line}`).toContain(line);
    expect(code).toContain(kind === "webgl" ? "webglcontextrestored" : "one.lost.then");
  }
});

test("the Shadertoy text is Shadertoy's tabs in order, the player's own shader in its frame", () => {
  const P = decodePalette(SEEDS[2]) as Palette;
  const { effect, angle } = read("style=rosette&angle=300&speed=3&fps=24&shape=8");
  const text = rosetteShader("shadertoy", P, effect, angle, SEEDS[2], ORIGIN);
  const tabs = [...text.matchAll(/^\/\/ ==== (.+?) ====/gm)].map(m => m[1]);
  expect(tabs).toEqual(["Common", "Buffer A", "Buffer B", "Image"]);
  expect(text).toMatch(
    /\/\/ ==== Common ====\n.*\nconst float SPEED = 3\.0;.*\nconst float FPS = 24\.0;.*\nconst float EASE = (.+?);/
  );
  /* the ease is the players' own */
  expect(Number(/^const float EASE = (.+?);/m.exec(text)?.[1])).toBe(EFFECT_EASE_S);
  /* without 32-bit float buffers the state reads back wrong: the frame says so in magenta */
  expect(text).toContain(
    "if (iResolution.x < float(STATE) || state(iChannel0, T_MARK).x != MAGIC) {\n    fragColor = vec4(1.0, 0.0, 1.0, 1.0);"
  );
  const pass = shadertoyPass(ROSETTE_FS, { common: ["uStop", "uKeyOfSlot"] });
  expect(text).toContain(pass);
  expect(pass).not.toMatch(/uniform|gl_FragCoord|#version/);
  expect(pass).toContain(
    ROSETTE_FS.slice(ROSETTE_FS.indexOf("void main()") + "void main()".length).replace(
      /gl_FragCoord/g,
      "fragPlace"
    )
  );
});

test("a soft rosette's pages draw the pass into the finish's frame and lay the finish over the canvas, its texts the finish's passes", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=rosette&angle=137&shape=8");
  const underlay = effectUnderlay(P, effect, angle, 60);
  const finish = { soft: 60, grain: 20, underlay };
  const webgl = rosetteShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGL_SHADERS)
    expect(webgl).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    "finish = finishing(gl);",
    "finish.layout(w, h, grainScaleOf(w));",
    "gl.bindFramebuffer(gl.FRAMEBUFFER, finish.frame);",
    "finish.draw();",
    `const SOFT = ${effectSoftShare(60)};`,
    "const UNDER_ANGLE = ANGLE;",
    "const GRAIN = 20;"
  ])
    expect(webgl, line).toContain(line);
  expect(webgl.split("\n").slice(2, 5)).toEqual([
    `  grabient ${SEEDS[1]}`,
    `  ${ORIGIN}/${SEEDS[1]}?style=rosette&angle=137&soft=60&grain=20&shape=8`,
    "  the rosette, the palette in rings of petals on a golden spiral, drawn by WebGL 2, soft 60, grain 20"
  ]);
  const webgpu = rosetteShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGPU_SHADERS)
    expect(webgpu).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    'rosette = pipeline("rosette", "rgba8unorm");',
    "finish = finishing(gpu, format);",
    "pass(encoder, finish.view, rosette, groups.rosette);",
    "finish.draw(encoder, context.getCurrentTexture().createView());"
  ])
    expect(webgpu, line).toContain(line);
  expect(rosetteShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, finish)).toContain(
    FINISH_GLSL_SECTIONS
  );
  expect(rosetteShader("wgsl", P, effect, angle, SEEDS[1], ORIGIN, finish)).toContain(
    FINISH_WGSL_SECTIONS
  );
});

test("a grained rosette with no soft lays its grain in its own pass, from a tile its page makes", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=rosette");
  const finish = { grain: 45 };
  const webgl = rosetteShader("webgl", P, effect, angle, SEEDS[0], ORIGIN, finish);
  expect(webgl).not.toContain("finishing(gl)");
  for (const line of [
    "grainTex = grainTexture(gl);",
    "gl.uniform1f(U.grainScale, grainScale);",
    "const GRAIN = 45;",
    GRAIN_TILE_GLSL,
    "o = grainOver(vec4(roundEven(clamp(col, 0.0, 1.0) * 255.0), 255.0), ivec2(gl_FragCoord.x, uBox.y - gl_FragCoord.y)) / 255.0;"
  ])
    expect(webgl, line).toContain(line);
  expect(rosetteShader("glsl", P, effect, angle, SEEDS[0], ORIGIN, finish)).not.toContain(
    "==== Finish"
  );
  const webgpu = rosetteShader("webgpu", P, effect, angle, SEEDS[0], ORIGIN, finish);
  expect(webgpu).toContain("{ binding: 1, resource: grainTex.createView() }");
  expect(webgpu).toContain(grainTileWgsl(1));
  expect(webgpu).toContain(
    "return grainOver(vec4f(round(clamp(col, vec3f(0.0), vec3f(1.0)) * 255.0), 255.0), vec2i(position.xy)) / 255.0;"
  );
});

test("a soft rosette's Shadertoy text takes its frame down to the soft's grid in Buffer C, blurs it in C and D and lays it over the gradient in the Image", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=rosette&angle=137&shape=8");
  const underlay = effectUnderlay(P, effect, angle, 60);
  const text = rosetteShader("shadertoy", P, effect, angle, SEEDS[1], ORIGIN, {
    soft: 60,
    underlay
  });
  expect([...text.matchAll(/^\/\/ ==== (.+?) ====/gm)].map(m => m[1])).toEqual([
    "Common",
    "Buffer A",
    "Buffer B",
    "Buffer C",
    "Buffer D",
    "Image"
  ]);
  expect(text).toContain(`const float SOFT = ${glslFloat(effectSoftShare(60))};`);
  /* the frame in Buffer B as plain, taken down to the soft's grid in C, the grid blurred in C and D */
  expect(text).toContain("vec4 blockAt(sampler2D frame, ivec2 i, Plan g) {");
  expect(text).toContain(
    "for (int i = -g.reach; i <= g.reach; i++) row += gridAt(iChannel1, b + ivec2(i, j), g) * g.w[abs(i)];"
  );
  expect(text).toContain("// ==== Image ==== iChannel0: Buffer D (filter: nearest, wrap: clamp)");
  expect(text).toContain("fragColor = vec4(c.rgb / 255.0, 1.0);");
  expect(text).not.toContain("grainOver");
  const grained = rosetteShader("shadertoy", P, effect, angle, SEEDS[1], ORIGIN, { grain: 45 });
  expect(grained).toContain(
    "// ==== Image ==== iChannel0: Buffer B (filter: nearest, wrap: clamp)"
  );
  expect(grained).toContain("fragColor = vec4(grainOver(c, p) / 255.0, 1.0);");
});
