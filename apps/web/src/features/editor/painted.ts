/* When the page's effect still is on the screen. A WebGL context asked for while the GPU paints the still's filter
   waits on that painting, and the page's thread with it: about a quarter of a second on a slow GPU in a page's first
   second, where it takes a few milliseconds once the still is painted (the editor's holder paints it again as the
   editor takes the page over from its first screen). The picture's holders are marked for the browser's element
   timing (STILL_TIMING), and the players and the shared still canvas make their contexts once one of them is painted;
   at once where the browser reports no element timing, where the page has no still of the server's and once the
   page's first seconds have gone, and in any case once they have. */
import { probeWaitsFor } from "@grabient/ui/renderer.ts";
import { BLOB_STILL_STYLE } from "./blob-draw.ts";
import { GLASS_STILL_STYLE } from "./glass-draw.ts";

/** The element timing name of a picture's still holder. */
export const STILL_TIMING = "effect-still";
/** How far into a page's life a context waits for its still. */
const WAIT_MS = 2000;

let painted: Promise<void> | null = null;

/** Done once the picture's still has been painted, or at once where there is none to wait for. */
export function stillPainted(): Promise<void> {
  if (painted) return painted;
  const left = WAIT_MS - performance.now();
  const reports =
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes?.includes("element");
  const server =
    !!document.getElementById(GLASS_STILL_STYLE) || !!document.getElementById(BLOB_STILL_STYLE);
  if (!reports || !server || left <= 0) {
    painted = Promise.resolve();
    return painted;
  }
  painted = new Promise<void>(resolve => {
    let timer = 0;
    const observer = new PerformanceObserver(list => {
      /* the first screen's holder, gone once the editor has drawn its own, painted the still before: its context
         would wait on the editor's */
      for (const entry of list.getEntries() as unknown as ElementTiming[])
        if (entry.identifier === STILL_TIMING && entry.element?.isConnected) return done();
    });
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(done, left);
    observer.observe({ type: "element", buffered: true });
  });
  return painted;
}

/** The element timing name of a small picture's holder (GlassArt.tsx): a menu's tile, the header's swatch, a card. */
export const TILE_TIMING = "effect-tile";

/** Done once the browser reports `el`, which carries an element timing name, painted, or after `cap` ms: what the GPU
    paints as a menu opens (its tiles' filters) holds a context made meanwhile as the page's start does. At once where
    the browser reports no element timing. */
export function elementPainted(el: Element, cap: number): Promise<void> {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("element")
  )
    return Promise.resolve();
  return new Promise<void>(resolve => {
    let timer = 0;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as unknown as ElementTiming[])
        if (entry.element === el) return done();
    });
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(done, cap);
    observer.observe({ type: "element", buffered: true });
  });
}

/* The players' first frames, the GPU's longest work in a page's first seconds once the still is painted: the driver
   compiles a player's programs as they are first drawn with and its maps are baked, a tenth of a second and more on a
   slow driver (150 ms on an RTX 2080 Ti through WSL's D3D12). What the page asks of the GPU and waits for meanwhile
   waits with the page's thread: the shared still canvas's context made (glass-draw.ts), or the renderer probe's worker
   let go, whose context goes with it (ui/renderer.ts). A player holds the GPU from the moment it is on its way until
   its canvas has faded in over the still (GlassStage.tsx, BlobStage.tsx): the page draws frames ahead of the GPU, and
   two frames after the first one was drawn the GPU was still at it; work that can wait asks for gpuQuiet(). */

/** How long a hold lasts at most, and how long work waits for the players at most: a player that never draws, or a
    hidden page's, which draws no frames, lets go by then. */
const QUIET_MS = 3000;

let held = 0;
let waiting: (() => void)[] = [];

/** A player is on its way: the GPU is busy with it until the returned release, called once its first frame is drawn
    and shown, or once it plays nothing or goes; the hold ends two frames after. Calling the release again does
    nothing. */
export function holdGpu(): () => void {
  held++;
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(cap);
    held--;
    if (held > 0) return;
    const done = waiting;
    waiting = [];
    for (const run of done) run();
  };
  const cap = setTimeout(end, QUIET_MS);
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    requestAnimationFrame(() => requestAnimationFrame(end));
  };
}

/** Done once no player holds the GPU: at once where none does, and after QUIET_MS at most. */
export function gpuQuiet(): Promise<void> {
  if (held <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      waiting = waiting.filter(run => run !== done);
      resolve();
    };
    const timer = setTimeout(done, QUIET_MS);
    waiting.push(done);
  });
}

/* the probe's worker goes once no player holds the GPU, on a page whose players' code has come */
probeWaitsFor(gpuQuiet);

/* a PerformanceElementTiming entry, which TypeScript's DOM types do not carry */
interface ElementTiming {
  identifier: string;
  element: Element | null;
}
