import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { EFFECT_LOOK, type Effect, effectAddressParts, effectFileAddress } from "./effect.ts";
import { effectSvg } from "./effect-code.ts";
import {
  blurRgba,
  effectBlurSigma,
  effectUnderlay,
  finishPixels,
  finishSvg,
  grainOverRgba,
  linearGradientPixels,
  overUnder,
  underlayPixels
} from "./fx-finish.ts";
import { GRAIN_SIDE, grainOver } from "./grain.ts";
import { effectSoftShare } from "./view.ts";

const P = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const silk: Effect = { kind: "silk", speed: 1, fps: 60, look: { ...EFFECT_LOOK } };
const blob = (bg: string | null): Effect => ({
  kind: "blob",
  speed: 1,
  fps: 60,
  look: { ...EFFECT_LOOK, shape: 7, bg }
});

test("an effect's soft is a Gaussian a share of the picture's longer side", () => {
  expect(effectBlurSigma(100, { width: 1600, height: 900 })).toBeCloseTo(96, 6);
  expect(effectBlurSigma(100, { width: 500, height: 800 })).toBeCloseTo(48, 6);
  expect(effectBlurSigma(40, { width: 1000, height: 1000 })).toBeCloseTo(
    effectSoftShare(40) * 1000,
    9
  );
  expect(effectBlurSigma(0, { width: 1000, height: 1000 })).toBe(0);
  expect(effectBlurSigma(undefined, { width: 1000, height: 1000 })).toBe(0);
});

test("the gradient under a soft effect: the palette's, blurred alike, at its angle; none under a clear blob", () => {
  const under = effectUnderlay(P, silk, 30, 50)!;
  expect(under.style).toBe("linearGradient");
  expect(under.angle).toBe(30);
  expect(under.at?.length).toBe(under.stops.length);
  expect(under.stops.length).toBeGreaterThan(7);
  /* the blob's palette lies left to right whatever the view's angle */
  expect(effectUnderlay(P, blob("#101820"), 30, 50)?.angle).toBe(90);
  expect(effectUnderlay(P, blob(null), 30, 50)).toBeNull();
  /* unsoftened, the plain stops evenly */
  const plain = effectUnderlay(P, silk, 90, 0)!;
  expect(plain.at).toBeUndefined();
  expect(plain.stops).toHaveLength(Math.max(7, P.anchors.length));
});

test("a linear gradient's pixels run along CSS's line", () => {
  const size = { width: 64, height: 16 };
  const px = linearGradientPixels(["#000000", "#ffffff"], 90, size);
  /* left to right: the first column dark, the last light, the middle half way */
  expect(px[0]).toBeLessThan(8);
  expect(px[(15 * 64 + 63) * 3]).toBeGreaterThan(247);
  expect(Math.abs(px[(8 * 64 + 32) * 3] - 128)).toBeLessThanOrEqual(3);
  /* 0 runs bottom to top */
  const up = linearGradientPixels(["#000000", "#ffffff"], 0, size);
  expect(up[15 * 64 * 3]).toBeLessThan(up[0]);
  /* stops placed along the line stand there */
  const placed = linearGradientPixels(["#000000", "#ffffff"], 90, size, [0.5, 0.5]);
  expect(placed[(0 * 64 + 10) * 3]).toBe(0);
  expect(placed[(0 * 64 + 50) * 3]).toBe(255);
});

test("the blur of a picture's pixels: a Gaussian's three boxes, clear past the edges", () => {
  const w = 101;
  const h = 101;
  /* a picture opaque left of its middle and clear right of it: the edge blurs to the normal curve's integral, a
     sigma either side of it 84% and 16% */
  const half = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x <= 50; x++) half.set([255, 255, 255, 255], (y * w + x) * 4);
  const sigma = 6;
  const blurred = blurRgba(half, w, h, sigma);
  const alpha = (x: number) => blurred[(50 * w + x) * 4 + 3] / 255;
  expect(Math.abs(alpha(50 - sigma) - 0.861)).toBeLessThan(0.02);
  expect(Math.abs(alpha(51 + sigma) - 0.139)).toBeLessThan(0.02);
  expect(Math.abs(alpha(50) + alpha(51) - 1)).toBeLessThan(0.02);
  /* a picture opaque to its edges thins toward them, to about half at an edge and a quarter at a corner */
  const full = new Uint8ClampedArray(w * h * 4).fill(255);
  const edges = blurRgba(full, w, h, 10, true);
  expect(edges[(50 * w + 50) * 4 + 3]).toBe(255);
  expect(Math.abs(edges[(50 * w + 0) * 4 + 3] - 0.5 * 255)).toBeLessThan(26);
  expect(Math.abs(edges[3] - 0.25 * 255)).toBeLessThan(26);
  /* straight, the colors stand where the alpha thins */
  expect(edges[(50 * w + 0) * 4]).toBe(255);
  /* no sigma, nothing moves */
  expect([...blurRgba(full, 4, 4, 0, true).slice(0, 8)]).toEqual([
    255, 255, 255, 255, 255, 255, 255, 255
  ]);
});

test("a blurred picture over its gradient goes to the gradient at its edges", () => {
  const size = { width: 120, height: 60 };
  const n = size.width * size.height;
  const red = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) red.set([255, 0, 0, 255], i * 4);
  const under = effectUnderlay(P, silk, 90, 100)!;
  const out = finishPixels(red, size, { soft: 100 }, under);
  const underPx = underlayPixels(under, size);
  const at = (x: number, y: number) => (y * size.width + x) * 4;
  /* the middle stays red; the edge is half the gradient's */
  expect(out[at(60, 30)]).toBeGreaterThan(200);
  const edge = at(0, 30);
  const mixed = (255 + underPx[30 * size.width * 3]) / 2;
  expect(Math.abs(out[edge] - mixed)).toBeLessThan(40);
  expect(out[edge + 3]).toBe(255);
  /* over its gradient, a clear picture is the gradient */
  const clear = new Uint8ClampedArray(n * 4);
  const rgb = overUnder(
    blurRgba(clear, size.width, size.height, 4),
    underPx,
    size.width,
    size.height
  );
  expect([...rgb.slice(0, 3)]).toEqual([...underPx.slice(0, 3)]);
});

test("the grain over RGBA pixels is the grain over RGB where they are opaque, and stands alone where clear", () => {
  const w = GRAIN_SIDE + 7;
  const h = 9;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgba.set([120, 60, 200, 255], i * 4);
    rgb.set([120, 60, 200], i * 3);
  }
  grainOverRgba(rgba, w, h, 60);
  grainOver(rgb, w, h, 60);
  for (let i = 0; i < w * h; i++)
    for (let c = 0; c < 3; c++) expect(rgba[i * 4 + c]).toBe(rgb[i * 3 + c]);
  const clear = new Uint8ClampedArray(4 * 4 * 4);
  grainOverRgba(clear, 4, 4, 100);
  expect(clear.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
});

test("an effect's SVG finished: its drawing whole, blurred over its gradient and clipped, the grain's tiles over it", () => {
  const size = { width: 300, height: 200 };
  const plain = effectSvg(P, "kUMzO5Na871ukuyhHUJA", silk, 40, size, "https://grabient.com");
  expect(effectSvg(P, "kUMzO5Na871ukuyhHUJA", silk, 40, size, "https://grabient.com", {})).toBe(
    plain
  );
  const svg = effectSvg(
    P,
    "kUMzO5Na871ukuyhHUJA",
    silk,
    40,
    size,
    "https://grabient.com",
    { soft: 50, grain: 30 },
    "data:image/png;base64,AAAA"
  );
  /* the credit names the view's soft and grain, first in the document */
  expect(svg).toMatch(
    /^<svg [^>]*><!-- https:\/\/grabient\.com\/kUMzO5Na871ukuyhHUJA\?style=silk&angle=40&soft=50&grain=30 -->/
  );
  const sigma = effectBlurSigma(50, size);
  expect(svg).toContain(`<feGaussianBlur stdDeviation="${Number(sigma.toFixed(3))}"/>`);
  expect(svg).toContain('color-interpolation-filters="sRGB"');
  expect(svg).toContain('<rect width="300" height="200" fill="url(#gfx-under)"/>');
  expect(svg.match(/<use xlink:href="#gfx-grain"/g)).toHaveLength(3 * 2);
  /* the silk's root names the box alone, so its drawing stands in a group, read plainly by a design tool */
  expect(svg).toContain('<g filter="url(#gfx-soft)"><g>');
  /* the blob's root scales a design square to cover the box, so it stands inside as an SVG of its own */
  const blobSvg = effectSvg(
    P,
    "kUMzO5Na871ukuyhHUJA",
    blob("#101820"),
    90,
    size,
    "https://grabient.com",
    { soft: 50 }
  );
  expect(blobSvg).toMatch(/<g filter="url\(#gfx-soft\)"><svg x="0" y="0" width="300" height="200"/);
  expect(blobSvg).not.toContain("gfx-grain");
  /* grain alone needs no gradient or filter */
  const grained = finishSvg(plain, size, { grain: 30 }, { grain: "data:image/png;base64,AAAA" });
  expect(grained).not.toContain("feGaussianBlur");
  expect(grained).toContain("gfx-grain");
  /* a grain with no tile to lay is no change */
  expect(finishSvg(plain, size, { grain: 30 })).toBe(plain);
});

test("an effect's addresses name its soft and grain after its angle, as the editor's does", () => {
  const glass: Effect = { kind: "glass", speed: 2, fps: 60, look: { ...EFFECT_LOOK, shape: 3 } };
  expect(effectAddressParts(glass, 45, { soft: 20, grain: 10 })).toEqual([
    "style=glass",
    "angle=45",
    "soft=20",
    "grain=10",
    "speed=2",
    "shape=3"
  ]);
  expect(effectAddressParts(glass, 45)).toEqual(["style=glass", "angle=45", "speed=2", "shape=3"]);
  expect(
    effectFileAddress(
      "https://o",
      "k1",
      blob(null),
      45,
      "png",
      { width: 10, height: 20 },
      { grain: 5 }
    )
  ).toBe("https://o/k1.png?style=blob&grain=5&shape=7&w=10&h=20");
});
