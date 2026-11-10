import { expect, test } from "vitest";
import { decodePalette } from "../codec.ts";
import {
  EFFECT_EASE_S,
  EFFECT_PIXELS_MAX,
  EFFECT_SETTLE_MS,
  type EffectSettings
} from "../effect.ts";
import { effectUnderlay } from "../fx-finish.ts";
import type { Palette } from "../palette.ts";
import {
  FINISH_GLSL_SECTIONS,
  FINISH_WEBGL_SHADERS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL_SECTIONS,
  GRAIN_TILE_GLSL,
  grainTileWgsl
} from "../shader-finish.ts";
import { SHADER_KINDS } from "../shader-kinds.ts";
import { effectShaderCredit } from "../shader-shell.ts";
import { compileKernel } from "./compile.ts";
import { demo } from "./fields/demo.ts";
import { KERNEL_GLSL, KERNEL_WGSL } from "./gen/demo.ts";
import {
  KIT_BYTES_GLSL,
  KIT_LEVELS,
  KIT_VS,
  kitFragment,
  kitFrameUniforms,
  kitRecipeConstants,
  kitSceneUniforms,
  kitShadowInk,
  kitShadowLayers,
  kitUniformNames
} from "./gl.ts";
import { KIT_KINDS } from "./kinds.ts";
import { kitColors, kitCredit, kitModel, kitSettings, kitTextHead, kitWhat } from "./page.ts";
import { kitEffect } from "./registry.ts";
import { KIT_STOPS, KIT_TIE, kitByte, kitRng, kitScene, kitSheetColor } from "./scene.ts";
import { kitRimColor, kitScratch, kitShade, kitShadowColor, kitShadowSteps } from "./shade.ts";
import { KIT_SHADER_KINDS, kitShader } from "./shader.ts";
import type { FieldEffect, SheetsRecipe } from "./types.ts";
import {
  KIT_BYTES_WGSL,
  KIT_WGSL_UNIFORMS,
  kitKernelLayout,
  kitWgsl,
  kitWgslBytes
} from "./wgsl.ts";

const kernel = { glsl: KERNEL_GLSL, wgsl: KERNEL_WGSL };
const sheets = demo.sheets as SheetsRecipe;
/* the demo and its recipe varied so every branch of the passes and pages is written: a soft shadow, the same soft
   shadow in the color of the sheet below darkened with each rim in its own sheet's lit (the tints, their depth and lift
   left out as shade.ts reads them), periodic stripes with cycle and mirror maps, a rim alone with the lines' darkest
   color on a light ground, lines alone, tinted shadows cast far over sheets a few pixels apart (deep), and a tinted
   soft shadow of the first sheet on the ground with each rim lit further than the default (ground). Each was drawn on a
   GPU against kitRender on 8 Nov 2026, on SwiftShader through a headless Chromium and on the RTX 2080 Ti with no
   browser (EGL surfaceless on Mesa's d3d12, a GLES 3.1 context running the player's shaders and uniforms): on the RTX
   the CPU's bytes at all but 6 to 33 of 57,600 pixels at 320 by 180, each a level off (the stripes' 133 before every
   format broke a tie up, kitByte); on SwiftShader, over 18 frames each (three palettes, two looks, three times), the
   tinted one's channels at most 0.02 levels off on average and 0.19% of its pixels more than a level. Those frames of
   the tinted one never take the tinted run of whole shadows past the edge window, which deep takes at 20% of its
   pixels (3.4% past KIT_SHADOWS): its channels at most 0.01 levels off, 0.014% of its pixels more than a level;
   ground lays its first sheet's shadow on the ground at 0.8% of its pixels: 0.021 and 0.26% */
const RECIPES: FieldEffect[] = [
  demo,
  { ...demo, sheets: { ...sheets, shadow: { ...sheets.shadow!, steps: 3, spread: 0.6 } } },
  {
    ...demo,
    sheets: {
      ...sheets,
      shadow: { ...sheets.shadow!, steps: 3, spread: 0.6, tint: "below" },
      rim: { ...sheets.rim!, tint: "own" }
    }
  },
  {
    ...demo,
    ground: { pick: "lightest", lightness: 0.4, bound: 0.92, chroma: 0.6, lift: 0.08 },
    sheets: {
      ...sheets,
      count: null,
      colors: { hop: 0.07, offset: 0.13, wrap: "cycle" },
      shadow: { angle: 120, distance: 0.012, alpha: 0.4, swing: 30, steps: 4, spread: 1 }
    },
    lines: {
      base: 0.05,
      step: 0.1,
      half: 0.006,
      colors: { hop: 0.1, offset: 0.5, wrap: "mirror" },
      alpha: 0.6
    }
  },
  {
    ...demo,
    ground: { pick: "lightest", lightness: 0.5, bound: 0.9, chroma: 0.5, lift: 0.1 },
    sheets: { ...sheets, shadow: null, rim: { distance: 0.002, alpha: 0.5 } },
    lines: { base: 0.03, step: 0.12, half: 0.005, colors: "darkest", alpha: 0.7 }
  },
  {
    ...demo,
    sheets: null,
    lines: {
      base: 0,
      step: 0.05,
      half: 0.008,
      colors: { hop: 0.05, offset: 0, wrap: "cycle" },
      alpha: 0.9
    }
  },
  {
    ...demo,
    sheets: {
      ...sheets,
      step: 0.004,
      count: null,
      colors: { hop: 0.011, offset: 0.2, wrap: "mirror" },
      shadow: { angle: 60, distance: 0.12, alpha: 0.18, swing: 20, tint: "below", depth: 0.8 },
      rim: null
    },
    lines: null
  },
  {
    ...demo,
    sheets: {
      ...sheets,
      base: 0.1,
      count: 6,
      shadow: {
        angle: 60,
        distance: 0.05,
        alpha: 0.6,
        swing: 20,
        steps: 2,
        spread: 0.5,
        tint: "below",
        depth: 0.3
      },
      rim: { ...sheets.rim!, tint: "own", lift: 0.6 }
    }
  }
];
/* the recipes whose levels the view's steps space (types.ts KitSteps): plain bands that run on, as the sandstone's,
   and the stripes' soft shadow, tints and lines, which read every one of KIT_LEVELS (a soft shadow's rise and reach
   among them) from uLevels */
const STEPPED: FieldEffect[] = [
  {
    ...demo,
    sheets: { ...sheets, count: null, step: 0.04, shadow: null, rim: null },
    lines: null,
    steps: { least: 8, most: 40, designed: 28 }
  },
  { ...RECIPES[3], steps: { least: 6, most: 30, designed: 12 } }
];
RECIPES.push(...STEPPED);
/* the steps a recipe is drawn at: as designed, and where it takes steps, the fewest, the most, one between and two
   past either end, which clamp */
const stepsOf = (def: FieldEffect): (number | null)[] =>
  def.steps
    ? [null, def.steps.least, def.steps.most, def.steps.least + 3, def.steps.most + 9, 1]
    : [null];
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
const TIMES = [0, 1 / 60, 7.3, 30, 59.983333333333334, 60, 3600.5];
const ORIGIN = "https://grabient.com";
const play = (
  shape: number | null,
  speed = 1,
  fps = 60,
  steps: number | null = null
): EffectSettings => ({
  speed,
  fps,
  look: { shape, frost: 1, bg: null, steps, zoom: null }
});

type Scene = { width: number; height: number };
type Model = {
  kitScene: (angle: number, w: number, h: number) => Scene;
  sceneUniforms: (scene: Scene) => ReturnType<typeof kitSceneUniforms>;
  frameAt: (t: number, phases: Float32Array, move: Float32Array) => void;
};
/* the pages' JavaScript, run as a page runs it */
const modelOf = (
  def: FieldEffect,
  P: Palette,
  shape: number | null,
  angle: number,
  steps: number | null = null
): Model =>
  new Function(
    `${kitSettings(def, P, play(shape, 1, 60, steps), angle)}\n${kitModel(def, P, shape)}\nreturn { kitScene, sceneUniforms, frameAt };`
  )() as Model;

test("the pages lay an effect out and move it as the player does, to the last bit, for any recipe, palette, angle, shape, steps and canvas", () => {
  for (const [r, def] of RECIPES.entries())
    for (const [s, seed] of SEEDS.entries())
      for (const angle of [90, 0, 137, 300])
        for (const shape of [null, 7, 999])
          for (const steps of stepsOf(def)) {
            if ((r + s) % 2 && angle === 137) continue;
            if (steps !== null && shape === 7) continue;
            const P = decodePalette(seed) as Palette;
            const model = modelOf(def, P, shape, angle, steps);
            for (const [w, h] of SIZES.filter((_, i) => (i + s + r) % 2 === 0 || i === 3)) {
              const site = kitScene(def, P, { angle, shape, steps }, { width: w, height: h });
              const page = model.kitScene(angle, w, h);
              const at = `${def.kind} ${r} ${seed} ${w}x${h} ${angle} ${shape} ${steps}`;
              expect(model.sceneUniforms(page), at).toEqual(kitSceneUniforms(site));
              const phases = new Float32Array(4 * Math.ceil(def.tracks / 4));
              const move = new Float32Array(4);
              for (const t of TIMES) {
                const frame = kitFrameUniforms(site, t);
                model.frameAt(t, phases, move);
                expect(phases, `${at} t ${t}`).toEqual(frame.phases);
                expect(move, `${at} t ${t}`).toEqual(frame.move);
              }
            }
          }
  /* a recipe the steps space sets its levels with the scene's uniforms, each the recipe's own at its designed steps */
  for (const def of STEPPED) {
    const P = decodePalette(SEEDS[0]) as Palette;
    const levels = (steps: number | null) =>
      kitSceneUniforms(kitScene(def, P, { angle: 90, shape: null, steps }, { width: 9, height: 9 }))
        .levels;
    expect(levels(null)).toEqual(levels(def.steps?.designed ?? null));
    expect(levels(null)?.[0]).toBe(Math.fround((def.sheets as SheetsRecipe).step));
    expect(levels(def.steps?.least ?? 0)?.[0]).toBeGreaterThan(levels(null)?.[0] ?? 0);
  }
  expect(
    kitSceneUniforms(
      kitScene(
        demo,
        decodePalette(SEEDS[0]) as Palette,
        { angle: 90, shape: null, steps: 12 },
        { width: 9, height: 9 }
      )
    ).levels
  ).toBeUndefined();
}, 120_000);

test("a page's colors are the site's, and a reader's own are taken as they are", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  for (const def of RECIPES) {
    const scene = kitScene(def, P, { angle: 90, shape: null }, { width: 9, height: 9 });
    const u = kitSceneUniforms(scene);
    const colors = kitColors(def, P);
    const settings = kitSettings(def, P, play(null), 90);
    for (const hex of [colors.ground, ...colors.stops, colors.shade, colors.line].filter(Boolean))
      expect(settings).toContain(`"${hex}"`);
    expect(settings.includes("const SHADE"), def.kind).toBe(kitShadowInk(def));
    expect(settings.includes("const LINE"), def.kind).toBe(typeof def.lines?.colors === "string");
    const page = modelOf(def, P, null, 90);
    expect(page.sceneUniforms(page.kitScene(90, 9, 9))).toEqual(u);
  }
  const page = new Function(
    `${kitSettings(demo, P, play(null), 90).replace(/const GROUND = "[^"]*";/, 'const GROUND = "#102030";')}\n${kitModel(demo, P, null)}\nreturn kitScene(90, 800, 400);`
  )() as { ground: number[] };
  expect(page.ground).toEqual([16 / 255, 32 / 255, 48 / 255]);
});

test("each text credits the seed, the effect's address as the site writes an effect's, and what it is", () => {
  const SEED = SEEDS[0];
  const P = decodePalette(SEED) as Palette;
  for (const kind of KIT_SHADER_KINDS) {
    const text = kitShader(demo, kernel, kind, P, play(7, 3, 24), 137, SEED, ORIGIN);
    expect(text, kind).toContain(`grabient ${SEED}`);
    expect(text, kind).toContain(`${ORIGIN}/${SEED}?style=demo&angle=137&speed=3&fps=24&shape=7`);
    expect(text, kind).toContain(kitWhat(demo));
  }
  expect(KIT_SHADER_KINDS).toEqual(SHADER_KINDS.map(([kind]) => kind));
  /* what it is, in its own words */
  expect(kitWhat(demo)).toBe(demo.about.what);
  /* the address is the one effect.ts writes for an effect that takes an angle and a soft, the silk's, in its style */
  for (const [p, angle, finish] of [
    [play(null), 90, {}],
    [play(12, 0.5, 120), 45, { soft: 40, grain: 30 }],
    [play(0, 0, 60), 300, { grain: 5 }]
  ] as const) {
    const silk = effectShaderCredit(SEED, { kind: "silk", ...p }, angle, "what", ORIGIN, finish);
    expect(kitCredit(demo, SEED, p, angle, "what", ORIGIN, finish)).toEqual(
      silk.map(line => line.replace("style=silk", "style=demo"))
    );
    /* a field effect the site plays is credited by that writer itself, as an effect */
    for (const kind of KIT_KINDS)
      expect(kitCredit(kitEffect(kind), SEED, p, angle, "what", ORIGIN, finish)).toEqual(
        silk.map(line => line.replace("style=silk", `style=${kind}`))
      );
  }
});

test("the GLSL is the player's own pass, the WGSL its line for line, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const fs = kitFragment(demo, KERNEL_GLSL);
  const glsl = kitShader(demo, kernel, "glsl", P, play(null), 90, SEEDS[1]);
  for (const shader of [KIT_VS, fs]) expect(glsl).toContain(shader);
  const webgl = kitShader(demo, kernel, "webgl", P, play(null), 90, SEEDS[1]);
  expect(webgl).toContain(`<script type="x-shader/x-vertex" id="demo-vs">${KIT_VS}</script>`);
  expect(webgl).toContain(`<script type="x-shader/x-fragment" id="demo-fs">${fs}</script>`);
  const module = kitWgsl(demo, KERNEL_WGSL);
  expect(kitShader(demo, kernel, "wgsl", P, play(null), 90, SEEDS[1])).toContain(module);
  expect(kitShader(demo, kernel, "webgpu", P, play(null), 90, SEEDS[1])).toContain(
    `<script type="text/wgsl" id="demo">${module}</script>`
  );
  expect(() => kitFragment(demo, "float f(float x) { return x; }")).toThrow(/kfield/);
  expect(() => kitWgsl(demo, KERNEL_WGSL.replace("struct KitKernel", "struct Other"))).toThrow(
    /KitKernel/
  );
});

test("each recipe's pass reads the uniforms the player and the pages set, and writes the recipe's numbers in both languages alike", () => {
  for (const def of RECIPES) {
    const fs = kitFragment(def, KERNEL_GLSL);
    const declared = [...fs.matchAll(/^uniform \w+ (\w+)/gm)].map(m => m[1]);
    expect(declared.sort(), def.kind).toEqual([...kitUniformNames(def)].sort());
    const wgsl = kitWgsl(def, KERNEL_WGSL);
    const constants = kitRecipeConstants(def);
    for (const [name] of constants) {
      const g = fs.match(new RegExp(`^const (?:float|int) ${name} = (.+);$`, "m"))?.[1];
      const w = wgsl.match(new RegExp(`^const ${name} = (.+);$`, "m"))?.[1];
      expect(g, `${def.kind} ${name}`).toBeDefined();
      expect(w, `${def.kind} ${name}`).toBe(g);
    }
    /* the branches each writes, in both: a shadow in the ink, or each sheet's its own (shadowColor, darkened by
       SHADOW_DEPTH), a rim white, or each in its own color lit (rimColor, by RIM_LIFT) */
    const below = !!def.sheets?.shadow && !kitShadowInk(def);
    const own = def.sheets?.rim?.tint === "own";
    for (const [text, shade, line] of [
      [fs, "uShade", "uLine"],
      [wgsl, "S.shade.rgb", "S.line.rgb"]
    ] as const) {
      expect(text.includes(shade), def.kind).toBe(kitShadowInk(def));
      expect(text.includes("shadowColor("), def.kind).toBe(below);
      expect(text.includes("SHADOW_DEPTH"), def.kind).toBe(below);
      expect(text.includes("rimColor("), def.kind).toBe(own);
      expect(text.includes("RIM_LIFT"), def.kind).toBe(own);
      expect(text.includes(line), def.kind).toBe(typeof def.lines?.colors === "string");
      expect(text.includes("SHEET_TOP"), def.kind).toBe(!!def.sheets && def.sheets.count !== null);
      expect(text.includes("SHADOW_STEPS"), def.kind).toBe(kitShadowLayers(def).steps > 1);
      expect(text.includes("RIM_ALPHA"), def.kind).toBe(!!def.sheets?.rim);
      expect(text.includes("sheetColor("), def.kind).toBe(!!def.sheets);
      expect(text.includes("lineColor("), def.kind).toBe(
        !!def.lines && typeof def.lines.colors === "object"
      );
    }
    /* a recipe the view's steps space reads its levels from the scene, none of them a constant, and every other's
       are constants, its pass's text as it was */
    const levels: readonly string[] = KIT_LEVELS;
    const fixed = constants.map(([name]) => name).filter(name => levels.includes(name));
    if (def.steps) expect(fixed, def.kind).toEqual([]);
    else if (def.sheets) expect(fixed, def.kind).toContain("SHEET_STEP");
    for (const [text, uniform] of [
      [fs, "uLevels["],
      [wgsl, "S.levels["]
    ] as const) {
      expect(text.includes(uniform), def.kind).toBe(!!def.steps);
      for (const name of KIT_LEVELS)
        if (text.includes(name))
          expect(
            def.steps
              ? text.includes(`${name} = ${uniform}`)
              : new RegExp(`^const (?:float )?${name} = `, "m").test(text),
            `${def.kind} ${name}`
          ).toBe(true);
    }
  }
});

test("a soft shadow's layers are the ones kitShade draws, its numbers worked out as kitShade works them", () => {
  const P = decodePalette(SEEDS[2]) as Palette;
  for (const def of RECIPES) {
    const scene = kitScene(def, P, { angle: 90, shape: null }, { width: 9, height: 9 });
    const { steps, rise, share, keep } = kitShadowLayers(def);
    expect({ steps, rise }).toEqual(kitShadowSteps(scene));
    if (!def.sheets?.shadow) continue;
    expect(share).toBe(def.sheets.shadow.alpha / steps);
    let one = 1;
    for (let s = 0; s < steps; s++) one *= 1 - share;
    expect(keep).toBe(one);
  }
});

test("the depth and the lift a pass is written with (kitRecipeConstants) give shade.ts's tinted shadows and rims, the defaults among them", () => {
  /* the constants alone, in the tints' arithmetic as written here: the passes' own text is run against kitShade in the
     next test */
  const P = decodePalette(SEEDS[1]) as Palette;
  const want = new Float64Array(3);
  const got = new Float64Array(3);
  let tinted = 0;
  /* the tinted recipe leaves its depth and lift out; the site's tinted effects give theirs */
  for (const def of [...RECIPES, ...KIT_KINDS.map(kitEffect)]) {
    const S = def.sheets;
    if (!S) continue;
    const scene = kitScene(def, P, { angle: 90, shape: null }, { width: 9, height: 9 });
    const n = Object.fromEntries(kitRecipeConstants(def).map(([name, v]) => [name, v]));
    const below = !!S.shadow && !kitShadowInk(def);
    if (below || S.rim?.tint === "own") tinted++;
    const ks =
      S.count === null
        ? [-17, -1, 0, 1, 2, 7, 14, 15, 16, 40]
        : Array.from({ length: S.count }, (_, k) => k);
    for (const k of ks) {
      /* the sheet below (the ground under a counted stack's first) times SHADOW_DEPTH */
      if (below) {
        if (k > 0 || S.count === null) kitSheetColor(scene, k - 1, got);
        else got.set(scene.ground);
        for (let i = 0; i < 3; i++) got[i] *= n.SHADOW_DEPTH;
        kitShadowColor(scene, k, want);
        expect(got, `${def.kind} shadow ${k}`).toEqual(want);
      }
      /* the sheet's own, lifted RIM_LIFT of the way to white */
      if (S.rim?.tint === "own") {
        kitSheetColor(scene, k, got);
        for (let i = 0; i < 3; i++) got[i] += (1 - got[i]) * n.RIM_LIFT;
        kitRimColor(scene, k, want);
        expect(got, `${def.kind} rim ${k}`).toEqual(want);
      }
    }
  }
  expect(tinted).toBeGreaterThanOrEqual(3);
  /* the texts say where a tinted shadow's and rim's colors come from, as the page has no shadows' color to edit */
  const head = (def: FieldEffect) => kitTextHead(def, ["credit"]).replaceAll("\n// ", " ");
  expect(head(RECIPES[2])).toContain(
    "each with its shadow (the sheet below it darkened) and its rim (its own color lit) under it"
  );
  expect(head(demo)).toContain("each with its shadow and its rim under it");
});

/* a pass's shading, its text read as JavaScript a channel at a time (it works every color channel by channel, so each
   vec3 is that channel's number, and the ground's, the shadows', the lines' and each stop's color that channel's): its
   recipe's constants and its functions from cover() to shade(), whose reads of the field are left out for the f, g, fs
   and fr handed in, each word of its language put as JavaScript's; any other word it writes is left to throw */
const shadingOf = (pass: string, wgsl: boolean) => {
  const constants = [
    ...pass.matchAll(wgsl ? /^const (\w+) = (.+);$/gm : /^const (?:float|int) (\w+) = (.+);$/gm)
  ].map(([, name, v]) => `const ${name} = ${v};`);
  const params = (list: string) =>
    list
      .split(", ")
      .map(p => (wgsl ? p.split(":")[0] : p.split(" ")[1]))
      .join(", ");
  const code = pass
    .slice(
      pass.indexOf(wgsl ? "\nfn cover(" : "\nfloat cover("),
      pass.indexOf(wgsl ? "\n@fragment" : "\nvoid main()")
    )
    .replace(/\/\/.*$/gm, "")
    .replace(/^ {2}(?:vec2 |float |let )(?:q|f|gx|gy|g|fs|fr) = .*\n/gm, "")
    .replace(
      wgsl ? /^fn (\w+)\(([^)]*)\) -> \w+ \{$/gm : /^(?:float|vec3) (\w+)\(([^)]*)\) \{$/gm,
      (_, name: string, list: string) =>
        `function ${name}(${name === "shade" ? "f, g, fs, fr" : params(list)}) {`
    )
    .replace(wgsl ? /\b(?:let|var) /g : /\b(?:float|int|vec3) (?=\w+ =)/g, "let ")
    .replace(wgsl ? /\b(?:i32|f32)\(/g : /\b(?:int|float)\(/g, "(")
    .replace(/\bS\.stops\[([^\]]+)\]\.rgb/g, "uStops[$1]")
    .replace(/\bS\.levels\[/g, "uLevels[")
    .replace(
      /\bS\.(ground|shade|line)\.rgb/g,
      (_, n: string) => `u${n[0].toUpperCase()}${n.slice(1)}`
    )
    .replace(/\b(floor|min|max)\(/g, "Math.$1(");
  return new Function(
    "uGround",
    "uShade",
    "uLine",
    "uStops",
    "uLevels",
    "clamp",
    "select",
    `${constants.join("\n")}\n${code}\nreturn shade;`
  ) as (...channel: unknown[]) => (f: number, g: number, fs: number, fr: number) => number;
};
/* a scene's levels as the passes' uLevels, two vectors, in the doubles kitShade reads them in (kit/gl.ts kitLevels
   writes them as float32 for a GPU) */
const levelsOf = (m: ReturnType<typeof kitScene>) => {
  const { steps, rise } = kitShadowSteps(m);
  return [
    { x: m.sheetStep, y: m.sheetHop, z: m.lineStep, w: m.lineHop },
    { x: rise, y: (Math.max(1, steps) - 1) * rise, z: 0, w: 0 }
  ];
};

test("each recipe's pass, its text run as written, shades a pixel as kitShade does to the last bit, in both languages, every branch", () => {
  /* the field's reads aside (the GPU checks hold those), every early exit, the tints, the run of whole shadows past the
     edge window (a sheet at a time where tinted, cut at KIT_SHADOWS where it runs longer) and the first sheet's shadow
     on the ground meet kitShade's own doubles, on inputs drawn to reach each: f across the sheets, the shadow's point by
     it or far above it, the rim's by it, the sheets from a few hundred pixels to a third of a pixel apart. Each of 27
     slips put into gl.ts or wgsl.ts one at a time failed it (8 Nov 2026), where the checks of the texts' words and of
     the constants passed all of the first 19, in the tints and the shadows' and rims' layers: a shadow's color from its
     own sheet or the next, a rim's from the next, the ground's case off by one, a run of 17 or laid top down, a soft
     shadow's whole keeping 1 - share, a lift halved or held at its default, a soft layer's rise doubled, a rim's alpha
     halved; the other 8 an early exit on any cover, the edge window a sheet short, the mirror map turned over, the
     first sheet laid whole where none covers the pixel, the ink's whole keeping 1 - share, a soft shadow's partial
     shadows two, the whole shadows' reach left out, a line's band cut short */
  const P = decodePalette(SEEDS[1]) as Palette;
  const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
  const select = (no: number, yes: number, which: boolean) => (which ? yes : no);
  const c = kitScratch();
  const want = kitScratch();
  const drawn = [...RECIPES, ...KIT_KINDS.map(kitEffect)].flatMap(def =>
    (def.steps ? [null, def.steps.least, def.steps.most] : [null]).map(steps => ({ def, steps }))
  );
  for (const [r, { def, steps }] of drawn.entries()) {
    const m = kitScene(def, P, { angle: 90, shape: null, steps }, { width: 9, height: 9 });
    const passes = (
      [
        ["GLSL", kitFragment(def, KERNEL_GLSL), false],
        ["WGSL", kitWgsl(def, KERNEL_WGSL), true]
      ] as const
    ).map(([lang, text, wgsl]) => {
      const read = shadingOf(text, wgsl);
      const channel = (k: number) =>
        read(
          m.ground[k],
          m.shade[k],
          m.lineFixed?.[k] ?? 0,
          Array.from({ length: KIT_STOPS }, (_, i) => m.stops[3 * i + k]),
          levelsOf(m),
          clamp,
          select
        );
      return { lang, channels: [channel(0), channel(1), channel(2)] };
    });
    const S = def.sheets;
    const base = (S ?? def.lines)!.base;
    const step = S ? m.sheetStep : m.lineStep;
    const [lo, hi] =
      S && S.count !== null
        ? [base - 3 * step, base + (S.count + 3) * step]
        : [base - 40 * step, base + 40 * step];
    const rng = kitRng(17);
    const at = (a: number, b: number) => a + (b - a) * rng();
    const off: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const f = at(lo, hi);
      const g = step * 10 ** at(-2.5, 0.5);
      const fs = rng() < 0.5 ? f + at(-3, 3) * step : at(lo, hi + 30 * step);
      const fr = rng() < 0.7 ? f + at(-1.5, 1.5) * step : at(lo, hi);
      kitShade(m, f, g, fs, fr, c, want);
      for (const { lang, channels } of passes)
        for (let k = 0; k < 3; k++) {
          const got = channels[k](f, g, fs, fr);
          if (got !== want[k])
            off.push(
              `${lang} channel ${k}, f ${f} g ${g} fs ${fs} fr ${fr}: ${got}, not ${want[k]}`
            );
        }
    }
    expect(off.slice(0, 3), `${r} ${def.kind} ${steps}: ${off.length} channels off`).toEqual([]);
  }
});

test("each pass takes its colors to bytes as kitByte does, a tie up, there and nowhere else", () => {
  expect(KIT_BYTES_GLSL).toBe("clamp(floor(shade(px) * 255.0 + 0.5009765625), 0.0, 255.0)");
  expect(KIT_BYTES_WGSL).toBe(
    "clamp(floor(shade(px) * 255.0 + 0.5009765625), vec3f(0.0), vec3f(255.0))"
  );
  expect(0.5009765625).toBe(0.5 + KIT_TIE);
  /* float32 rounds a tie the way the CPU's doubles do, product and sum rounded apart or fused, at every byte's
     midpoint and either side */
  for (let b = 0; b < 256; b++)
    for (const v of [(b - 0.5) / 255, (b - 0.25) / 255, b / 255, (b + 0.5) / 255]) {
      const f = Math.fround(v);
      for (const sum of [
        Math.fround(Math.fround(f * 255) + 0.5009765625),
        Math.fround(f * 255 + 0.5009765625)
      ])
        expect(Math.min(255, Math.max(0, Math.floor(sum))), `${b} ${v}`).toBe(kitByte(v));
    }
  for (const def of RECIPES) {
    const fs = kitFragment(def, KERNEL_GLSL);
    const wgsl = kitWgsl(def, KERNEL_WGSL);
    expect(fs, def.kind).toContain(`\n  o = vec4(${KIT_BYTES_GLSL} / 255.0, 1.0);\n}`);
    expect(wgsl, def.kind).toContain(`\n  return vec4f(${KIT_BYTES_WGSL} / 255.0, 1.0);\n}`);
    /* and nowhere else */
    expect(fs.match(/255\.0 \+/g), def.kind).toHaveLength(1);
    expect(wgsl.match(/255\.0 \+/g), def.kind).toHaveLength(1);
  }
});

/* a uniform struct's members' offsets and its bytes, by WGSL's memory layout rules for the types the kit's structs
   use: a scalar on 4 bytes, a vec2 on 8, a vec4 on 16, an array of vec4s 16 bytes an element, the struct rounded up to
   its largest member's alignment; any other member throws */
const uniformLayout = (wgsl: string, name: string) => {
  const body = wgsl.match(new RegExp(`^struct ${name} \\{\\n([^}]*)\\n\\}`, "m"))?.[1];
  if (!body) throw new Error(`no struct ${name}`);
  const SIZES: Record<string, number> = { f32: 4, i32: 4, u32: 4, vec2f: 8, vec4f: 16 };
  const offsets: Record<string, number> = {};
  let end = 0;
  let align = 0;
  for (const line of body.split("\n")) {
    const [, member, type] = line.match(/^ {2}(\w+): (array<[^>]+>|\w+),/) ?? [];
    const array = type?.match(/^array<vec4f, ([1-9]\d*)>$/);
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

test("the WebGPU page writes each uniform where WGSL lays it out in the scene's struct and the kernel's", () => {
  const scene = uniformLayout(kitWgsl(demo, KERNEL_WGSL), "Kit");
  const { bytes, levels, ...at } = KIT_WGSL_UNIFORMS;
  expect(at).toEqual(scene.offsets);
  expect(bytes).toBe(scene.bytes);
  expect(kitWgslBytes(demo)).toBe(scene.bytes);
  /* the levels close the struct of a recipe the view's steps space, and its page writes them there */
  for (const def of STEPPED) {
    const spaced = uniformLayout(kitWgsl(def, KERNEL_WGSL), "Kit");
    expect(spaced.offsets).toEqual({ ...at, levels });
    expect(kitWgslBytes(def)).toBe(spaced.bytes);
    const page = kitShader(
      def,
      kernel,
      "webgpu",
      decodePalette(SEEDS[0]) as Palette,
      play(7, 1, 60, 17),
      45,
      SEEDS[0]
    );
    for (const line of [
      `sceneBuffer = gpu.createBuffer({ size: ${spaced.bytes},`,
      `const sceneBlock = new Float32Array(${spaced.bytes / 4});`,
      `sceneBlock.set(u.levels, ${levels / 4});`,
      "const STEPS = 17;"
    ])
      expect(page, line).toContain(line);
  }
  const k = uniformLayout(KERNEL_WGSL, "KitKernel");
  const K = kitKernelLayout(demo);
  expect({ ...K.lists, f: K.phases }).toEqual(k.offsets);
  expect(K.bytes).toBe(k.bytes);
  const P = decodePalette(SEEDS[0]) as Palette;
  for (const finish of [{}, { grain: 30 }, { soft: 40, grain: 30 }]) {
    const page = kitShader(demo, kernel, "webgpu", P, play(7), 45, SEEDS[0], ORIGIN, finish);
    for (const line of [
      `sceneBuffer = gpu.createBuffer({ size: ${scene.bytes},`,
      `kernelBuffer = gpu.createBuffer({ size: ${k.bytes},`,
      `const sceneBlock = new Float32Array(${scene.bytes / 4});`,
      `const kernelBlock = new Float32Array(${k.bytes / 4});`,
      `sceneBlock.set(u.size, ${scene.offsets.size / 4});`,
      `sceneBlock.set(u.turn, ${scene.offsets.turn / 4});`,
      `sceneBlock[${scene.offsets.D / 4}] = u.D;`,
      `sceneBlock.set(u.ground, ${scene.offsets.ground / 4});`,
      `sceneBlock.set(u.shade, ${scene.offsets.shade / 4});`,
      `sceneBlock.set(u.line, ${scene.offsets.line / 4});`,
      `sceneBlock.set(u.stops.subarray(3 * i, 3 * i + 3), ${scene.offsets.stops / 4} + 4 * i);`,
      `kernelBlock.set(u.K.shear, ${k.offsets.shear / 4});`,
      `kernelBlock.set(u.K.wave, ${k.offsets.wave / 4});`,
      `gpu.queue.writeBuffer(sceneBuffer, ${scene.offsets.moves}, move);`,
      `gpu.queue.writeBuffer(kernelBuffer, ${k.offsets.f}, phases);`
    ])
      expect(page, line).toContain(line);
  }
});

test("the WGSL pass uses the kernel's struct where the kernel reads none of it, so a page's bind group fits its layout", () => {
  /* a layout "auto" holds only the bindings the shaders use: a module that never names kk leaves binding 1 out, and
     the page's bind group, which names it, is invalid (8 Nov 2026 on SwiftShader: every frame thrown away) */
  const flat = compileKernel(
    "export function flat(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {\n  return 0.6 * x + 0.05 * Math.sin(9 * y);\n}\n",
    { name: "flat", kind: "flat", uniforms: {}, tracks: 1 }
  );
  expect(flat.wgsl).not.toMatch(/\bkk\b/);
  for (const [def, wgsl] of [
    [{ ...demo, kind: "flat", uniforms: {}, tracks: 1 }, flat.wgsl],
    [demo, KERNEL_WGSL]
  ] as const) {
    const module = kitWgsl(def, wgsl);
    expect(module.slice(module.indexOf("\nfn fs_main(")), def.kind).toContain("\n  _ = kk.f[0];\n");
  }
});

test("a recipe whose sheets do not step up, or whose soft shadow's layers sink, is refused, as the passes' early exits need", () => {
  const recipes: [FieldEffect, RegExp][] = [
    [{ ...demo, sheets: { ...sheets, step: 0 } }, /step is 0/],
    [{ ...demo, sheets: { ...sheets, step: -0.12 } }, /step is -0.12/],
    [{ ...demo, sheets: { ...sheets, step: Number.NaN } }, /step is NaN/],
    [
      { ...demo, sheets: { ...sheets, shadow: { ...sheets.shadow!, steps: 3, spread: -0.5 } } },
      /spread is -0.5/
    ]
  ];
  for (const [def, message] of recipes) {
    expect(() => kitFragment(def, KERNEL_GLSL)).toThrow(message);
    expect(() => kitWgsl(def, KERNEL_WGSL)).toThrow(message);
  }
  for (const def of RECIPES) expect(() => kitRecipeConstants(def)).not.toThrow();
});

test("nothing in a page's shaders or code could end its script element", () => {
  const P = decodePalette(SEEDS[3]) as Palette;
  for (const def of RECIPES)
    for (const kind of ["webgl", "webgpu"] as const) {
      const page = kitShader(def, kernel, kind, P, play(999), 300, SEEDS[3], ORIGIN, {
        soft: 30,
        grain: 20,
        underlay: effectUnderlay(P, { kind: "silk", ...play(999) }, 300, 30)
      });
      const inner = page.slice(page.indexOf("<body>"), page.lastIndexOf("</body>"));
      expect(inner.match(/<\/script/g)?.length).toBe(inner.match(/<script/g)?.length);
    }
});

test("a page's settings are its first script, and it plays by the players' clock and numbers", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  for (const kind of ["webgl", "webgpu"] as const) {
    const page = kitShader(demo, kernel, kind, P, play(12, 0.5, 120), 45, SEEDS[0]);
    const code = page.slice(page.lastIndexOf("<script"));
    expect(code).toMatch(
      /^<script[^>]*>\n\/\/ The ground, the palette's darkest color made deeper/
    );
    for (const line of [
      "const ANGLE = 45;",
      "const SPEED = 0.5;",
      "const FPS = 120;",
      `const EASE = ${EFFECT_EASE_S};`,
      `const LOOP = ${demo.loop};`,
      `const SPAN = ${demo.span};`,
      "CONSTANTS, the lists its field reads",
      `const PIXELS_MAX = ${EFFECT_PIXELS_MAX};`,
      `laidOut ? ${EFFECT_SETTLE_MS} : 0`,
      'const reduced = matchMedia("(prefers-reduced-motion: reduce)");'
    ])
      expect(code, `${kind} ${line}`).toContain(line);
    expect(code).toContain("Shape 12:");
    expect(code).toContain(kind === "webgl" ? "webglcontextrestored" : "one.lost.then");
    expect(code).toContain(kind === "webgl" ? "needs WebGL 2" : "needs WebGPU");
  }
  /* the design's numbers are the shape's, as the site draws it */
  const scene = kitScene(demo, P, { angle: 90, shape: 12 }, { width: 9, height: 9 });
  const model = kitModel(demo, P, 12);
  for (const v of scene.tracks)
    expect(model).toContain(`[${v.rest}, ${v.swing}, ${v.cycles}, ${v.psi}]`);
  expect(model).toContain(`    ${Array.from(scene.U.shear.subarray(0, 4)).join(", ")}`);
});

test("a page of a recipe the view's steps space says its steps among its settings and sets its levels as the player does", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  for (const def of STEPPED) {
    const range = def.steps!;
    for (const [steps, said] of [
      [null, range.designed],
      [range.least, range.least],
      [range.most + 5, range.most]
    ] as const) {
      const webgl = kitShader(def, kernel, "webgl", P, play(null, 1, 60, steps), 90, SEEDS[1]);
      expect(webgl).toContain(
        `// How many bands a sweep of the palette spans, ${range.least} to ${range.most} (${range.designed} as designed).\nconst STEPS = ${said};`
      );
      expect(webgl).toContain("gl.uniform4fv(U.uLevels, u.levels);");
      expect(webgl).toContain("levels: levelsAt(STEPS)");
      const glsl = kitShader(def, kernel, "glsl", P, play(null, 1, 60, steps), 90, SEEDS[1]);
      expect(glsl.replaceAll("\n// ", " ")).toContain(
        `its ${said} steps' spacing, which the pass reads from uLevels: ${range.least} to ${range.most} steps, ${range.designed} as designed`
      );
    }
  }
  /* and every other recipe's pages carry neither */
  const webgl = kitShader(demo, kernel, "webgl", P, play(null, 1, 60, 12), 90, SEEDS[1]);
  expect(webgl).not.toContain("STEPS");
  expect(webgl).not.toContain("uLevels");
});

test("a soft one's pages draw the pass into the finish's frame and lay the finish over the canvas, its texts the finish's passes", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const underlay = effectUnderlay(P, { kind: "silk", ...play(7) }, 45, 40);
  const finish = { soft: 40, grain: 30, underlay };
  const webgl = kitShader(demo, kernel, "webgl", P, play(7), 45, SEEDS[0], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGL_SHADERS)
    expect(webgl).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    "finish = finishing(gl);",
    "finish.layout(w, h, grainScaleOf(w));",
    "gl.bindFramebuffer(gl.FRAMEBUFFER, finish.frame);",
    "finish.draw();",
    "const UNDER_ANGLE = ANGLE;",
    "const GRAIN = 30;"
  ])
    expect(webgl, line).toContain(line);
  expect(webgl.split("\n").slice(2, 5)).toEqual([
    `  grabient ${SEEDS[0]}`,
    `  ${ORIGIN}/${SEEDS[0]}?style=demo&angle=45&soft=40&grain=30&shape=7`,
    `  ${kitWhat(demo)}, drawn by WebGL 2, soft 40, grain 30`
  ]);
  const webgpu = kitShader(demo, kernel, "webgpu", P, play(7), 45, SEEDS[0], ORIGIN, finish);
  for (const [id, type, code] of FINISH_WEBGPU_SHADERS)
    expect(webgpu).toContain(`<script type="${type}" id="${id}">${code}</script>`);
  for (const line of [
    'targets: [{ format: "rgba8unorm" }]',
    "finish = finishing(gpu, format);",
    "finish.layout(w, h, grainScaleOf(w));",
    "view: finish.view",
    "finish.draw(encoder, context.getCurrentTexture().createView());"
  ])
    expect(webgpu, line).toContain(line);
  const glsl = kitShader(demo, kernel, "glsl", P, play(7), 45, SEEDS[0], ORIGIN, finish);
  expect(glsl).toContain(FINISH_GLSL_SECTIONS);
  expect(glsl).toContain("// ==== Pass 1: the field ==== target: the finish's frame");
  expect(kitShader(demo, kernel, "wgsl", P, play(7), 45, SEEDS[0], ORIGIN, finish)).toContain(
    FINISH_WGSL_SECTIONS
  );
});

test("a grained one with no soft lays its grain in its pass, from a tile its page makes", () => {
  const P = decodePalette(SEEDS[1]) as Palette;
  const finish = { grain: 60 };
  const webgl = kitShader(demo, kernel, "webgl", P, play(null), 300, SEEDS[1], ORIGIN, finish);
  expect(webgl).not.toContain("finishing(gl)");
  expect(webgl).not.toContain("const SOFT");
  for (const line of [
    "grainTex = grainTexture(gl);",
    "grainScale = grainScaleOf(w);",
    "gl.uniform1f(U.grainScale, grainScale);",
    "const GRAIN = 60;",
    GRAIN_TILE_GLSL,
    "  o = grainOver(vec4(clamp(floor(shade(px) * 255.0 + 0.5009765625), 0.0, 255.0), 255.0), ivec2(px)) / 255.0;"
  ])
    expect(webgl, line).toContain(line);
  expect(webgl).not.toContain("  o = vec4(clamp(floor(shade(px)");
  const glsl = kitShader(demo, kernel, "glsl", P, play(null), 300, SEEDS[1], ORIGIN, finish);
  expect(glsl).toContain(GRAIN_TILE_GLSL);
  expect(glsl).not.toContain("==== Finish");
  const webgpu = kitShader(demo, kernel, "webgpu", P, play(null), 300, SEEDS[1], ORIGIN, finish);
  expect(webgpu).toContain(
    "  return grainOver(vec4f(clamp(floor(shade(px) * 255.0 + 0.5009765625), vec3f(0.0), vec3f(255.0)), 255.0), vec2i(px)) / 255.0;"
  );
  expect(webgpu).toContain("{ binding: 2, resource: grainTex.createView() }");
  expect(webgpu).toContain("{ binding: 3, resource: { buffer: grainScale } }");
  expect(webgpu).toContain(
    "gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));"
  );
  expect(kitShader(demo, kernel, "wgsl", P, play(null), 300, SEEDS[1], ORIGIN, finish)).toContain(
    grainTileWgsl(2)
  );
});
