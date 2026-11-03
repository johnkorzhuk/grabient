import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import {
  EFFECT_EASE_S,
  EFFECT_PIXELS_MAX,
  EFFECT_SETTLE_MS,
  type Effect,
  parseEffect
} from "./effect.ts";
import { shadertoyPass } from "./fx-shadertoy.ts";
import type { Palette } from "./palette.ts";
import { SHADER_KINDS } from "./shader-kinds.ts";
import { MAX_FOLDS, SILK_LOOP, silkScene } from "./silk.ts";
import {
  bandUniforms,
  colorTexels,
  foldUniforms,
  profileTexels,
  SILK_FS,
  SILK_VS,
  sceneUniforms
} from "./silk-gl.ts";
import { silkModel, silkSettings } from "./silk-page.ts";
import { SILK_SHADER_KINDS, silkShader } from "./silk-shader.ts";
import { halfOf } from "./silk-shadertoy.ts";
import { SILK_WGSL } from "./silk-wgsl.ts";
import { parseView } from "./view.ts";

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
  [20, 20],
  [83, 61],
  [333, 777],
  [390, 844],
  [500, 500],
  [800, 400],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160]
];
const ORIGIN = "https://grabient.com";

type Model = {
  silkScene: (angle: number, shape: number, w: number, h: number) => unknown;
  sceneUniforms: (scene: unknown, S: Float32Array) => void;
  bandUniforms: (scene: unknown, G: Float32Array) => void;
  foldUniforms: (scene: unknown, t: number, F: Float32Array) => void;
  colorTexels: () => Uint8Array;
  profileTexels: () => Float32Array;
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number): Model =>
  new Function(
    `${silkSettings(P, effect, angle)}\n${silkModel()}\nreturn { silkScene, sceneUniforms, bandUniforms, foldUniforms, colorTexels, profileTexels };`
  )() as Model;

test("the pages lay the silk out as the player does, to the last bit, for any palette, angle, shape and canvas", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const angle of [90, 0, 45, 137, 300])
      for (const shape of [null, 7, 500, 999]) {
        const P = decodePalette(seed) as Palette;
        const { effect } = read(`style=silk${shape === null ? "" : `&shape=${shape}`}`);
        const model = modelOf(P, effect, angle);
        expect(model.colorTexels()).toEqual(
          colorTexels(silkScene(P, { angle, shape }, { width: 9, height: 9 }))
        );
        expect(model.profileTexels()).toEqual(
          profileTexels(silkScene(P, { angle, shape }, { width: 9, height: 9 }))
        );
        for (const [w, h] of SIZES.filter(([w], i) => (i + s) % 3 === 0 || w === 1920)) {
          const site = silkScene(P, { angle, shape }, { width: w, height: h });
          const page = model.silkScene(angle, shape ?? 0, w, h);
          const [S1, S2] = [new Float32Array(4), new Float32Array(4)];
          sceneUniforms(site, S1);
          model.sceneUniforms(page, S2);
          expect(S2, `${seed} ${w}x${h} ${angle} ${shape}`).toEqual(S1);
          const [G1, G2] = [new Float32Array(2 * MAX_FOLDS), new Float32Array(2 * MAX_FOLDS)];
          bandUniforms(site, G1);
          model.bandUniforms(page, G2);
          expect(G2).toEqual(G1);
          for (const t of [
            0,
            1 / 60,
            0.4,
            1.6,
            7.3,
            120,
            SILK_LOOP - 1 / 60,
            SILK_LOOP + 0.25,
            3600.5
          ]) {
            const [F1, F2] = [new Float32Array(4 * MAX_FOLDS), new Float32Array(4 * MAX_FOLDS)];
            foldUniforms(site, t, F1);
            model.foldUniforms(page, t, F2);
            expect(F2, `${seed} ${w}x${h} ${angle} ${shape} t ${t}`).toEqual(F1);
          }
        }
      }
}, 60_000);

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read("style=silk&angle=137&speed=3&fps=24&shape=7");
  for (const kind of SILK_SHADER_KINDS) {
    const text = silkShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(`${ORIGIN}/${SEED}?style=silk&angle=137&speed=3&fps=24&shape=7`);
    expect(text, kind).toContain("the silk, the palette dyed into folded cloth");
  }
  expect(SILK_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=silk");
  const glsl = silkShader("glsl", P, effect, angle, SEEDS[1]);
  expect(glsl).toContain(SILK_VS);
  expect(glsl).toContain(SILK_FS);
  const webgl = silkShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(`<script type="x-shader/x-vertex" id="silk-vs">${SILK_VS}</script>`);
  expect(webgl).toContain(`<script type="x-shader/x-fragment" id="silk-fs">${SILK_FS}</script>`);
  const wgsl = silkShader("wgsl", P, effect, angle, SEEDS[1]);
  const webgpu = silkShader("webgpu", P, effect, angle, SEEDS[1]);
  for (const [id, module] of Object.entries(SILK_WGSL)) {
    expect(wgsl).toContain(module);
    expect(webgpu).toContain(`<script type="text/wgsl" id="${id}">${module}</script>`);
  }
});

test("nothing in a page's shaders or code could end its script element", () => {
  const P = decodePalette(SEEDS[4]) as Palette;
  const { effect, angle } = read("style=silk&shape=999");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = silkShader(kind, P, effect, angle, SEEDS[4], ORIGIN);
    const inner = page.slice(page.indexOf("<body>"), page.lastIndexOf("</body>"));
    expect(inner.match(/<\/script/g)?.length).toBe(inner.match(/<script/g)?.length);
  }
});

test("a page's settings are its first script, and it plays by the players' clock and numbers", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=silk&angle=45&speed=0.5&fps=120&shape=12");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = silkShader(kind, P, effect, angle, SEEDS[0]);
    const code = page.slice(page.lastIndexOf("<script"));
    expect(code).toMatch(/^<script[^>]*>\n\/\/ The palette's 32 colors/);
    for (const line of [
      "const ANGLE = 45;",
      "const SHAPE = 12;",
      "const SPEED = 0.5;",
      "const FPS = 120;",
      `const EASE = ${EFFECT_EASE_S};`,
      `const PIXELS_MAX = ${EFFECT_PIXELS_MAX};`,
      `laidOut ? ${EFFECT_SETTLE_MS} : 0`,
      'const reduced = matchMedia("(prefers-reduced-motion: reduce)");'
    ])
      expect(code, `${kind} ${line}`).toContain(line);
    expect(code).toContain(kind === "webgl" ? "webglcontextrestored" : "one.lost.then");
    expect(code).toContain(kind === "webgl" ? "needs WebGL 2" : "needs WebGPU");
  }
});

test("the WebGPU page rounds the profiles to half floats as the browser rounds the player's texture", () => {
  const page = silkShader(
    "webgpu",
    decodePalette(SEEDS[0]) as Palette,
    read("style=silk").effect,
    90,
    SEEDS[0]
  );
  const source = /function halves\(values\) \{[\s\S]*?\n\}/.exec(page)?.[0];
  const halves = new Function(`${source}\nreturn halves;`)() as (
    v: ArrayLike<number>
  ) => Uint16Array;
  const values = [
    0,
    1,
    0.5,
    1 / 3,
    0.8,
    2 ** -14,
    2 ** -15,
    3e-5,
    0.000123,
    65504,
    70000,
    0.0039215686,
    0.1
  ];
  const bits = halves(Float32Array.from(values));
  const back = (h: number) => {
    const e = (h >>> 10) & 31;
    const m = h & 1023;
    return e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15);
  };
  values.forEach((v, i) => {
    expect(back(bits[i]), String(v)).toBe(halfOf(v));
  });
  /* ties to even: 1 + 2^-11 lies halfway between 1 and the next half float, and rounds down to 1 */
  expect(halfOf(1 + 2 ** -11)).toBe(1);
  expect(halfOf(1 + 3 * 2 ** -11)).toBe(1 + 2 ** -9);
});

test("the Shadertoy text is Shadertoy's tabs in order, the player's own shader in its frame", () => {
  const P = decodePalette(SEEDS[2]) as Palette;
  const { effect, angle } = read("style=silk&angle=300&speed=3&fps=24&shape=999");
  const text = silkShader("shadertoy", P, effect, angle, SEEDS[2], ORIGIN);
  const tabs = [...text.matchAll(/^\/\/ ==== (.+?) ====/gm)].map(m => m[1]);
  expect(tabs).toEqual(["Common", "Buffer A", "Buffer B", "Image"]);
  expect(text).toMatch(
    /\/\/ ==== Common ====\n.*\nconst float SPEED = 3\.0;.*\nconst float FPS = 24\.0;/
  );
  expect(text).toContain(shadertoyPass(SILK_FS, { samplers: ["T", "S"] }));
  /* the player's main, as it is */
  const body = SILK_FS.slice(SILK_FS.indexOf("void main()") + "void main()".length).replace(
    /gl_FragCoord/g,
    "fragPlace"
  );
  expect(text).toContain(
    body.replace("textureLod(S, ", "lookup(1, ").replace(/textureLod\(T, /g, "lookup(0, ")
  );
});
