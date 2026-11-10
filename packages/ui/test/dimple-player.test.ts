import { decodePalette } from "@grabient/engine/codec.ts";
import { DIMPLE_EASE_S } from "@grabient/engine/dimple.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playDimple } from "../src/dimple-player.ts";

/* The dimple's player has no loop to play (John, 10 Nov 2026: "there should be no stationary animations for this
   one"): it draws its first frame, the still's, and then a frame only while its hollow is on its way to where the
   pointer last was over its canvas, where it stays ("just have it hold its last posisiion instead of resetting to
   the center"). Played here on a stand-in for WebGL that counts what is drawn, a frame each 16 ms of the fake clock,
   the pointer's moves told to the window's listeners. */

const P = decodePalette("kS7CQ31Do6asvY-") as Palette;
const VIEW = { speed: 1, fps: 60, angle: 90, shape: null };

let draws = 0;
let sizes: ((entries: unknown[]) => void)[] = [];
let listeners: Record<string, ((event: unknown) => void)[]> = {};
/** A canvas 300 by 200 at the page's top left, on a WebGL 2 context that draws nothing and counts its draws. */
function stage() {
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
      draws++;
    }
  };
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => gl,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }),
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  own.canvas = canvas;
  const gl = new Proxy(own, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      return /^[A-Z0-9_]+$/.test(key) ? 1 : () => ({});
    }
  });
  return canvas;
}
/** The canvas's first size, as the browser tells it before the first paint. */
const sized = () => {
  for (const told of sizes)
    told([{ devicePixelContentBoxSize: [{ inlineSize: 300, blockSize: 200 }] }]);
};
/** The pointer at a place on the page. */
const pointer = (clientX: number, clientY: number, type = "pointermove") => {
  for (const told of listeners[type] ?? []) told({ clientX, clientY });
};
const frames = (n: number) => vi.advanceTimersByTime(16 * n);

beforeEach(() => {
  vi.useFakeTimers();
  draws = 0;
  sizes = [];
  listeners = {};
  Object.assign(globalThis, {
    window: globalThis,
    devicePixelRatio: 1,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener: (type: string, told: (event: unknown) => void) => {
      listeners[type] = [...(listeners[type] ?? []), told];
    },
    removeEventListener: (type: string, told: (event: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter(one => one !== told);
    },
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
    "addEventListener",
    "removeEventListener",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "ResizeObserver",
    "IntersectionObserver",
    "matchMedia"
  ])
    Reflect.deleteProperty(globalThis, name);
});

test("draws its first frame at its rest, then nothing: it has no loop", () => {
  let first = 0;
  const player = playDimple(stage(), P, VIEW, () => first++);
  sized();
  frames(4);
  expect([draws, first]).toEqual([1, 1]);
  expect(player?.led?.()).toBeNull();
  /* a minute on, not a frame more, and no frame asked for */
  vi.advanceTimersByTime(60_000);
  expect(draws).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("follows the pointer over its canvas, draws only while its hollow is on its way, and stays where it comes to", () => {
  const player = playDimple(stage(), P, VIEW);
  sized();
  frames(4);
  pointer(75, 50);
  frames(2);
  /* on its way from the middle: nearer the pointer each frame, by the ease */
  const [u1, v1] = player?.led?.() ?? [0, 0];
  expect(u1).toBeLessThan(0.5);
  expect(u1).toBeGreaterThan(0.25);
  expect(v1).toBeLessThan(0.5);
  frames(1);
  const [u2] = player?.led?.() ?? [0];
  expect((u2 - 0.25) / (u1 - 0.25)).toBeCloseTo(Math.exp(-0.016 / DIMPLE_EASE_S), 6);
  /* three seconds on it is there, and has drawn nothing since it came */
  frames(190);
  expect(player?.led?.()).toEqual([0.25, 0.25]);
  const drawn = draws;
  expect(drawn).toBeGreaterThan(20);
  vi.advanceTimersByTime(60_000);
  expect(draws).toBe(drawn);
  expect(vi.getTimerCount()).toBe(0);
});

test("holds its last place when the pointer leaves its canvas, which sends it nowhere", () => {
  const player = playDimple(stage(), P, VIEW);
  sized();
  frames(4);
  pointer(240, 150);
  frames(190);
  expect(player?.led?.()).toEqual([0.8, 0.75]);
  const drawn = draws;
  /* off the canvas: to its right, under it, above the page's corner */
  pointer(301, 150);
  pointer(240, 260);
  pointer(-5, -5);
  frames(60);
  expect(player?.led?.()).toEqual([0.8, 0.75]);
  expect(draws).toBe(drawn);
  /* back over it, a press as well as a move: it follows again */
  pointer(30, 20, "pointerdown");
  frames(190);
  expect(player?.led?.()).toEqual([0.1, 0.1]);
  expect(draws).toBeGreaterThan(drawn);
});

test("stays as it is at speed 0 and for a reader who asks for less motion, and follows once it may", () => {
  let reduced = true;
  const player = playDimple(stage(), P, VIEW, undefined, { reduced: () => reduced });
  sized();
  frames(4);
  expect(draws).toBe(1);
  pointer(75, 50);
  frames(60);
  /* it knows where the pointer was and has not moved */
  expect(draws).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  reduced = false;
  player?.motion();
  frames(190);
  expect(player?.led?.()).toEqual([0.25, 0.25]);
  /* held at speed 0: the pointer leads it nowhere */
  const drawn = draws;
  player?.set(P, { ...VIEW, speed: 0 });
  frames(2);
  pointer(240, 150);
  frames(60);
  expect(player?.led?.()).toEqual([0.25, 0.25]);
  expect(draws).toBe(drawn + 1);
});

test("follows faster at a greater speed", () => {
  const places = [1, 4].map(speed => {
    const player = playDimple(stage(), P, { ...VIEW, speed });
    sized();
    frames(4);
    pointer(75, 50);
    frames(4);
    const at = player?.led?.() ?? [1, 1];
    player?.destroy();
    return at[0];
  });
  expect(places[1]).toBeLessThan(places[0]);
});

test("goes back to its rest when rewound, is put where a card left it, and lets its listeners go", () => {
  const player = playDimple(stage(), P, VIEW);
  sized();
  frames(4);
  pointer(75, 50);
  frames(190);
  player?.rewind();
  frames(2);
  expect(player?.led?.()).toBeNull();
  const drawn = draws;
  /* a card's next player takes over where the pointer left its still */
  player?.lead?.([0.6, 0.4]);
  frames(2);
  expect(player?.led?.()).toEqual([0.6, 0.4]);
  expect(draws).toBe(drawn + 1);
  expect(vi.getTimerCount()).toBe(0);
  player?.lead?.(null);
  frames(2);
  expect(player?.led?.()).toBeNull();
  expect(listeners.pointermove).toHaveLength(1);
  player?.destroy();
  expect(listeners.pointermove).toHaveLength(0);
  expect(listeners.pointerdown).toHaveLength(0);
});
