import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { compile, evaluate, registersOf } from "./double-program.ts";
import {
  EFFECT_EASE_S,
  EFFECT_PIXELS_MAX,
  EFFECT_SETTLE_MS,
  type Effect,
  parseEffect
} from "./effect.ts";
import { effectUnderlay } from "./fx-finish.ts";
import { FX_BUFFER_C, FX_BUFFER_D, glslFloat, shadertoyPass } from "./fx-shadertoy.ts";
import type { Palette } from "./palette.ts";
import {
  PAPERCUT_BUMP,
  PAPERCUT_LOOP,
  PAPERCUT_MAX_BUMPS,
  PAPERCUT_MAX_SHEETS,
  papercutFrameSize,
  papercutScene
} from "./papercut.ts";
import {
  PAPERCUT_FIELD,
  PAPERCUT_FIELD_FS,
  PAPERCUT_SHADE_FS,
  PAPERCUT_VS,
  papercutFieldSize,
  papercutFrameUniforms,
  papercutSceneUniforms
} from "./papercut-gl.ts";
import { papercutModel, papercutSettings, papercutSheetHexes } from "./papercut-page.ts";
import { PAPERCUT_SHADER_KINDS, papercutShader } from "./papercut-shader.ts";
import { papercutClock, papercutLayout } from "./papercut-shadertoy.ts";
import {
  PAPERCUT_FIELD_UNIFORMS,
  PAPERCUT_FIELD_WGSL,
  PAPERCUT_SHADE_UNIFORMS,
  PAPERCUT_SHADE_WGSL
} from "./papercut-wgsl.ts";
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
/* 1050 by 590 and 590 by 1050: a longer side an odd ten, where the drop shadows' offsets fall on a tie the doubles
   decide */
const SIZES: [number, number][] = [
  [1, 1],
  [20, 20],
  [83, 61],
  [333, 777],
  [390, 844],
  [500, 500],
  [800, 400],
  [1050, 590],
  [590, 1050],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160]
];
const TIMES = [0, 1 / 60, 0.4, 1.6, 7.3, 90, 179.98333333333332, 180, 180.25, 3600.5];
const ORIGIN = "https://grabient.com";

type Scene = { width: number; height: number };
type Uniforms = Record<"level" | "face" | "wall" | "shadow" | "sheet" | "reach", Float32Array> & {
  misc: [number, number];
};
type Model = {
  papercutScene: (angle: number, shape: number, w: number, h: number) => Scene;
  sceneUniforms: (scene: Scene) => Uniforms;
  frameUniforms: (
    scene: Scene,
    t: number,
    at: Float32Array,
    bump: Float32Array,
    rest: Float32Array
  ) => void;
  fieldSize: (scene: Scene) => { w: number; h: number };
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (P: Palette, effect: Effect, angle: number): Model =>
  new Function(
    `${papercutSettings(P, effect, angle)}\n${papercutModel()}\nreturn { papercutScene, sceneUniforms, frameUniforms, fieldSize };`
  )() as Model;

test("the papercut's five texts are as the shader lab checked them, for four palettes and looks", () => {
  const { origin, entries } = golden<{
    origin: string;
    entries: { id: string; seed: string; address: string; texts: Record<ShaderKind, string> }[];
  }>("papercut-shaders");
  expect(entries.length).toBe(4);
  for (const e of entries) {
    const { effect, angle } = read(e.address);
    for (const kind of PAPERCUT_SHADER_KINDS)
      expect(
        papercutShader(kind, decodePalette(e.seed) as Palette, effect, angle, e.seed, origin),
        `${e.id} ${kind}`
      ).toBe(e.texts[kind]);
  }
});

test("the pages lay the papercut out and move it as the player does, to the last bit, for any palette, angle, shape and canvas", () => {
  for (const [s, seed] of SEEDS.entries())
    for (const angle of [90, 0, 45, 137, 300])
      for (const shape of [null, 7, 42, 999]) {
        const P = decodePalette(seed) as Palette;
        const { effect } = read(`style=papercut${shape === null ? "" : `&shape=${shape}`}`);
        const model = modelOf(P, effect, angle);
        for (const [w, h] of SIZES.filter((_, i) => (i + s) % 3 === 0 || i === 7)) {
          const site = papercutScene(P, { angle, shape }, { width: w, height: h });
          const page = model.papercutScene(angle, shape ?? 0, w, h);
          const a = papercutSceneUniforms(site);
          const b = model.sceneUniforms(page);
          for (const k of ["level", "face", "wall", "shadow", "sheet", "reach"] as const)
            expect(b[k], `${seed} ${w}x${h} ${angle} ${shape} ${k}`).toEqual(a[k]);
          expect(Float32Array.from(b.misc)).toEqual(Float32Array.from(a.misc));
          expect(model.fieldSize(page)).toEqual(papercutFieldSize(site));
          for (const t of TIMES) {
            const [at1, at2] = [new Float32Array(papercutFrameSize(site)), new Float32Array(30)];
            const [b1, b2] = [
              new Float32Array(4 * PAPERCUT_MAX_BUMPS),
              new Float32Array(4 * PAPERCUT_MAX_BUMPS)
            ];
            const [r1, r2] = [new Float32Array(6), new Float32Array(6)];
            papercutFrameUniforms(site, t, at1, b1, r1);
            model.frameUniforms(page, t, at2, b2, r2);
            expect(b2, `${seed} ${w}x${h} ${angle} ${shape} t ${t}`).toEqual(b1);
            expect(r2, `${seed} ${w}x${h} ${angle} ${shape} t ${t}`).toEqual(r1);
          }
        }
      }
}, 60_000);

test("a page's sheets are the palette's colors the site cuts, and each one's cut and shadow come from its own", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const scene = papercutScene(P, { angle: 90, shape: null }, { width: 9, height: 9 });
  expect(papercutSheetHexes(P)).toEqual(scene.hex);
  const settings = papercutSettings(P, read("style=papercut").effect, 90);
  for (const hex of scene.hex) expect(settings).toContain(`"${hex}"`);
  /* a reader's own sheets: their cuts and shadows worked out from them, as the site would from those colors */
  const own = ["#102030", "#405060", "#7080a0", "#c0d0e0", "#ffe0a0"];
  const page = new Function(
    `${settings.replace(/const SHEETS = \[[^\]]*\];/, `const SHEETS = ${JSON.stringify(own)};`)}\n${papercutModel()}\nreturn papercutScene(90, 0, 800, 400);`
  )() as { n: number; face: number[] };
  expect(page.n).toBe(own.length);
  expect(page.face.slice(0, 3)).toEqual([16 / 255, 32 / 255, 48 / 255]);
});

test("the Shadertoy text works the canvas's shadows out as the player's doubles do, to the last bit, odd tens and all", () => {
  const program = compile(papercutLayout());
  const P = decodePalette(SEEDS[0]) as Palette;
  const reg = (name: string) => program.pinned.get(name) as number;
  for (let side = 1; side <= 4000; side += side < 200 ? 1 : 7)
    for (const [w, h] of [
      [side, Math.max(1, Math.round(side / 2))],
      [Math.max(1, Math.round(side * 0.6)), side]
    ]) {
      const R = evaluate(program, registersOf(program, { W: w, H: h }));
      const u = papercutSceneUniforms(
        papercutScene(P, { angle: 90, shape: null }, { width: w, height: h })
      );
      const at = `${w}x${h}`;
      expect(R[reg("D")], at).toBe(Math.fround(0.75 * Math.max(w, h)));
      /* sheet 1 is thin, sheet 4 thick */
      expect([R[reg("thinIsigma")], R[reg("thinOffset")], R[reg("thinReach")]], at).toEqual([
        u.sheet[4],
        u.sheet[5],
        u.reach[1]
      ]);
      expect([R[reg("thickIsigma")], R[reg("thickOffset")], R[reg("thickReach")]], at).toEqual([
        u.sheet[16],
        u.sheet[17],
        u.reach[4]
      ]);
      expect([R[reg("icsigma")], R[reg("wall")]], at).toEqual([u.sheet[7], Math.fround(u.misc[1])]);
    }
  /* and the loop's own seconds at the time drawn, as papercutFrameAt takes them: a first frame draws the clock's time
     as it stands */
  const clock = compile(papercutClock());
  for (const t of [0, 0.4, 179.99999999999997, 180, 359.5, 3600.25, 12345.678]) {
    const R = evaluate(
      clock,
      registersOf(clock, { t, first: 1, changed: 1, speed100: 100, ease100: 160, fps: 60 })
    );
    expect(R[clock.pinned.get("loopT") as number], String(t)).toBe(
      t - PAPERCUT_LOOP * Math.floor(t / PAPERCUT_LOOP)
    );
  }
});

test("each text credits the seed, the effect's address and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  const { effect, angle } = read("style=papercut&angle=137&speed=3&fps=24&shape=7");
  for (const kind of PAPERCUT_SHADER_KINDS) {
    const text = papercutShader(kind, P, effect, angle, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(
      `${ORIGIN}/${SEED}?style=papercut&angle=137&speed=3&fps=24&shape=7`
    );
    expect(text, kind).toContain("the papercut, the palette cut into sheets of paper");
  }
  expect(PAPERCUT_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
});

test("the GLSL is the player's own two passes, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=papercut");
  const glsl = papercutShader("glsl", P, effect, angle, SEEDS[1]);
  for (const shader of [PAPERCUT_VS, PAPERCUT_FIELD_FS, PAPERCUT_SHADE_FS])
    expect(glsl).toContain(shader);
  const webgl = papercutShader("webgl", P, effect, angle, SEEDS[1]);
  expect(webgl).toContain(
    `<script type="x-shader/x-vertex" id="papercut-vs">${PAPERCUT_VS}</script>`
  );
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="papercut-field-fs">${PAPERCUT_FIELD_FS}</script>`
  );
  expect(webgl).toContain(
    `<script type="x-shader/x-fragment" id="papercut-shade-fs">${PAPERCUT_SHADE_FS}</script>`
  );
  const wgsl = papercutShader("wgsl", P, effect, angle, SEEDS[1]);
  const webgpu = papercutShader("webgpu", P, effect, angle, SEEDS[1]);
  for (const module of [PAPERCUT_FIELD_WGSL, PAPERCUT_SHADE_WGSL]) expect(wgsl).toContain(module);
  expect(webgpu).toContain(
    `<script type="text/wgsl" id="papercut-field">${PAPERCUT_FIELD_WGSL}</script>`
  );
  expect(webgpu).toContain(
    `<script type="text/wgsl" id="papercut-shade">${PAPERCUT_SHADE_WGSL}</script>`
  );
  /* the field as each float's bits, the sheets straight onto the canvas, as the player draws them */
  expect(webgl).toContain(
    "gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, tw, th, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);"
  );
  expect(webgl).toContain("gl.bindFramebuffer(gl.FRAMEBUFFER, null);\n    gl.useProgram(pShade);");
  expect(webgpu).toContain('pField = pipeline("papercut-field", "rgba32uint");');
  expect(webgpu).toContain('pShade = pipeline("papercut-shade", format);');
});

/* a uniform struct's members' offsets and its bytes, by WGSL's memory layout rules for the types the papercut's structs
   use: a scalar on 4 bytes, a vec2 on 8, a vec4 on 16, an array of vec4s 16 bytes an element, the struct rounded up to
   its largest member's alignment; any other member throws */
const uniformLayout = (wgsl: string, name: string) => {
  const body = wgsl.match(new RegExp(`^struct ${name} \\{\\n([^}]*)\\n\\}`, "m"))?.[1];
  if (!body) throw new Error(`no struct ${name}`);
  const SIZES: Record<string, number> = {
    f32: 4,
    i32: 4,
    u32: 4,
    vec2f: 8,
    vec2i: 8,
    vec4f: 16,
    vec4i: 16
  };
  const offsets: Record<string, number> = {};
  let end = 0;
  let align = 0;
  for (const line of body.split("\n")) {
    const [, member, type] = line.match(/^ {2}(\w+): (array<[^>]+>|\w+),/) ?? [];
    const array = type?.match(/^array<vec4[fiu], ([1-9]\d*)>$/);
    const [size, alignment] = array
      ? [16 * Number(array[1]), 16]
      : [SIZES[type ?? ""], SIZES[type ?? ""]];
    if (!member || !size || !alignment) throw new Error(`not a member this layout knows: ${line}`);
    end = Math.ceil(end / alignment) * alignment;
    offsets[member] = end;
    end += size;
    align = Math.max(align, alignment);
  }
  return { offsets, bytes: Math.ceil(end / align) * align };
};

test("the WebGPU page writes each uniform where WGSL lays it out in the passes' structs", () => {
  const field = uniformLayout(PAPERCUT_FIELD_WGSL, "Field");
  const shade = uniformLayout(PAPERCUT_SHADE_WGSL, "Shade");
  const { bytes: fieldBytes, ...fieldAt } = PAPERCUT_FIELD_UNIFORMS;
  const { bytes: shadeBytes, ...shadeAt } = PAPERCUT_SHADE_UNIFORMS;
  expect(fieldAt).toEqual(field.offsets);
  expect(fieldBytes).toBe(field.bytes);
  expect(shadeAt).toEqual(shade.offsets);
  expect(shadeBytes).toBe(shade.bytes);
  /* a hill is one vector of the field's array, as the page's frame writes the hills; the page writes the canvas and D
     as three floats from each block's start */
  expect(PAPERCUT_BUMP).toBe(4);
  for (const { offsets } of [field, shade]) expect([offsets.size, offsets.D]).toEqual([0, 8]);
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=papercut&angle=45&shape=7");
  for (const finish of [
    {},
    { grain: 30 },
    { soft: 40, underlay: effectUnderlay(P, effect, angle, 40) }
  ]) {
    const page = papercutShader("webgpu", P, effect, angle, SEEDS[0], ORIGIN, finish);
    for (const line of [
      `fieldBuffer = gpu.createBuffer({ size: ${field.bytes},`,
      `shadeBuffer = gpu.createBuffer({ size: ${shade.bytes},`,
      `const fieldBlock = new ArrayBuffer(${field.bytes});`,
      `const shadeBlock = new ArrayBuffer(${shade.bytes});`,
      `const FN = new Int32Array(fieldBlock, ${field.offsets.bumps}, 1);`,
      `const SN = new Int32Array(shadeBlock, ${shade.offsets.sheets}, 1);`,
      "FU.set([scene.width, scene.height, scene.D]);",
      "SU.set([scene.width, scene.height, scene.D]);",
      `FU.set([scene.rx, scene.ry], ${field.offsets.ramp / 4});`,
      `FU.set([scene.wa, scene.wf, scene.wa2, scene.wf2], ${field.offsets.warp / 4});`,
      `FU.set(rest.subarray(0, 4), ${field.offsets.phase / 4});`,
      `FU.set(bump, ${field.offsets.bump / 4});`,
      `SU.set(rest.subarray(4, 6), ${shade.offsets.light / 4});`,
      `SU.set(u.misc, ${shade.offsets.misc / 4});`,
      `SU.set(u.level, ${shade.offsets.level / 4});`,
      `SU.set(u.reach, ${shade.offsets.reach / 4});`,
      `SU.set(u.face.subarray(3 * k, 3 * k + 3), ${shade.offsets.face / 4} + 4 * k);`,
      `SU.set(u.wall.subarray(3 * k, 3 * k + 3), ${shade.offsets.wallC / 4} + 4 * k);`,
      `SU.set(u.shadow.subarray(3 * k, 3 * k + 3), ${shade.offsets.shade / 4} + 4 * k);`,
      `SU.set(u.sheet, ${shade.offsets.sheet / 4});`
    ])
      expect(page).toContain(line);
  }
});

test("nothing in a page's shaders or code could end its script element", () => {
  const P = decodePalette(SEEDS[4]) as Palette;
  const { effect, angle } = read("style=papercut&shape=999");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = papercutShader(kind, P, effect, angle, SEEDS[4], ORIGIN, {
      soft: 30,
      grain: 20,
      underlay: effectUnderlay(P, effect, angle, 30)
    });
    const inner = page.slice(page.indexOf("<body>"), page.lastIndexOf("</body>"));
    expect(inner.match(/<\/script/g)?.length).toBe(inner.match(/<script/g)?.length);
  }
});

test("a page's settings are its first script, and it plays by the players' clock and numbers", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=papercut&angle=45&speed=0.5&fps=120&shape=12");
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = papercutShader(kind, P, effect, angle, SEEDS[0]);
    const code = page.slice(page.lastIndexOf("<script"));
    expect(code).toMatch(/^<script[^>]*>\n\/\/ The palette's 12 colors at even steps/);
    for (const line of [
      "const ANGLE = 45;",
      "const SHAPE = 12;",
      "const SPEED = 0.5;",
      "const FPS = 120;",
      `const EASE = ${EFFECT_EASE_S};`,
      `const LOOP = ${PAPERCUT_LOOP};`,
      `const MAX_SHEETS = ${PAPERCUT_MAX_SHEETS};`,
      `const PIXELS_MAX = ${EFFECT_PIXELS_MAX};`,
      `laidOut ? ${EFFECT_SETTLE_MS} : 0`,
      'const reduced = matchMedia("(prefers-reduced-motion: reduce)");'
    ])
      expect(code, `${kind} ${line}`).toContain(line);
    expect(code).toContain(kind === "webgl" ? "webglcontextrestored" : "one.lost.then");
    expect(code).toContain(kind === "webgl" ? "needs WebGL 2" : "needs WebGPU");
  }
});

test("the Shadertoy text is Shadertoy's tabs in order, the player's own two passes in Buffers B and C", () => {
  const P = decodePalette(SEEDS[2]) as Palette;
  const { effect, angle } = read("style=papercut&angle=300&speed=3&fps=24&shape=999");
  const text = papercutShader("shadertoy", P, effect, angle, SEEDS[2], ORIGIN);
  const tabs = [...text.matchAll(/^\/\/ ==== (.+?) ====(.*)$/gm)].map(m => [m[1], m[2]]);
  expect(tabs.map(([tab]) => tab)).toEqual(["Common", "Buffer A", "Buffer B", "Buffer C", "Image"]);
  expect(tabs[3][1]).toBe(
    " iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer C (filter: nearest, wrap: clamp); iChannel2: Buffer B (filter: nearest, wrap: clamp)"
  );
  expect(tabs[4][1]).toBe(" iChannel0: Buffer C (filter: nearest, wrap: clamp)");
  expect(text).toMatch(
    /\/\/ ==== Common ====\n.*\nconst float SPEED = 3\.0;.*\nconst float FPS = 24\.0;.*\nconst float EASE = (.+?);/
  );
  /* the ease is the players' own */
  expect(Number(/^const float EASE = (.+?);/m.exec(text)?.[1])).toBe(EFFECT_EASE_S);
  /* without 32-bit float buffers the state reads back wrong: the frame says so in magenta */
  expect(text).toContain(
    "if (iResolution.x < float(STATE) || state(iChannel0, T_MARK).x != MAGIC) {\n    fragColor = vec4(1.0, 0.0, 1.0, 1.0);"
  );
  /* the player's own passes: the field as it is, its output a global; the shading pass reading Buffer B's floats as
     the player reads its texture's bits, the levels and colors Common's */
  expect(text).toContain(shadertoyPass(PAPERCUT_FIELD_FS.replace("\nout uvec4 o;", "\nuvec4 o;")));
  expect(text).toContain(
    shadertoyPass(
      PAPERCUT_SHADE_FS.replace("\nuniform highp usampler2D uField;", "").replace(
        /texelFetch\(uField, /g,
        "fieldBits("
      ),
      { common: ["uLevel", "uFace", "uWallC", "uShade"] }
    )
  );
  expect(text).toContain(
    "uvec4 fieldBits(ivec2 i, int lod) { return floatBitsToUint(texelFetch(iChannel2, i, lod)); }"
  );
  expect(text).toContain("fragColor = uintBitsToFloat(o);");
  /* the text's levels and sheets are the player's floats */
  const levels = papercutSceneUniforms(
    papercutScene(P, { angle, shape: 999 }, { width: 1, height: 1 })
  );
  expect(text).toContain(
    `const float uLevel[${PAPERCUT_MAX_SHEETS}] = float[](\n  ${glslFloat(levels.level[0])},`
  );
});

test("a soft papercut's pages draw the shading pass into the finish's frame and lay the finish over the canvas, its texts the finish's passes", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=papercut&angle=45&shape=7");
  const underlay = effectUnderlay(P, effect, angle, 40);
  const finish = { soft: 40, grain: 30, underlay };
  const webgl = papercutShader("webgl", P, effect, angle, SEEDS[0], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGL_SHADERS)
    expect(webgl).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    "finish = finishing(gl);",
    "finish.layout(w, h, grainScaleOf(w));",
    "gl.bindFramebuffer(gl.FRAMEBUFFER, finish.frame);",
    "finish.draw();",
    `const SOFT = ${effectSoftShare(40)};`,
    "const UNDER_ANGLE = ANGLE;",
    "const GRAIN = 30;"
  ])
    expect(webgl, line).toContain(line);
  expect(webgl.split("\n").slice(2, 5)).toEqual([
    `  grabient ${SEEDS[0]}`,
    `  ${ORIGIN}/${SEEDS[0]}?style=papercut&angle=45&soft=40&grain=30&shape=7`,
    "  the papercut, the palette cut into sheets of paper, drawn by WebGL 2, soft 40, grain 30"
  ]);
  const webgpu = papercutShader("webgpu", P, effect, angle, SEEDS[0], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGPU_SHADERS)
    expect(webgpu).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    'pShade = pipeline("papercut-shade", "rgba8unorm");',
    "finish = finishing(gpu, format);",
    "finish.layout(w, h, grainScaleOf(w));",
    "pass(encoder, finish.view, pShade, groups.shade);",
    "finish.draw(encoder, context.getCurrentTexture().createView());"
  ])
    expect(webgpu, line).toContain(line);
  const glsl = papercutShader("glsl", P, effect, angle, SEEDS[0], ORIGIN, finish);
  expect(glsl).toContain(FINISH_GLSL_SECTIONS);
  expect(glsl).toContain("// ==== Pass 2: the sheets ==== target: the finish's frame");
  expect(papercutShader("wgsl", P, effect, angle, SEEDS[0], ORIGIN, finish)).toContain(
    FINISH_WGSL_SECTIONS
  );
});

test("a grained papercut with no soft lays its grain in its shading pass, from a tile its page makes", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const { effect, angle } = read("style=papercut&angle=300");
  const finish = { grain: 60 };
  const webgl = papercutShader("webgl", P, effect, angle, SEEDS[1], ORIGIN, finish);
  expect(webgl).not.toContain("finishing(gl)");
  expect(webgl).not.toContain("const SOFT");
  for (const line of [
    "grainTex = grainTexture(gl);",
    "grainScale = grainScaleOf(w);",
    "gl.uniform1f(US.grainScale, grainScale);",
    "const GRAIN = 60;",
    GRAIN_TILE_GLSL,
    "  o = grainOver(vec4(roundEven(clamp(shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px).rgb, 0.0, 1.0) * 255.0), 255.0), ivec2(px)) / 255.0;"
  ])
    expect(webgl, line).toContain(line);
  const glsl = papercutShader("glsl", P, effect, angle, SEEDS[1], ORIGIN, finish);
  expect(glsl).toContain(GRAIN_TILE_GLSL);
  expect(glsl).not.toContain("==== Finish");
  const webgpu = papercutShader("webgpu", P, effect, angle, SEEDS[1], ORIGIN, finish);
  expect(webgpu).toContain("{ binding: 2, resource: grainTex.createView() }");
  expect(webgpu).toContain(
    "gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));"
  );
  expect(papercutShader("wgsl", P, effect, angle, SEEDS[1], ORIGIN, finish)).toContain(
    grainTileWgsl(2)
  );
});

test("a soft papercut's Shadertoy text draws its frame in Buffer B, its field's samples worked out there, and blurs it in C and D as the silk's", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=papercut&angle=45");
  const underlay = effectUnderlay(P, effect, angle, 40);
  const text = papercutShader("shadertoy", P, effect, angle, SEEDS[0], ORIGIN, {
    soft: 40,
    grain: 30,
    underlay
  });
  const tabs = [...text.matchAll(/^\/\/ ==== (.+?) ====(.*)$/gm)].map(m => [m[1], m[2]]);
  expect(tabs.map(([tab]) => tab)).toEqual([
    "Common",
    "Buffer A",
    "Buffer B",
    "Buffer C",
    "Buffer D",
    "Image"
  ]);
  expect(tabs[2][1]).toBe(
    " iChannel0: Buffer A (filter: nearest, wrap: clamp); iChannel1: Buffer B (filter: nearest, wrap: clamp)"
  );
  expect(tabs[5][1]).toBe(" iChannel0: Buffer D (filter: nearest, wrap: clamp)");
  expect(text).toContain(`const float SOFT = ${glslFloat(effectSoftShare(40))};`);
  expect(text).toContain(`const int UNDERS = ${underlay?.stops.length};`);
  /* an edit to the soft lays the state out again, so it shows at once */
  expect(text).toContain("k == 2 ? EASE : SOFT");
  /* the frame's four samples of the field, each by the player's own field function as its field pass works it out */
  expect(text).toContain(PAPERCUT_FIELD);
  expect(text).toContain(
    "    vec2 at = (vec2(sampled + ivec2(k & 1, k >> 1)) - 1.0) * 4.0 + 0.5;\n    samples[k] = floatBitsToUint(field((at - 0.5 * uSize) / uD));"
  );
  expect(text).not.toContain("fragColor = uintBitsToFloat(o);");
  /* the silk's and the rosette's grid and blur */
  expect(text).toContain(FX_BUFFER_C);
  expect(text).toContain(FX_BUFFER_D);
  expect(text).toContain("fragColor = vec4(grainOver(c.rgb, p) / 255.0, 1.0);");
  expect(text).toContain("Buffers A to D each in Shadertoy's tab of the name");
  /* a grain alone: the frame's tabs, the grain over the Image */
  const grained = papercutShader("shadertoy", P, effect, angle, SEEDS[0], ORIGIN, { grain: 30 });
  expect([...grained.matchAll(/^\/\/ ==== (.+?) ====/gm)].map(m => m[1])).toEqual([
    "Common",
    "Buffer A",
    "Buffer B",
    "Buffer C",
    "Image"
  ]);
  expect(grained).toContain("fragColor = vec4(grainOver(c, p) / 255.0, 1.0);");
  expect(grained).not.toContain("SOFT");
});
