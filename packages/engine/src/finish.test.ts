import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { lchToSrgb, type Triple, toHex } from "./color.ts";
import { cssBlock, cssLine, cssWide, gradientCss, paletteCss } from "./css.ts";
import { sampleStops } from "./curve.ts";
import { paletteDocument } from "./document.ts";
import { GRAIN_FULL, grainAlpha, grainOf, grainOver, grainSpeck, grainTile } from "./grain.ts";
import { DEG } from "./math.ts";
import { drawnStops, SOFT_TOLERANCE, softSigma, softStops, softStyle } from "./soft.ts";
import { artworkSvg } from "./svg.ts";
import { parseView, type Style, viewSearch } from "./view.ts";

/* Soft and grain, the finish over any style: the blur along a style's line, worked exactly, and the grain's tile. */

const P = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const STYLES: Style[] = [
  "linearSwatches",
  "radialSwatches",
  "angularSwatches",
  "linearGradient",
  "radialGradient",
  "angularGradient"
];
const lab = (lch: readonly number[]) => [
  lch[0],
  lch[1] * Math.cos(lch[2] * DEG),
  lch[1] * Math.sin(lch[2] * DEG)
];

/* the plain curve a style draws at t, in OKLab: bands, or blends between evenly spaced stops */
function plain(c: number[][], style: Style, t: number) {
  const n = c.length;
  if (style.endsWith("Swatches")) return c[Math.min(n - 1, Math.max(0, Math.floor(t * n)))];
  const p = Math.min(n - 1, Math.max(0, t * (n - 1)));
  const i = Math.min(n - 2, Math.floor(p));
  return c[i].map((v, k) => v + (c[i + 1][k] - v) * (p - i));
}
/* the same blurred the slow way: the curve extended as its family extends it, convolved on a fine grid */
function brute(c: number[][], style: Style, sigma: number, t: number) {
  const angular = style.startsWith("angular");
  const radial = style.startsWith("radial");
  const N = 3000;
  const out = [0, 0, 0];
  let total = 0;
  for (let k = -N; k <= N; k++) {
    const x = (k / N) * 6 * sigma;
    let u = t + x;
    if (angular) u -= Math.floor(u);
    else if (radial) u = Math.abs(u);
    u = Math.min(angular ? 0.999999 : 1, Math.max(0, u));
    const g = Math.exp(-0.5 * (x / sigma) ** 2);
    const v = plain(c, style, u);
    for (let q = 0; q < 3; q++) out[q] += v[q] * g;
    total += g;
  }
  return out.map(v => v / total);
}
/* the drawn soft at t: straight blends in OKLab between the stops it keeps */
function drawnAt(stops: ReturnType<typeof softStops>, t: number) {
  const j = Math.max(
    1,
    stops.findIndex(s => s.t >= t)
  );
  const [a, b] = [lab(stops[j - 1].lch), lab(stops[j].lch)];
  const f = (t - stops[j - 1].t) / (stops[j].t - stops[j - 1].t || 1);
  return a.map((v, k) => v + (b[k] - v) * f);
}

test("a soft view's stops draw the style's curve blurred along its line, within a fraction of a just-noticeable difference", () => {
  const stops = sampleStops(P, 7);
  const c = stops.map(s => lab(s.lch));
  for (const style of STYLES)
    for (const soft of [12, 60, 100]) {
      const out = softStops(stops, style, soft);
      const sigma = softSigma(style, soft);
      expect(out[0].t).toBe(0);
      expect(out.at(-1)!.t).toBe(1);
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const want = brute(c, style, sigma, t);
        const got = drawnAt(out, t);
        expect(Math.hypot(...want.map((v, k) => v - got[k]))).toBeLessThan(1.4 * SOFT_TOLERANCE);
      }
    }
});

test("the blur wraps round an angular picture and mirrors through a radial one's middle", () => {
  const stops = sampleStops(P, 5);
  for (const style of ["angularSwatches", "angularGradient"] as const) {
    const out = softStops(stops, style, 70);
    const [a, b] = [lab(out[0].lch), lab(out.at(-1)!.lch)];
    expect(Math.hypot(...a.map((v, k) => v - b[k]))).toBeLessThan(1e-9);
  }
  /* radial bands: the middle band's color holds at the middle, as no edge lies left of it to blur in */
  const radial = softStops(stops, "radialSwatches", 30);
  const middle = lab(stops[0].lch);
  expect(Math.hypot(...lab(radial[0].lch).map((v, k) => v - middle[k]))).toBeLessThan(1e-3);
});

test("a soft view blends in its family's gradient, plain views stay as they were", () => {
  expect(softStyle("linearSwatches", 40)).toBe("linearGradient");
  expect(softStyle("radialSwatches", 1)).toBe("radialGradient");
  expect(softStyle("angularGradient", 100)).toBe("angularGradient");
  expect(softStyle("angularSwatches", 0)).toBe("angularSwatches");
  expect(softSigma("linearGradient", 0)).toBe(0);
  expect(softSigma("linearGradient", 100)).toBeCloseTo(0.06, 12);
  const stops = sampleStops(P, 7);
  expect(drawnStops(stops, { style: "linearSwatches" })).toEqual({
    stops,
    style: "linearSwatches"
  });
  const soft = drawnStops(stops, { style: "linearSwatches", soft: 45 });
  expect(soft.style).toBe("linearGradient");
  expect(soft.at).toEqual(soft.stops.map(s => s.t));
  /* a band's middle keeps its color under a soft that reaches no further than its edges */
  const at = (t: number) => drawnAt(softStops(stops, "linearSwatches", 20), t);
  const own = lab(stops[3].lch);
  expect(Math.hypot(...at(3.5 / 7).map((v, k) => v - own[k]))).toBeLessThan(SOFT_TOLERANCE);
});

test("an address carries soft and grain after the angle, each 1 to 100, none left out", () => {
  const view = parseView(new URLSearchParams("style=linearSwatches&soft=45&grain=20&angle=30"));
  expect(view).toMatchObject({ style: "linearSwatches", angle: 30, soft: 45, grain: 20 });
  expect(viewSearch({ ...view, size: { width: 1200, height: 630 } })).toBe(
    "?style=linearSwatches&angle=30&soft=45&grain=20&size=1200x630"
  );
  for (const bad of ["soft=0", "soft=101", "soft=-3", "soft=4.5", "grain=abc", "grain=0"]) {
    const v = parseView(new URLSearchParams(bad));
    expect(v.soft).toBeUndefined();
    expect(v.grain).toBeUndefined();
  }
  expect(viewSearch(parseView(new URLSearchParams("")))).toBe("");
});

test("CSS places a soft view's stops and lays the grain over them", () => {
  expect(gradientCss(["#000", "#fff"], "linearGradient", 90, undefined, [0.25, 0.6])).toBe(
    "linear-gradient(90deg, #000 25%, #fff 60%)"
  );
  const soft = drawnStops(sampleStops(P, 6), { style: "radialSwatches", soft: 50 });
  const line = cssLine(soft.stops, soft.style, 0, "hex", {
    at: soft.at,
    grain: 'url("g.png")'
  });
  expect(line.startsWith('background: url("g.png") 0 0 / 128px 128px, radial-gradient(')).toBe(
    true
  );
  expect(line.match(/#[0-9a-f]{6} [\d.]+%/g)).toHaveLength(soft.stops.length);
  /* the palette's JSON names them and draws its CSS soft */
  const doc = paletteDocument("kUMzO5Na871ukuyhHUJA", P, "https://grabient.com", {
    style: "linearSwatches",
    soft: 30,
    grain: 10
  });
  expect(doc).toMatchObject({ soft: 30, grain: 10 });
  expect(doc.url).toBe(
    "https://grabient.com/kUMzO5Na871ukuyhHUJA?style=linearSwatches&soft=30&grain=10"
  );
  expect(doc.css.hex).toMatch(/^background: linear-gradient\(90deg, #/);
});

test("the SVG file draws a soft view's stops where they stand and the grain's tile over the picture", () => {
  const stops = sampleStops(P, 7);
  for (const style of STYLES) {
    const view = { style, steps: 7, angle: 90, soft: 40, grain: 25 };
    const drawn = drawnStops(stops, view);
    const svg = artworkSvg(
      drawn.stops,
      view,
      "k",
      "o",
      { width: 300, height: 200 },
      { style: drawn.style, at: drawn.at, grain: "data:image/png;base64,AAAA" }
    );
    /* the tile's image once and a use of it per tile, 3 by 2 over 300 by 200, clipped to the box: Figma's importer
       takes each one to one, where it stretches a pattern's image over the whole picture */
    expect(svg).toContain(
      '<image id="grain" width="128" height="128" xlink:href="data:image/png;base64,AAAA"'
    );
    expect(svg.match(/<use xlink:href="#grain"/g)).toHaveLength(6);
    expect(svg).toContain('<g clip-path="url(#grainBox)">');
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(svg).not.toContain("<pattern");
    expect(svg).toContain("soft=40&grain=25");
    if (!style.startsWith("angular")) expect(svg).toMatch(/<stop offset="0\.\d{5}"/);
  }
  /* no grain without its tile, and a plain view's SVG as it was */
  const plainSvg = artworkSvg(stops, { style: "linearSwatches", steps: 7, angle: 90 }, "k", "o");
  expect(plainSvg).not.toContain("<use");
  expect(plainSvg).not.toContain("stop offset");
});

test("the grain's tile: its specks from a hash of their place, their alpha the strength's share", () => {
  /* the hash is the shader's too: pinned */
  expect(grainSpeck(0, 0)).toEqual(grainSpeck(128, 256));
  const specks = [grainSpeck(0, 0), grainSpeck(5, 9), grainSpeck(127, 64)].map(s => [
    s.white,
    Math.round(s.size * 1e6)
  ]);
  expect(specks).toMatchInlineSnapshot(`
    [
      [
        true,
        4854586,
      ],
      [
        false,
        227073,
      ],
      [
        true,
        302687,
      ],
    ]
  `);
  const full = grainTile(100);
  const half = grainTile(50);
  let sum = 0;
  for (let i = 3; i < full.length; i += 4) {
    sum += full[i];
    /* in steps of 2 */
    expect(full[i] % 2).toBe(0);
    expect(Math.abs(half[i] - full[i] / 2)).toBeLessThanOrEqual(2);
  }
  /* a speck's mean size is √(2/π) of a sigma */
  expect(sum / (128 * 128) / 255).toBeCloseTo(GRAIN_FULL * Math.sqrt(2 / Math.PI), 2);
  expect(grainAlpha(1, 100)).toBe(2 * Math.round((GRAIN_FULL * 255) / 2));
  expect([grainOf("40"), grainOf("0"), grainOf("101"), grainOf("x"), grainOf(7)]).toEqual([
    40, 0, 0, 0, 7
  ]);
  /* laid over pixels: each moves toward its speck's shade by the speck's alpha */
  const px = new Uint8Array(3 * 130 * 2).fill(100);
  grainOver(px, 130, 2, 100);
  const { white, size } = grainSpeck(3, 1);
  const a = grainAlpha(size, 100);
  expect(px[(130 + 3) * 3]).toBe(Math.round((100 * (255 - a) + (white ? 255 : 0) * a) / 255));
  /* the tile repeats every 128 pixels */
  expect(px[(130 + 129) * 3]).toBe(px[(130 + 1) * 3]);
});

test("a stylesheet holds the grain's tile once where a Display-P3 block lays it too", () => {
  const vivid = (
    [
      [0.62, 0.33, 29],
      [0.7, 0.3, 145]
    ] as Triple[]
  ).map((lch, i) => {
    const rgb = lchToSrgb(...lch);
    return { t: i, hex: toHex(rgb), rgb, lch };
  });
  expect(cssWide(vivid)).toBe(true);
  const block = cssBlock(vivid, "linearGradient", 90, "hex", { grain: 'url("g.png")' });
  expect(block.match(/g\.png/g)).toHaveLength(1);
  expect(block).toMatch(
    /^--grabient-grain: url\("g\.png"\);\nbackground: var\(--grabient-grain\) 0 0 \/ 128px 128px, linear-gradient\(/
  );
  expect(block).toContain(
    "@media (color-gamut: p3) {\n  background: var(--grabient-grain) 0 0 / 128px 128px, linear-gradient("
  );
  const file = paletteCss(vivid, { style: "linearGradient", angle: 90 }, "a", "hex", null, {
    grain: 'url("g.png")'
  });
  expect(file.match(/g\.png/g)).toHaveLength(1);
  expect(file).toContain(
    'html {\n  min-height: 100%;\n  --grabient-grain: url("g.png");\n  background: var('
  );
  /* one declaration lays it inline */
  expect(cssLine(vivid, "linearGradient", 90, "hex", { grain: 'url("g.png")' })).toMatch(
    /^background: url\("g\.png"\) 0 0 \/ 128px 128px, linear-gradient\(/
  );
});
