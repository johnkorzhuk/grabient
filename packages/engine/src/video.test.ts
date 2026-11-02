import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOB_LOOP, blobBackdrop, blobRenderer } from "./blob.ts";
import { decodePalette } from "./codec.ts";
import { GLASS_LOOP, glassField } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { glassCover, glassRenderer } from "./glass-render.ts";
import { mp4 } from "./mp4.ts";
import {
  VIDEO_LIMITS,
  VIDEO_QUALITY,
  type VideoAsk,
  videoDrawer,
  videoDuration,
  videoFit,
  videoFrames,
  videoParts,
  videoPlan,
  videoQp,
  videoWork
} from "./video.ts";

/* Node's WebAssembly, as much of it as this names (the engine's lib knows no host, as video.ts says) */
declare const WebAssembly: {
  Module: { new (bytes: Uint8Array): object; imports(module: object): unknown[] };
};
const wasm = new WebAssembly.Module(readFileSync(new URL("./video/video.wasm", import.meta.url)));
const palette = decodePalette("kWnCIwwC47igfOklkTlShq44");
if (!palette) throw new Error("the test's palette");
const look = { shape: null, frost: 1, bg: null };

describe("video.wasm", () => {
  it("imports nothing, so a Worker loads it as it is", () => {
    expect(WebAssembly.Module.imports(wasm)).toEqual([]);
  });
});

describe("videoPlan", () => {
  it("plays one loop where no duration is asked, in whole frames", () => {
    const plan = videoPlan("glass", 2.45, 60, null);
    expect(plan.frames).toBe(Math.round((GLASS_LOOP / 2.45) * 60));
    expect(plan.loops).toBe(1);
    expect(plan.speed).toBeCloseTo(2.45, 2);
    expect(plan.seconds).toBe(plan.frames / 60);
  });

  it("fills a duration with whole loops, the speed nudged to fit them", () => {
    const plan = videoPlan("glass", 2.45, 30, 20);
    expect(plan.frames).toBe(600);
    expect(plan.loops).toBe(1);
    expect(plan.speed).toBeCloseTo(GLASS_LOOP / 20, 6);
    const many = videoPlan("blob", 5, 30, 20);
    expect(many.loops).toBe(Math.round((20 * 5) / BLOB_LOOP));
    expect(many.speed).toBeCloseTo((many.loops * BLOB_LOOP) / 20, 6);
  });

  it("holds the first frame at speed 0", () => {
    expect(videoPlan("blob", 0, 30, 2)).toEqual({ frames: 60, loops: 0, speed: 0, seconds: 2 });
    expect(videoPlan("glass", 0, 30, null).frames).toBe(30);
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
    const fit = videoFit("glass", 2.45, 60, null, { width: 1080, height: 1080 });
    expect(fit.size).toEqual({ width: 1080, height: 1080 });
    expect(fit.size.width * fit.size.height * fit.plan.frames).toBeLessThanOrEqual(
      VIDEO_LIMITS.work
    );
    const odd = videoFit("glass", 2.45, 30, 4, { width: 641, height: 361 });
    expect([odd.size.width % 2, odd.size.height % 2]).toEqual([0, 0]);
    expect(videoFit("blob", 1, 240, 4, { width: 100, height: 100 }).fps).toBe(VIDEO_LIMITS.fps);
    const big = videoFit("glass", 1, 60, 60, { width: 3840, height: 2160 });
    expect(big.size.width * big.size.height * big.plan.frames).toBeLessThanOrEqual(
      VIDEO_LIMITS.work
    );
    expect(Math.max(big.size.width, big.size.height)).toBeLessThanOrEqual(VIDEO_LIMITS.side);
    const blob = videoFit("blob", 1, 60, 60, { width: 1920, height: 1080 });
    expect(videoWork("blob", blob.size, blob.plan.frames)).toBeLessThanOrEqual(VIDEO_LIMITS.work);
  });

  it("plays a loop longer than the longest clip in that time", () => {
    const slow = videoFit("glass", 0.1, 30, null, { width: 320, height: 180 });
    expect(slow.plan.seconds).toBe(VIDEO_LIMITS.seconds);
    expect(slow.plan.loops).toBe(1);
  });
});

describe("videoParts", () => {
  it("shares out every frame once, in order, each part within its work", () => {
    const plan = videoPlan("glass", 2.45, 60, null);
    const size = { width: 1080, height: 1080 };
    const runs = videoParts("glass", plan, size, 55_000_000);
    expect(runs[0][0]).toBe(0);
    expect(runs.at(-1)?.[1]).toBe(plan.frames);
    for (let i = 1; i < runs.length; i++) expect(runs[i][0]).toBe(runs[i - 1][1]);
    for (const [from, to] of runs)
      expect((to - from) * size.width * size.height).toBeLessThanOrEqual(60_000_000);
    expect(videoParts("glass", videoPlan("glass", 0, 30, 3), size, 1)).toEqual([[0, 90]]);
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
    const plan = videoPlan(ask.kind, 2.45, ask.fps, null);
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
    const plan = videoPlan("glass", 10, 30, null);
    const whole = videoFrames(wasm, ask, plan).frames;
    const parted = [];
    let state: Uint8Array | null = null;
    for (const [from, to] of videoParts("glass", plan, ask.size, 64 * 48 * 50)) {
      const part = videoFrames(wasm, ask, plan, from, to, state);
      parted.push(...part.frames);
      state = part.state;
    }
    const file = (frames: typeof whole) => mp4({ width: 64, height: 48, fps: 30 }, frames);
    expect(file(parted)).toEqual(file(whole));
    expect(whole.filter(f => f.key).length).toBe(1);
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
    expect(() => videoFrames(wasm, ask, videoPlan("blob", 1, 10, 2), 5, 10)).toThrow();
  });
});
