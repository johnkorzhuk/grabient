import { expect, test } from "vitest";
import { fixture } from "../test/files.ts";
import { colorAt, imageSamples } from "./picture.ts";

const round = (x: number) => Math.round(x * 1e6) / 1e6;

/* the pictures G4's checks drew, 200 by 120 */
type Paint = (x: number, y: number) => number[];
function picture(paint: Paint, w = 200, h = 120): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      px.set([r, g, b, a], (y * w + x) * 4);
    }
  }
  return px;
}
const rgb = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const art = ["#1d3557", "#e63946", "#f4efe6", "#a8dadc", "#f4a261"];
const PICTURES: Record<string, Paint> = {
  flat: (x, y) =>
    rgb(
      x < 90
        ? art[0]
        : y > 90
          ? art[3]
          : x > 170 && y < 40
            ? art[4]
            : x > 110 && x < 160 && y > 20 && y < 70
              ? art[1]
              : art[2]
    ),
  softEdge: x => {
    const a = rgb("#14213d");
    const b = rgb("#fca311");
    const t = Math.min(1, Math.max(0, (x - 98) / 4));
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  },
  accent: (x, y) =>
    (x - 140) ** 2 + (y - 60) ** 2 < 36
      ? rgb("#e8441e")
      : [56 + (x % 7), 120 + (y % 5), 124 + ((x + y) % 9)],
  halfClear: x => (x < 100 ? [255, 0, 255, 0] : rgb("#2a9d8f")),
  clear: () => [10, 20, 30, 0],
  gradient: (x, y) => [Math.round((255 * x) / 199), Math.round((255 * y) / 119), 128],
  sea: (x, y) =>
    rgb(
      y > 90
        ? "#2b3c3a"
        : (x - 120) ** 2 / 900 + (y - 45) ** 2 / 144 < 1
          ? "#e24625"
          : y < 45
            ? "#4b9394"
            : "#1b535c"
    )
};

test.each(Object.keys(PICTURES))("the %s picture reads as G4 read it", name => {
  const golden =
    fixture<
      Record<
        string,
        { samples: { hex: string; x: number; y: number }[]; colorAt: [number, number, string][] }
      >
    >("image-colors.json")[name];
  const px = picture(PICTURES[name]);
  expect(
    imageSamples(px, 200, 120).map(s => ({ hex: s.hex, x: round(s.x), y: round(s.y) }))
  ).toEqual(golden.samples);
  for (const [x, y, hex] of golden.colorAt)
    expect(colorAt({ data: px, width: 200, height: 120 }, x, y)).toBe(hex);
});

test("flat art reads back exactly, the same every time", () => {
  const px = picture(PICTURES.flat);
  const once = imageSamples(px, 200, 120);
  expect(once.map(s => s.hex).sort()).toEqual([...art].sort());
  expect(imageSamples(px, 200, 120)).toEqual(once);
  for (const spot of once)
    expect(colorAt({ data: px, width: 200, height: 120 }, spot.x, spot.y)).toBe(spot.hex);
});
