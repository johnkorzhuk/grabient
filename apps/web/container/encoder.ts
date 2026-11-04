/* The encoder thread: one instance of video.wasm that never draws. Frame by frame, in order, it waits for the frame in
   its slot, copies its planes into its own, counts it taken (which lets the drawer of the frame `slots` on fill the
   slot) and codes them as the Worker codes a clip (frame 0 the key frame, the loop's ramp at its end: videoDrawer's
   code), so the drawers' frames make today's one stream. Each coded frame goes to the main thread as it is done. */
import { parentPort, workerData } from "node:worker_threads";
import { videoDrawer } from "@grabient/engine/video.ts";
import { askOf, slotLayout, type VideoWholeJob } from "./clip.ts";

const { job, module, ring, ctrl, taken, slots } = workerData as {
  job: VideoWholeJob;
  module: WebAssembly.Module;
  ring: SharedArrayBuffer;
  ctrl: SharedArrayBuffer;
  taken: SharedArrayBuffer;
  slots: number;
};
const held = new Int32Array(ctrl);
const out = new Int32Array(taken);
const layout = slotLayout(job.width, job.height);
const { ask, quality } = askOf(job);
const encoder = videoDrawer(module, ask, job.plan, quality);
parentPort?.postMessage({ ready: true });

for (let i = 0; i < job.plan.frames; i++) {
  const slot = i % slots;
  for (let v = Atomics.load(held, slot); v !== i; v = Atomics.load(held, slot)) {
    Atomics.wait(held, slot, v);
  }
  const from = new Uint8Array(ring, slot * layout.bytes, layout.bytes);
  const [y, u, v] = encoder.planes();
  y.set(from.subarray(0, layout.y));
  u.set(from.subarray(layout.y, layout.y + layout.uv));
  v.set(from.subarray(layout.y + layout.uv));
  Atomics.store(out, 0, i + 1);
  Atomics.notify(out, 0);
  const data = encoder.code(i);
  parentPort?.postMessage({ i, data }, [data.buffer]);
}
parentPort?.postMessage({ done: true });
