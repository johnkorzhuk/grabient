import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { DIMPLE_EASE_S, DIMPLE_STOPS, dimpleScene } from "./dimple.ts";
import {
  DIMPLE_FS,
  DIMPLE_GROUND_SIZE,
  DIMPLE_VS,
  dimpleHollowUniforms,
  dimpleSceneUniforms
} from "./dimple-gl.ts";
import { DIMPLE_FOLLOW, dimpleColors, dimpleModel, dimpleSettings } from "./dimple-page.ts";
import { DIMPLE_SHADER_KINDS, dimpleShader } from "./dimple-shader.ts";
import { DIMPLE_WGSL, DIMPLE_WGSL_UNIFORMS } from "./dimple-wgsl.ts";
import { type Effect, parseEffect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import {
  FINISH_GLSL_SECTIONS,
  FINISH_WEBGL_SHADERS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL_SECTIONS,
  GRAIN_TILE_GLSL
} from "./shader-finish.ts";
import { SHADER_KINDS } from "./shader-kinds.ts";
import { parseView } from "./view.ts";

const read = (address: string): { effect: Effect; angle: number } => {
  const params = new URLSearchParams(address);
  return { effect: parseEffect(params) as Effect, angle: parseView(params).angle };
};
const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kQ9hLj-wW4g",
  "kUMzO5Na871ukuyhHUJA"
];
const SIZES: [number, number][] = [
  [1, 1],
  [83, 61],
  [390, 844],
  [1050, 590],
  [1920, 1080],
  [3840, 2160]
];
/* where the hollow is, in the canvas, 0 to 1 each way */
const PLACES: [number, number][] = [
  [0.5, 0.5],
  [0, 0],
  [1, 1],
  [0.123456, 0.87],
  [0.9, 0.31]
];
const ORIGIN = "https://grabient.com";

type Scene = { width: number; height: number; ox: number; oy: number };
type Model = {
  dimpleScene: (angle: number, zoom: number, w: number, h: number) => Scene;
  sceneUniforms: (scene: Scene) => ReturnType<typeof dimpleSceneUniforms>;
  hollowUniforms: (scene: Scene, cx: number, cy: number, ground: Float32Array) => number;
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number): Model =>
  new Function(
    `${dimpleSettings(P, effect, angle)}\n${dimpleModel()}\nreturn { dimpleScene, sceneUniforms, hollowUniforms };`
  )() as Model;

test("the pages lay the dimple out as the player does, to the last bit, for any palette, angle, zoom, canvas and place of the hollow", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const angle of [90, 0, 137, 300])
      for (const zoom of [null, 1.37, 2.5, 4]) {
        const P = decodePalette(seed) as Palette;
        const { effect } = read(`style=dimple${zoom === null ? "" : `&zoom=${zoom}`}`);
        expect(effect.look.zoom).toBe(zoom);
        const model = modelOf(P, effect, angle);
        for (const [w, h] of SIZES.filter((_, i) => (i + s) % 2 === 0 || i === 3)) {
          const site = dimpleScene(P, { angle, zoom }, { width: w, height: h });
          /* the page's own ZOOM, as its settings write it */
          const page = model.dimpleScene(angle, zoom ?? 1, w, h);
          const what = `${seed} ${w}x${h} ${angle} ${zoom}`;
          expect(model.sceneUniforms(page), what).toEqual(dimpleSceneUniforms(site));
          expect([page.ox, page.oy], what).toEqual([site.ox, site.oy]);
          for (const [u, v] of PLACES) {
            const [a, b] = [
              new Float32Array(DIMPLE_GROUND_SIZE),
              new Float32Array(DIMPLE_GROUND_SIZE)
            ];
            const far = dimpleHollowUniforms(site, u * w, v * h, a);
            expect(model.hollowUniforms(page, u * w, v * h, b), `${what} at ${u}, ${v}`).toBe(far);
            expect(b, `${what} at ${u}, ${v}`).toEqual(a);
          }
        }
      }
}, 60_000);

test("a page's colors are the site's, its darker end first, and a reader's own are taken as they are", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const stops = dimpleColors(P);
  expect(stops).toHaveLength(DIMPLE_STOPS);
  const settings = dimpleSettings(P, read("style=dimple").effect, 90);
  for (const hex of stops) expect(settings).toContain(`"${hex}"`);
  const site = dimpleScene(P, { angle: 90, zoom: null }, { width: 9, height: 9 });
  const page = new Function(
    `${settings}\n${dimpleModel()}\nreturn dimpleScene(90, ZOOM, 9, 9);`
  )() as { stops: number[] };
  expect(page.stops).toEqual(site.stops);
  const edited = new Function(
    `${settings.replace(`"${stops[0]}"`, '"#102030"')}\n${dimpleModel()}\nreturn dimpleScene(90, ZOOM, 9, 9);`
  )() as { stops: number[] };
  expect(edited.stops.slice(0, 3)).toEqual([16 / 255, 32 / 255, 48 / 255]);
});

test("a page's settings are its address's: the angle, the zoom, how fast the hollow follows and its frames", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=dimple&angle=137&speed=3&fps=24&zoom=2.5");
  const settings = dimpleSettings(P, effect, angle);
  expect(settings).toContain("const ANGLE = 137;");
  expect(settings).toContain("const ZOOM = 2.5;");
  expect(dimpleSettings(P, read("style=dimple").effect, 90)).toContain("const ZOOM = 1;");
  expect(settings).toContain("const SPEED = 3;");
  expect(settings).toContain("const FPS = 24;");
  expect(settings).toContain(`const EASE = ${DIMPLE_EASE_S};`);
  expect(dimpleSettings(P, read("style=dimple&speed=0").effect, 90)).toContain("const SPEED = 0;");
});

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read("style=dimple&angle=137&speed=3&fps=24&zoom=2.5");
  for (const kind of DIMPLE_SHADER_KINDS) {
    const text = dimpleShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(
      `${ORIGIN}/${SEED}?style=dimple&angle=137&speed=3&fps=24&zoom=2.5`
    );
    expect(text, kind).toContain("the dimple, the palette as a sheet of round scales");
  }
  expect(DIMPLE_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own pass, the WGSL its line for line, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=dimple");
  const glsl = dimpleShader("glsl", P, effect, angle, SEEDS[1]);
  for (const shader of [DIMPLE_VS, DIMPLE_FS]) expect(glsl).toContain(shader);
  const webgl = dimpleShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(`<script type="x-shader/x-vertex" id="dimple-vs">${DIMPLE_VS}</script>`);
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="dimple-fs">${DIMPLE_FS}</script>`
  );
  expect(dimpleShader("wgsl", P, effect, angle, SEEDS[1])).toContain(DIMPLE_WGSL);
  const webgpu = dimpleShader("webgpu", P, effect, angle, SEEDS[1]);
  expect(webgpu).toContain(`<script type="text/wgsl" id="dimple">${DIMPLE_WGSL}</script>`);
  /* opaque canvases, as the player's is */
  expect(webgl).toContain("alpha: false,");
  expect(webgpu).toContain('alphaMode: "opaque"');
  /* every uniform the player sets is one the pass declares, and the WGSL's struct is laid out as the page writes it */
  for (const name of [
    "uSize",
    "uRest",
    "uHollow",
    "uFar",
    "uLattice",
    "uBack",
    "uBowl",
    "uDisc",
    "uGround",
    "uStops"
  ])
    expect(DIMPLE_FS).toContain(` ${name}`);
  const fields = [...DIMPLE_WGSL.matchAll(/^ {2}(\w+): /gm)].map(m => m[1]);
  expect(fields).toEqual(
    Object.keys(DIMPLE_WGSL_UNIFORMS)
      .filter(k => k !== "bytes")
      .sort(
        (a, b) =>
          DIMPLE_WGSL_UNIFORMS[a as keyof typeof DIMPLE_WGSL_UNIFORMS] -
          DIMPLE_WGSL_UNIFORMS[b as keyof typeof DIMPLE_WGSL_UNIFORMS]
      )
  );
  expect(DIMPLE_WGSL_UNIFORMS.bytes % 16).toBe(0);
});

test("the pages have no clock: the hollow follows the pointer, stays where it is left, and a frame comes only as it moves", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=dimple");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = dimpleShader(kind, P, effect, angle, SEEDS[1]);
    for (const line of DIMPLE_FOLLOW.split("\n").filter(Boolean))
      expect(page, kind).toContain(line);
    expect(page, kind).toContain('addEventListener("pointermove", point');
    /* nothing asks for a frame but a hollow on its way, or a picture owed */
    expect(page.match(/requestAnimationFrame\(tick\)/g), kind).toHaveLength(2);
    expect(page, kind).toContain("if (going || moved) raf = requestAnimationFrame(tick);");
    /* off the canvas the pointer is not followed, and nothing sends the hollow back */
    expect(page, kind).toContain("if (u < 0 || u > 1 || v < 0 || v > 1) return;");
    expect(page, kind).not.toMatch(/pointerleave|pointerout|mouseleave/);
  }
});

test("every page's script is one script: no name of the dimple's is the finish's or the grain's", () => {
  /* a page's scripts share one scope, the settings', the model's and the finish's: a name declared twice stops the
     page before it draws (the model's ground once took the finish's UNDER) */
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=dimple");
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    code: string
  ) => unknown;
  for (const kind of ["webgl", "webgpu"] as const)
    for (const finish of [{}, { grain: 30 }, { soft: 40 }, { soft: 40, grain: 30 }]) {
      const page = dimpleShader(kind, P, effect, angle, SEEDS[1], ORIGIN, finish);
      const scripts = [...page.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map(
        m => m[1]
      );
      expect(scripts.length, `${kind} ${JSON.stringify(finish)}`).toBeGreaterThan(0);
      for (const code of scripts)
        expect(() => new AsyncFunction(code), `${kind} ${JSON.stringify(finish)}`).not.toThrow();
    }
});

test("a soft or grained one's texts carry the finish, its grain in the pass where it has no soft", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=dimple&grain=30");
  const grained = dimpleShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 });
  expect(grained).toContain(GRAIN_TILE_GLSL);
  expect(grained).toContain("grainOver(");
  const soft = { soft: 40, grain: 30 };
  expect(dimpleShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_GLSL_SECTIONS
  );
  expect(dimpleShader("wgsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_WGSL_SECTIONS
  );
  const webgl = dimpleShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGL_SHADERS) expect(webgl).toContain(`id="${id}"`);
  const webgpu = dimpleShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGPU_SHADERS) expect(webgpu).toContain(`id="${id}"`);
  /* a grained page's pass reads the grain's tile */
  expect(dimpleShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 })).toContain(
    "grainTile"
  );
  expect(dimpleShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 })).toContain(
    "grainTex"
  );
});
