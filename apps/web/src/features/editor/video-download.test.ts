import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NO_VIDEO_HERE } from "./formats.ts";
import type { ClipSaid } from "./video-clip.ts";
import { downloadClip, makesClips } from "./video-download.ts";

/* The editor's Download MP4 as the page's thread runs it: a worker started a clip, what it says heard, the file saved,
   and why there is none told apart, so a reader whose browser can make videos is never told it cannot. The worker's
   own side is video-clip.test.ts's. */

const saved = vi.hoisted(() => [] as { name: string; type: string; size: number }[]);
vi.mock("@grabient/ui/copy.ts", async load => ({
  ...(await load<typeof import("@grabient/ui/copy.ts")>()),
  downloadFile: (name: string, data: Blob) => {
    saved.push({ name, type: data.type, size: data.size });
  }
}));

/* a worker as the page sees one: what it is asked, whether it is ended, and what it says or how it fails; a browser
   without module workers refuses to make one */
class Made extends EventTarget {
  static all: Made[] = [];
  static refused = false;
  readonly url: URL;
  readonly options: WorkerOptions;
  asked: unknown[] = [];
  ended = false;
  constructor(url: URL, options: WorkerOptions) {
    super();
    if (Made.refused)
      throw new TypeError("Module scripts are not supported on DedicatedWorker yet");
    this.url = url;
    this.options = options;
    Made.all.push(this);
  }
  postMessage(data: unknown) {
    this.asked.push(data);
  }
  terminate() {
    this.ended = true;
  }
  say(said: ClipSaid) {
    this.dispatchEvent(new MessageEvent("message", { data: said }));
  }
  /* its script did not load: no connection, or a deploy since retired it */
  unloaded() {
    this.dispatchEvent(new Event("error", { cancelable: true }));
  }
}

const CLIP = { address: "https://grabient.test/k.mp4?style=glass", name: "grabient-k-glass.mp4" };
const make = (signal = new AbortController().signal) => {
  const heard: number[] = [];
  const made = downloadClip(CLIP, done => heard.push(done), signal);
  return { made, heard, worker: Made.all.at(-1) };
};
const why = (made: Promise<void>) =>
  made.then(
    () => "saved",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  );

beforeEach(() => {
  vi.stubGlobal("Worker", Made);
  Made.all = [];
  Made.refused = false;
  saved.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a worker of its own draws the clip at its address, says how far along it is, and hands over the file to save", async () => {
  const { made, heard, worker } = make();
  expect(worker?.options).toEqual({ type: "module", name: "MP4" });
  expect(worker?.url.pathname).toMatch(/\/video-worker\.ts$/);
  expect(worker?.asked).toEqual([{ address: CLIP.address }]);
  worker?.say({ said: "progress", done: 0.5 });
  worker?.say({ said: "progress", done: 1 });
  worker?.say({ said: "done", file: new Uint8Array(7).buffer });
  await made;
  expect(heard).toEqual([0.5, 1]);
  expect(saved).toEqual([{ name: CLIP.name, type: "video/mp4", size: 7 }]);
  expect(worker?.ended).toBe(true);
});

test("a stop ends its worker at once, and no file comes", async () => {
  const stop = new AbortController();
  const { made, worker } = make(stop.signal);
  stop.abort(new Error("stopped"));
  expect(await why(made)).toBe("stopped");
  expect(worker?.ended).toBe(true);
  worker?.say({ said: "done", file: new Uint8Array(7).buffer });
  await Promise.resolve();
  expect(saved).toEqual([]);
});

test("a browser that cannot make videos is told so, before anything loads", async () => {
  vi.spyOn(WebAssembly, "validate").mockReturnValue(false);
  expect(makesClips()).toBe(false);
  expect(await why(make().made)).toBe(NO_VIDEO_HERE);
  expect(Made.all).toEqual([]);
  vi.restoreAllMocks();
  /* one that runs no module workers refuses the worker itself */
  Made.refused = true;
  expect(await why(make().made)).toBe(NO_VIDEO_HERE);
  /* one whose WebAssembly refuses the module's own bytes, which its worker says */
  Made.refused = false;
  const { made, worker } = make();
  worker?.say({ said: "failed", why: "browser" });
  expect(await why(made)).toBe(NO_VIDEO_HERE);
});

test("a worker or a module that did not load, or a drawing that failed, is a download that failed, never the browser", async () => {
  expect(makesClips()).toBe(true);
  const unloaded = make();
  unloaded.worker?.unloaded();
  expect(await why(unloaded.made)).toBe("Video load");
  expect(unloaded.worker?.ended).toBe(true);
  for (const failed of ["load", "drawing"] as const) {
    const { made, worker } = make();
    worker?.say({ said: "failed", why: failed });
    expect(await why(made)).toBe(`Video ${failed}`);
  }
  expect(saved).toEqual([]);
});
