import { expect, test } from "vitest";
import { AURORA_LOOP, auroraScene, auroraStops, auroraTiles, auroraTime } from "./aurora.ts";
import { AURORA_FS, AURORA_VS, auroraSceneUniforms, auroraTable } from "./aurora-gl.ts";
import { auroraColors, auroraModel, auroraSettings } from "./aurora-page.ts";
import { AURORA_DESIGNED_PATH } from "./aurora-path.ts";
import { auroraMadePath } from "./aurora-path-kinds.ts";
import { AURORA_SHADER_KINDS, auroraShader } from "./aurora-shader.ts";
import { AURORA_WGSL, AURORA_WGSL_UNIFORMS } from "./aurora-wgsl.ts";
import { decodePalette } from "./codec.ts";
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
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kWKxfe1GRDVfIxNzPsjbDZKA",
  "kQTIPV6CvNg",
  "kW4ihe8xe522aOLnGjnaI05o"
];
const WALLED = "line,0:30,20:30,20:55,35:55,35:38,100:38";
const MIXED = "line,25,25,curve,45,60,45,25,line,25,40,25";
const PATHS = [null, WALLED, MIXED, "curve,30,55,35,60,30", auroraMadePath("skyline", 3)];
const SIZES: [number, number][] = [
  [1, 1],
  [83, 61],
  [390, 844],
  [1050, 590],
  [1920, 1080]
];
const TIMES = [0, 1 / 60, 7.3, 24, 47.98333333333333, 48, 3600.5];
const ORIGIN = "https://grabient.com";

type Scene = ReturnType<typeof auroraScene>;
type Model = {
  auroraScene: (angle: number, shape: number, w: number, h: number) => Scene;
  auroraTableOf: (scene: Scene) => Float32Array;
  sceneUniforms: (scene: Scene) => ReturnType<typeof auroraSceneUniforms>;
  auroraTiles: () => { noise: Uint8Array; soft: Uint8Array };
  auroraTime: (t: number) => number;
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number, edit = (s: string) => s): Model =>
  new Function(
    `${edit(auroraSettings(P, effect, angle))}\n${auroraModel()}\nreturn { auroraScene, auroraTableOf, sceneUniforms, auroraTiles, auroraTime };`
  )() as Model;
const addressOf = (shape: number | null, path: string | null, bg: string | null) =>
  `style=aurora${shape === null ? "" : `&shape=${shape}`}${path === null ? "" : `&path=${path}`}${bg === null ? "" : `&bg=${bg.replace("#", "%23")}`}`;

test("the pages make the noise the player reads, to the byte", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const page = modelOf(P, read("style=aurora").effect, 90).auroraTiles();
  const site = auroraTiles();
  expect(Buffer.compare(Buffer.from(page.noise), Buffer.from(site.noise))).toBe(0);
  expect(Buffer.compare(Buffer.from(page.soft), Buffer.from(site.soft))).toBe(0);
});

test("the pages lay the aurora out as the player does, to the last bit, for any palette, path, range, angle, shape and canvas", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const [p, path] of PATHS.entries())
      for (const bg of [null, "#102030", "#10203080"].filter((_, i) => (i + s + p) % 2 === 0))
        for (const angle of [90, 0, 137, 300].filter((_, i) => (i + p) % 2 === 0))
          for (const shape of [null, 7, 417, 999]) {
            const P = decodePalette(seed) as Palette;
            const { effect } = read(addressOf(shape, path, bg));
            expect([effect.look.shape, effect.look.path, effect.look.bg]).toEqual([
              shape,
              path,
              bg
            ]);
            const model = modelOf(P, effect, angle);
            for (const [w, h] of SIZES.filter((_, i) => (i + s + p) % 2 === 0 || i === 3)) {
              const site = auroraScene(P, { angle, shape, path, bg }, { width: w, height: h });
              const page = model.auroraScene(angle, shape ?? 0, w, h);
              const named = `${seed} ${path} ${bg} ${w}x${h} ${angle} ${shape}`;
              expect(model.sceneUniforms(page), named).toEqual(auroraSceneUniforms(site));
              expect(model.auroraTableOf(page), named).toEqual(auroraTable(site));
            }
          }
}, 120_000);

test("a page's loop is the player's: the share of it at any time", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const model = modelOf(P, read("style=aurora").effect, 90);
  for (const t of [...TIMES, -12, AURORA_LOOP * 7.25])
    expect(model.auroraTime(t)).toBe(auroraTime(t));
});

test("a page's colors are the site's, and a reader's own are taken as they are", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const stops = auroraColors(P);
  expect(stops).toHaveLength(auroraStops(P).length);
  const settings = auroraSettings(P, read("style=aurora").effect, 90);
  for (const hex of stops) expect(settings).toContain(`"${hex}"`);
  /* a stop edited is the ramp's: the darkest end of this palette is its first stop, the ramp's first color */
  const edited = modelOf(P, read("style=aurora").effect, 90, s =>
    s.replace(`"${stops[0]}"`, '"#102030"')
  ).auroraScene(90, 0, 9, 9);
  const site = auroraScene(
    P,
    { angle: 90, shape: null, path: null, bg: null },
    { width: 9, height: 9 }
  );
  expect(edited.ramp).not.toEqual(site.ramp);
  /* a range of the reader's own, and one that lets the page through */
  for (const range of ['"#102030"', '"#10203080"']) {
    const page = modelOf(P, read("style=aurora").effect, 90, s =>
      s.replace("const RANGE = null;", `const RANGE = ${range};`)
    );
    const bg = JSON.parse(range) as string;
    expect(page.sceneUniforms(page.auroraScene(90, 0, 9, 9))).toEqual(
      auroraSceneUniforms(
        auroraScene(P, { angle: 90, shape: null, path: null, bg }, { width: 9, height: 9 })
      )
    );
  }
  /* a path of the reader's own, in any spelling the address reads, and what is no path draws the designed range */
  for (const [written, path] of [
    ["line,33.0,33", "line,33,33"],
    [WALLED, WALLED],
    ["mountains", null]
  ] as const) {
    const page = modelOf(P, read("style=aurora").effect, 90, s =>
      s.replace(`const PATH = "${AURORA_DESIGNED_PATH}";`, `const PATH = "${written}";`)
    );
    expect(page.auroraTableOf(page.auroraScene(90, 0, 320, 180)), written).toEqual(
      auroraTable(
        auroraScene(P, { angle: 90, shape: null, path, bg: null }, { width: 320, height: 180 })
      )
    );
  }
});

test("a page's settings are its address's: the palette, the range, its path, the angle, the shape, the speed and the frames", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read(
    `style=aurora&angle=137&speed=3&fps=24&shape=417&path=${WALLED}&bg=%2310203080`
  );
  const settings = auroraSettings(P, effect, angle);
  for (const line of [
    "const ANGLE = 137;",
    "const SHAPE = 417;",
    "const SPEED = 3;",
    "const FPS = 24;",
    `const PATH = "${WALLED}";`,
    'const RANGE = "#10203080";'
  ])
    expect(settings).toContain(line);
  /* as designed: the designed range written out, so a reader sees and edits its heights, and a clear range */
  const designed = auroraSettings(P, read("style=aurora").effect, 90);
  for (const line of [
    "const ANGLE = 90;",
    "const SHAPE = 0;",
    `const PATH = "${AURORA_DESIGNED_PATH}";`,
    "const RANGE = null;"
  ])
    expect(designed).toContain(line);
});

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read(`style=aurora&angle=137&speed=3&fps=24&shape=7&path=${MIXED}`);
  for (const kind of AURORA_SHADER_KINDS) {
    const text = auroraShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(
      `${ORIGIN}/${SEED}?style=aurora&angle=137&speed=3&fps=24&shape=7&path=${MIXED}`
    );
    expect(text, kind).toContain("the aurora, the palette as light rising behind a clear range");
  }
  expect(auroraShader("glsl", P, read("style=aurora&bg=%23102030").effect, 90, SEED)).toContain(
    "behind a range of #102030"
  );
  expect(AURORA_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own pass, the WGSL its line for line, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=aurora");
  const glsl = auroraShader("glsl", P, effect, angle, SEEDS[1]);
  for (const shader of [AURORA_VS, AURORA_FS]) expect(glsl).toContain(shader);
  const webgl = auroraShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(`<script type="x-shader/x-vertex" id="aurora-vs">${AURORA_VS}</script>`);
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="aurora-fs">${AURORA_FS}</script>`
  );
  expect(auroraShader("wgsl", P, effect, angle, SEEDS[1])).toContain(AURORA_WGSL);
  expect(auroraShader("webgpu", P, effect, angle, SEEDS[1])).toContain(
    `<script type="text/wgsl" id="aurora">${AURORA_WGSL}</script>`
  );
  /* the pages lay their canvas premultiplied, as the player does, so a range's alpha shows the page */
  expect(webgl).toContain("alpha: true,");
  expect(auroraShader("webgpu", P, effect, angle, SEEDS[1])).toContain(
    'alphaMode: "premultiplied"'
  );
  /* every uniform the player sets is one the pass declares, and the WGSL's struct is laid out as the page writes it */
  for (const name of ["uSize", "uFrame", "uPath", "uRange", "uFan", "uSheets", "uTime"])
    expect(AURORA_FS).toContain(` ${name}`);
  const fields = [...AURORA_WGSL.matchAll(/^ {2}(\w+): /gm)].map(m => m[1]);
  expect(fields).toEqual(
    Object.keys(AURORA_WGSL_UNIFORMS)
      .filter(k => k !== "bytes")
      .sort(
        (a, b) =>
          AURORA_WGSL_UNIFORMS[a as keyof typeof AURORA_WGSL_UNIFORMS] -
          AURORA_WGSL_UNIFORMS[b as keyof typeof AURORA_WGSL_UNIFORMS]
      )
  );
  /* the WGSL reads every sheet and the table's rows the GLSL reads, the same sums */
  for (let k = 0; k < 6; k++) expect(AURORA_WGSL).toContain(`A.sheets[${k}]`);
  expect(AURORA_WGSL.match(/textureSampleLevel\(/g)?.length).toBe(
    AURORA_FS.match(/texture\(/g)?.length
  );
});

test("every page's script is one script: no name of the aurora's is the finish's or the grain's", () => {
  /* a page's scripts share one scope, the settings', the model's and the finish's: a name declared twice stops the
     page before it draws */
  const P = decodePalette(SEEDS[1]) as Palette;
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    code: string
  ) => unknown;
  for (const kind of ["webgl", "webgpu"] as const)
    for (const finish of [{}, { grain: 30 }, { soft: 40 }, { soft: 40, grain: 30 }]) {
      const { effect, angle } = read(`style=aurora&path=${WALLED}&bg=%2310203080`);
      const page = auroraShader(kind, P, effect, angle, SEEDS[1], ORIGIN, finish);
      const scripts = [...page.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map(
        m => m[1]
      );
      expect(scripts.length, `${kind} ${JSON.stringify(finish)}`).toBe(1);
      for (const code of scripts)
        expect(() => new AsyncFunction(code), `${kind} ${JSON.stringify(finish)}`).not.toThrow();
    }
});

test("a soft or grained one's texts carry the finish, its grain in the pass where it has no soft", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=aurora&grain=30");
  const grained = auroraShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 });
  expect(grained).toContain(GRAIN_TILE_GLSL);
  expect(grained).toContain("grainOver(");
  const soft = { soft: 40, grain: 30 };
  expect(auroraShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_GLSL_SECTIONS
  );
  expect(auroraShader("wgsl", P, effect, angle, SEEDS[1], ORIGIN, soft)).toContain(
    FINISH_WGSL_SECTIONS
  );
  const webgl = auroraShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGL_SHADERS) expect(webgl).toContain(`id="${id}"`);
  const webgpu = auroraShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, soft);
  for (const [id] of FINISH_WEBGPU_SHADERS) expect(webgpu).toContain(`id="${id}"`);
  /* a grained page's pass reads the grain's tile, on a unit and a binding of its own past the aurora's */
  const grainedWebgl = auroraShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 });
  expect(grainedWebgl).toContain("gl.uniform1i(U.grainTile, 3);");
  const grainedWebgpu = auroraShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, { grain: 30 });
  expect(grainedWebgpu).toContain("{ binding: 5, resource: grainTex.createView() }");
  expect(grainedWebgpu).toContain("@group(0) @binding(5) var grainTile");
});
