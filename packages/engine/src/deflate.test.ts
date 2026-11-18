import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { deflate, deflateSteps } from "./deflate.ts";

/* numbers that are the same on every machine */
const noise = (seed: number) => () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
/* a smooth picture with fine streaks, as the aurora's light is, each row as its difference from the row above:
   small numbers and, under its flat lower third, zeros */
const rows = (width: number, height: number) => {
  const at = (x: number, y: number) => {
    if (y > (height * 2) / 3) return 9;
    const u = x / width;
    const v = y / height;
    return Math.floor(64 + 40 * Math.sin(9 * u + 4 * v * v) + 20 * Math.sin(53 * u - 2 * v));
  };
  const out = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    out[y * (width + 1)] = 2;
    for (let x = 0; x < width; x++)
      out[y * (width + 1) + 1 + x] = at(x, y) - (y ? at(x, y - 1) : 0);
  }
  return out;
};
const fnv = (bytes: Uint8Array) => {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16);
};

describe("deflate", () => {
  const random = noise(12345);
  const cases: [string, Uint8Array][] = [
    ["nothing", new Uint8Array(0)],
    ["one byte", Uint8Array.of(7)],
    ["two bytes", Uint8Array.of(7, 7)],
    ["three bytes", Uint8Array.of(1, 2, 3)],
    ["zeros", new Uint8Array(100000)],
    ["noise", Uint8Array.from({ length: 50000 }, () => Math.floor(random() * 256))],
    [
      "small numbers",
      Uint8Array.from({ length: 80000 }, () => {
        const r = random();
        return r < 0.5 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 255 : r < 0.95 ? 2 : 254;
      })
    ],
    [
      "words",
      Uint8Array.from("the light of each place, a pixel a place. ".repeat(500), c =>
        c.charCodeAt(0)
      )
    ],
    ["a ramp", Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) & 255)],
    ["matches far back", Uint8Array.from({ length: 90000 }, (_, i) => (i % 31337) % 251)],
    ["a picture's rows", rows(256, 256)]
  ];

  it("writes a zlib stream that any reader of deflate turns back into the bytes", () => {
    for (const [name, bytes] of cases) {
      const packed = deflate(bytes);
      /* zlib's header: deflate, a window of 32 KiB, its check */
      expect([packed[0], packed[1]], name).toEqual([0x78, 0xda]);
      const back = inflateSync(packed);
      expect(back.length, name).toBe(bytes.length);
      expect(Buffer.compare(back, bytes), name).toBe(0);
    }
  });

  it("writes runs and smooth pictures small, and noise hardly larger than it is", () => {
    const sizes = Object.fromEntries(cases.map(([name, bytes]) => [name, deflate(bytes).length]));
    expect(sizes.zeros).toBeLessThan(200);
    expect(sizes.words).toBeLessThan(250);
    expect(sizes["a ramp"]).toBeLessThan(800);
    expect(sizes.noise).toBeLessThan(50000 * 1.01);
    /* numbers of five kinds, 1.86 bits each as often as they come: a match of three of them costs more than the
       three as they are, and a search that takes every match it finds writes these a quarter larger */
    expect(sizes["small numbers"]).toBeLessThan(80000 * 0.25);
    /* 65,792 bytes of a picture's rows: an eighth of them */
    expect(sizes["a picture's rows"]).toBeLessThan(65792 * 0.13);
  });

  it("writes the same bytes a step at a time, and the same on every machine", () => {
    const picture = rows(256, 256);
    const steps = deflateSteps(picture);
    let count = 0;
    let step = steps.next();
    while (!step.done) {
      count++;
      step = steps.next();
    }
    expect(count).toBeGreaterThan(4);
    expect(Buffer.compare(step.value, deflate(picture))).toBe(0);
    expect([step.value.length, fnv(step.value)]).toEqual([8145, "d93ca383"]);
  });
});
