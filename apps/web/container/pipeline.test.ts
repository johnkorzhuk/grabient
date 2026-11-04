import { readFileSync } from "node:fs";
import { decodePalette } from "@grabient/engine/codec.ts";
import { mp4 } from "@grabient/engine/mp4.ts";
import { videoAt, videoFrames } from "@grabient/engine/video.ts";
import { describe, expect, test } from "vitest";
import { askOf, type VideoWholeJob } from "./clip.ts";
import { drawWhole } from "./pipeline.ts";

const wasm = new WebAssembly.Module(
  readFileSync(new URL("../../../packages/engine/src/video/video.wasm", import.meta.url))
);

/** The job the Worker sends for an address (server/images/video-drawer.ts), at the size it asks. */
function jobOf(seed: string, address: string, width: number, height: number): VideoWholeJob {
  const params = new URLSearchParams(address);
  const at = videoAt(params, { width, height })!;
  return {
    palette: decodePalette(seed)!,
    kind: at.kind,
    look: at.effect.look,
    angle: at.angle,
    finish: at.finish,
    width: at.size.width,
    height: at.size.height,
    fps: at.fps,
    plan: at.plan
  };
}

/** The clip as the Worker draws it today: one instance, one thread. */
function today(job: VideoWholeJob) {
  const { ask, quality } = askOf(job);
  const head = { width: job.width, height: job.height, fps: job.fps };
  return mp4(head, videoFrames(wasm, ask, job.plan, 0, job.plan.frames, null, quality).frames);
}

describe("a clip drawn whole by drawers feeding one encoder", () => {
  /* Each drawer and the encoder is a thread that loads the engine on its own, which a busy machine running every
     test at once makes slow (30 s for nine threads in the whole suite, 1.7 s alone): the drawers asked are spread
     over the cases, and each case has two minutes. */
  const cases = [
    [
      "papercut, soft and grain",
      "kYu01i1DI31C0ulGmctwIi7cqVT2",
      "style=papercut&angle=0&soft=22&grain=38&speed=0.3&fps=60&shape=235&duration=0.6",
      96,
      96,
      [1, 3]
    ],
    ["glass", "kWnCIwwC47igfOklkTlShq44", "style=glass&fps=30&duration=1", 128, 72, [2]],
    [
      "silk with a grain",
      "kWnCIwwC47igfOklkTlShq44",
      "style=silk&grain=20&fps=24&duration=1",
      64,
      112,
      [3]
    ]
  ] as const;
  for (const [name, seed, address, width, height, counts] of cases) {
    test(`${name}: the Worker's bytes, with ${counts.join(" and ")} drawers`, {
      timeout: 120_000
    }, async () => {
      const job = jobOf(seed, address, width, height);
      expect(job.plan.frames).toBeGreaterThan(10);
      const expected = today(job);
      for (const drawers of counts) {
        let coded = 0;
        const bytes = await drawWhole(job, wasm, { drawers, onCoded: n => (coded = n) });
        expect(coded).toBe(job.plan.frames);
        expect(Buffer.from(bytes).equals(Buffer.from(expected))).toBe(true);
      }
    });
  }

  test("a drawer held up keeps the others from filling its frame's slot", {
    timeout: 120_000
  }, async () => {
    const job = jobOf(
      "kYu01i1DI31C0ulGmctwIi7cqVT2",
      "style=papercut&angle=0&soft=22&grain=38&speed=0.3&fps=60&shape=235&duration=0.6",
      96,
      96
    );
    // frame 0's drawer waits while the other two could draw past every slot: frame 3 must not take frame 0's
    const bytes = await drawWhole(job, wasm, {
      drawers: 3,
      slots: 3,
      stall: { frame: 0, ms: 400 }
    });
    expect(Buffer.from(bytes).equals(Buffer.from(today(job)))).toBe(true);
  });

  test("a held effect is drawn once and coded as often as it has frames", async () => {
    const job = jobOf("kWnCIwwC47igfOklkTlShq44", "style=rosette&speed=0&duration=0.5", 64, 64);
    expect(job.plan.loops).toBe(0);
    const bytes = await drawWhole(job, wasm, { drawers: 3 });
    expect(Buffer.from(bytes).equals(Buffer.from(today(job)))).toBe(true);
  });
});
