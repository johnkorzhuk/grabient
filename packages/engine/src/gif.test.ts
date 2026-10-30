import { describe, expect, it } from "vitest";
import { readGif } from "../test/gif.ts";
import { encodeGif, gifDelays } from "./gif.ts";

/** Frames of `width` by `height` from a function of the frame and the pixel to [r, g, b] or [r, g, b, a]. */
function source(
  width: number,
  height: number,
  frames: number,
  channels: 3 | 4,
  at: (i: number, x: number, y: number) => number[]
) {
  const drawn = Array.from({ length: frames }, (_, i) => {
    const pixels = new Uint8Array(channels * width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) pixels.set(at(i, x, y), channels * (y * width + x));
    }
    return pixels;
  });
  return { width, height, channels, frames, frame: (i: number) => drawn[i], delay: () => 5, drawn };
}

const rgba = (pixels: Uint8Array) => {
  const out = new Uint8Array((pixels.length / 3) * 4);
  for (let p = 0, o = 0; o < pixels.length; p += 4, o += 3)
    out.set([pixels[o], pixels[o + 1], pixels[o + 2], 255], p);
  return out;
};

describe("gifDelays", () => {
  it("adds up to the whole, each a hundredth from the others", () => {
    const delays = gifDelays(192, 16);
    expect(delays.reduce((a, b) => a + b)).toBe(1600);
    expect(new Set(delays)).toEqual(new Set([8, 9]));
    expect(gifDelays(10, 1)).toEqual(Array(10).fill(10));
  });
});

describe("encodeGif", () => {
  const colors = [
    [255, 0, 0],
    [0, 128, 255],
    [250, 250, 240],
    [20, 10, 30]
  ];

  it("writes opaque frames back exactly, a loop forever, each frame's delay", async () => {
    const frames = source(9, 7, 3, 3, (i, x, y) => colors[(x + 2 * y + i) % 4]);
    const read = readGif(await encodeGif(frames));
    expect([read.width, read.height, read.loops, read.frames.length]).toEqual([9, 7, 0, 3]);
    for (const [i, frame] of read.frames.entries())
      expect(frame.pixels).toEqual(rgba(frames.drawn[i]));
    expect(read.frames.map(f => f.delay)).toEqual([5, 5, 5]);
  });

  it("writes an opaque frame as what changed, and nothing where nothing did", async () => {
    const frames = source(16, 12, 3, 3, (i, x, y) =>
      i === 1 && x >= 4 && x < 7 && y >= 2 && y < 5 ? colors[2] : colors[(x >> 2) % 2]
    );
    const read = readGif(
      await encodeGif({ ...frames, frames: 4, frame: i => frames.drawn[Math.min(i, 2)] })
    );
    expect(read.frames.map(f => f.box)).toEqual([
      [0, 0, 16, 12],
      [4, 2, 3, 3],
      [4, 2, 3, 3],
      [0, 0, 1, 1]
    ]);
    for (const [i, frame] of read.frames.entries())
      expect(frame.pixels).toEqual(rgba(frames.drawn[Math.min(i, 2)]));
  });

  it("draws frames with transparency whole on a cleared screen, the pixel gone where its alpha went", async () => {
    const frames = source(10, 10, 2, 4, (i, x, y) =>
      Math.hypot(x - 3 - 4 * i, y - 5) < 3 ? [...colors[1], 255] : [0, 0, 0, 0]
    );
    const read = readGif(await encodeGif(frames));
    for (const [i, frame] of read.frames.entries()) {
      expect(frame.disposal).toBe(2);
      const shown = Array.from({ length: 100 }, (_, p) => frame.pixels[4 * p + 3] > 0);
      const meant = Array.from({ length: 100 }, (_, p) => frames.drawn[i][4 * p + 3] > 0);
      expect(shown).toEqual(meant);
    }
    expect(read.table[read.background]).toBeDefined();
  });

  it("sprays a half-transparent pixel: about half are drawn, the same ones each frame", async () => {
    const frames = source(64, 64, 2, 4, () => [200, 100, 50, 128]);
    const read = readGif(await encodeGif(frames));
    const drawn = (i: number) =>
      Array.from({ length: 64 * 64 }, (_, p) => read.frames[i].pixels[4 * p + 3] > 0);
    const share = drawn(0).filter(Boolean).length / (64 * 64);
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
    expect(drawn(1)).toEqual(drawn(0));
  });

  it("keeps many colors and long noise through its table's clears", async () => {
    let n = 7;
    const rand = () => {
      n = (Math.imul(n, 1103515245) + 12345) >>> 0;
      return n >>> 24;
    };
    /* each color in a bin of its own, so the table holds them all */
    const palette = Array.from({ length: 200 }, (_, i) => [(i % 32) * 8, ((i >> 5) % 8) * 32, 128]);
    const frames = source(120, 90, 1, 3, () => palette[rand() % 200]);
    const read = readGif(await encodeGif(frames));
    expect(read.frames[0].pixels).toEqual(rgba(frames.drawn[0]));
  });

  it("holds a color that drifted within the tolerance, and lets one past it change", async () => {
    const frames = source(4, 1, 2, 3, (i, x) =>
      x < 2 ? [100 + 12 * i, 100, 100] : [100 + 60 * i, 100, 100]
    );
    const read = readGif(await encodeGif(frames, { tolerance: 2 * 16 * 16 }));
    const red = (i: number, x: number) => read.frames[i].pixels[4 * x];
    expect([red(1, 0), red(1, 1)]).toEqual([red(0, 0), red(0, 1)]);
    expect(red(1, 3)).toBeGreaterThan(140);
  });
});
