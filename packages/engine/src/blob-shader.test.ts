import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
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
import { type BlobShaderKind, blobCredit, blobShader } from "./blob-shader.ts";
import { BLOB_WGSL } from "./blob-wgsl.ts";
import { decodePalette } from "./codec.ts";
import { hexBytes } from "./color.ts";
import { type Effect, parseEffect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { parseView } from "./view.ts";

const KINDS: BlobShaderKind[] = ["shadertoy", "glsl", "wgsl", "webgl", "webgpu"];
const { origin, entries } = golden<{
  origin: string;
  entries: { id: string; seed: string; address: string; texts: Record<BlobShaderKind, string> }[];
}>("blob-shaders");

const read = (address: string) => {
  const params = new URLSearchParams(address);
  return { effect: parseEffect(params) as Effect, angle: parseView(params).angle };
};
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
    const { effect, angle } = read(e.address);
    const P = decodePalette(e.seed) as Palette;
    for (const kind of KINDS)
      expect(blobShader(kind, P, effect, angle, e.seed, origin), `${e.id} ${kind}`).toBe(
        e.texts[kind]
      );
  }
});

test("each text credits the seed, the effect's address and what it is", () => {
  const { effect, angle } = read("style=blob&angle=45&speed=3&frost=2&bg=151315");
  expect(blobCredit("webgpu", effect, angle, "kQ9hLj-wW4g", "https://grabient.com/")).toEqual([
    "grabient kQ9hLj-wW4g",
    "https://grabient.com/kQ9hLj-wW4g?style=blob&angle=45&speed=3&frost=2&bg=%23151315",
    "the blob, the palette's balls melted and frosted, drawn by WebGPU"
  ]);
  const P = decodePalette("kQ9hLj-wW4g") as Palette;
  for (const kind of KINDS) {
    const text = blobShader(kind, P, effect, angle, "kQ9hLj-wW4g");
    expect(text, kind).toContain("grabient kQ9hLj-wW4g");
    expect(text, kind).not.toContain("https://");
  }
});

test("the GLSL is the player's own shaders, and the pages run the texts' shaders", () => {
  const P = decodePalette(SEEDS[0]) as Palette;
  const { effect, angle } = read("style=blob");
  const glsl = blobShader("glsl", P, effect, angle, SEEDS[0]);
  const webgl = blobShader("webgl", P, effect, angle, SEEDS[0]);
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
  const wgsl = blobShader("wgsl", P, effect, angle, SEEDS[0]);
  const webgpu = blobShader("webgpu", P, effect, angle, SEEDS[0]);
  for (const module of Object.values(BLOB_WGSL)) {
    expect(wgsl).toContain(`\n${module}\n`);
    expect(webgpu).toContain(`">${module}</script>`);
  }
});

/* the pages' script, run in Node: the engine's numbers, as the player's script computes them */
function pageMath(P: Palette, effect: Effect, angle: number) {
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
    `${blobSettings(P, effect, angle)}\n${BLOB_MATH}\nreturn { ${names.join(", ")} };`
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
      "style=blob&angle=137&shape=0&frost=2&bg=151315",
      "style=blob&angle=300&shape=500&frost=0.37&bg=f4f1ea80",
      "style=blob&angle=0&shape=999&frost=0"
    ]) {
      const P = decodePalette(seed) as Palette;
      const { effect, angle } = read(address);
      const page = pageMath(P, effect, angle);
      const view = { ...effect.look, angle };
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
