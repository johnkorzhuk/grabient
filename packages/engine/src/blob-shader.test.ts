import { expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import {
  BLOB_DESIGN,
  type BlobScene,
  blobFilter,
  blobNoiseTables,
  blobPlaces,
  blobScene
} from "./blob.ts";
import {
  BLOB_BLUR_FS,
  BLOB_DOTS_FS,
  BLOB_DOTS_VS,
  BLOB_FINAL_FS,
  BLOB_FULL_VS,
  BLOB_NOISE_FS,
  BLOB_RADIUS,
  blobCanvas,
  blobMap,
  blobMelt
} from "./blob-gl.ts";
import { BLOB_MATH, blobSettings } from "./blob-page.ts";
import { blobCredit, blobShader } from "./blob-shader.ts";
import { BLOB_WGSL } from "./blob-wgsl.ts";
import { decodePalette } from "./codec.ts";
import { hexBytes } from "./color.ts";
import { type Effect, parseEffect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";

const KINDS = SHADER_KINDS.map(([kind]) => kind);
const { origin, entries } = golden<{
  origin: string;
  entries: { id: string; seed: string; address: string; texts: Record<ShaderKind, string> }[];
}>("blob-shaders");

const read = (address: string) => parseEffect(new URLSearchParams(address)) as Effect;
/* the lab's palettes: a vivid six, a two-color isoluminant pastel near gray, an eight, an achromatic near gray, a near
   gray keeping its own tint, a pastel five */
const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kQ9hLj-wW4g",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kSMQbGJYI_q4CwC",
  "kCYD0ov39_J_0cKtM",
  "kW0B2lbAbMXISxv1E0NeJVCg"
];
const SIZES = [
  [800, 400],
  [500, 500],
  [1920, 1080],
  [390, 844],
  [333, 777],
  [2560, 1440],
  [1280, 720],
  [100, 100],
  [801, 401]
] as const;

test("the blob's five texts are as before, for six palettes and looks", () => {
  expect(entries.length).toBe(6);
  for (const e of entries) {
    const effect = read(e.address);
    const P = decodePalette(e.seed) as Palette;
    for (const kind of KINDS)
      expect(blobShader(kind, P, effect, e.seed, origin), `${e.id} ${kind}`).toBe(e.texts[kind]);
  }
});

test("each text credits the seed, the effect's address and what it is, and names no angle: the blob has none", () => {
  const effect = read("style=blob&angle=45&speed=3&frost=2&bg=151315");
  expect(blobCredit("webgpu", effect, "kQ9hLj-wW4g", "https://grabient.com/")).toEqual([
    "grabient kQ9hLj-wW4g",
    "https://grabient.com/kQ9hLj-wW4g?style=blob&speed=3&frost=2&bg=%23151315",
    "the blob, the palette's balls melted and frosted, drawn by WebGPU"
  ]);
  const P = decodePalette("kQ9hLj-wW4g") as Palette;
  for (const kind of KINDS) {
    const text = blobShader(kind, P, effect, "kQ9hLj-wW4g");
    expect(text, kind).toContain("grabient kQ9hLj-wW4g");
    expect(text, kind).not.toContain("https://");
    expect(text, kind).not.toMatch(/angle=|\bANGLE\b|\d degrees/);
    expect(blobShader(kind, P, read("style=blob&speed=3&frost=2&bg=151315"), "kQ9hLj-wW4g")).toBe(
      text
    );
  }
});

test("the GLSL is the player's own shaders, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const effect = read("style=blob");
  const glsl = blobShader("glsl", P, effect, SEEDS[0]);
  const webgl = blobShader("webgl", P, effect, SEEDS[0]);
  for (const shader of [
    BLOB_FULL_VS,
    BLOB_NOISE_FS,
    BLOB_DOTS_VS,
    BLOB_DOTS_FS,
    BLOB_BLUR_FS,
    BLOB_FINAL_FS
  ]) {
    expect(glsl).toContain(`\n${shader}\n`);
    /* from the script element's first character, so #version leads it */
    expect(webgl).toContain(`">${shader}</script>`);
  }
  const wgsl = blobShader("wgsl", P, effect, SEEDS[0]);
  const webgpu = blobShader("webgpu", P, effect, SEEDS[0]);
  for (const module of Object.values(BLOB_WGSL)) {
    expect(wgsl).toContain(`\n${module}\n`);
    expect(webgpu).toContain(`">${module}</script>`);
  }
});

/* the pages' script, run in Node: the engine's numbers, as the player's script computes them */
function pageMath(P: Palette, effect: Effect) {
  const names = [
    "colorAt",
    "blobScene",
    "blobFilter",
    "noiseTables",
    "canvasOf",
    "mapOf",
    "meltOf",
    "places",
    "groundOf"
  ];
  return new Function(
    `${blobSettings(P, effect)}\n${BLOB_MATH}\nreturn { ${names.join(", ")} };`
  )() as {
    colorAt: (t: number) => number[];
    blobScene: () => BlobScene;
    blobFilter: (scene: BlobScene) => ReturnType<typeof blobFilter>;
    noiseTables: (seed: number) => ReturnType<typeof blobNoiseTables>;
    canvasOf: typeof blobCanvas;
    mapOf: typeof blobMap;
    meltOf: typeof blobMelt;
    places: typeof blobPlaces;
    groundOf: (bg: string | null) => number[];
  };
}

test("the pages' script computes the engine's colors, scene, filter, tables, layout and places", () => {
  for (const seed of SEEDS)
    for (const address of [
      "style=blob",
      "style=blob&shape=0&frost=2&bg=151315",
      "style=blob&shape=500&frost=0.37&bg=f4f1ea80",
      "style=blob&shape=999&frost=0"
    ]) {
      const P = decodePalette(seed) as Palette;
      const effect = read(address);
      const page = pageMath(P, effect);
      const view = effect.look;
      const scene = blobScene(P, BLOB_DESIGN, view);
      const ours = page.blobScene();
      expect(ours.seed, `${seed} ${address}`).toBe(scene.seed);
      expect(ours.pad).toBe(scene.pad);
      expect(ours.blobs).toEqual(scene.blobs);
      for (const b of scene.blobs.flatMap(blob => blob.balls))
        expect(page.colorAt(b.at)).toEqual(hexBytes(scene.color(b.at)));
      const look = blobFilter(view, BLOB_DESIGN, scene);
      const { speckle: _, octaves: __, ...rest } = look;
      expect(page.blobFilter(ours)).toEqual(rest);
      expect(page.noiseTables(look.seed)).toEqual(blobNoiseTables(look.seed));
      for (const [W, H] of SIZES) {
        expect(page.canvasOf(W, H, 1.5, null)).toEqual(blobCanvas(W, H, 1.5, null));
        const map = blobMap(W, H, 1, 1);
        expect(page.mapOf(W, H, 1, 1)).toEqual(map);
        const a = new Float32Array(BLOB_RADIUS + 1);
        const b = new Float32Array(BLOB_RADIUS + 1);
        expect(page.meltOf(look, map, W, H, a)).toEqual(blobMelt(look, map, W, H, b));
        expect(a).toEqual(b);
      }
      const a = new Float32Array(8 * 24);
      const b = new Float32Array(8 * 24);
      for (const f of [0, 0.123456789, 0.5, 0.999]) {
        page.places(ours, f, a, 8);
        blobPlaces(scene, f, b, 8);
        expect(a).toEqual(b);
      }
      expect(page.groundOf(effect.look.bg)).toEqual(
        effect.look.bg
          ? [
              ...hexBytes(effect.look.bg).map(
                v => (v / 255) * (effect.look.bg?.length === 9 ? 128 / 255 : 1)
              ),
              effect.look.bg.length === 9 ? 128 / 255 : 1
            ]
          : [0, 0, 0, 0]
      );
    }
});

/* 24 palettes of the corpus (apps/web/public/corpus-k.json), drawn at random */
const CORPUS = [
  "kUZHu6xDW-diwPRks77g",
  "kUvG4I36M8GqcNj3Jjfg",
  "kaUTdhKBJLriiwLAqUGPT7Db_KwpMQsLg",
  "kS52lw9jG9Hq1vM",
  "kaKVO5HjRCa62Q1JkMM4hZPXO4wb3xsBg",
  "kUSCGbPJe8lkbPr1lT_A",
  "kaoXgRzLhBs4qw3WK8VX7HC2IrwfcoMHA",
  "kUSETRuh0-diTvNxDL1A",
  "kW7R35eom8vyFsz7Eb3eRm_w",
  "kS4mdDYzY8lhFPW",
  "kWxRz74wjQu0NuXyDTvbAlLw",
  "kc0F0iyyc_jYSRU9nkfWKrAnMtQD8iz2_pE6g",
  "kcyo3n4bG82Eru3jsTy5zE9Go2O7uy7279E_o",
  "kavyyG3YfF9wQy3aJMG17RA1Q-QHPQcBA",
  "kUQlTdsEHBUHOQFWQL9g",
  "kU1BQsXQxKMuTwq8DL2g",
  "kc_TJO-B692MsOHV0D5zFZAELMQE5wsAsTZAA",
  "kYhieK0ZHCc8TRC8GEFKpFACyCPK",
  "kWsYfU17099LMQXWU8G20O_Q",
  "kYPCJnsZo_8OWPRSmThXS-8V2_Pe",
  "kcO3a1oKVNrtFwjPU0BXz_BuwURVuoMy5LHAg",
  "kaWRSqR5W5uMVOhrHre27O8z4wvqpEcCg",
  "kanlt1QCC-KqJwQdEUsppvAzwXPfNoLtg",
  "kU4RFM4wPUk2bRC3PMDA"
];

test("the pages' script computes the engine's numbers for random palettes, looks, boxes and densities", () => {
  const rand = lcg(11);
  const int = (n: number) => Math.floor(rand() * n);
  const byte = () => int(256).toString(16).padStart(2, "0");
  for (const seed of [...SEEDS, ...CORPUS]) {
    const P = decodePalette(seed) as Palette;
    const shape = rand() < 0.25 ? null : int(1000);
    const frost = int(201) / 100;
    const bg = [null, `${byte()}${byte()}${byte()}`, `${byte()}${byte()}${byte()}${byte()}`][
      int(3)
    ];
    const address = `style=blob&frost=${frost}${shape === null ? "" : `&shape=${shape}`}${bg ? `&bg=${bg}` : ""}`;
    const effect = read(address);
    const page = pageMath(P, effect);
    const view = effect.look;
    const scene = blobScene(P, BLOB_DESIGN, view);
    const ours = page.blobScene();
    expect(ours.blobs, `${seed} ${address}`).toEqual(scene.blobs);
    expect([ours.seed, ours.pad]).toEqual([scene.seed, scene.pad]);
    for (const b of scene.blobs.flatMap(blob => blob.balls))
      expect(page.colorAt(b.at), `${seed} ${address}`).toEqual(hexBytes(scene.color(b.at)));
    const look = blobFilter(view, BLOB_DESIGN, scene);
    const { speckle: _, octaves: __, ...rest } = look;
    expect(page.blobFilter(ours)).toEqual(rest);
    expect(page.noiseTables(look.seed)).toEqual(blobNoiseTables(look.seed));
    const alpha = effect.look.bg?.length === 9 ? parseInt(effect.look.bg.slice(7), 16) / 255 : 1;
    expect(page.groundOf(effect.look.bg)).toEqual(
      effect.look.bg
        ? [...hexBytes(effect.look.bg).map(v => (v / 255) * alpha), alpha]
        : [0, 0, 0, 0]
    );
    for (let k = 0; k < 8; k++) {
      /* a box as a page lays it out, in CSS pixels, at a screen's density, with the device box the browser reports */
      const W = int(2400) + 1 + [0, 0.5, 1 / 3, 0.25][int(4)];
      const H = int(1600) + 1 + [0, 0.5, 2 / 3, 0.75][int(4)];
      const dpr = [1, 1.25, 1.5, 2, 2.625, 3][int(6)];
      const device =
        rand() < 0.3
          ? null
          : { w: Math.round(W * dpr) + int(3) - 1, h: Math.round(H * dpr) + int(3) - 1 };
      const canvas = blobCanvas(W, H, dpr, device);
      expect(page.canvasOf(W, H, dpr, device), `${W}x${H} at ${dpr}`).toEqual(canvas);
      const map = blobMap(W, H, canvas.kx, canvas.ky);
      expect(page.mapOf(W, H, canvas.kx, canvas.ky)).toEqual(map);
      const a = new Float32Array(BLOB_RADIUS + 1);
      const b = new Float32Array(BLOB_RADIUS + 1);
      expect(page.meltOf(look, map, canvas.w, canvas.h, a)).toEqual(
        blobMelt(look, map, canvas.w, canvas.h, b)
      );
      expect(a).toEqual(b);
      const x = new Float32Array(8 * 24);
      const y = new Float32Array(8 * 24);
      const f = rand();
      page.places(ours, f, x, 8);
      blobPlaces(scene, f, y, 8);
      expect(x, `${seed} ${address} at ${f}`).toEqual(y);
    }
  }
}, 60_000);
