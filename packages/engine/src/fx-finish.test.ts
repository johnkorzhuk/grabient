import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { EFFECT_LOOK, type Effect, effectAddressParts, effectFileAddress } from "./effect.ts";
import { effectSvg } from "./effect-code.ts";
import {
  blurOver,
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

test("the gradient under a soft effect: the palette's, blurred alike, at its angle; none under a clear blob or one whose ground lets the page through", () => {
  const under = effectUnderlay(P, silk, 30, 50)!;
  expect(under.style).toBe("linearGradient");
  expect(under.angle).toBe(30);
  expect(under.at?.length).toBe(under.stops.length);
  expect(under.stops.length).toBeGreaterThan(7);
  /* the blob's palette lies left to right whatever the view's angle */
  expect(effectUnderlay(P, blob("#101820"), 30, 50)?.angle).toBe(90);
  expect(effectUnderlay(P, blob(null), 30, 50)).toBeNull();
  expect(effectUnderlay(P, blob("#10182080"), 30, 50)).toBeNull();
  expect(effectUnderlay(P, blob("#101820ff"), 30, 50)).not.toBeNull();
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
  /* a band of the box's rows alone is those rows of the whole, as the blur lays it */
  const hexes = ["#ff0000", "#0000ff", "#00ff00"];
  const whole = linearGradientPixels(hexes, 30, size);
  const band = linearGradientPixels(hexes, 30, size, undefined, {
    from: 5,
    to: 9,
    into: new Uint8Array(64 * 4 * 3)
  });
  expect([...band]).toEqual([...whole.subarray(5 * 64 * 3, 9 * 64 * 3)]);
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

/* A frame with hard edges a blur shows any error at: bars of saturated colors, every 13 pixels, a clear hole. */
function bars(width: number, height: number, hole = false) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0]
  ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inHole = hole && Math.hypot(x - width / 3, y - height / 2) < height / 4;
      rgba.set(
        inHole ? [0, 0, 0, 0] : [...colors[Math.floor((x + 2 * y) / 13) % colors.length], 255],
        (y * width + x) * 4
      );
    }
  return rgba;
}
/* the largest level difference and the mean one between two opaque RGBA pictures' colors, or between two straight
   ones laid over white */
function apart(a: ArrayLike<number>, b: ArrayLike<number>) {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const over = (p: ArrayLike<number>) => (p[i + c] * p[i + 3] + 255 * (255 - p[i + 3])) / 255;
      const d = Math.abs(over(a) - over(b));
      max = Math.max(max, d);
      sum += d;
      n++;
    }
  return { max, mean: sum / n };
}
const exactOver = (
  rgba: Uint8ClampedArray,
  size: { width: number; height: number },
  sigma: number
) => {
  const under = effectUnderlay(P, silk, 30, 60)!;
  const rgb = overUnder(
    blurRgba(rgba, size.width, size.height, sigma),
    underlayPixels(under, size),
    size.width,
    size.height
  );
  const out = new Uint8ClampedArray(size.width * size.height * 4);
  for (let i = 0, j = 0; i < out.length; i += 4, j += 3)
    out.set([rgb[j], rgb[j + 1], rgb[j + 2], 255], i);
  return { out, under };
};

test("a wide blur runs on the picture's cells within about a level of the browser's three boxes", () => {
  const size = { width: 230, height: 130 };
  const frame = bars(size.width, size.height, true);
  /* boxes of 12, 17, 45 and 75 pixels: cells of 2, 2, 7 and 12 */
  for (const sigma of [6.4, 9, 24, 40]) {
    const { out, under } = exactOver(frame, size, sigma);
    const over = apart(blurOver(frame, size, sigma, under), out);
    expect(over.max).toBeLessThanOrEqual(2.5);
    expect(over.mean).toBeLessThan(0.4);
    /* with nothing under it, clear where the frame is: straight alpha */
    const clear = apart(
      blurOver(frame, size, sigma, null),
      blurRgba(frame, size.width, size.height, sigma, true)
    );
    expect(clear.max).toBeLessThanOrEqual(2.5);
    expect(clear.mean).toBeLessThan(0.4);
  }
});

test("a narrow blur runs by bands of rows, as the whole picture's would", () => {
  /* taller than two bands, so a band's rows read the bands either side, one with the picture's ends on neither */
  const size = { width: 40, height: 600 };
  const frame = bars(size.width, size.height, true);
  for (const sigma of [0.8, 2.5]) {
    const { out, under } = exactOver(frame, size, sigma);
    expect(apart(blurOver(frame, size, sigma, under), out).max).toBeLessThanOrEqual(1);
    const straight = blurRgba(frame, size.width, size.height, sigma, true);
    expect(apart(blurOver(frame, size, sigma, null), straight).max).toBeLessThanOrEqual(1);
  }
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
  expect(svg).toContain('<image id="gfx-grain" width="300" height="200" xlink:href="');
  expect(svg).not.toContain('<use xlink:href="#gfx-grain"');
  /* the silk's light and shade are translucent layers over its dye, which Safari composites in linear light inside a
     filter: its drawing (its root naming the box alone, so its elements as they are, with no group for an importer to
     make a frame of) is a pattern whose tile is the box, and the blur reads one rect painted by it */
  expect(svg).toContain(
    '<pattern id="gfx-drawing" patternUnits="userSpaceOnUse" width="300" height="200"><defs>'
  );
  expect(svg).toContain(
    '<g filter="url(#gfx-soft)"><rect width="300" height="200" fill="url(#gfx-drawing)"/></g>'
  );
  /* the rosette's petals are opaque, so its drawing is blurred itself, which Figma's importer takes as a layer blur
     over its petals; it is clipped to the box before its blur, so no browser blurs what it paints past the box into
     its edges */
  const rosette = effectSvg(
    P,
    "kUMzO5Na871ukuyhHUJA",
    { ...silk, kind: "rosette" },
    40,
    size,
    "https://grabient.com",
    { soft: 50 }
  );
  expect(rosette).toContain('<g filter="url(#gfx-soft)"><g clip-path="url(#gfx-box)">');
  expect(rosette).not.toContain('<g clip-path="url(#gfx-box)"><g>');
  expect(rosette).not.toContain("<pattern");
  /* the blob takes no soft: its SVG is the one with none */
  const blobSvg = (soft?: number) =>
    effectSvg(
      P,
      "kUMzO5Na871ukuyhHUJA",
      blob("#101820"),
      90,
      size,
      "https://grabient.com",
      soft ? { soft } : {}
    );
  expect(blobSvg(50)).toBe(blobSvg());
  expect(blobSvg(50)).not.toContain("gfx-soft");
  /* grain alone needs no gradient or filter, nor a pattern to blur through */
  const grained = finishSvg(
    plain,
    size,
    { grain: 30 },
    { grain: "data:image/png;base64,AAAA", isolated: true }
  );
  expect(grained).not.toContain("feGaussianBlur");
  expect(grained).not.toContain("<pattern");
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
