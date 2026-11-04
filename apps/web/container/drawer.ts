/* A drawer thread: its own instance of video.wasm takes the next frame no drawer has taken, draws it (the effect, its
   soft and grain, written as finished YUV planes), waits until the encoder has taken out of the ring the frame its
   slot held before (`slots` frames earlier), and copies the planes in. Taking frames from one counter keeps every
   drawer busy however fast its core is that minute: drawers handed every k-th frame waited on the slowest (302 s
   against 222 s for a 4K clip, 3 Nov 2026). A slot that is merely free is not enough: a drawer held up drawing frame
   i lets the others run ahead, and one of them would fill i's slot with frame i + slots, which the encoder, waiting
   for i, never takes. */
import { parentPort, workerData } from "node:worker_threads";
import { videoDrawer } from "@grabient/engine/video.ts";
import { askOf, slotLayout, type VideoWholeJob } from "./clip.ts";

const { job, module, ring, ctrl, next, taken, slots, stall } = workerData as {
  job: VideoWholeJob;
  module: WebAssembly.Module;
  ring: SharedArrayBuffer;
  ctrl: SharedArrayBuffer;
  next: SharedArrayBuffer;
  taken: SharedArrayBuffer;
  slots: number;
  /** a test's: the drawer of this frame waits this long before handing it over */
  stall?: { frame: number; ms: number };
};
const held = new Int32Array(ctrl);
const counter = new Int32Array(next);
const out = new Int32Array(taken);
const layout = slotLayout(job.width, job.height);
const { ask, quality } = askOf(job);
const drawer = videoDrawer(module, ask, job.plan, quality);
parentPort?.postMessage({ ready: true });

for (let i = Atomics.add(counter, 0, 1); i < job.plan.frames; i = Atomics.add(counter, 0, 1)) {
  drawer.draw(i);
  if (stall?.frame === i) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, stall.ms);
  for (let t = Atomics.load(out, 0); i - t >= slots; t = Atomics.load(out, 0))
    Atomics.wait(out, 0, t);
  const slot = i % slots;
  const [y, u, v] = drawer.planes();
  if (y.length !== layout.y || u.length !== layout.uv || v.length !== layout.uv) {
    throw new Error("video: the module's planes are not the ring's");
  }
  const to = new Uint8Array(ring, slot * layout.bytes, layout.bytes);
  to.set(y, 0);
  to.set(u, layout.y);
  to.set(v, layout.y + layout.uv);
  Atomics.store(held, slot, i);
  Atomics.notify(held, slot);
}
parentPort?.postMessage({ done: true });
