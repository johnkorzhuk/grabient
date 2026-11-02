import { decodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { playBlob } from "../src/blob-player.ts";
import { playGlass } from "../src/glass-player.ts";

/* The effects' players hold their first frame while their caller says the reader asks for less motion, and ask no
   media query of their own: on the site the reader's choice in Settings decides (motion.ts), on another site's page
   the device's setting (embed/mount.ts). Played here on a stand-in for WebGL that counts what is drawn, a frame each
   16 ms of the fake clock. */

const P = decodePalette("kS7CQ31Do6asvY-") as Palette;

/** A WebGL 2 context that draws nothing and counts its draws: its programs build at once, on "A GPU". */
function fakeGl() {
  const counted = { draws: 0 };
  const own: Record<string, unknown> = {
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info"
        ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
        : name === "WEBGL_lose_context"
          ? { loseContext() {} }
          : null,
    getParameter: () => "A GPU",
    isContextLost: () => false,
    getProgramParameter: () => true,
    drawArrays: () => {
      counted.draws++;
    },
    drawArraysInstanced: () => {
      counted.draws++;
    }
  };
  const gl = new Proxy(own, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      /* its constants are numbers, and every other call makes or does something */
      return /^[A-Z0-9_]+$/.test(key) ? 1 : () => ({});
    }
  });
  return { gl, counted };
}

/** A canvas 300 by 200 on the page, and the observer that says its size. */
function stage() {
  const { gl, counted } = fakeGl();
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => gl,
    getBoundingClientRect: () => ({ width: 300, height: 200 }),
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  return { canvas, counted };
}

let sizes: ((entries: unknown[]) => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  sizes = [];
  Object.assign(globalThis, {
    window: globalThis,
    devicePixelRatio: 1,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: (run: (now: number) => void) => setTimeout(() => run(Date.now()), 16),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    ResizeObserver: class {
      constructor(told: (entries: unknown[]) => void) {
        sizes.push(told);
      }
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    /* the players never ask it: a call fails the test */
    matchMedia: () => {
      throw new Error("a player asked the media query");
    }
  });
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const name of [
    "window",
    "devicePixelRatio",
    "document",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "ResizeObserver",
    "IntersectionObserver",
    "matchMedia"
  ])
    Reflect.deleteProperty(globalThis, name);
});

/** The canvas's first size, as the browser tells it before the first paint. */
const sized = () => {
  for (const told of sizes)
    told([{ devicePixelContentBoxSize: [{ inlineSize: 300, blockSize: 200 }] }]);
};

describe.each([
  [
    "fluted glass",
    (canvas: HTMLCanvasElement, reduced: () => boolean, fps: number | null) =>
      playGlass(canvas, P, { speed: 1, fps, angle: 90, shape: null }, undefined, { reduced })
  ],
  [
    "blob",
    (canvas: HTMLCanvasElement, reduced: () => boolean, fps: number | null) =>
      playBlob(
        canvas,
        P,
        { speed: 1, fps, frost: 1, shape: 3, bg: null, still: false },
        undefined,
        { reduced }
      )
  ]
] as const)("the %s", (_, play) => {
  test("holds its first frame while its caller says the reader asks for less motion, and moves once it says otherwise", () => {
    const { canvas, counted } = stage();
    let reduced = true;
    const player = play(canvas, () => reduced, null);
    expect(player).not.toBeNull();
    sized();
    vi.advanceTimersByTime(200);
    // the first frame, then nothing: no loop runs
    expect(counted.draws).toBeGreaterThan(0);
    const held = counted.draws;
    vi.advanceTimersByTime(500);
    expect(counted.draws).toBe(held);
    // motion welcome: it moves, a frame each refresh
    reduced = false;
    player?.motion();
    vi.advanceTimersByTime(500);
    expect(counted.draws).toBeGreaterThan(held + 20);
    // less motion asked while it plays: the first frame again at once, then it stops
    reduced = true;
    player?.motion();
    vi.advanceTimersByTime(20);
    const stopped = counted.draws;
    vi.advanceTimersByTime(500);
    expect(counted.draws).toBe(stopped);
    player?.destroy();
  });

  test("draws the first frame at once when less motion is asked, whatever frame rate it keeps", () => {
    const { canvas, counted } = stage();
    let reduced = false;
    // a frame a second at most: the next is not due for most of a second
    const player = play(canvas, () => reduced, 1);
    sized();
    vi.advanceTimersByTime(1200);
    const before = counted.draws;
    reduced = true;
    player?.motion();
    vi.advanceTimersByTime(20);
    expect(counted.draws).toBeGreaterThan(before);
    player?.destroy();
  });
});
