import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* The players' hold on the GPU (painted.ts): work that can wait for their first frames waits for every hold to end, two
   frames after its release, and no longer than the cap; the renderer probe's worker is let go the same way. Each test
   loads the modules afresh: the count is the page's. */
let frames: (() => void)[] = [];
const frame = () => {
  const run = frames;
  frames = [];
  for (const f of run) f();
};
const load = async () => {
  vi.resetModules();
  return import("./painted.ts");
};
/* whether a promise has settled, once the microtasks queued so far have run */
const settled = async (promise: Promise<unknown>) => {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  return done;
};

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => frames.push(f));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("work asked for with no player on its way goes at once", async () => {
  const { gpuQuiet } = await load();
  expect(await settled(gpuQuiet())).toBe(true);
});

test("work waits for each player's first frame, shown two frames after it is drawn", async () => {
  const { gpuQuiet, holdGpu } = await load();
  const glass = holdGpu();
  const blob = holdGpu();
  const work = gpuQuiet();
  glass();
  frame();
  frame();
  expect(await settled(work)).toBe(false);
  blob();
  frame();
  expect(await settled(work)).toBe(false);
  frame();
  expect(await settled(work)).toBe(true);
});

test("a release called again lets go of nothing more", async () => {
  const { gpuQuiet, holdGpu } = await load();
  const first = holdGpu();
  first();
  first();
  frame();
  frame();
  const second = holdGpu();
  const work = gpuQuiet();
  frame();
  frame();
  expect(await settled(work)).toBe(false);
  second();
  frame();
  frame();
  expect(await settled(work)).toBe(true);
});

test("a player that never draws, or a page that draws no frames, holds the GPU three seconds at most", async () => {
  const { gpuQuiet, holdGpu } = await load();
  holdGpu();
  const work = gpuQuiet();
  vi.advanceTimersByTime(2999);
  expect(await settled(work)).toBe(false);
  vi.advanceTimersByTime(1);
  expect(await settled(work)).toBe(true);
  /* the hold is over too: later work goes at once */
  expect(await settled(gpuQuiet())).toBe(true);
});

test("the renderer probe's worker is let go once no player holds the GPU", async () => {
  const { holdGpu } = await load();
  const renderer = await import("@grabient/ui/renderer.ts");
  let gone = 0;
  let answer: ((e: { data: string }) => void) | undefined;
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal(
    "Worker",
    class {
      set onmessage(f: (e: { data: string }) => void) {
        answer = f;
      }
      set onerror(_: unknown) {}
      postMessage() {}
      terminate() {
        gone++;
      }
    }
  );
  const release = holdGpu();
  const known = renderer.waterAllowed();
  answer?.({ data: "ANGLE (NVIDIA GeForce RTX 2080 Ti)" });
  expect(await known).toBe(true);
  expect(gone).toBe(0);
  release();
  frame();
  frame();
  await settled(Promise.resolve());
  expect(gone).toBe(1);
});
