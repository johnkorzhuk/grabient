import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kitShadowRun } from "../scripts/kit-gen.ts";
import { AURORA_LOOP, auroraPoint, auroraRange, auroraScene, auroraSolid } from "./aurora.ts";
import { renderAurora } from "./aurora-render.ts";
import { BLOB_LOOP, blobBackdrop, blobRenderer } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import {
  CLEAR_GROUND,
  EFFECTS,
  type EffectFinish,
  type EffectLook,
  effectBare,
  groundParts
} from "./effect.ts";
import {
  blurBoxes,
  blurRgba,
  effectBlurSigma,
  effectUnderlay,
  finishPixels,
  grainOverRgba,
  overUnder
} from "./fx-finish.ts";
import { GLASS_LOOP, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { glassCover, glassRenderer } from "./glass-render.ts";
import demo from "./kit/fields/demo.ts";
import { KERNEL_COST } from "./kit/gen/demo.ts";
import { KIT_KERNEL_COSTS, KIT_KERNEL_KINDS } from "./kit/gen/kernel-order.ts";
import { isKitKind, KIT_KINDS } from "./kit/kinds.ts";
import { kitEffect } from "./kit/registry.ts";
import { kitRender } from "./kit/render.ts";
import { kitScene } from "./kit/scene.ts";
import type { FieldEffect } from "./kit/types.ts";
import { mp4 } from "./mp4.ts";
import { PAPERCUT_LOOP, papercutScene } from "./papercut.ts";
import { renderPapercut } from "./papercut-render.ts";
import { rosetteDesign, rosetteScene } from "./rosette.ts";
import { renderRosette } from "./rosette-render.ts";
import { SILK_LOOP, silkScene } from "./silk.ts";
import { renderSilk } from "./silk-render.ts";
import { STRINGS_LOOP, stringsScene, stringsSolid } from "./strings.ts";
import { stringsDesignedGround } from "./strings-ground.ts";
import { renderStrings } from "./strings-render.ts";
import {
  AURORA_WEIGHT,
  auroraVideoWeight,
  kitVideoDrawer,
  kitVideoWeight,
  VIDEO_LIMITS,
  VIDEO_MODULE,
  VIDEO_QUALITY,
  VIDEO_WEIGHT,
  type VideoAsk,
  type VideoBlur,
  type VideoKind,
  type VideoPlan,
  videoAt,
  videoBlurScale,
  videoDrawer,
  videoDuration,
  videoFit,
  videoFrames,
  videoLoop,
  videoParts,
  videoPlan,
  videoQp,
  videoQuality,
  videoWeight,
  videoWork
} from "./video.ts";
import { videoBlur, videoFinish } from "./video-finish.ts";
import { hasVideo, VIDEO_KINDS } from "./video-kinds.ts";
import type { Size } from "./view.ts";

/* Node's WebAssembly, as much of it as this names (the engine's lib knows no host, as video.ts says) */
declare const WebAssembly: {
  Module: { new (bytes: Uint8Array): object; imports(module: object): unknown[] };
  Instance: new (module: object, imports: object) => { readonly exports: object };
};
const wasmFile = readFileSync(new URL("./video/video.wasm", import.meta.url));
const wasm = new WebAssembly.Module(wasmFile);
const palette = decodePalette("kWnCIwwC47igfOklkTlShq44");
if (!palette) throw new Error("the test's palette");
const look = { shape: null, frost: 1, bg: null, steps: null, zoom: null, path: null };
const glass = { kind: "glass", look } as const;
const blob = { kind: "blob", look } as const;

describe("video.wasm", () => {
  it("imports nothing, so a Worker loads it as it is", () => {
    expect(WebAssembly.Module.imports(wasm)).toEqual([]);
  });

  it("is named by its contents, which a drawing goes on from a kept state by", () => {
    expect(VIDEO_MODULE).toBe(createHash("sha256").update(wasmFile).digest("hex").slice(0, 12));
  });
});

describe("the clips' kinds", () => {
  it("are every effect, each drawn by the module, which the address and the editor read from one list", () => {
    expect(EFFECTS.filter(hasVideo)).toEqual([...VIDEO_KINDS]);
    expect(VIDEO_KINDS).toContain("papercut");
    expect(VIDEO_KINDS).toContain("strings");
    const size = { width: 32, height: 24 };
    for (const kind of VIDEO_KINDS) {
      const ask: VideoAsk = { kind, palette, look, angle: 135, size, fps: 10 };
      const drawer = videoDrawer(wasm, ask, videoPlan(ask, 2.45, 10, 1), VIDEO_QUALITY[kind], true);
      drawer.draw(0);
      expect(drawer.code(0).length, kind).toBeGreaterThan(0);
    }
  });
});

describe("videoAt", () => {
  const asked = { width: 640, height: 360 };
  const at = (query: string) => videoAt(new URLSearchParams(query), asked);

  it("names a clip of each effect the clips' list names, and of no other style", () => {
    for (const kind of VIDEO_KINDS) expect(at(`style=${kind}`)?.kind).toBe(kind);
    for (const kind of EFFECTS.filter(kind => !hasVideo(kind)))
      expect(at(`style=${kind}`), kind).toBeNull();
    expect(at("style=linearGradient")).toBeNull();
  });

  it("reads an address's effect, angle, soft, grain and duration, and fits the size it asks for", () => {
    const clip = at("style=silk&angle=135&soft=40&grain=30&speed=2&fps=30&shape=7&duration=12");
    expect(clip).toMatchObject({
      kind: "silk",
      angle: 135,
      finish: { soft: 40, grain: 30 },
      duration: 12,
      effect: { kind: "silk", speed: 2, fps: 30, look: { shape: 7 } }
    });
    const fit = videoFit(
      { kind: "silk", look: clip!.effect.look, finish: { soft: 40, grain: 30 } },
      2,
      30,
      12,
      asked
    );
    expect([clip?.size, clip?.fps, clip?.plan]).toEqual([fit.size, fit.fps, fit.plan]);
  });

  it("plays the glass where no style is named, and one blob for every angle", () => {
    expect(at("angle=20")).toMatchObject({ kind: "glass", angle: 20 });
    expect(at("style=blob&angle=20")?.angle).toBe(90);
  });
});

describe("videoPlan", () => {
  it("plays one loop where no duration is asked, in whole frames", () => {
    const plan = videoPlan(glass, 2.45, 60, null);
    expect(plan.frames).toBe(Math.round((GLASS_LOOP / 2.45) * 60));
    expect(plan.loops).toBe(1);
    expect(plan.speed).toBeCloseTo(2.45, 2);
    expect(plan.seconds).toBe(plan.frames / 60);
  });

  it("fills a duration with whole loops, the speed nudged to fit them", () => {
    const plan = videoPlan(glass, 2.45, 30, 20);
    expect(plan.frames).toBe(600);
    expect(plan.loops).toBe(1);
    expect(plan.speed).toBeCloseTo(GLASS_LOOP / 20, 6);
    const many = videoPlan(blob, 5, 30, 20);
    expect(many.loops).toBe(Math.round((20 * 5) / BLOB_LOOP));
    expect(many.speed).toBeCloseTo((many.loops * BLOB_LOOP) / 20, 6);
  });

  it("holds the first frame at speed 0", () => {
    expect(videoPlan(blob, 0, 30, 2)).toEqual({ frames: 60, loops: 0, speed: 0, seconds: 2 });
    expect(videoPlan(glass, 0, 30, null).frames).toBe(30);
  });
});

describe("videoDuration", () => {
  it("reads seconds within the limits, and nothing else", () => {
    expect(videoDuration("12.5")).toBe(12.5);
    expect(videoDuration("0.1")).toBe(VIDEO_LIMITS.least);
    expect(videoDuration("9999")).toBe(VIDEO_LIMITS.seconds);
    expect([
      videoDuration("0"),
      videoDuration("-3"),
      videoDuration("ten"),
      videoDuration(null)
    ]).toEqual([null, null, null, null]);
  });
});

describe("videoFit", () => {
  it("keeps sides even and the rate, the length and the work within the limits", () => {
    const fit = videoFit(glass, 2.45, 60, null, { width: 1080, height: 1080 });
    expect(fit.size).toEqual({ width: 1080, height: 1080 });
    expect(fit.size.width * fit.size.height * fit.plan.frames).toBeLessThanOrEqual(
      VIDEO_LIMITS.work
    );
    const odd = videoFit(glass, 2.45, 30, 4, { width: 641, height: 361 });
    expect([odd.size.width % 2, odd.size.height % 2]).toEqual([0, 0]);
    expect(videoFit(blob, 1, 240, 4, { width: 100, height: 100 }).fps).toBe(VIDEO_LIMITS.fps);
    const big = videoFit(glass, 1, 60, 60, { width: 3840, height: 2160 });
    expect(big.size.width * big.size.height * big.plan.frames).toBeLessThanOrEqual(
      VIDEO_LIMITS.work
    );
    expect(Math.max(big.size.width, big.size.height)).toBeLessThanOrEqual(VIDEO_LIMITS.side);
    const frosted = videoFit(blob, 1, 60, 60, { width: 1920, height: 1080 });
    expect(videoWork(blob, frosted.size, frosted.plan.frames)).toBeLessThanOrEqual(
      VIDEO_LIMITS.work
    );
  });

  it("plays a loop longer than the longest clip in that time", () => {
    const slow = videoFit(glass, 0.1, 30, null, { width: 320, height: 180 });
    expect(slow.plan.seconds).toBe(VIDEO_LIMITS.seconds);
    expect(slow.plan.loops).toBe(1);
  });
});

describe("videoParts", () => {
  it("shares out every frame once, in order, each part within its work", () => {
    const plan = videoPlan(glass, 2.45, 60, null);
    const size = { width: 1080, height: 1080 };
    const runs = videoParts(glass, plan, size, 55_000_000);
    expect(runs[0][0]).toBe(0);
    expect(runs.at(-1)?.[1]).toBe(plan.frames);
    for (let i = 1; i < runs.length; i++) expect(runs[i][0]).toBe(runs[i - 1][1]);
    for (const [from, to] of runs)
      expect((to - from) * size.width * size.height).toBeLessThanOrEqual(60_000_000);
    expect(videoParts(glass, videoPlan(glass, 0, 30, 3), size, 1)).toEqual([[0, 90]]);
  });
});

describe("videoQuality", () => {
  it("codes a blob grained with less frost than designed as the glass, every other as before", () => {
    const thin = { ...blob, look: { ...look, frost: 0.5 } };
    expect(videoQuality(blob)).toEqual(VIDEO_QUALITY.blob);
    expect(videoQuality({ ...blob, finish: {} })).toEqual(VIDEO_QUALITY.blob);
    expect(videoQuality({ ...thin, finish: { grain: 30 } })).toEqual(VIDEO_QUALITY.glass);
    /* the frost holds the grain as the glass's coding holds the glass's */
    expect(videoQuality({ ...blob, finish: { grain: 30 } })).toEqual(VIDEO_QUALITY.blob);
    /* and a blob takes no soft */
    expect(videoQuality({ ...thin, finish: { soft: 40 } })).toEqual(VIDEO_QUALITY.blob);
    for (const kind of ["glass", "silk", "rosette", "papercut", "strings", "aurora"] as const)
      expect(videoQuality({ kind, look, finish: { soft: 40, grain: 30 } })).toEqual(
        VIDEO_QUALITY[kind]
      );
  });

  it("is what a clip's frames are coded at", () => {
    const size = { width: 64, height: 48 };
    const thin = { ...look, frost: 0.5 };
    const ask: VideoAsk = {
      kind: "blob",
      palette,
      look: thin,
      angle: 90,
      size,
      fps: 10,
      finish: videoFinish(palette, { ...blob, look: thin }, 90, { grain: 30 }, size)
    };
    const plan = videoPlan(blob, 2, 10, 2);
    const coded = (quality?: typeof VIDEO_QUALITY.blob) =>
      videoFrames(wasm, ask, plan, 0, plan.frames, null, quality).frames.map(f => f.data);
    expect(coded()).toEqual(coded(VIDEO_QUALITY.glass));
    expect(coded()).not.toEqual(coded(VIDEO_QUALITY.blob));
  });
});

describe("videoQp", () => {
  it("codes the key frame and the frames easing into the loop's seam finer", () => {
    const q = VIDEO_QUALITY.glass;
    expect(videoQp(q, 0, 200)).toBe(q.keyQp);
    expect(videoQp(q, 100, 200)).toBe(q.qp);
    expect(videoQp(q, 199, 200)).toBe(q.keyQp);
    const ramp = Array.from({ length: q.ramp + 2 }, (_, i) =>
      videoQp(q, 200 - q.ramp - 2 + i, 200)
    );
    expect(ramp).toEqual([...ramp].sort((a, b) => b - a));
  });
});

describe("the module's frames", () => {
  /* The engine's own frames, as the PNG and the cards draw them, against the module's: within two levels, which the
     module's single precision allows, and the same nearly everywhere. */
  const compare = (
    ask: VideoAsk,
    reference: (i: number, frames: number) => ArrayLike<number>,
    stride: number
  ) => {
    const plan = videoPlan(ask, 2.45, ask.fps, null);
    const drawer = videoDrawer(wasm, ask, plan, VIDEO_QUALITY[ask.kind], true);
    let worst = 0;
    let off = 0;
    for (const i of [0, 7, Math.floor(plan.frames / 2)]) {
      drawer.draw(i);
      const ours = drawer.rgb();
      const theirs = reference(i, plan.frames);
      for (let p = 0; p < ask.size.width * ask.size.height; p++) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(ours[3 * p + c] - theirs[stride * p + c]);
          worst = Math.max(worst, d);
          if (d) off++;
        }
      }
    }
    return { worst, share: off / (3 * 3 * ask.size.width * ask.size.height) };
  };

  it("are the glass's, as glassRenderer draws it", () => {
    for (const [size, angle, shape] of [
      [{ width: 160, height: 90 }, 135, null],
      [{ width: 96, height: 128 }, 20, 417]
    ] as const) {
      const ask: VideoAsk = {
        kind: "glass",
        palette,
        look: { ...look, shape },
        angle,
        size,
        fps: 30
      };
      const { geometry, window } = glassCover(size, 1, angle, shape);
      const renderer = glassRenderer(geometry, window);
      const field = glassField(geometry, glassColors(palette));
      const { worst, share } = compare(
        ask,
        (i, n) => renderer.frame(field, (i * GLASS_LOOP) / n),
        4
      );
      expect(worst).toBeLessThanOrEqual(2);
      expect(share).toBeLessThan(0.001);
    }
  });

  it("are the blob's, as blobRenderer draws it on its ground", () => {
    for (const blobLook of [
      look,
      { shape: 3, frost: 2, bg: "#ffeeddaa", steps: null, zoom: null, path: null },
      { shape: 999, frost: 0, bg: "#102030", steps: null, zoom: null, path: null }
    ]) {
      const size = { width: 120, height: 96 };
      const ask: VideoAsk = { kind: "blob", palette, look: blobLook, angle: 90, size, fps: 30 };
      const renderer = blobRenderer(palette, blobLook, size, blobBackdrop(palette));
      const { worst, share } = compare(ask, (i, n) => renderer.frame(i / n), 3);
      expect(worst).toBeLessThanOrEqual(2);
      expect(share).toBeLessThan(0.01);
    }
  });

  it("are the silk's and the rosette's, as renderSilk and renderRosette draw them", () => {
    for (const [size, angle, shape] of [
      [{ width: 160, height: 90 }, 135, null],
      [{ width: 96, height: 128 }, 20, 417]
    ] as const) {
      const silk: VideoAsk = {
        kind: "silk",
        palette,
        look: { ...look, shape },
        angle,
        size,
        fps: 30
      };
      const scene = silkScene(palette, { angle, shape }, size);
      const woven = compare(silk, (i, n) => renderSilk(scene, (i * SILK_LOOP) / n), 4);
      expect(woven.worst).toBeLessThanOrEqual(1);
      expect(woven.share).toBeLessThan(0.001);
      const rosette: VideoAsk = { ...silk, kind: "rosette" };
      const flower = rosetteScene(palette, { angle, shape }, size);
      const grown = compare(rosette, (i, n) => renderRosette(flower, i / n), 4);
      expect(grown.worst).toBeLessThanOrEqual(1);
      expect(grown.share).toBeLessThan(0.001);
    }
  });

  it("are the papercut's, as renderPapercut draws it: its own arithmetic, the same bytes", () => {
    /* the module computes as the CPU drawing does, in double precision, but for the waves' third and fourth sines
       (sums of their terms across and down) and its own sin, cos and exp, each within a hair of V8's: a byte could
       differ only where a value lies within that hair of a rounding's half */
    for (const [size, angle, shape] of [
      [{ width: 160, height: 90 }, 135, null],
      [{ width: 96, height: 128 }, 20, 417],
      [{ width: 202, height: 114 }, 300, 7],
      [{ width: 18, height: 64 }, 90, 999]
    ] as const) {
      const ask: VideoAsk = {
        kind: "papercut",
        palette,
        look: { ...look, shape },
        angle,
        size,
        fps: 30
      };
      const scene = papercutScene(palette, { angle, shape }, size);
      const cut = compare(ask, (i, n) => renderPapercut(scene, (i * PAPERCUT_LOOP) / n), 4);
      expect(cut.worst, `${size.width}x${size.height} ${angle} ${shape}`).toBeLessThanOrEqual(1);
      expect(cut.share).toBeLessThan(1e-5);
    }
  });

  it("are the strings', as renderStrings draws them: their own arithmetic, the same bytes", () => {
    /* the module computes as the CPU drawing does, in double precision, two pixels at a time, its cells past the
       blob's ends the ground alone as the CPU drawing's are, its sin and cos V8's own: none of its bytes differs from
       Node's (the strings' threads round right at a half wherever one covers a pixel whole in a color 100 levels off
       its ground, which sin and cos merely within an ulp of V8's moved) */
    for (const [size, angle, shape] of [
      [{ width: 160, height: 90 }, 135, null],
      [{ width: 96, height: 128 }, 20, 417],
      [{ width: 202, height: 114 }, 300, 7],
      [{ width: 18, height: 64 }, 90, 999],
      [{ width: 320, height: 96 }, 0, 12]
    ] as const) {
      const ask: VideoAsk = {
        kind: "strings",
        palette,
        look: { ...look, shape },
        angle,
        size,
        fps: 30
      };
      const scene = stringsScene(palette, { angle, shape, bg: null }, size);
      const drawn = compare(ask, (i, n) => renderStrings(scene, (i * STRINGS_LOOP) / n), 4);
      expect(drawn, `${size.width}x${size.height} ${angle} ${shape}`).toEqual({
        worst: 0,
        share: 0
      });
    }
  });

  it("are the strings' on a ground, as renderStrings draws them where a picture cannot be clear: the same bytes", () => {
    /* a clip is never clear: a ground that lets the page through laid over the designed one (stringsSolid), as the blob's
       clips lay theirs over near black or near white; a whole one is its own */
    for (const [bg, size, angle, shape] of [
      ["#f4efe6", { width: 160, height: 90 }, 135, null],
      ["#10203080", { width: 96, height: 128 }, 20, 417],
      [CLEAR_GROUND, { width: 202, height: 114 }, 300, 7]
    ] as const) {
      const ask: VideoAsk = {
        kind: "strings",
        palette,
        look: { ...look, shape, bg },
        angle,
        size,
        fps: 30
      };
      const scene = stringsSolid(stringsScene(palette, { angle, shape, bg }, size));
      expect(scene.alpha).toBe(1);
      const drawn = compare(ask, (i, n) => renderStrings(scene, (i * STRINGS_LOOP) / n), 4);
      expect(drawn, `${bg} ${size.width}x${size.height}`).toEqual({ worst: 0, share: 0 });
    }
  });

  it("are the aurora's, as renderAurora draws it behind a range that is never clear, within a level", () => {
    /* the module draws four pixels at once in single precision from what the engine kept of each (its place on the
       fan, its height over the range, how much of the light shows), where renderAurora works each out in double
       precision: a channel differs, by one level, where its value lies within a hair of a rounding's half (0.002% to
       0.017% of them, 11 Nov 2026). A range that lets the page through is laid over the blob's backdrop, as a
       card's */
    const walled = "line,0:30,20:30,20:55,35:55,35:38,100:38";
    for (const [size, angle, path, bg] of [
      [{ width: 160, height: 90 }, 90, null, null],
      [{ width: 96, height: 128 }, 20, walled, "#140b19"],
      [{ width: 200, height: 200 }, 45, "line,25,25,curve,45,60,45,25,line,25,40,25", null],
      [{ width: 130, height: 74 }, 135, "curve,30,55,35,60,30", "#10203080"]
    ] as const) {
      const ask: VideoAsk = {
        kind: "aurora",
        palette,
        look: { ...look, path, bg },
        angle,
        size,
        fps: 30
      };
      const scene = auroraSolid(
        auroraScene(palette, { angle, path, bg }, size),
        blobBackdrop(palette)
      );
      expect(scene.cover).toBe(1);
      const drawn = compare(ask, (i, n) => renderAurora(scene, (i * AURORA_LOOP) / n), 4);
      expect(drawn.worst, `${path} ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
      expect(drawn.share, `${path} ${size.width}x${size.height}`).toBeLessThan(0.001);
    }
  });

  it("loop: the frame a loop on is the first", () => {
    const most = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      Array.from(a).reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
    const size = { width: 64, height: 48 };
    /* the glass's, the silk's, the papercut's and the strings' time runs on past the loop, so the module draws the
       frame after the last: the papercut's and the strings' are their first exactly, as their motions are whole
       cycles of their loops; the aurora's drawer wraps its time, every sheet sliding whole tiles a loop */
    for (const kind of ["glass", "silk", "papercut", "strings", "aurora"] as const) {
      const ask: VideoAsk = { kind, palette, look, angle: 135, size, fps: 30 };
      const plan = videoPlan(ask, 2.45, 30, null);
      const drawer = videoDrawer(wasm, ask, plan, VIDEO_QUALITY[kind], true);
      drawer.draw(0);
      const first = drawer.rgb().slice();
      drawer.draw(plan.frames);
      expect(most(drawer.rgb(), first), kind).toBeLessThanOrEqual(1);
    }
    /* the blob's and the rosette's drawers wrap their phase, so the module's frame there is the first by
       construction: their designs at a loop's end against its start */
    const melt = blobRenderer(palette, look, size, blobBackdrop(palette));
    expect(most(melt.frame(1), melt.frame(0)), "blob").toBeLessThanOrEqual(1);
    /* at a clip's sizes: a box of 64 by 48 has its innermost petals under a pixel at the heart, where a few channels
       differ by up to 7 */
    for (const shape of [null, 417, 7]) {
      const flower = rosetteScene(palette, { angle: 135, shape }, { width: 160, height: 90 });
      expect(
        most(renderRosette(flower, 1), renderRosette(flower, 0)),
        `rosette ${shape}`
      ).toBeLessThanOrEqual(2);
    }
  });
});

describe("a field effect's clips (kit/)", () => {
  /* the kit's demo, never an effect of the site, drawn by the kit's own path as any field effect is before it is one:
     the module's frames against kitRender's, which compute alike in double precision, the kernel kit-gen's C, and
     every function of Math V8's own, so every byte is the CPU drawing's */
  const frames = 120;
  const plan: VideoPlan = {
    frames,
    loops: 1,
    speed: (demo.loop * 30) / frames,
    seconds: frames / 30
  };
  const apart = (
    def: FieldEffect,
    size: Size,
    angle: number,
    shape: number | null,
    steps: number | null = null
  ) => {
    const ask = { palette, look: { ...look, shape, steps }, angle, size, fps: 30 };
    const drawer = kitVideoDrawer(wasm, def, ask, plan, VIDEO_QUALITY.glass, true);
    const scene = kitScene(def, palette, { angle, shape, steps }, size);
    let worst = 0;
    let off = 0;
    for (const i of [0, 7, 61]) {
      drawer.draw(i);
      const ours = drawer.rgb();
      const theirs = kitRender(scene, (i * def.loop) / frames);
      for (let p = 0; p < size.width * size.height; p++)
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(ours[3 * p + c] - theirs[4 * p + c]);
          worst = Math.max(worst, d);
          if (d) off++;
        }
    }
    return { worst, off };
  };

  it("are kitRender's, its arithmetic in C: the same bytes at every size, angle and shape", () => {
    for (const [size, angle, shape] of [
      [{ width: 160, height: 90 }, 135, null],
      [{ width: 96, height: 128 }, 20, 417],
      [{ width: 202, height: 114 }, 300, 7],
      [{ width: 18, height: 64 }, 90, 999]
    ] as const) {
      expect(
        apart(demo, size, angle, shape),
        `${size.width}x${size.height} ${angle} ${shape}`
      ).toEqual({
        worst: 0,
        off: 0
      });
    }
  });

  it("hold every kernel kit-gen wrote, in its order: each kind's frames are kitRender's", () => {
    /* a module built before `pnpm kit:gen` wrote a kernel draws another kind's in its place, or none */
    for (const kind of KIT_KERNEL_KINDS)
      expect(
        apart(kind === "demo" ? demo : kitEffect(kind), { width: 64, height: 36 }, 135, null),
        kind
      ).toEqual({ worst: 0, off: 0 });
  });

  it("draw an effect the view's steps space at any steps as kitRender does: its levels and hops the scene's", () => {
    /* the sandstone at its fewest and most steps, and the demo's stripes with a soft shadow and lines by maps, every
       level the steps space (its sheets' step and hop, its lines', a soft shadow's rise), at both ends of its range */
    const sheets = demo.sheets!;
    const spaced: FieldEffect = {
      ...demo,
      sheets: {
        ...sheets,
        count: null,
        colors: { hop: 0.13, offset: 0.2, wrap: "cycle" },
        shadow: { ...sheets.shadow!, steps: 3, spread: 0.6 }
      },
      lines: { ...demo.lines!, colors: { hop: 0.21, offset: 0.1, wrap: "mirror" } },
      steps: { least: 6, most: 30, designed: 12 }
    };
    for (const [def, steps] of [
      [kitEffect("strata"), 8],
      [kitEffect("strata"), 40],
      [spaced, 6],
      [spaced, 30]
    ] as const)
      for (const [size, angle, shape] of [
        [{ width: 96, height: 54 }, 135, null],
        [{ width: 48, height: 80 }, 20, 417]
      ] as const)
        expect(
          apart(def, size, angle, shape, steps),
          `${def.kind} ${steps} ${size.width}x${size.height}`
        ).toEqual({ worst: 0, off: 0 });
  });

  it("are compiled before any macro of the module's, so a kernel keeps the names its author wrote", () => {
    /* compile.ts lets a kernel's locals take names such as CS, L0 or INT32_MAX, which a macro of video.c's, of
       minih264e.h's or of <stdint.h>'s (through <wasm_simd128.h>) defined above the kernels would rewrite, failing the
       module's build far from the kernel */
    const source = readFileSync(new URL("./video/video.c", import.meta.url), "utf8");
    expect(source.match(/^#.*$/m)?.[0]).toBe('#include "kit-kernels.c"');
  });

  it("shade every recipe as kitRender does: soft and tinted shadows, lit rims, endless stripes, each map", () => {
    /* a shadow cast up the field's slope (at 240 degrees, against the demo's ramp at these views) covers pixels by
       many whole shadows, which kitShade runs past its window of sheets: in one product for the ink, each in turn for
       the sheet below's color, the topmost sixteen */
    const sheets = demo.sheets;
    const lines = demo.lines;
    if (!sheets?.shadow || !sheets.rim || !lines)
      throw new Error("the demo's sheets, shadow, rim and lines");
    const recipes: Record<string, Partial<FieldEffect>> = {
      "soft shadow, endless stripes, cycle, darkest lines": {
        sheets: {
          ...sheets,
          count: null,
          colors: { hop: 0.13, offset: 0.2, wrap: "cycle" },
          shadow: { ...sheets.shadow, alpha: 0.5, steps: 3, spread: 0.6 }
        },
        lines: { ...lines, colors: "darkest" }
      },
      "rim alone, mirror, lines by a map": {
        sheets: { ...sheets, shadow: null, colors: { hop: 0.37, offset: -0.4, wrap: "mirror" } },
        lines: {
          base: 0.03,
          step: 0.05,
          half: 0.01,
          colors: { hop: 0.21, offset: 0.1, wrap: "mirror" },
          alpha: 0.8
        }
      },
      "lines alone": {
        sheets: null,
        lines: {
          base: 0,
          step: 0.04,
          half: 0.006,
          colors: { hop: 0.09, offset: 0.5, wrap: "clamp" },
          alpha: 1
        }
      },
      "four layers of a long shadow, three sheets, no rim": {
        sheets: {
          ...sheets,
          count: 3,
          step: 0.3,
          rim: null,
          shadow: { angle: 200, distance: 0.03, alpha: 0.9, swing: 40, steps: 4, spread: 1 }
        },
        lines: null
      },
      "a light ground, lifted stops": {
        ground: { pick: "lightest", lightness: 0.6, bound: 0.9, chroma: 0.5, lift: 0.15 },
        sheets: { ...sheets, count: null, shadow: { ...sheets.shadow, steps: 2, spread: 0.3 } },
        lines: { ...lines, colors: { hop: 0.5, offset: 0, wrap: "cycle" } }
      },
      "stripes and lines finer than a pixel, under whole shadows": {
        sheets: {
          ...sheets,
          count: null,
          step: 0.004,
          shadow: { ...sheets.shadow, angle: 240, distance: 0.05, steps: 4, spread: 0.9 }
        },
        lines: { ...lines, step: 0.003, half: 0.001 }
      },
      "shadows the sheet below or the ground darkened, rims their sheet's own color lit": {
        /* sheets from the field's middle up on a light ground, so the first sheet's shadow falls on the ground in the
           ground's color darkened: the demo's first sheet covers the whole box at these views (its level -0.66, the
           field's lowest -0.634 and -0.601), and a shadow on its near-black ground differs from none by a level or
           two, on this one by up to 15 (8 Nov 2026: a module taking the ground undarkened, 1,285 channels off here) */
        ground: { pick: "lightest", lightness: 0.6, bound: 0.9, chroma: 0.5, lift: 0.15 },
        sheets: {
          ...sheets,
          base: 0,
          step: 0.1,
          count: 5,
          shadow: { ...sheets.shadow, tint: "below", depth: 0.5 },
          rim: { ...sheets.rim, tint: "own", lift: 0.3 }
        }
      },
      "past sixteen whole shadows, each the sheet below darkened": {
        /* levels from the field's middle, their colors cycling every 73 sheets: shadows then fall from sheets under 0
           too, the sheet below each still a sheet's color by the map where no count ends the stack, and the sheets of
           a run past sixteen each take their own, so only the topmost sixteen give kitRender's pixel. Under the demo's
           base and map no sheet lies under 0 at these views and every one from 11 up takes the last stop (8 Nov 2026:
           modules compositing the first sixteen, or casting the shadows of sheet 0 and those under it in the ground's
           color, were exact there and 28,518 and 26,607 channels off here) */
        sheets: {
          ...sheets,
          base: 0,
          count: null,
          step: 0.002,
          colors: { hop: 0.0137, offset: 0.1, wrap: "cycle" },
          shadow: {
            ...sheets.shadow,
            angle: 240,
            distance: 0.1,
            steps: 2,
            spread: 0.5,
            tint: "below"
          },
          rim: { ...sheets.rim, tint: "own" }
        },
        lines: null
      }
    };
    for (const [name, recipe] of Object.entries(recipes))
      for (const [size, angle, shape] of [
        [{ width: 96, height: 54 }, 135, null],
        [{ width: 62, height: 98 }, 17, 31]
      ] as const)
        expect(apart({ ...demo, ...recipe }, size, angle, shape), `${name} ${angle}`).toEqual({
          worst: 0,
          off: 0
        });
  });

  it("loop: the frame a loop on is the first, its phases whole cycles of the loop", () => {
    const ask = { palette, look, angle: 135, size: { width: 64, height: 48 }, fps: 30 };
    const drawer = kitVideoDrawer(wasm, demo, ask, plan, VIDEO_QUALITY.glass, true);
    drawer.draw(0);
    const first = drawer.rgb().slice();
    drawer.draw(frames);
    expect(drawer.rgb()).toEqual(first);
  });

  it("are finished as finishPixels finishes kitRender's frame: the grain exactly, a soft within a level", () => {
    /* a field effect takes the view's angle and stands opaque, as the strings do, whose underlay is the palette's
       gradient at that angle; the soft at each resolution its blur runs at, and wide against a short side */
    const effect = { kind: "strings" as const, look };
    for (const [size, finish, scale] of [
      [{ width: 96, height: 54 }, { grain: 60 }, 1],
      [{ width: 160, height: 90 }, { soft: 60, grain: 30 }, 1],
      [{ width: 160, height: 90 }, { soft: 100 }, 2],
      [{ width: 320, height: 180 }, { soft: 100, grain: 100 }, 4],
      [{ width: 1920, height: 16 }, { soft: 40, grain: 30 }, undefined],
      [{ width: 18, height: 1080 }, { soft: 40 }, undefined]
    ] as [Size, EffectFinish, VideoBlur["scale"] | undefined][]) {
      const angle = 135;
      const ask = {
        palette,
        look,
        angle,
        size,
        fps: 30,
        finish: videoFinish(palette, effect, angle, finish, size, scale)
      };
      const drawer = kitVideoDrawer(wasm, demo, ask, plan, VIDEO_QUALITY.glass, true);
      const scene = kitScene(demo, palette, { angle, shape: null }, size);
      const back = blobBackdrop(palette);
      const underlay = effectUnderlay(palette, effect, angle, finish.soft);
      let worst = 0;
      for (const i of [0, 61]) {
        drawer.draw(i);
        const ours = drawer.rgb();
        const done = finishPixels(
          kitRender(scene, (i * demo.loop) / frames),
          size,
          finish,
          underlay
        );
        for (let p = 0; p < size.width * size.height; p++) {
          const a = done[4 * p + 3] / 255;
          for (let c = 0; c < 3; c++) {
            const theirs = Math.round(done[4 * p + c] * a + back[c] * (1 - a));
            worst = Math.max(worst, Math.abs(ours[3 * p + c] - theirs));
          }
        }
      }
      expect(worst, `${size.width}x${size.height} ${JSON.stringify(finish)}`).toBeLessThanOrEqual(
        finish.soft ? 1 : 0
      );
    }
  });

  it("draw none whose kernel the module lacks, or whose design it cannot hold", () => {
    const ask = { palette, look, angle: 135, size: { width: 32, height: 24 }, fps: 30 };
    expect(() =>
      kitVideoDrawer(wasm, { ...demo, kind: "absent" }, ask, plan, VIDEO_QUALITY.glass)
    ).toThrow(/no kernel for absent/);
    /* the demo's 28 constants and 1,002 more, past the 1,024 the module keeps */
    const more: FieldEffect = {
      ...demo,
      uniforms: { ...demo.uniforms, more: 1002 },
      design: seed => {
        const d = demo.design(seed);
        return { ...d, U: { ...d.U, more: Array<number>(1002).fill(0) } };
      }
    };
    expect(() => kitVideoDrawer(wasm, more, ask, plan, VIDEO_QUALITY.glass)).toThrow(
      /reads 1030 constants and sets 7 phases, past the module's 1024 and 64/
    );
  });

  it("weigh their kernel's reads and their shading, a shadow's run by the levels it crosses: the demo 49", () => {
    const sheets = demo.sheets;
    if (!sheets?.shadow || !sheets.rim) throw new Error("the demo's sheets, shadow and rim");
    /* a recipe on the demo's kernel, its shadows' run worked out as kit-gen works it out for the weights in use */
    const weigh = (def: FieldEffect) => kitVideoWeight(def, 112, kitShadowRun(def));
    expect(KERNEL_COST).toBe(112);
    expect(weigh(demo)).toBeCloseTo(48.96, 9);
    /* no shadow and no rim: the kernel read once a pixel */
    const bare = { ...sheets, shadow: null, rim: null };
    expect(weigh({ ...demo, sheets: bare })).toBeCloseTo(24.32, 9);
    /* the dearest recipe measured: four layers of a long shadow in the sheet below's color, rims lit in their own */
    const shadow = { ...sheets.shadow, distance: 0.1, steps: 4, spread: 1, tint: "below" as const };
    const dense = {
      ...sheets,
      count: null,
      step: 0.002,
      shadow,
      rim: { ...sheets.rim, tint: "own" as const }
    };
    expect(weigh({ ...demo, sheets: dense })).toBeCloseTo(85.96, 9);
    /* the run past kitShade's window is charged by the share of pixels whose shadow crosses more than four levels, its
       length times the field's slope over the step: none for a shadow longer than the step over levels too far apart
       on the screen to cross three, nearly all for a shorter one over a field twenty times as steep */
    const sparse = { ...sheets, shadow: { ...sheets.shadow, distance: 0.13 } };
    expect(weigh({ ...demo, sheets: sparse })).toBeCloseTo(48.96, 9);
    const steep = weigh({
      ...demo,
      field: (x, y, U, F) => 20 * demo.field(x, y, U, F),
      sheets: { ...sheets, shadow: { ...sheets.shadow, distance: 0.1 } }
    });
    expect(steep).toBeGreaterThan(48.96 + 0.9 * 6);
    expect(steep).toBeLessThanOrEqual(48.96 + 6);
  });

  it("weigh each kind by the cost and the shadows' run kit-gen wrote at its place", () => {
    /* VIDEO_WEIGHT reads kit/gen/kernel-order.ts by the kind's place, never working the run out as the module starts */
    for (const kind of KIT_KINDS) {
      const def = kitEffect(kind);
      const cost = KIT_KERNEL_COSTS[KIT_KERNEL_KINDS.indexOf(kind)];
      expect(VIDEO_WEIGHT[kind], `${kind}: pnpm kit:gen`).toBe(
        kitVideoWeight(def, cost, kitShadowRun(def))
      );
    }
  });

  it("weigh a field effect as its file says it measured, while its kernel costs what it cost then", () => {
    const measured = { ...demo, clipWeight: { weight: 30, cost: 112 } };
    expect(kitVideoWeight(measured, 112, 0)).toBe(30);
    /* a kernel changed since: its cost's estimate, until it is measured again */
    expect(kitVideoWeight(measured, 113, 0)).toBe(kitVideoWeight(demo, 113, 0));
    /* each site effect's measured weight is for its kernel as kit-gen wrote it, under what its costliest path says */
    for (const kind of KIT_KINDS) {
      const def = kitEffect(kind);
      const cost = KIT_KERNEL_COSTS[KIT_KERNEL_KINDS.indexOf(kind)];
      if (!def.clipWeight) continue;
      expect(def.clipWeight.cost, `${kind}: measure again (test/kit-weight.ts)`).toBe(cost);
      const estimate = kitVideoWeight({ ...def, clipWeight: undefined }, cost, kitShadowRun(def));
      expect(VIDEO_WEIGHT[kind]).toBeLessThan(estimate);
    }
  });
});

describe("the kernels' Math (video.c's kit_ functions)", () => {
  it("is V8's: sin, cos, tan, exp, log, atan2, min and max to the bit", () => {
    /* through the module's kit_math, which applies one to the arguments in params: magnitudes across every exponent
       (the trigonometric ones past 2^19 pi / 2 too, which V8 reduces by 2 / pi's bits), near the quarter turns, a
       kernel's few radians, random bit patterns and the special values; 20 million each matched Node 24 and 25 when it
       was written */
    const m = new WebAssembly.Instance(wasm, {}).exports as unknown as {
      memory: { buffer: ArrayBuffer };
      params: () => number;
      kit_math: (fn: number, n: number) => number;
    };
    let seed = 1;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const bits = new Uint32Array(2);
    const double = new Float64Array(bits.buffer);
    const any = () => {
      const r = random();
      if (r < 0.3) return (random() * 2 - 1) * 30;
      if (r < 0.5) return (random() < 0.5 ? -1 : 1) * Math.exp((random() * 2 - 1) * 700);
      if (r < 0.7)
        return ((Math.floor(random() * 2000) - 1000) * Math.PI) / 2 + (random() - 0.5) * 1e-9;
      bits[0] = random() * 2 ** 32;
      bits[1] = random() * 2 ** 32;
      return double[0];
    };
    /* where V8's branches turn: the zeros, the infinities, NaN, the least double, exp's last finite and first 0, the
       tiny arguments' 2^-28, tan's 0.6744, atan's 2^66, a quarter turn */
    const special = `0 -0 Infinity -Infinity NaN 5e-324 1e-300 709.782712893384 -745.1332191019412
      1.7976931348623157e308 3.725290298461914e-9 0.6744 73786976294838210000 1.5707963267948966`
      .trim()
      .split(/\s+/)
      .map(Number);
    const fns: [(...v: number[]) => number, number][] = [
      [Math.sin, 1],
      [Math.cos, 1],
      [Math.tan, 1],
      [Math.exp, 1],
      [Math.log, 1],
      [Math.atan2, 2],
      [Math.min, 2],
      [Math.max, 2]
    ];
    const params = () => new Float64Array(m.memory.buffer, m.params(), 4096);
    const apart: string[] = [];
    for (const [fn, [f, arity]] of fns.entries()) {
      for (let round = 0; round < 12; round++) {
        const n = arity === 1 ? 4096 : 2048;
        const args = Array.from({ length: n * arity }, (_, i) =>
          round === 0 && i < special.length * arity
            ? special[Math.floor(i / arity) % special.length] * (i % arity ? -1 : 1)
            : any()
        );
        params().set(args);
        expect(m.kit_math(fn, n)).toBe(n);
        const out = params();
        for (let i = 0; i < n; i++) {
          const want = arity === 1 ? f(args[i]) : f(args[2 * i], args[2 * i + 1]);
          if (!Object.is(out[i], want) && !(Number.isNaN(out[i]) && Number.isNaN(want)))
            apart.push(
              `${f.name}(${args.slice(arity * i, arity * i + arity)}): ${out[i]}, not ${want}`
            );
        }
      }
    }
    expect(apart.slice(0, 5)).toEqual([]);
  });
});

/* A frame finished as the site paints it, by the engine's own code: the effect's CPU drawing as straight-alpha RGBA,
   finishPixels over it, then the clip's backdrop under what is not opaque (a blob with no ground: under a soft one,
   as its gradient goes under another). */
function finished(ask: VideoAsk, finish: EffectFinish, plan: VideoPlan, i: number): Uint8Array {
  const { kind, size, look: shown, angle, palette: P } = ask;
  const n = size.width * size.height;
  const opaque = (rgb: ArrayLike<number>, stride: number) => {
    const rgba = new Uint8Array(n * 4);
    for (let p = 0; p < n; p++) {
      for (let c = 0; c < 3; c++) rgba[4 * p + c] = rgb[stride * p + c];
      rgba[4 * p + 3] = 255;
    }
    return rgba;
  };
  let rgba: Uint8Array;
  if (kind === "glass") {
    const { geometry, window } = glassCover(size, 1, angle, shown.shape);
    rgba = opaque(
      glassRenderer(geometry, window).frame(
        glassField(geometry, glassColors(P)),
        (i * plan.loops * GLASS_LOOP) / plan.frames
      ),
      4
    );
  } else if (kind === "blob") {
    const frame = blobRenderer(P, shown, size).frame(
      ((i * plan.loops) % plan.frames) / plan.frames
    );
    rgba = frame.length === n * 4 ? frame : opaque(frame, 3);
  } else if (kind === "silk") {
    const scene = silkScene(P, { angle, shape: shown.shape }, size);
    rgba = opaque(renderSilk(scene, (i * plan.loops * SILK_LOOP) / plan.frames), 4);
  } else if (kind === "rosette") {
    const scene = rosetteScene(P, { angle, shape: shown.shape }, size);
    rgba = opaque(renderRosette(scene, ((i * plan.loops) % plan.frames) / plan.frames), 4);
  } else if (kind === "papercut") {
    const scene = papercutScene(P, { angle, shape: shown.shape }, size);
    rgba = opaque(renderPapercut(scene, (i * plan.loops * PAPERCUT_LOOP) / plan.frames), 4);
  } else if (isKitKind(kind)) {
    const def = kitEffect(kind);
    const scene = kitScene(def, P, { angle, shape: shown.shape, steps: shown.steps }, size);
    rgba = opaque(kitRender(scene, (i * plan.loops * def.loop) / plan.frames), 4);
  } else if (kind === "aurora") {
    /* the aurora's range laid over the blob's backdrop where it lets the page through, the clip's backdrop for it */
    const scene = auroraSolid(
      auroraScene(P, { angle, path: shown.path, bg: shown.bg }, size),
      blobBackdrop(P)
    );
    rgba = opaque(renderAurora(scene, (i * plan.loops * AURORA_LOOP) / plan.frames), 4);
  } else {
    /* the strings laid over their designed ground where theirs lets the page through, the clip's backdrop for them */
    const scene = stringsSolid(stringsScene(P, { angle, shape: shown.shape, bg: shown.bg }, size));
    rgba = opaque(renderStrings(scene, (i * plan.loops * STRINGS_LOOP) / plan.frames), 4);
  }
  const back =
    kind === "strings" ? stringsDesignedGround(P).map(v => Math.round(v * 255)) : blobBackdrop(P);
  const underlay = effectUnderlay(P, ask, angle, finish.soft);
  const sigma = effectBlurSigma(finish.soft, size);
  let done: ArrayLike<number>;
  if (!underlay && sigma > 0) {
    /* a soft blob with no ground over the clip's backdrop, which goes under its blurred layer as finishPixels lays a
       gradient under one, the layer's premultiplied colors rounded once, as a browser composites it: finishPixels'
       own straight-alpha bytes, which a page lays over itself, lose a level or two where the blur leaves the picture
       thin (W/styles-lab/sg/mp4/parity-exact.ts) */
    const ground = Uint8Array.from({ length: n * 3 }, (_, k) => back[k % 3]);
    const blurred = blurRgba(rgba, size.width, size.height, sigma);
    const layered = opaque(overUnder(blurred, ground, size.width, size.height), 3);
    grainOverRgba(layered, size.width, size.height, finish.grain ?? 0);
    done = layered;
  } else done = finishPixels(rgba, size, finish, underlay);
  const out = new Uint8Array(n * 3);
  for (let p = 0; p < n; p++) {
    const a = done[4 * p + 3] / 255;
    for (let c = 0; c < 3; c++)
      out[3 * p + c] = Math.round(done[4 * p + c] * a + back[c] * (1 - a));
  }
  return out;
}

describe("a clip's soft and grain", () => {
  /* the module's frames, finished as videoFinish works it out, against the engine's, the level differences' share
     past 1 and their most */
  const against = (shown: VideoAsk, finish: EffectFinish, blurAs?: VideoBlur["scale"]) => {
    const ask = {
      ...shown,
      finish: videoFinish(palette, shown, shown.angle, finish, shown.size, blurAs)
    };
    const plan = videoPlan(ask, 2.45, ask.fps, null);
    const drawer = videoDrawer(wasm, ask, plan, VIDEO_QUALITY[ask.kind], true);
    let worst = 0;
    let past = 0;
    let all = 0;
    for (const i of [0, Math.floor(plan.frames / 2)]) {
      drawer.draw(i);
      const ours = drawer.rgb();
      const theirs = finished(ask, finish, plan, i);
      for (let k = 0; k < ours.length; k++) {
        const d = Math.abs(ours[k] - theirs[k]);
        worst = Math.max(worst, d);
        if (d > 1) past++;
        all++;
      }
    }
    return { worst, past: past / all };
  };
  const kinds: [VideoKind, EffectLook][] = [
    ["glass", look],
    ["blob", look],
    ["blob", { shape: 3, frost: 2, bg: "#ffeeddaa", steps: null, zoom: null, path: null }],
    ["blob", { shape: 999, frost: 0, bg: "#102030", steps: null, zoom: null, path: null }],
    ["silk", { ...look, shape: 417 }],
    ["rosette", look],
    ["papercut", { ...look, shape: 7 }],
    ["strings", look],
    ["strings", { ...look, bg: "#f4efe6" }],
    ["strings", { ...look, shape: 417, bg: "#10203080" }],
    ["strings", { ...look, bg: CLEAR_GROUND }],
    ["aurora", look],
    ["aurora", { ...look, path: "line,0:30,20:30,20:55,35:55,35:38,100:38", bg: "#140b19" }],
    ["aurora", { ...look, path: "curve,30,55,35,60,30", bg: "#10203080" }]
  ];

  it("are the site's, as finishPixels finishes a frame: the grain alone within a level nearly everywhere", () => {
    for (const [kind, shown] of kinds) {
      const ask: VideoAsk = {
        kind,
        palette,
        look: shown,
        angle: 135,
        size: { width: 96, height: 54 },
        fps: 30
      };
      const { worst, past } = against(ask, { grain: 60 });
      expect(worst, kind).toBeLessThanOrEqual(2);
      expect(past, kind).toBeLessThan(0.005);
    }
  });

  it("are the site's within two levels where the blur is wide against the picture's shorter side", () => {
    /* There a clear blob (or one whose ground lets the page through) is thin all over, its colors the blur's middle rather than its whole, which the boxes at a
       half or a quarter of the resolution reach a little apart from the frame's own: against an exact composite
       (W/styles-lab/sg/mp4/parity-exact.ts) the module sits half a level off on the whole at 1920 by 16 to 100, 640
       by 32 or 18 by 1080 (most 2), where the reference sits 0.15 to 0.25; at 282 by 502 within a level of it. Every
       other effect is opaque there, its edges alone thinned. */
    for (const [size, finish] of [
      [
        { width: 1920, height: 16 },
        { soft: 40, grain: 30 }
      ],
      [{ width: 18, height: 1080 }, { soft: 40 }],
      [
        { width: 282, height: 502 },
        { soft: 100, grain: 100 }
      ]
    ] as [{ width: number; height: number }, EffectFinish][]) {
      for (const [kind, shown] of kinds) {
        const { worst, past } = against(
          { kind, palette, look: shown, angle: 135, size, fps: 30 },
          finish
        );
        const at = `${kind} ${shown.bg ?? "clear"} ${size.width}x${size.height}`;
        expect(worst, at).toBeLessThanOrEqual(2);
        /* a blob whose ground lets the page through stands clear as one with none does (fx-finish.ts effectUnderlay);
           the strings on a ground of their own differ from the gradient under its soft edges as no effect's own colors
           do, and where the blur is wider than the picture the whole picture is that edge: a light ground's channels
           sit past a level at 1.8% there (18 by 1080, soft 40), within two as everywhere, and at 0.1% at 282 by 502
           (8 Nov 2026) */
        const clear = kind === "blob" && !(shown.bg && groundParts(shown.bg).alpha === 1);
        const own = kind === "strings" && shown.bg !== null;
        /* the aurora behind a range that lets the page through lies on the clip's backdrop with no gradient under
           it, as a clear blob does, and its light stands bright to the box's very rim, where the strings' picture
           is their ground: where the blur is wider than the picture all of it is the edge thinning to that
           backdrop, and its channels sit past a level at 7.3% to 9.4% (18 by 1080, soft 40) and 1.8% to 2.1% (1920
           by 16), within two as everywhere, and at 0.1% at 282 by 502; behind a range of a whole color, its
           gradient under it, none does (11 Nov 2026) */
        const bare = kind === "aurora" && effectBare(kind, shown);
        expect(past, at).toBeLessThan(clear ? 0.15 : bare ? 0.1 : own ? 0.03 : 0.005);
      }
    }
  });

  it("are the site's within two levels at each resolution the blur runs at", () => {
    /* sigmas of 2.9 (its own resolution), 9.6 (a half) and 19.2 (a quarter) */
    for (const [size, finish, scale] of [
      [{ width: 160, height: 90 }, { soft: 60, grain: 30 }, 1],
      [{ width: 160, height: 90 }, { soft: 100 }, 2],
      [{ width: 320, height: 180 }, { soft: 100, grain: 100 }, 4]
    ] as [{ width: number; height: number }, EffectFinish, VideoBlur["scale"]][]) {
      expect(videoBlurScale(effectBlurSigma(finish.soft, size))).toBe(scale);
      for (const [kind, shown] of kinds) {
        const { worst, past } = against(
          { kind, palette, look: shown, angle: 135, size, fps: 30 },
          finish,
          scale
        );
        expect(worst, `${kind} at 1/${scale}`).toBeLessThanOrEqual(2);
        /* the aurora behind a range that lets the page through, its light bright at the box's rim where the blur
           thins it to the clip's backdrop (as above): 0.9% to 1.2% past a level at a half, 0.1% at a quarter and at
           its own; behind a range of a whole color, none (11 Nov 2026) */
        const bare = kind === "aurora" && effectBare(kind, shown);
        expect(past, `${kind} at 1/${scale}`).toBeLessThan(bare ? 0.015 : 0.01);
      }
    }
  });
});

describe("videoBlur", () => {
  const variance = (boxes: readonly [number, number][]) =>
    boxes.reduce((v, [l, r]) => v + ((l + r + 1) ** 2 - 1) / 12, 0);

  it("blurs a narrow soft at the frame's own resolution by finishPixels' own boxes", () => {
    expect(videoBlur(4)).toEqual({ scale: 1, boxes: blurBoxes(4) });
    expect(videoBlur(0.2)).toEqual({ scale: 1, boxes: [] });
    expect([
      videoBlurScale(6.9),
      videoBlurScale(7),
      videoBlurScale(15.9),
      videoBlurScale(16)
    ]).toEqual([1, 2, 2, 4]);
  });

  it("blurs a wide one smaller by centered boxes of the full blur's variance, less what reading it back spreads", () => {
    for (const sigma of [7, 9.5, 12, 15.9, 16, 22, 40, 65, 115]) {
      const { scale, boxes } = videoBlur(sigma);
      expect(boxes.length).toBe(3);
      expect(boxes.reduce((lean, [l, r]) => lean + r - l, 0)).toBe(0);
      const widths = boxes.map(([l, r]) => l + r + 1);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
      const spread = (scale * scale - 1) / 12 + (scale * scale) / 6;
      const sigmaOf = Math.sqrt(variance(boxes) * scale * scale + spread);
      expect(Math.abs(sigmaOf / Math.sqrt(variance(blurBoxes(sigma))) - 1)).toBeLessThan(0.03);
    }
  });
});

describe("the silk's, the rosette's, the papercut's and the strings' clips", () => {
  it("play a loop of their design: the rosette's by its shape", () => {
    expect(videoLoop({ kind: "silk", look })).toBe(SILK_LOOP);
    expect(videoLoop({ kind: "papercut", look })).toBe(PAPERCUT_LOOP);
    expect(videoLoop({ kind: "strings", look })).toBe(STRINGS_LOOP);
    expect(videoLoop({ kind: "aurora", look })).toBe(AURORA_LOOP);
    /* the strings' loop is a minute, so at speed 1 a clip is one whole loop, never nudged to fit */
    expect(videoPlan({ kind: "strings", look }, 1, 30, null)).toEqual({
      frames: 1800,
      loops: 1,
      speed: 1,
      seconds: 60
    });
    expect(videoLoop({ kind: "rosette", look })).toBe(rosetteDesign(null).loop);
    expect(videoLoop({ kind: "rosette", look: { ...look, shape: 417 } })).toBe(
      rosetteDesign(417).loop
    );
    expect(videoLoop({ kind: "rosette", look: { ...look, shape: 417 } })).not.toBe(
      rosetteDesign(null).loop
    );
  });

  it("fit a loop longer than the longest clip into it, and the work into its limit", () => {
    for (const [kind, loop] of [
      ["silk", SILK_LOOP],
      ["papercut", PAPERCUT_LOOP]
    ] as const) {
      const effect = { kind, look };
      const fit = videoFit(effect, 1, 60, null, { width: 1080, height: 1080 });
      expect(fit.plan.seconds, kind).toBe(VIDEO_LIMITS.seconds);
      expect(fit.plan.loops).toBe(1);
      expect(fit.plan.speed).toBeCloseTo(loop / VIDEO_LIMITS.seconds, 6);
      expect(videoWork(effect, fit.size, fit.plan.frames)).toBeLessThanOrEqual(VIDEO_LIMITS.work);
    }
  });
});

describe("videoFit with a soft", () => {
  it("fits within the work, and a fitted size to itself, across the steps of the blur's resolution", () => {
    const sides = [16, 320, 540, 1080, 1600, 1920];
    let over = 0;
    let moved = 0;
    for (const kind of VIDEO_KINDS)
      for (const finish of [{}, { soft: 5 }, { soft: 20 }, { soft: 40, grain: 30 }, { soft: 100 }])
        for (const width of sides)
          for (const height of sides)
            for (const [speed, fps, duration] of [
              [2.45, 60, null],
              [1, 60, 60],
              [1, 30, null]
            ] as const) {
              const effect = { kind, look, finish };
              const fit = videoFit(effect, speed, fps, duration, { width, height });
              if (videoWork(effect, fit.size, fit.plan.frames) > VIDEO_LIMITS.work * (1 + 1e-12))
                over++;
              const again = videoFit(effect, speed, fps, duration, fit.size).size;
              if (again.width !== fit.size.width || again.height !== fit.size.height) moved++;
            }
    expect({ over, moved }).toEqual({ over: 0, moved: 0 });
    /* shrinking past a sigma of 7 pixels blurs at the frame's own resolution, at twice the cost: the steps after it
       moved the scale a thousandth and left the floored sides as they were, over the work */
    const soft = { ...glass, finish: { soft: 40, grain: 30 } };
    const fit = videoFit(soft, 1, 60, 60, { width: 512, height: 512 });
    expect(fit.size).toEqual({ width: 438, height: 438 });
    expect(videoWork(soft, fit.size, fit.plan.frames)).toBeLessThanOrEqual(VIDEO_LIMITS.work);
  });

  it("weighs the soft's blur into the work, at the size the clip is drawn at", () => {
    const plain = videoFit(glass, 2.45, 60, null, { width: 1080, height: 1080 });
    for (const soft of [10, 40, 100]) {
      const finish = { soft, grain: 30 };
      const fit = videoFit({ ...glass, finish }, 2.45, 60, null, { width: 1080, height: 1080 });
      expect(videoWork({ ...glass, finish }, fit.size, fit.plan.frames)).toBeLessThanOrEqual(
        VIDEO_LIMITS.work
      );
      expect(fit.size.width).toBeLessThan(plain.size.width);
    }
  });
});

describe("videoFrames", () => {
  it("draws a clip in parts, each going on from the one before, as the same stream it draws whole", () => {
    const ask: VideoAsk = {
      kind: "glass",
      palette,
      look,
      angle: 135,
      size: { width: 64, height: 48 },
      fps: 30
    };
    const plan = videoPlan(glass, 10, 30, null);
    const whole = videoFrames(wasm, ask, plan).frames;
    const parted = [];
    let state: Uint8Array | null = null;
    for (const [from, to] of videoParts(glass, plan, ask.size, 64 * 48 * 50)) {
      const part = videoFrames(wasm, ask, plan, from, to, state);
      parted.push(...part.frames);
      state = part.state;
    }
    const file = (frames: typeof whole) => mp4({ width: 64, height: 48, fps: 30 }, frames);
    expect(file(parted)).toEqual(file(whole));
    expect(whole.filter(f => f.key).length).toBe(1);
  });

  it("draws a soft, grained clip of each effect in parts as the same stream it draws whole", () => {
    for (const kind of VIDEO_KINDS) {
      for (const finish of [{ soft: 100, grain: 30 }, { soft: 60 }]) {
        const size = { width: 64, height: 48 };
        const ask: VideoAsk = {
          kind,
          palette,
          look,
          angle: 135,
          size,
          fps: 30,
          finish: videoFinish(palette, { kind, look }, 135, finish, size)
        };
        const plan = videoPlan(ask, 10, 30, null);
        const whole = videoFrames(wasm, ask, plan).frames;
        const parted = [];
        let state: Uint8Array | null = null;
        for (const [from, to] of videoParts({ kind, look, finish }, plan, size, 64 * 48 * 40)) {
          const part = videoFrames(wasm, ask, plan, from, to, state);
          parted.push(...part.frames);
          state = part.state;
        }
        expect(
          parted.map(f => f.data),
          kind
        ).toEqual(whole.map(f => f.data));
      }
    }
  });

  it("refuses a part after the first without the state it goes on from", () => {
    const ask: VideoAsk = {
      kind: "blob",
      palette,
      look,
      angle: 90,
      size: { width: 32, height: 32 },
      fps: 10
    };
    expect(() => videoFrames(wasm, ask, videoPlan(blob, 1, 10, 2), 5, 10)).toThrow();
  });
});

describe("the aurora's clips", () => {
  const wide = { width: 1920, height: 1080 };
  const behind = (path: string | null) => ({ ...look, path });
  const skyline =
    "line,0:26.4,11.1:26.4,11.1:45,21.5:45,21.5:33,32.9:33,32.9:43,43.1:43,43.1:32,53.3:32,53.3:26.4,62.4:26.4,62.4:58,72.1:58,72.1:63,80:63,80:30,100:30";

  it("are weighed by their range: no light shows under its lowest height, and a clip costs by the light it shows", () => {
    const weight = (path: string | null, size = wide) => auroraVideoWeight(behind(path), size);
    /* the designed range in a wide box, whose clips' frames measured 2.5 to 2.9 */
    expect(weight(null)).toBeCloseTo(3.45, 1);
    /* a range all of whose light shows weighs the most the aurora does, and none weighs more */
    expect(weight("line,0,0")).toBe(VIDEO_WEIGHT.aurora);
    expect(weight("line,4,4")).toBe(VIDEO_WEIGHT.aurora);
    expect(VIDEO_WEIGHT.aurora).toBe(AURORA_WEIGHT.base + AURORA_WEIGHT.lit);
    /* a higher range weighs less, down to half a box's light, which no range in the box's upper half shows more
       than */
    const falling = ["line,20,20", "line,35,35", "line,50,50", "line,80,80"].map(path =>
      weight(path)
    );
    expect(falling).toEqual([...falling].sort((a, b) => b - a));
    expect(weight("line,80,80")).toBeCloseTo(AURORA_WEIGHT.base + AURORA_WEIGHT.lit * 0.51, 6);
    expect(weight("line,95,95")).toBe(weight("line,80,80"));
    /* by its lowest height, wherever along it that is */
    expect(weight("line,80,80,20,80,80")).toBeCloseTo(weight("line,20,20"), 6);
    expect(weight(skyline)).toBeCloseTo(weight("line,26.4,26.4"), 6);
    /* by a box's shape alone, never its size or which way up it is: a clip drawn smaller weighs the same */
    expect(weight(null, { width: 640, height: 360 })).toBeCloseTo(weight(null), 6);
    expect(weight(null, { width: 1080, height: 1920 })).toBeCloseTo(weight(null), 6);
    expect(weight(null, { width: 1080, height: 1080 })).toBeLessThan(weight(null));
    /* it is what a clip is fitted by, its soft's and its grain's cost over it */
    expect(videoWeight({ kind: "aurora", look: behind(null) }, wide)).toBe(weight(null));
    expect(
      videoWeight({ kind: "aurora", look: behind(null), finish: { grain: 30 } }, wide)
    ).toBeCloseTo(weight(null) + 0.3, 6);
    /* so a clip behind a higher range is drawn larger, within the same work */
    const fit = (path: string | null) =>
      videoFit({ kind: "aurora", look: behind(path) }, 1, 60, null, wide);
    expect(fit("line,80,80").size.width).toBeGreaterThan(fit(null).size.width);
    expect(fit(null).size.width).toBeGreaterThan(fit("line,4,4").size.width);
    for (const path of [null, "line,4,4", "line,80,80"]) {
      const { size, plan } = fit(path);
      expect(
        videoWork({ kind: "aurora", look: behind(path) }, size, plan.frames)
      ).toBeLessThanOrEqual(VIDEO_LIMITS.work);
    }
  });

  it("show light in no more of a box than their weight counts, whatever the box and the angle", () => {
    /* the share of a box's pixels that show any light (auroraRange), counted at every pixel of a small box of the
       same shape, against the share the weight takes */
    const at = new Float64Array(2);
    for (const path of [
      null,
      "line,4,4",
      "line,20,20",
      "line,50,50",
      "line,80,80",
      "line,10,90",
      "curve,30,55,35,60,30",
      "curve,80,20,80,20,80",
      skyline
    ])
      for (const [width, height] of [
        [192, 108],
        [108, 192],
        [144, 144],
        [240, 100],
        [100, 240]
      ])
        for (const angle of [90, 0, 20, 45, 135, 180, 270]) {
          const size = { width, height };
          const scene = auroraScene(palette, { angle, path, bg: null }, size);
          let lit = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              auroraPoint(scene, x + 0.5, y + 0.5, at);
              auroraRange(scene, at[0], at[1], at);
              if (at[0] > 0) lit++;
            }
          const counted =
            (auroraVideoWeight(behind(path), size) - AURORA_WEIGHT.base) / AURORA_WEIGHT.lit;
          expect(
            lit / (width * height),
            `${path} ${width}x${height} at ${angle}`
          ).toBeLessThanOrEqual(counted);
        }
  });
});
