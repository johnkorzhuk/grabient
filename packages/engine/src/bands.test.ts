import { expect, test } from "vitest";
import {
  BANDS_SIZE,
  type BandsView,
  bandsSearch,
  bandsStill,
  bandsSvg,
  parseBands
} from "./bands.ts";
import { decodePalette } from "./codec.ts";

const read = (query: string) => parseBands(new URLSearchParams(query));
const P = decodePalette("kKSAEDEVJVQQpMqxBWXeGPsNYdzUyx-eqwA")!;
const draw = (query: string) => bandsSvg(P, read(query), BANDS_SIZE, "https://grabient.com/k");

test("an address's animation: the defaults, values brought into bounds, and an odd count of bands", () => {
  expect(read("")).toEqual({ bands: 19, duration: 4.4, dir: "out", reverse: null });
  expect(read("bands=20&duration=0.1&dir=in&reverse=1")).toEqual({
    bands: 21,
    duration: 0.5,
    dir: "in",
    reverse: true
  } satisfies BandsView);
  expect(read("bands=99&duration=600&reverse=0")).toMatchObject({
    bands: 41,
    duration: 60,
    reverse: false
  });
  expect(read("bands=x&duration=-2&dir=up&reverse=yes")).toEqual(read(""));
  expect(bandsSearch(read("bands=19&duration=4.40&junk=1"))).toBe("?style=bands");
  expect(bandsSearch(read("reverse=0&dir=in&bands=7&duration=2.5"), ["size=800x600"])).toBe(
    "?style=bands&bands=7&duration=2.5&dir=in&reverse=0&size=800x600"
  );
});

test("the file draws a quarter, one gradient to each band from the center out, and mirrors it", () => {
  const svg = draw("");
  expect(svg).toBe(draw(""));
  expect(svg).toContain(
    'width="400" height="500" viewBox="0 0 400 500" preserveAspectRatio="none"'
  );
  expect(svg.match(/<linearGradient /g)).toHaveLength(10);
  expect(svg.match(/<path /g)).toHaveLength(10);
  expect(svg.match(/<use /g)).toHaveLength(2);
  // half a loop, played forward and back, and only for a reader who has not asked for less motion
  expect(svg).toContain("@media (prefers-reduced-motion:no-preference){");
  expect(svg).toContain("animation-duration:2.2s;");
  expect(svg).toContain("animation-direction:alternate");
  expect(svg.length).toBeLessThan(22_000);
  expect(draw("bands=41").match(/<linearGradient /g)).toHaveLength(21);
});

test("each band runs a step behind the one inside it, or ahead of it when the bloom gathers in", () => {
  const delays = (query: string) =>
    [...draw(query).matchAll(/\d stop\{animation-delay:-([\d.]+)s\}/g)].map(m => Number(m[1]));
  const steps = (query: string) => delays(query).map((d, i, all) => (i ? d - all[i - 1] : 0));
  expect(delays("")).toHaveLength(10);
  for (const step of steps("").slice(1)) expect(step).toBeCloseTo(-0.14, 2);
  for (const step of steps("dir=in").slice(1)) expect(step).toBeCloseTo(0.14, 2);
});

test("the palette's darker end makes the ring unless the address says otherwise", () => {
  const ring = (svg: string) => /stop-color="(#[0-9a-f]{6})"\/>/.exec(svg)?.[1];
  expect(ring(draw(""))).toBe("#20040c");
  expect(ring(draw("reverse=0"))).toBe("#20040c");
  expect(ring(draw("reverse=1"))).toBe("#f9eab0");
  const lightFirst = decodePalette("kU9h0185Y9mqdPPfpL2A")!;
  const view = read("");
  expect(ring(bandsSvg(lightFirst, view, BANDS_SIZE, "x"))).toBe(
    ring(bandsSvg(lightFirst, { ...view, reverse: true }, BANDS_SIZE, "x"))
  );
});

test("the still frame as pixels: mirrored left to right and top to bottom, the ring in the palette's dark end", () => {
  const [W, H] = [120, 80];
  const pixels = bandsStill(P, read(""), { width: W, height: H });
  expect(pixels).toHaveLength(3 * W * H);
  const at = (x: number, y: number) => [...pixels.subarray(3 * (y * W + x), 3 * (y * W + x) + 3)];
  for (const [x, y] of [
    [3, 5],
    [40, 30],
    [59, 39],
    [100, 70]
  ]) {
    expect(at(W - 1 - x, y)).toEqual(at(x, y));
    expect(at(x, H - 1 - y)).toEqual(at(x, y));
  }
  // the center band's ring, 0.097 to 0.136 of the height from the middle
  expect(at(W / 2, Math.round(H / 2 + 0.115 * H))).toEqual([0x20, 0x04, 0x0c]);
});
