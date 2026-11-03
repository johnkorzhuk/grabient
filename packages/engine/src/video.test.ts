import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOB_LOOP, blobBackdrop, blobRenderer } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import type { EffectFinish, EffectLook } from "./effect.ts";
import { blurBoxes, effectBlurSigma, effectUnderlay, finishPixels } from "./fx-finish.ts";
import { GLASS_LOOP, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { glassCover, glassRenderer } from "./glass-render.ts";
import { mp4 } from "./mp4.ts";
import { rosetteDesign, rosetteScene } from "./rosette.ts";
import { renderRosette } from "./rosette-render.ts";
import { SILK_LOOP, silkScene } from "./silk.ts";
import { renderSilk } from "./silk-render.ts";
import {
  VIDEO_LIMITS,
  VIDEO_QUALITY,
  type VideoAsk,
  type VideoBlur,
  type VideoKind,
  type VideoPlan,
  videoBlurScale,
  videoDrawer,
  videoDuration,
  videoFit,
  videoFrames,
  videoLoop,
  videoParts,
  videoPlan,
  videoQp,
  videoWork
} from "./video.ts";
import { videoBlur, videoFinish } from "./video-finish.ts";

/* Node's WebAssembly, as much of it as this names (the engine's lib knows no host, as video.ts says) */
declare const WebAssembly: {
  Module: { new (bytes: Uint8Array): object; imports(module: object): unknown[] };
};
const wasm = new WebAssembly.Module(readFileSync(new URL("./video/video.wasm", import.meta.url)));
const palette = decodePalette("kWnCIwwC47igfOklkTlShq44");
if (!palette) throw new Error("the test's palette");
const look = { shape: null, frost: 1, bg: null };
const glass = { kind: "glass", look } as const;
const blob = { kind: "blob", look } as const;

describe("video.wasm", () => {
  it("imports nothing, so a Worker loads it as it is", () => {
    expect(WebAssembly.Module.imports(wasm)).toEqual([]);
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
      { shape: 3, frost: 2, bg: "#ffeeddaa" },
      { shape: 999, frost: 0, bg: "#102030" }
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

  it("loop: the frame a loop on is the first", () => {
    for (const kind of ["glass", "blob", "silk", "rosette"] as const) {
      const ask: VideoAsk = {
        kind,
        palette,
        look,
        angle: 135,
        size: { width: 64, height: 48 },
        fps: 30
      };
      const plan = videoPlan(ask, 2.45, 30, null);
      const drawer = videoDrawer(wasm, ask, plan, VIDEO_QUALITY[kind], true);
      drawer.draw(0);
      const first = drawer.rgb().slice();
      drawer.draw(plan.frames);
      expect(Math.max(...drawer.rgb().map((v, i) => Math.abs(v - first[i])))).toBeLessThanOrEqual(
        1
      );
    }
  });
});

/* A frame finished as the site paints it, by the engine's own code: the effect's CPU drawing as straight-alpha RGBA,
   finishPixels over it, then the clip's backdrop under what is not opaque (a blob with no ground). */
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
  } else {
    const scene = rosetteScene(P, { angle, shape: shown.shape }, size);
    rgba = opaque(renderRosette(scene, ((i * plan.loops) % plan.frames) / plan.frames), 4);
  }
  const done = finishPixels(rgba, size, finish, effectUnderlay(P, ask, angle, finish.soft));
  const back = blobBackdrop(P);
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
    ["blob", { shape: 3, frost: 2, bg: "#ffeeddaa" }],
    ["blob", { shape: 999, frost: 0, bg: "#102030" }],
    ["silk", { ...look, shape: 417 }],
    ["rosette", look]
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
        expect(past, `${kind} at 1/${scale}`).toBeLessThan(0.01);
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

describe("the silk's and the rosette's clips", () => {
  it("play a loop of their design: the rosette's by its shape", () => {
    expect(videoLoop({ kind: "silk", look })).toBe(SILK_LOOP);
    expect(videoLoop({ kind: "rosette", look })).toBe(rosetteDesign(null).loop);
    expect(videoLoop({ kind: "rosette", look: { ...look, shape: 417 } })).toBe(
      rosetteDesign(417).loop
    );
    expect(videoLoop({ kind: "rosette", look: { ...look, shape: 417 } })).not.toBe(
      rosetteDesign(null).loop
    );
  });

  it("fit a loop longer than the longest clip into it, and the work into its limit", () => {
    const silk = { kind: "silk", look } as const;
    const fit = videoFit(silk, 1, 60, null, { width: 1080, height: 1080 });
    expect(fit.plan.seconds).toBe(VIDEO_LIMITS.seconds);
    expect(fit.plan.loops).toBe(1);
    expect(fit.plan.speed).toBeCloseTo(SILK_LOOP / VIDEO_LIMITS.seconds, 6);
    expect(videoWork(silk, fit.size, fit.plan.frames)).toBeLessThanOrEqual(VIDEO_LIMITS.work);
  });
});

describe("videoFit with a soft", () => {
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
    for (const kind of ["glass", "blob", "silk", "rosette"] as const) {
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
