/* One clip drawn whole: `drawers` threads, each its own instance of video.wasm, drawing frames into a ring of shared
   slots, and one encoder thread coding them in order (drawer.ts, encoder.ts), then the engine's mp4() of the frames.
   The stream is the one the Worker draws in parts and the editor's download draws on one thread, byte for byte. On a
   standard-4 container (4 vCPUs), 4 drawers beside the encoder kept the cores 3.9 to 4 busy: John's 1080 by 1080
   papercut with a soft and a grain (3,600 frames) in 36 to 38 s, 4K in 4.2 to 4.4 minutes (3 Nov 2026). A held effect
   is drawn once and coded as often as it has frames, on this thread. */
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { type Mp4Frame, mp4 } from "@grabient/engine/mp4.ts";
import { videoFrames } from "@grabient/engine/video.ts";
import { askOf, slotLayout, type VideoWholeJob } from "./clip.ts";

// the threads' own files: .ts where the sources run as they are (tests), .mjs in the image's bundle
const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".mjs";

export async function drawWhole(
  job: VideoWholeJob,
  module: WebAssembly.Module,
  options: {
    drawers?: number;
    /** frames the ring holds at once, twice the drawers unless said */
    slots?: number;
    onCoded?: (coded: number) => void;
    /** a test's: the drawer of this frame waits this long before handing it over */
    stall?: { frame: number; ms: number };
  } = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const { ask, quality } = askOf(job);
  const head = { width: job.width, height: job.height, fps: job.fps };
  const drawers = options.drawers ?? availableParallelism();
  if (!job.plan.loops || drawers < 1) {
    return mp4(head, videoFrames(module, ask, job.plan, 0, job.plan.frames, null, quality).frames);
  }
  const slots = Math.max(1, options.slots ?? 2 * drawers);
  const layout = slotLayout(job.width, job.height);
  const ring = new SharedArrayBuffer(slots * layout.bytes);
  const ctrl = new SharedArrayBuffer(4 * slots);
  // no slot holds a frame yet
  new Int32Array(ctrl).fill(-1);
  const next = new SharedArrayBuffer(4);
  const taken = new SharedArrayBuffer(4);
  const shared = { job, module, ring, ctrl, taken, slots };
  const threads = [
    ...Array.from(
      { length: drawers },
      () =>
        new Worker(new URL(`./drawer${ext}`, import.meta.url), {
          workerData: { ...shared, next, stall: options.stall }
        })
    ),
    new Worker(new URL(`./encoder${ext}`, import.meta.url), { workerData: shared })
  ];
  const encoder = threads[drawers];
  const frames: Mp4Frame[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let done = 0;
      for (const thread of threads) {
        thread.on("error", reject);
        thread.on("exit", code => code && reject(new Error(`video: a thread exited ${code}`)));
        thread.on("message", (m: { done?: boolean; i?: number; data?: Uint8Array }) => {
          if (m.done) {
            if (++done === threads.length) resolve();
            return;
          }
          if (thread !== encoder || m.i === undefined || !m.data) return;
          if (m.i !== frames.length) return reject(new Error(`video: frame ${m.i} out of order`));
          frames.push({ data: m.data, key: m.i === 0 });
          options.onCoded?.(frames.length);
        });
      }
    });
  } finally {
    await Promise.all(threads.map(thread => thread.terminate()));
  }
  return mp4(head, frames);
}
