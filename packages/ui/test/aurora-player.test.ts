import { AURORA_TILE, auroraScene, auroraTiles, auroraTime } from "@grabient/engine/aurora.ts";
import { AURORA_TABLE, auroraSceneUniforms, auroraTable } from "@grabient/engine/aurora-gl.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type AuroraPlay, createAuroraDrawing, playAurora } from "../src/aurora-player.ts";

/* The aurora's player on a stand-in for WebGL that keeps what it is sent: the two noise tiles go up once, however
   many times the scene is laid out, the table and the scene's uniforms once a layout, and a frame sets the loop's
   share alone. Played on the loop, a frame each 17 ms of the fake clock (a 60 Hz screen's), it draws one a refresh,
   and at speed 0 its first frame and no more until its look changes. */

const P = decodePalette("kS7CQ31Do6asvY-") as Palette;
const VIEW: AuroraPlay = { angle: 90, path: null, bg: null, speed: 1, fps: 60 };

interface Sent {
  draws: number;
  /** each picture sent to a texture: its size and its numbers */
  pictures: { width: number; height: number; data: ArrayLike<number> }[];
  /** each uniform set, by its name */
  uniforms: { name: string; data: number[] }[];
}
/** A WebGL 2 context that draws nothing and keeps what it is sent: its programs build at once, on "A GPU". */
function recordingGl(sent: Sent, canvas?: HTMLCanvasElement) {
  const uniform = (location: { name: string } | null, ...data: (number | ArrayLike<number>)[]) => {
    if (location)
      sent.uniforms.push({
        name: location.name,
        data: data.flatMap(d => (typeof d === "number" ? [d] : Array.from(d)))
      });
  };
  const own: Record<string, unknown> = {
    canvas,
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info"
        ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
        : name === "WEBGL_lose_context"
          ? { loseContext() {} }
          : null,
    getParameter: () => "A GPU",
    isContextLost: () => false,
    getProgramParameter: () => true,
    getUniformLocation: (_: unknown, name: string) => ({ name }),
    uniform1i: uniform,
    uniform1f: uniform,
    uniform2f: uniform,
    uniform3fv: uniform,
    uniform4fv: uniform,
    texImage2D: (...args: unknown[]) => {
      sent.pictures.push({
        width: args[3] as number,
        height: args[4] as number,
        data: args[8] as ArrayLike<number>
      });
    },
    drawArrays: () => {
      sent.draws++;
    }
  };
  return new Proxy(own, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      /* its constants are numbers, and every other call makes or does something */
      return /^[A-Z0-9_]+$/.test(key) ? 1 : () => ({});
    }
  }) as unknown as WebGL2RenderingContext;
}
const nothingSent = (): Sent => ({ draws: 0, pictures: [], uniforms: [] });
const tilesOf = (sent: Sent) => sent.pictures.filter(p => p.width === AURORA_TILE);
const tablesOf = (sent: Sent) => sent.pictures.filter(p => p.width === AURORA_TABLE.width);
const named = (sent: Sent, name: string) => sent.uniforms.filter(u => u.name === name);

let sizes: ((entries: unknown[]) => void)[] = [];
/** A canvas 300 by 200 on the page, on the recording context. */
function stage(sent: Sent) {
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => gl,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }),
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  const gl = recordingGl(sent, canvas);
  return canvas;
}
/** The canvas's first size, as the browser tells it before the first paint. */
const sized = () => {
  for (const told of sizes)
    told([{ devicePixelContentBoxSize: [{ inlineSize: 300, blockSize: 200 }] }]);
};
const frames = (n: number) => vi.advanceTimersByTime(17 * n);

/** The loop's world: a page shown, a screen that asks a frame each 17 ms of the fake clock. */
function onThePage() {
  vi.useFakeTimers();
  Object.assign(globalThis, {
    window: globalThis,
    devicePixelRatio: 1,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: (run: (now: number) => void) => setTimeout(() => run(Date.now()), 17),
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
}
beforeEach(() => {
  sizes = [];
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

/* first in the file: the tiles are kept once made, so only the first drawing of a page makes them */
test("makes its tiles a few milliseconds an ask, says it is not built until they are made, and sends them once", () => {
  /* a clock that goes on a millisecond each time it is read: an ask works for three reads of it */
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock++);
  const sent = nothingSent();
  const drawing = createAuroraDrawing(recordingGl(sent));
  drawing.layout(P, VIEW, 320, 180);
  let asks = 1;
  expect(drawing.built()).toBe(false);
  /* nothing is drawn, and no tile sent, while they are being made */
  drawing.draw(0);
  expect([sent.draws, sent.pictures.length]).toEqual([0, 0]);
  while (drawing.built() === false) asks++;
  expect(asks).toBeGreaterThan(3);
  expect(drawing.built()).toBe(true);
  const { noise, soft } = auroraTiles();
  expect(tilesOf(sent).map(p => [p.height, p.data])).toEqual([
    [AURORA_TILE, noise],
    [AURORA_TILE, soft]
  ]);
  /* a second drawing on the page finds them made: built at its first ask, and sends them to its own context */
  const next = nothingSent();
  const second = createAuroraDrawing(recordingGl(next));
  expect(second.built()).toBe(true);
  expect(tilesOf(next)).toHaveLength(2);
});

test("sends the table and the scene's uniforms once a layout, and a frame sets the loop's share alone", () => {
  const sent = nothingSent();
  const drawing = createAuroraDrawing(recordingGl(sent));
  drawing.layout(P, VIEW, 320, 180);
  expect(drawing.built()).toBe(true);
  drawing.draw(0);
  const scene = auroraScene(P, VIEW, { width: 320, height: 180 });
  const u = auroraSceneUniforms(scene);
  expect(Object.fromEntries(sent.uniforms.map(s => [s.name, s.data]))).toEqual({
    uTable: [0],
    uNoise: [1],
    uSoft: [2],
    uSize: [320, 180],
    uFrame: Array.from(u.frame),
    uPath: Array.from(u.path),
    uRange: Array.from(u.range),
    uTime: [0]
  });
  expect(tablesOf(sent).map(p => [p.height, p.data])).toEqual([
    [AURORA_TABLE.height, auroraTable(scene)]
  ]);
  for (const t of [1 / 60, 23.7, 59.9]) {
    sent.uniforms.length = 0;
    drawing.draw(t);
    expect(sent.uniforms).toEqual([{ name: "uTime", data: [auroraTime(t)] }]);
  }
  expect([sent.draws, tablesOf(sent).length, tilesOf(sent).length]).toEqual([4, 1, 2]);
});

test("sends the scene again when the look's path, its angle or its ground changes, and never the tiles", () => {
  const sent = nothingSent();
  const drawing = createAuroraDrawing(recordingGl(sent));
  drawing.layout(P, VIEW, 320, 180);
  expect(drawing.built()).toBe(true);
  drawing.draw(0);
  const looks: AuroraPlay[] = [
    { ...VIEW, path: "line,20,80,35" },
    { ...VIEW, path: "line,20,80,35", angle: 215 },
    { ...VIEW, path: "line,20,80,35", angle: 215, bg: "#140b19" }
  ];
  let before = auroraScene(P, VIEW, { width: 320, height: 180 });
  for (const look of looks) {
    sent.pictures.length = 0;
    sent.uniforms.length = 0;
    drawing.layout(P, look, 320, 180);
    drawing.draw(5);
    drawing.draw(6);
    const scene = auroraScene(P, look, { width: 320, height: 180 });
    const u = auroraSceneUniforms(scene);
    /* the look differs from the last in what the pass reads */
    const was = auroraSceneUniforms(before);
    expect([u.frame, u.path, u.range, auroraTable(scene)]).not.toEqual([
      was.frame,
      was.path,
      was.range,
      auroraTable(before)
    ]);
    expect(sent.pictures.map(p => [p.width, p.height, p.data])).toEqual([
      [AURORA_TABLE.width, AURORA_TABLE.height, auroraTable(scene)]
    ]);
    expect(named(sent, "uFrame").map(s => s.data)).toEqual([Array.from(u.frame)]);
    expect(named(sent, "uPath").map(s => s.data)).toEqual([Array.from(u.path)]);
    expect(named(sent, "uRange").map(s => s.data)).toEqual([Array.from(u.range)]);
    expect(named(sent, "uTime")).toHaveLength(2);
    before = scene;
  }
});

test("draws its first frame at the loop's start, then a frame each refresh", () => {
  onThePage();
  const sent = nothingSent();
  let first = 0;
  const player = playAurora(stage(sent), P, VIEW, () => first++);
  expect(player).not.toBeNull();
  sized();
  frames(1);
  expect([sent.draws, first]).toEqual([1, 1]);
  expect(named(sent, "uTime").map(s => s.data)).toEqual([[0]]);
  frames(10);
  expect([sent.draws, first]).toEqual([11, 1]);
  /* the loop's share goes on, frame by frame */
  const shares = named(sent, "uTime").map(s => s.data[0]);
  expect(shares.every((share, i) => i === 0 || share > shares[i - 1])).toBe(true);
  expect([tilesOf(sent).length, tablesOf(sent).length]).toEqual([2, 1]);
  player?.destroy();
  expect(vi.getTimerCount()).toBe(0);
});

test("holds its first frame at speed 0, and draws again only when its look changes", () => {
  onThePage();
  const sent = nothingSent();
  const player = playAurora(stage(sent), P, { ...VIEW, speed: 0 });
  sized();
  frames(4);
  expect(sent.draws).toBe(1);
  /* a minute on, not a frame more, and no frame asked for */
  vi.advanceTimersByTime(60_000);
  expect(sent.draws).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  player?.set(P, { ...VIEW, speed: 0, path: "curve,30,70,40" });
  frames(4);
  expect(sent.draws).toBe(2);
  expect(tablesOf(sent)).toHaveLength(2);
  expect(named(sent, "uTime").map(s => s.data)).toEqual([[0], [0]]);
  expect(vi.getTimerCount()).toBe(0);
  player?.destroy();
});

test("holds its first frame for a reader who asks for less motion", () => {
  onThePage();
  const sent = nothingSent();
  const player = playAurora(stage(sent), P, VIEW, undefined, { reduced: () => true });
  sized();
  frames(20);
  expect(sent.draws).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  player?.destroy();
});
