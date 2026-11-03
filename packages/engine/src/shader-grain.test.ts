import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { sampleStops } from "./curve.ts";
import { GRAIN_FULL, GRAIN_SIDE, grainAlpha, grainSpeck } from "./grain.ts";
import type { Palette } from "./palette.ts";
import { shaderText } from "./shader.ts";
import {
  GRAIN_NEAR,
  grainFactor,
  grainFixes,
  grainGlsl,
  grainWgsl,
  speckSize
} from "./shader-grain.ts";
import { shaderPage } from "./shader-page.ts";
import { drawnStops } from "./soft.ts";

const SEED = "kS7Q8Yy5S_SChv0";
const P = decodePalette(SEED) as Palette;

/* the shader's log and cosine (grainGlsl's grainLn and grainCos), each step a float32 as a GPU's are */
const F = Math.fround;
function ln32(u: number): number {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, u);
  const bits = b.getUint32(0);
  let e = (bits >>> 23) - 127;
  b.setUint32(0, (bits & 0x7fffff) | 0x3f800000);
  let m = b.getFloat32(0);
  if (m > F(Math.SQRT2)) {
    m = F(m * 0.5);
    e += 1;
  }
  const s = F(F(m - 1) / F(m + 1));
  const s2 = F(s * s);
  let p = F(F(0.11111111) * s2);
  p = F(F(F(0.14285715) + p) * s2);
  p = F(F(F(0.2) + p) * s2);
  p = F(F(F(0.33333334) + p) * s2);
  p = F(1 + p);
  return F(F(e * F(Math.LN2)) + F(F(2 * s) * p));
}
function cos32(u: number): number {
  const k = Math.floor(F(F(u * 4) + 0.5));
  const r = F(F(u - F(0.25 * k)) * F(6.2831855));
  const r2 = F(r * r);
  const horner = (cs: number[]) => cs.reduceRight((acc, c) => F(F(c) + F(r2 * acc)), 0);
  const c = horner([1, -0.5, 0.041666668, -0.0013888889, 2.4801588e-5, -2.7557319e-7]);
  const s = F(r * horner([1, -0.16666667, 0.008333334, -1.984127e-4, 2.7557319e-6]));
  const q = k & 3;
  return q === 0 ? c : q === 1 ? -s : q === 2 ? -c : s;
}

test("the shader's own log and cosine, in floats, keep every speck's half-alpha within a tenth of GRAIN_NEAR", () => {
  const K = F(grainFactor(100));
  let worst = 0;
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      const u1 = ((h & 0xffff) + 0.5) / 65536;
      const u2 = ((h >>> 16) + 0.5) / 65536;
      const g = F(F(Math.sqrt(F(-2 * ln32(u1)))) * cos32(u2));
      const q32 = F(Math.abs(g) * K);
      const { size } = grainSpeck(x, y);
      const q = (size * GRAIN_FULL * 1 * 255) / 2;
      worst = Math.max(worst, Math.abs(q32 - q));
      expect(g > 0, `shade at ${x},${y}`).toBe(grainSpeck(x, y).white);
    }
  expect(worst).toBeLessThan(GRAIN_NEAR / 10);
});

test("the shaders' own copy of a speck's size is grainSpeck's to the bit", () => {
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) expect(speckSize(x, y)).toBe(grainSpeck(x, y).size);
});

test("the grain's table holds every speck a float may round the other way, in order, with grainAlpha's own half", () => {
  for (const grain of [1, 5, 30, 96, 100]) {
    const fixes = grainFixes(grain);
    const keys = fixes.map(v => v >> 7);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    for (const v of fixes) {
      const key = v >> 7;
      const { size } = grainSpeck(key % GRAIN_SIDE, Math.floor(key / GRAIN_SIDE));
      expect(2 * (v & 127)).toBe(grainAlpha(size, grain));
      const q = (size * GRAIN_FULL * (grain / 100) * 255) / 2;
      expect(Math.abs(q - Math.floor(q) - 0.5)).toBeLessThan(2 * GRAIN_NEAR);
    }
    /* a few a tile: the text stays small */
    expect(fixes.length).toBeLessThan(40);
  }
  /* the table and its lookup are in each language's text */
  expect(grainGlsl(30)).toContain(`const int GRAIN_FIX[] = int[](`);
  expect(grainWgsl(30)).toContain(`const GRAIN_FIX = array<i32, ${grainFixes(30).length}>(`);
});

test("a soft view's shader draws its blurred stops at the places its CSS writes, in its family's geometry", () => {
  const view = { style: "radialSwatches" as const, angle: 137, soft: 40 };
  const d = drawnStops(sampleStops(P, 7), view);
  const drawn = { stops: d.stops, style: d.style, at: d.at! };
  const glsl = shaderText("glsl", P, view, 7, SEED, "https://grabient.com", { drawn });
  expect(glsl).toContain(`const vec3 STOPS[] = vec3[](`);
  expect(glsl).toContain("return length(q) / length(R * 0.5);");
  expect(glsl).not.toContain("ANCHORS");
  for (const s of d.stops) {
    const n = Number.parseInt(s.hex.slice(1), 16);
    expect(glsl).toContain(`vec3(${(n >> 16) & 255}.0, ${(n >> 8) & 255}.0, ${n & 255}.0)`);
  }
  expect(glsl.split("\n").slice(3, 6)).toEqual([
    `// grabient ${SEED}`,
    `// https://grabient.com/${SEED}?style=radialSwatches&angle=137&soft=40`,
    "// 7 hard bands, soft 40"
  ]);
  const wgsl = shaderText("wgsl", P, view, 7, SEED, undefined, { drawn });
  expect(wgsl).toContain(`const N: i32 = ${d.stops.length};`);
  expect(wgsl).toContain("const STOPS = array<vec3f, N>(");
});

test("a grained view's shader lays the grain over its bytes in every spelling, and its pages run the texts whole", () => {
  const view = { style: "linearGradient" as const, angle: 90, grain: 30 };
  const finish = { grain: 30 };
  const toy = shaderText("shadertoy", P, view, 7, SEED, undefined, finish);
  expect(toy).toContain(grainGlsl(30));
  expect(toy).toContain(
    "fragColor = vec4(grainOver(roundEven(clamp(c, 0.0, 1.0) * 255.0), p) / 255.0, 1.0);"
  );
  const glsl = shaderText("glsl", P, view, 7, SEED, undefined, finish);
  expect(glsl.split("\n").slice(0, 3)).toEqual([
    "#version 300 es",
    "precision highp float;",
    "precision highp int;"
  ]);
  expect(glsl).toContain("ivec2 p = ivec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);");
  const wgsl = shaderText("wgsl", P, view, 7, SEED, undefined, finish);
  expect(wgsl).toContain(grainWgsl(30));
  expect(shaderPage("webgl", P, view, 7, SEED, undefined, finish)).toContain(
    `<script type="x-shader/x-fragment" id="shader">${glsl}</script>`
  );
  expect(shaderPage("webgpu", P, view, 7, SEED, undefined, finish)).toContain(
    `<script type="text/wgsl" id="shader">${wgsl}</script>`
  );
  /* nothing in a shader could end its script element */
  expect(`${toy}${glsl}${wgsl}`).not.toMatch(/<\/|<!--/);
});
