import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { CLEAR_GROUND, type Effect, parseEffect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import {
  FINISH_GLSL_SECTIONS,
  FINISH_WEBGL_SHADERS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL_SECTIONS,
  GRAIN_TILE_GLSL
} from "./shader-finish.ts";
import { SHADER_KINDS } from "./shader-kinds.ts";
import { STRINGS_FRAME_SIZE, stringsFrameAt, stringsScene } from "./strings.ts";
import { STRINGS_FS, STRINGS_VS, stringsSceneUniforms } from "./strings-gl.ts";
import { stringsColors, stringsModel, stringsSettings } from "./strings-page.ts";
import { STRINGS_SHADER_KINDS, stringsShader } from "./strings-shader.ts";
import { STRINGS_WGSL, STRINGS_WGSL_UNIFORMS } from "./strings-wgsl.ts";
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
const TIMES = [0, 1 / 60, 7.3, 90, 179.98333333333332, 180, 3600.5];
const ORIGIN = "https://grabient.com";

type Scene = { width: number; height: number };
type Model = {
  stringsScene: (angle: number, shape: number, w: number, h: number) => Scene;
  sceneUniforms: (scene: Scene) => ReturnType<typeof stringsSceneUniforms>;
  frameAt: (scene: Scene, t: number, at: Float32Array) => void;
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number): Model =>
  new Function(
    `${stringsSettings(P, effect, angle)}\n${stringsModel()}\nreturn { stringsScene, sceneUniforms, frameAt };`
  )() as Model;

test("the pages lay the strings out and move them as the player does, to the last bit, for any palette, angle, shape and canvas", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const angle of [90, 0, 137, 300])
      for (const shape of [null, 7, 999]) {
        const P = decodePalette(seed) as Palette;
        const { effect } = read(`style=strings${shape === null ? "" : `&shape=${shape}`}`);
        const model = modelOf(P, effect, angle);
        for (const [w, h] of SIZES.filter((_, i) => (i + s) % 2 === 0 || i === 3)) {
          const site = stringsScene(P, { angle, shape, bg: null }, { width: w, height: h });
          const page = model.stringsScene(angle, shape ?? 0, w, h);
          expect(model.sceneUniforms(page), `${seed} ${w}x${h} ${angle} ${shape}`).toEqual(
            stringsSceneUniforms(site)
          );
          for (const t of TIMES) {
            const [a, b] = [
              new Float32Array(STRINGS_FRAME_SIZE),
              new Float32Array(STRINGS_FRAME_SIZE)
            ];
            stringsFrameAt(site, t, a);
            model.frameAt(page, t, b);
            expect(b, `${seed} ${w}x${h} ${angle} ${shape} t ${t}`).toEqual(a);
          }
        }
      }
}, 60_000);

test("a page's colors are the site's, and a reader's own are taken as they are", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const scene = stringsScene(P, { angle: 90, shape: null, bg: null }, { width: 9, height: 9 });
  const { ground, stops } = stringsColors(P);
  expect(ground).toBe(scene.groundHex);
  const settings = stringsSettings(P, read("style=strings").effect, 90);
  for (const hex of [ground, ...stops]) expect(settings).toContain(`"${hex}"`);
  const page = new Function(
    `${settings.replace(/const GROUND = "[^"]*";/, 'const GROUND = "#102030";')}\n${stringsModel()}\nreturn stringsScene(90, 0, 800, 400);`
  )() as { ground: number[] };
  expect(page.ground).toEqual([16 / 255, 32 / 255, 48 / 255, 1]);
});

test("a page on a ground its address names starts from it, its alpha too, and lays it out as the player does", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  for (const bg of ["#f4efe6", "#10203080", CLEAR_GROUND]) {
    const { effect, angle } = read(`style=strings&shape=7&bg=${bg.replace("#", "%23")}`);
    expect(effect.look.bg).toBe(bg);
    const settings = stringsSettings(P, effect, angle);
    const { ground, stops } = stringsColors(P, bg);
    expect(ground).toBe(bg);
    for (const hex of [ground, ...stops]) expect(settings).toContain(`"${hex}"`);
    /* the threads stand off it as the site lays them off it */
    const site = stringsScene(P, { angle, shape: 7, bg }, { width: 640, height: 360 });
    const page = modelOf(P, effect, angle).stringsScene(angle, 7, 640, 360);
    expect(modelOf(P, effect, angle).sceneUniforms(page)).toEqual(stringsSceneUniforms(site));
    /* its ground premultiplied, its alpha last */
    expect([...stringsSceneUniforms(site).ground]).toEqual([
      ...Float32Array.of(...site.ground.map(v => v * site.alpha), site.alpha)
    ]);
    for (const kind of STRINGS_SHADER_KINDS)
      expect(stringsShader(kind, P, effect, angle, SEEDS[1], ORIGIN), kind).toContain(
        `${ORIGIN}/${SEEDS[1]}?style=strings&shape=7&bg=${bg.replace("#", "%23")}`
      );
  }
  /* the pages lay their canvas premultiplied, as the player does, so a ground's alpha shows the page */
  const { effect, angle } = read("style=strings&bg=%2310203080");
  expect(stringsShader("webgl", P, effect, angle, SEEDS[1])).toContain("alpha: true,");
  expect(stringsShader("webgpu", P, effect, angle, SEEDS[1])).toContain(
    'alphaMode: "premultiplied"'
  );
  expect(stringsShader("glsl", P, effect, angle, SEEDS[1])).toContain("on #10203080");
  expect(
    stringsShader("glsl", P, read("style=strings&bg=%2300000000").effect, 90, SEEDS[1])
  ).toContain("on a clear ground");
});

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read("style=strings&angle=137&speed=3&fps=24&shape=7");
  for (const kind of STRINGS_SHADER_KINDS) {
    const text = stringsShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(
      `${ORIGIN}/${SEED}?style=strings&angle=137&speed=3&fps=24&shape=7`
    );
    expect(text, kind).toContain("the strings, the palette as threads");
  }
  expect(STRINGS_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own pass, the WGSL its line for line, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=strings");
  const glsl = stringsShader("glsl", P, effect, angle, SEEDS[1]);
  for (const shader of [STRINGS_VS, STRINGS_FS]) expect(glsl).toContain(shader);
  const webgl = stringsShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(
    `<script type="x-shader/x-vertex" id="strings-vs">${STRINGS_VS}</script>`
  );
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="strings-fs">${STRINGS_FS}</script>`
  );
  expect(stringsShader("wgsl", P, effect, angle, SEEDS[1])).toContain(STRINGS_WGSL);
  expect(stringsShader("webgpu", P, effect, angle, SEEDS[1])).toContain(
    `<script type="text/wgsl" id="strings">${STRINGS_WGSL}</script>`
  );
  /* every uniform the player sets is one the pass declares, and the WGSL's struct is laid out as the page writes it */
  for (const name of [
    "uField",
    "uShear",
    "uWave",
    "uLump",
    "uPhase",
    "uLine",
    "uBlob",
    "uGround",
    "uStops"
  ])
    expect(STRINGS_FS).toContain(` ${name}`);
  const fields = [...STRINGS_WGSL.matchAll(/^ {2}(\w+): /gm)].map(m => m[1]);
  expect(fields).toEqual(
    Object.keys(STRINGS_WGSL_UNIFORMS)
      .filter(k => k !== "bytes")
      .sort(
        (a, b) =>
          STRINGS_WGSL_UNIFORMS[a as keyof typeof STRINGS_WGSL_UNIFORMS] -
          STRINGS_WGSL_UNIFORMS[b as keyof typeof STRINGS_WGSL_UNIFORMS]
      )
  );
});

test("a soft or grained one's texts carry the finish, its grain in the pass where it has no soft", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=strings&grain=30");
  const grained = stringsShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 });
  expect(grained).toContain(GRAIN_TILE_GLSL);
  expect(grained).toContain("grainOver(");
  const soft = { soft: 40, grain: 30 };
  expect(stringsShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_GLSL_SECTIONS
  );
  expect(stringsShader("wgsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_WGSL_SECTIONS
  );
  const webgl = stringsShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGL_SHADERS) expect(webgl).toContain(`id="${id}"`);
  const webgpu = stringsShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGPU_SHADERS) expect(webgpu).toContain(`id="${id}"`);
});
