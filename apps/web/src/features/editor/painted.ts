/* When the page's effect still is on the screen. A WebGL context asked for while the GPU paints the still's filter
   waits on that painting, and the page's thread with it: about a quarter of a second on a slow GPU in a page's first
   second, where it takes a few milliseconds once the still is painted (the editor's holder paints it again as the
   editor takes the page over from its first screen). The picture's holders are marked for the browser's element
   timing (STILL_TIMING), and the players and the shared still canvas make their contexts once one of them is painted;
   at once where the browser reports no element timing, where the page has no still of the server's and once the
   page's first seconds have gone, and in any case once they have. */
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

/* a PerformanceElementTiming entry, which TypeScript's DOM types do not carry */
interface ElementTiming {
  identifier: string;
  element: Element | null;
}
