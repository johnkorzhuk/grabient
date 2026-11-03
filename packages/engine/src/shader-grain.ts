/* The grain a fragment shader computes itself, a speck a pixel from the picture's top left, as a file bakes it
   (grain.ts): grainSpeck's integer hash, its Box-Muller normal and grainAlpha's steps of 2, laid over the picture's
   bytes, for the palette's shaders (shader.ts) and the glass's Shadertoy text, which have no page to make the tile.
   A GPU's own log and cosine stray in the fourth digit (SwiftShader's by up to 1.5e-2 of a half-alpha), so the shader
   works both out itself; a float still rounds a few specks' halves the other way than the site's doubles do, so each
   text carries those specks at its grain (grainFixes), which makes it the file's grain on any GPU whose floats come
   within GRAIN_NEAR. Loaded with the shaders' writers, never with a page's start. */
import { GRAIN_FULL, GRAIN_SIDE } from "./grain.ts";
import { GRAIN_MAX } from "./view.ts";

/** A speck's size, its normal's in standard deviations, as grain.ts grainSpeck works it out (shader-grain.test.ts
    holds the two together): a copy of its own, so the hash comes with the shaders' code rather than with grain.ts,
    which every page starts with and which leaves it out. */
export function speckSize(x: number, y: number): number {
  let h = (Math.imul(x & 127, 0x27d4eb2d) ^ Math.imul(y & 127, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const u1 = ((h & 0xffff) + 0.5) / 65536;
  const u2 = ((h >>> 16) + 0.5) / 65536;
  return Math.abs(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
}

const F = Math.fround;

/** A float32 as GLSL and WGSL write it: the fewest digits that read back as the same float, always a float literal. */
export function shaderFloat(value: number): string {
  const v = F(value);
  if (Object.is(v, -0) || v === 0) return "0.0";
  for (let digits = 1; digits <= 9; digits++) {
    const s = v.toPrecision(digits);
    if (F(Number(s)) !== v) continue;
    if (/e/.test(s)) return s.replace(/^(-?\d)e/, "$1.0e").replace("e+", "e");
    return s.includes(".") ? s : `${s}.0`;
  }
  throw new Error(`no float for ${value}`);
}

/* ---- The grain a shader computes ---- */

/** A speck's half-alpha per standard deviation of its normal at a grain: grainAlpha rounds its size times this. */
export const grainFactor = (grain: number): number =>
  (GRAIN_FULL * (Math.min(GRAIN_MAX, Math.max(0, grain)) / GRAIN_MAX) * 255) / 2;

/** How near a half a float's half-alpha may come before the shader takes the speck's own from its table: twenty times
    what the shader's own log and cosine stray by (about 1e-5 at the strongest grain). */
export const GRAIN_NEAR = 0.0002;

/** The specks whose half-alpha at a grain comes within twice GRAIN_NEAR of a half, where a float may round it the
    other way: each its place in the tile (y * 128 + x) times 128 plus the half-alpha grainAlpha gives it, in order. */
export function grainFixes(grain: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const size = speckSize(x, y);
      /* grainAlpha's own expression, in its order */
      const q =
        (size * GRAIN_FULL * (Math.min(GRAIN_MAX, Math.max(0, grain)) / GRAIN_MAX) * 255) / 2;
      if (Math.abs(q - Math.floor(q) - 0.5) < 2 * GRAIN_NEAR)
        out.push((y * GRAIN_SIDE + x) * 128 + Math.min(127, Math.round(q)));
    }
  return out;
}

const fixList = (fixes: readonly number[]) =>
  fixes
    .map((v, i) => `${i % 10 === 0 ? "\n  " : " "}${v}${i < fixes.length - 1 ? "," : ""}`)
    .join("");

const GRAIN_NOTE = (
  grain: number
) => `// The grain at ${grain} (engine/grain.ts): a black or white speck a pixel, from an integer hash of its place in a tile of
// 128 by 128 pixels from the picture's top left, its alpha the size of a normal (Box-Muller) times GRAIN_K, in steps
// of 2 of 255, laid over the picture's bytes. The log and the cosine are worked out here, as a GPU's own may stray in
// the fourth digit; a float still rounds a few specks' halves the other way than the site's doubles, so GRAIN_FIX holds
// each speck whose half comes near a half, its place in the tile (y * 128 + x) times 128 plus its half.`;

/** The grain at a grain as GLSL ES 3.00: its constants, grainSpeck(p) (a speck's alpha, 0 to 254, and its shade, 0 or
    255, at the pixel p from the picture's top left) and grainOver(c, p) (opaque bytes under the speck, as bytes). */
export function grainGlsl(grain: number): string {
  const fixes = grainFixes(grain);
  const table = fixes.length
    ? `const int GRAIN_FIX[] = int[](${fixList(fixes)}\n);`
    : "// no speck comes near a half at this grain";
  const lookup = fixes.length
    ? `
  if (abs(fract(q) - 0.5) < ${shaderFloat(GRAIN_NEAR)}) {
    int key = int(y * 128u + x);
    int lo = 0;
    int hi = GRAIN_FIX.length();
    while (lo < hi) {
      int mid = (lo + hi) / 2;
      if ((GRAIN_FIX[mid] >> 7) < key) lo = mid + 1;
      else hi = mid;
    }
    if (lo < GRAIN_FIX.length() && (GRAIN_FIX[lo] >> 7) == key) n = float(GRAIN_FIX[lo] & 127);
  }`
    : "";
  return `${GRAIN_NOTE(grain)}
const float GRAIN_K = ${shaderFloat(grainFactor(grain))};
${table}
// ln(u) for u > 0: the exponent from its bits, and the mantissa's log by the series of atanh
float grainLn(float u) {
  uint b = floatBitsToUint(u);
  float e = float(int(b >> 23u) - 127);
  float m = uintBitsToFloat((b & 0x7fffffu) | 0x3f800000u);
  if (m > 1.4142135) {
    m *= 0.5;
    e += 1.0;
  }
  float s = (m - 1.0) / (m + 1.0);
  float s2 = s * s;
  return e * 0.6931472 + 2.0 * s * (1.0 + s2 * (0.33333334 + s2 * (0.2 + s2 * (0.14285715 + s2 * 0.11111111))));
}
// cos(2 pi u) for 0 <= u < 1: the nearest quarter turn taken off exactly, the series for the rest
float grainCos(float u) {
  float k = floor(u * 4.0 + 0.5);
  float r = (u - 0.25 * k) * 6.2831855;
  float r2 = r * r;
  float c = 1.0 + r2 * (-0.5 + r2 * (0.041666668 + r2 * (-0.0013888889 + r2 * (2.4801588e-5 - r2 * 2.7557319e-7))));
  float s = r * (1.0 + r2 * (-0.16666667 + r2 * (0.008333334 + r2 * (-1.984127e-4 + r2 * 2.7557319e-6))));
  int q = int(k) & 3;
  return q == 0 ? c : q == 1 ? -s : q == 2 ? -c : s;
}
vec2 grainSpeck(ivec2 p) {
  uint x = uint(p.x & 127);
  uint y = uint(p.y & 127);
  uint h = (x * 0x27d4eb2du) ^ (y * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  h ^= h >> 16u;
  float u1 = (float(h & 0xffffu) + 0.5) / 65536.0;
  float u2 = (float(h >> 16u) + 0.5) / 65536.0;
  float g = sqrt(-2.0 * grainLn(u1)) * grainCos(u2);
  float q = abs(g) * GRAIN_K;
  float n = floor(q + 0.5);${lookup}
  return vec2(min(254.0, 2.0 * n), g > 0.0 ? 255.0 : 0.0);
}
vec3 grainOver(vec3 c, ivec2 p) {
  vec2 s = grainSpeck(p);
  return floor((c * (255.0 - s.x) + s.y * s.x) / 255.0 + 0.5);
}`;
}

/** The grain at a grain as WGSL: the same constants and functions as grainGlsl's. */
export function grainWgsl(grain: number): string {
  const fixes = grainFixes(grain);
  const table = fixes.length
    ? `const GRAIN_FIX = array<i32, ${fixes.length}>(${fixList(fixes)}\n);`
    : "// no speck comes near a half at this grain";
  const lookup = fixes.length
    ? `
  if (abs(fract(q) - 0.5) < ${shaderFloat(GRAIN_NEAR)}) {
    let key = i32(y * 128u + x);
    var lo = 0;
    var hi = ${fixes.length};
    while (lo < hi) {
      let mid = (lo + hi) / 2;
      if ((GRAIN_FIX[mid] >> 7u) < key) { lo = mid + 1; } else { hi = mid; }
    }
    if (lo < ${fixes.length} && (GRAIN_FIX[lo] >> 7u) == key) { n = f32(GRAIN_FIX[lo] & 127); }
  }`
    : "";
  return `${GRAIN_NOTE(grain)}
const GRAIN_K: f32 = ${shaderFloat(grainFactor(grain))};
${table}
// ln(u) for u > 0: the exponent from its bits, and the mantissa's log by the series of atanh
fn grainLn(u: f32) -> f32 {
  let b = bitcast<u32>(u);
  var e = f32(i32(b >> 23u) - 127);
  var m = bitcast<f32>((b & 0x7fffffu) | 0x3f800000u);
  if (m > 1.4142135) {
    m *= 0.5;
    e += 1.0;
  }
  let s = (m - 1.0) / (m + 1.0);
  let s2 = s * s;
  return e * 0.6931472 + 2.0 * s * (1.0 + s2 * (0.33333334 + s2 * (0.2 + s2 * (0.14285715 + s2 * 0.11111111))));
}
// cos(2 pi u) for 0 <= u < 1: the nearest quarter turn taken off exactly, the series for the rest
fn grainCos(u: f32) -> f32 {
  let k = floor(u * 4.0 + 0.5);
  let r = (u - 0.25 * k) * 6.2831855;
  let r2 = r * r;
  let c = 1.0 + r2 * (-0.5 + r2 * (0.041666668 + r2 * (-0.0013888889 + r2 * (2.4801588e-5 - r2 * 2.7557319e-7))));
  let s = r * (1.0 + r2 * (-0.16666667 + r2 * (0.008333334 + r2 * (-1.984127e-4 + r2 * 2.7557319e-6))));
  let q = i32(k) & 3;
  return select(select(select(s, -c, q == 2), -s, q == 1), c, q == 0);
}
fn grainSpeck(p: vec2i) -> vec2f {
  let x = u32(p.x & 127);
  let y = u32(p.y & 127);
  var h = (x * 0x27d4eb2du) ^ (y * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  let u1 = (f32(h & 0xffffu) + 0.5) / 65536.0;
  let u2 = (f32(h >> 16u) + 0.5) / 65536.0;
  let g = sqrt(-2.0 * grainLn(u1)) * grainCos(u2);
  let q = abs(g) * GRAIN_K;
  var n = floor(q + 0.5);${lookup}
  return vec2f(min(254.0, 2.0 * n), select(0.0, 255.0, g > 0.0));
}
fn grainOver(c: vec3f, p: vec2i) -> vec3f {
  let s = grainSpeck(p);
  return floor((c * (255.0 - s.x) + s.y * s.x) / 255.0 + 0.5);
}`;
}
