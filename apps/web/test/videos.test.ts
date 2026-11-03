import { describe, expect, it } from "vitest";
import { seedMp4Answer } from "../src/server/images/video.ts";
import { drawVideoPart } from "../src/server/images/video-draw.ts";
import { get, testEnv } from "./helpers.ts";

/* The clips drawn in workerd as the Worker draws them: the module compiled with the Worker (video-draw.ts imports it),
   each part drawn by drawVideoPart, the work of the Worker's own entrypoint, called here directly since the tests'
   Worker has no loopback, and the clip kept in R2. */

const SEED = "kWnCIwwC47igfOklkTlShq44";

describe("a palette's MP4 in workerd", () => {
  it("draws each effect, plain and soft and grained, in parts, and keeps it in R2", async () => {
    const env = testEnv();
    for (const style of ["glass", "blob", "silk", "rosette"])
      for (const finish of ["", "&soft=40&grain=30"]) {
        const asked = `/${SEED}.mp4?style=${style}&size=96x64&fps=10&duration=1${finish}`;
        const kept: Promise<unknown>[] = [];
        const parts: number[] = [];
        const answer = await seedMp4Answer(
          get(asked),
          env,
          work => void kept.push(work),
          async job => {
            parts.push(job.from);
            return drawVideoPart(job);
          },
          { partWork: 96 * 64 * 4 }
        );
        expect([answer.status, answer.headers.get("Content-Type")], asked).toEqual([
          200,
          "video/mp4"
        ]);
        const file = new Uint8Array(await answer.arrayBuffer());
        expect(String.fromCharCode(...file.subarray(4, 8)), asked).toBe("ftyp");
        expect(parts.length, asked).toBeGreaterThan(1);
        await Promise.all(kept);
        const hash = answer.headers.get("ETag")?.slice('"video:'.length, -1);
        expect((await env.UPLOADS?.head(`videos/${hash}.mp4`))?.size, asked).toBe(file.length);
      }
  });
});
