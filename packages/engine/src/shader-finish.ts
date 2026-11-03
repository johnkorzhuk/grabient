/* Soft and grain after an effect's own passes in its shader pages (glass-webgl.ts, glass-webgpu.ts, blob-webgl.ts,
   blob-webgpu.ts; the silk's and the rosette's call the same seam), as the site paints them over the player
   (fx-finish.ts, grain.ts): the effect draws its last pass into the finish's frame, the soft blurs it on a smaller
   grid (texels a power of two pixels wide, the largest at most half the sigma, so the sigma there is 2 to 4 texels:
   Chromium's own blur halves a picture so before it blurs and scales back up), reading clear past the picture's
   edges, and one pass over the canvas lays it over the palette's gradient under it (fx-finish.ts effectUnderlay;
   clear where there is none) and the grain over all, from a tile the page's JavaScript makes exactly as grain.ts
   does, a speck a CSS pixel as the site lays it (grainScale, the canvas's pixels to a CSS pixel). A grain with no soft
   needs no pass of its own: it goes into the effect's own last pass (grainedGlsl, grainedWgsl). The grain a single
   shader computes itself is shader-grain.ts's.
   The effects' writers load this module with their own, never with a page's start. */
import type { Finish, Underlay } from "./fx-finish.ts";
import { GRAIN_FULL } from "./grain.ts";
import { effectSoftShare } from "./view.ts";

/** An effect's finish as its shader code takes it: the soft and the grain, and the gradient under a soft effect's
    edges (fx-finish.ts effectUnderlay; none for a clear blob), which the caller works out. */
export interface EffectShaderFinish extends Finish {
  underlay?: Underlay | null;
}
/** Whether an effect's shader code has a finish to draw. */
export const finished = (finish: Finish | undefined): boolean => !!(finish?.soft || finish?.grain);

/** The grain from its tile over a picture's bytes in GLSL: \`grainOver(c, p)\` lays the speck the pixel p (from the
    picture's top left) shows over c (premultiplied bytes, 0 to 255), as a file bakes it: straight where the picture is
    clear or translucent, so a speck there stands at its own alpha. A speck spans grainScale pixels, the canvas's
    pixels to a CSS pixel, as the site lays its tile of CSS pixels. The tile is the page's (GRAIN_TILE_JS grainTile). */
export const GRAIN_TILE_GLSL = `uniform highp usampler2D grainTile;  // the grain's tile, 128 x 128: a speck's alpha, white in its lowest bit
uniform float grainScale;            // the canvas's pixels a speck spans, its pixels to a CSS pixel; under 1, a pixel
vec4 grainOver(vec4 c, ivec2 p) {
  // the speck the pixel shows, as a picture's pixels show a tile of CSS pixels, nearest
  uint s = texelFetch(grainTile, ivec2(floor((vec2(p) + 0.5) / max(grainScale, 1.0))) & 127, 0).r;
  float a = float(s & 254u);
  float v = (s & 1u) == 1u ? 255.0 : 0.0;
  if (a == 0.0) return c;
  if (c.a >= 255.0) return vec4(floor((c.rgb * (255.0 - a) + v * a) / 255.0 + 0.5), 255.0);
  // over clear or translucent pixels, straight: the speck's alpha and what shows through it
  float ta = a / 255.0;
  float ba = c.a / 255.0 * (1.0 - ta);
  float oa = ta + ba;
  vec3 straight = c.a > 0.0 ? c.rgb * (255.0 / c.a) : vec3(0.0);
  vec3 rgb = floor((v * ta + straight * ba) / oa + 0.5);
  float alpha = floor(oa * 255.0 + 0.5);
  return vec4(rgb * (alpha / 255.0), alpha);
}`;
/** The same in WGSL, its tile at \`binding\` of group 0 and its scale at the next. */
export const grainTileWgsl = (
  binding: number
) => `@group(0) @binding(${binding}) var grainTile: texture_2d<u32>;  // the grain's tile, 128 x 128: a speck's alpha, white in its lowest bit
@group(0) @binding(${binding + 1}) var<uniform> grainScale: f32;  // the canvas's pixels a speck spans, its pixels to a CSS pixel; under 1, a pixel
fn grainOver(c: vec4f, p: vec2i) -> vec4f {
  // the speck the pixel shows, as a picture's pixels show a tile of CSS pixels, nearest
  let s = textureLoad(grainTile, vec2i(floor((vec2f(p) + 0.5) / max(grainScale, 1.0))) & vec2i(127), 0).r;
  let a = f32(s & 254u);
  let v = select(0.0, 255.0, (s & 1u) == 1u);
  if (a == 0.0) {
    return c;
  }
  if (c.a >= 255.0) {
    return vec4f(floor((c.rgb * (255.0 - a) + v * a) / 255.0 + 0.5), 255.0);
  }
  // over clear or translucent pixels, straight: the speck's alpha and what shows through it
  let ta = a / 255.0;
  let ba = c.a / 255.0 * (1.0 - ta);
  let oa = ta + ba;
  let straight = select(vec3f(0.0), c.rgb * (255.0 / c.a), c.a > 0.0);
  let rgb = floor((v * ta + straight * ba) / oa + 0.5);
  let alpha = floor(oa * 255.0 + 0.5);
  return vec4f(rgb * (alpha / 255.0), alpha);
}`;

/** An effect's own last fragment shader with the grain from its tile over what it draws, for a grained effect with no
    soft, which so needs no pass of its own: its line \`from\` replaced by \`to\` (which lays grainOver over its bytes),
    the tile, its scale and grainOver before its main. Throws where the shader is not the one it was written for. */
export function grainedGlsl(fs: string, from: string, to: string): string {
  if (
    !fs.includes(from) ||
    !fs.includes("\nvoid main() {") ||
    !fs.includes("precision highp float;")
  )
    throw new Error("grainedGlsl: the shader is not the one it was written for");
  const ints = fs.includes("precision highp int;")
    ? fs
    : fs.replace("precision highp float;", "precision highp float;\nprecision highp int;");
  return ints.replace("\nvoid main() {", `\n${GRAIN_TILE_GLSL}\nvoid main() {`).replace(from, to);
}
/** The same for a WGSL module, its tile at \`binding\` and its scale at the next, before its fragment stage. */
export function grainedWgsl(module: string, binding: number, from: string, to: string): string {
  if (!module.includes(from) || !module.includes("\n@fragment"))
    throw new Error("grainedWgsl: the module is not the one it was written for");
  return module
    .replace("\n@fragment", `\n${grainTileWgsl(binding)}\n\n@fragment`)
    .replace(from, to);
}

/** The vertex stage of the finish's passes: one triangle over the target, no attributes. */
export const FINISH_VS = `#version 300 es
void main() {
  gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;
/** The soft's grid, a level at a time: each texel the mean of the factor by factor texels of its source it covers,
    clear past the source's edges (the frame's, eight pixels a side at most, then the rest of the way from there). */
export const FINISH_DOWN_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;  // the effect's frame (premultiplied), or the level before
uniform vec2 corner;       // this level's corner in the source's texels (x, y as GL counts them)
uniform int factor;        // source texels a side to a texel here
out vec4 color;
void main() {
  ivec2 lo = ivec2(corner) + ivec2(gl_FragCoord.xy) * factor;
  ivec2 size = textureSize(source, 0);
  ivec2 a = max(lo, ivec2(0));
  ivec2 b = min(lo + factor, size);
  vec4 sum = vec4(0.0);
  for (int y = a.y; y < b.y; y++)
    for (int x = a.x; x < b.x; x++) sum += texelFetch(source, ivec2(x, y), 0);
  color = sum / float(factor * factor);
}`;
/** One pass of the soft's Gaussian along \`along\`: the middle texel and pairs of texels either side, each pair one
    read between its two, weighed as both. The grid's outer texels are clear, so a read past them reads clear. */
export const FINISH_BLUR_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;  // the grid (linear, clamp to edge)
uniform vec2 along;        // (1, 0) across, (0, 1) down
uniform vec2 taps[7];      // the middle's weight, then each pair's offset in texels and weight, the whole summing to 1
uniform int pairs;         // pairs either side, at most 6
out vec4 color;
void main() {
  vec2 size = vec2(textureSize(source, 0));
  vec2 uv = gl_FragCoord.xy / size;
  vec4 sum = texture(source, uv) * taps[0].y;
  for (int i = 1; i <= 6; i++) {
    if (i > pairs) break;
    vec2 off = along * (taps[i].x / size);
    sum += (texture(source, uv + off) + texture(source, uv - off)) * taps[i].y;
  }
  color = sum;
}`;
/** The canvas: the frame, or the soft's grid read between its texels over the gradient under it, and the grain's
    speck over all, each kept as bytes as a file keeps them. */
export const FINISH_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D frame;          // the effect's frame (texelFetch)
uniform sampler2D soft;           // the soft's grid after its blur (linear, clamp to edge)
uniform bool softened;            // the frame is blurred
uniform vec3 grid;                // the soft's grid: its corner in the canvas's pixels (as GL counts them), its texel
uniform vec2 canvas;              // the canvas's pixels
uniform int unders;               // the gradient under the blur: its stops, none for none
uniform highp sampler2D under;    // a texel a stop (RGBA32F, texelFetch): its color in bytes and its place along the line
uniform vec2 line;                // the line's direction from the top left (y down), over its length
out vec4 color;
${GRAIN_TILE_GLSL}
vec3 underAt(float t) {
  vec4 before = texelFetch(under, ivec2(0, 0), 0);
  if (t <= before.a) return before.rgb;
  for (int i = 1; i < unders; i++) {
    vec4 stop = texelFetch(under, ivec2(i, 0), 0);
    if (stop.a >= t) {
      float span = stop.a - before.a;
      float u = span > 0.0 ? (t - before.a) / span : 1.0;
      return floor(before.rgb + (stop.rgb - before.rgb) * u + 0.5);
    }
    before = stop;
  }
  return before.rgb;
}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  // the pixel from the picture's top left
  ivec2 p = ivec2(at.x, int(canvas.y) - 1 - at.y);
  vec4 c;
  if (softened) {
    vec2 uv = (gl_FragCoord.xy - grid.xy) / grid.z / vec2(textureSize(soft, 0));
    c = floor(clamp(texture(soft, uv), 0.0, 1.0) * 255.0 + 0.5);
    // the gradient under shows only where the blur thins the frame, toward its edges
    if (unders > 0 && c.a < 255.0) {
      float t = dot(vec2(p) + 0.5 - 0.5 * canvas, line) + 0.5;
      c = vec4(floor(c.rgb + underAt(t) * (1.0 - c.a / 255.0) + 0.5), 255.0);
    }
  } else c = floor(texelFetch(frame, at, 0) * 255.0 + 0.5);
  color = grainOver(c, p) / 255.0;
}`;

const WGSL_FULL = `@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(select(-1.0, 3.0, i == 1u), select(-1.0, 3.0, i == 2u), 0.0, 1.0);
}`;

/** The finish's passes in WGSL, for the effects' WebGPU pages: the same as the GLSL's, rows from the top. */
export const FINISH_WGSL = {
  down: `struct Down {
  corner: vec2f,   // this level's corner in the source's texels, from the top left
  factor: i32,     // source texels a side to a texel here
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> down: Down;
${WGSL_FULL}
// each texel the mean of the factor by factor texels of its source it covers, clear past the source's edges
@fragment
fn fs_main(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let lo = vec2i(down.corner) + vec2i(at.xy) * down.factor;
  let size = vec2i(textureDimensions(source));
  let a = max(lo, vec2i(0));
  let b = min(lo + vec2i(down.factor), size);
  var sum = vec4f(0.0);
  for (var y = a.y; y < b.y; y++) {
    for (var x = a.x; x < b.x; x++) {
      sum += textureLoad(source, vec2i(x, y), 0);
    }
  }
  return sum / f32(down.factor * down.factor);
}`,
  blur: `struct Blur {
  along: vec2f,                 // (1, 0) across, (0, 1) down
  pairs: i32,                   // pairs either side, at most 6
  taps: array<vec4f, 7>,        // xy: the middle's weight (y), then each pair's offset in texels and weight
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;
@group(0) @binding(2) var<uniform> blur: Blur;
${WGSL_FULL}
// one pass of the soft's Gaussian: the middle texel and pairs either side, each pair one read between its two; the
// grid's outer texels are clear, so a read past them reads clear
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(source));
  let uv = position.xy / size;
  var sum = textureSampleLevel(source, linear, uv, 0.0) * blur.taps[0].y;
  for (var i = 1; i <= 6; i++) {
    if (i > blur.pairs) {
      break;
    }
    let off = blur.along * (blur.taps[i].x / size);
    sum += (textureSampleLevel(source, linear, uv + off, 0.0) + textureSampleLevel(source, linear, uv - off, 0.0)) * blur.taps[i].y;
  }
  return sum;
}`,
  final: `struct Finish {
  grid: vec4f,                  // the soft's grid: its corner from the top left, its texel; w 1 where it is blurred
  canvas: vec2f,                // the canvas's pixels
  line: vec2f,                  // the gradient's direction (y down), over its line's length
  unders: i32,                  // the gradient under the blur: its stops, none for none
}
@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var soft: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;
${grainTileWgsl(3)}
@group(0) @binding(5) var<uniform> fin: Finish;
@group(0) @binding(6) var<storage, read> under: array<vec4f>;  // a stop each: its color in bytes and its place along the line
${WGSL_FULL}
fn underAt(t: f32) -> vec3f {
  var before = under[0];
  if (t <= before.a) {
    return before.rgb;
  }
  for (var i = 1; i < fin.unders; i++) {
    let stop = under[i];
    if (stop.a >= t) {
      let span = stop.a - before.a;
      let u = select(1.0, (t - before.a) / span, span > 0.0);
      return floor(before.rgb + (stop.rgb - before.rgb) * u + 0.5);
    }
    before = stop;
  }
  return before.rgb;
}
// the frame, or the soft's grid read between its texels over the gradient under it, and the grain's speck over all,
// each kept as bytes as a file keeps them
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let blurred = textureSampleLevel(soft, linear, (position.xy - fin.grid.xy) / fin.grid.z / vec2f(textureDimensions(soft)), 0.0);
  var c: vec4f;
  if (fin.grid.w > 0.5) {
    c = floor(clamp(blurred, vec4f(0.0), vec4f(1.0)) * 255.0 + 0.5);
    // the gradient under shows only where the blur thins the frame, toward its edges
    if (fin.unders > 0 && c.a < 255.0) {
      let t = dot(vec2f(p) + 0.5 - 0.5 * fin.canvas, fin.line) + 0.5;
      c = vec4f(floor(c.rgb + underAt(t) * (1.0 - c.a / 255.0) + 0.5), 255.0);
    }
  } else {
    c = floor(textureLoad(frame, p, 0) * 255.0 + 0.5);
  }
  return grainOver(c, p) / 255.0;
}`
};

/** The finish's settings as a page's script writes them, after the effect's own: the soft as a share of the canvas's
    longer side (view.ts effectSoftShare, 0 for none), the gradient under it, each stop's color and place along its line
    (none for none) at the angle `angle` names, and the grain. */
export function finishSettingsJs(finish: EffectShaderFinish, angle: string): string {
  const share = finish.soft ? effectSoftShare(finish.soft) : 0;
  const underlay = finish.soft ? (finish.underlay ?? null) : null;
  const stops = underlay
    ? underlay.stops.map((s, i) => {
        const at = underlay.at ? underlay.at[i] : i / Math.max(1, underlay.stops.length - 1);
        return `\n  ["${s.hex}", ${Number(at.toFixed(5))}]`;
      })
    : [];
  return `// The finish, as the site lays it over the picture: the soft, a blur whose sigma is SOFT of the canvas's longer side (0
// for none), over the gradient under its edges (UNDER: each stop's color and its place along the line, at
// UNDER_ANGLE; none for none); and the grain, 1 to 100 (0 for none), a speck a CSS pixel.
const SOFT = ${share};
const UNDER = [${stops.join(",")}${stops.length ? "\n" : ""}];
const UNDER_ANGLE = ${angle};
const GRAIN = ${finish.grain ?? 0};`;
}

/** The grain's tile in a page's JavaScript, made as grain.ts makes it. */
export const GRAIN_TILE_JS = `// The grain's tile (engine/grain.ts): 128 by 128 specks, each black or white from an integer hash of its place, its
// alpha the size of a normal (Box-Muller) at the grain, in steps of 2 of 255; a byte a speck, its alpha with the white
// in its lowest bit.
const grainTile = grain => {
  const tile = new Uint8Array(128 * 128);
  const strength = Math.min(100, Math.max(0, grain)) / 100;
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      const u1 = ((h & 0xffff) + 0.5) / 65536;
      const u2 = ((h >>> 16) + 0.5) / 65536;
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const alpha = Math.min(254, 2 * Math.round((Math.abs(g) * ${GRAIN_FULL} * strength * 255) / 2));
      tile[y * 128 + x] = alpha | (g > 0 ? 1 : 0);
    }
  return tile;
};
// The canvas's pixels to a CSS pixel, which a speck spans, as the site's speck is a CSS pixel: w of them across it.
const grainScaleOf = w => {
  const css = canvas.getBoundingClientRect().width;
  return css > 0 ? w / css : 1;
};`;

/** A grained effect's settings with no soft, after the effect's own. */
export const grainSettingsJs = (grain: number): string =>
  `// The grain, as the site lays it over the picture: 1 to 100 (0 for none), a speck a CSS pixel.\nconst GRAIN = ${grain};`;
/** Whether an effect's shader code lays its grain in its own last pass: a grain with no soft. */
export const grainOnly = (finish: Finish | undefined): boolean => !!finish?.grain && !finish.soft;

/** The page's arithmetic for the finish: the grain's tile and the soft's plan. */
export const FINISH_MATH_JS = `${GRAIN_TILE_JS}

// The soft's plan for a canvas of w by h pixels: the Gaussian's sigma, SOFT of the longer side, drawn on a grid of
// texels t pixels wide, a power of two, the largest at most half the sigma (so the sigma there is 2 to 4 texels, as
// Chromium's own blur halves a picture before it blurs it), a texel past each edge, made from the frame in two
// levels (at most 8 pixels a side, then the rest); its taps either side, three sigmas, read in pairs, each pair one
// read between its two texels, and their weights. None for no soft, or one under a quarter of a pixel, whose blur
// moves no byte (its nearest tap weighs under a 2,900th).
const softPlan = (w, h) => {
  const sigma = SOFT * Math.max(w, h);
  if (!(sigma >= 0.25)) return null;
  let t = 1;
  while (4 * t <= sigma) t *= 2;
  const s = sigma / t;
  const reach = Math.min(12, Math.ceil(3 * s));
  const weights = [];
  let total = 0;
  for (let i = 0; i <= reach; i++) {
    weights.push(Math.exp(-(i * i) / (2 * s * s)));
    total += i ? 2 * weights[i] : weights[i];
  }
  const taps = new Float32Array(14);
  taps[1] = weights[0] / total;
  let pairs = 0;
  for (let a = 1; a <= reach; a += 2) {
    const wa = weights[a] / total;
    const wb = a < reach ? weights[a + 1] / total : 0;
    pairs++;
    taps[2 * pairs] = wa + wb > 0 ? a + wb / (wa + wb) : a;
    taps[2 * pairs + 1] = wa + wb;
  }
  const first = Math.min(t, 8);
  return { t, first, rest: t / first, pairs, taps, lw: Math.ceil(w / t) + 2, lh: Math.ceil(h / t) + 2 };
};

// The gradient under the soft's edges: its stops' colors in bytes and their places (a stop at the least, so nothing
// is bound empty), and its line in a w by h canvas as CSS lays a linear gradient's (from the top left, y down, over
// the line's length).
const underStops = () => {
  const out = new Float32Array(4 * Math.max(1, UNDER.length));
  UNDER.forEach(([hex, at], i) => {
    const n = Number.parseInt(hex.slice(1), 16);
    out.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, at], 4 * i);
  });
  return out;
};
const underLine = (w, h) => {
  const a = (UNDER_ANGLE * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const length = Math.abs(w * dx) + Math.abs(h * dy) || 1;
  return [dx / length, dy / length];
};`;

/** A WebGL 2 page's grain tile, a texture of its own for an effect's last pass to read: \`grainTexture(gl)\`. */
export const GRAIN_WEBGL_JS = `// The grain's tile as an integer texture, a byte a speck, for the last pass to read.
const grainTexture = gl => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 128, 128, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, grainTile(GRAIN));
  return t;
};`;
/** The same for a WebGPU page: \`grainTexture(device)\`, and \`grainScaleBuffer(device)\` for its scale. */
export const GRAIN_WEBGPU_JS = `// The grain's tile as an integer texture, a byte a speck, and a buffer for its scale, for the last pass to read.
const grainTexture = device => {
  const t = device.createTexture({
    size: [128, 128],
    format: "r8uint",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture({ texture: t }, grainTile(GRAIN), { bytesPerRow: 128 }, [128, 128]);
  return t;
};
const grainScaleBuffer = device =>
  device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });`;

/** The finish in a WebGL 2 page: \`finishing(gl)\` makes its programs and textures on a context (again on one given
    back) and gives the framebuffer the effect draws its last pass into, \`layout(w, h, scale)\` at each size (scale
    the canvas's pixels to a CSS pixel, which a speck spans) and \`draw()\`, which lays the finish over the canvas. The
    page's shaders carry the finish's under the ids finish-vs, finish-down-fs, finish-blur-fs and finish-fs. */
export const FINISH_WEBGL_JS = `// The finish over the canvas: the effect's last pass draws into \`frame\`; draw() blurs it by the soft on its grid,
// lays it over the gradient under it, and the grain over all.
function finishing(gl) {
  const compile = (type, id) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, document.getElementById(id).textContent);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, "finish-vs");
  const link = id => {
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, id));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  };
  const pDown = link("finish-down-fs");
  const pBlur = link("finish-blur-fs");
  const pFinal = link("finish-fs");
  const at = (program, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(program, n)]));
  const U = {
    down: at(pDown, ["source", "corner", "factor"]),
    blur: at(pBlur, ["source", "along", "taps", "pairs"]),
    final: at(pFinal, ["frame", "soft", "grainTile", "grainScale", "softened", "grid", "canvas", "unders", "under", "line"])
  };
  const texture = filter => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // the soft's grid: in bytes at a texel a pixel, as Chromium keeps a blur it draws at full size, else in half floats
  // where they can be drawn into, which come nearer the blur Chromium draws on a smaller picture
  const half = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  const frameTex = texture(gl.NEAREST);
  const frame = gl.createFramebuffer();
  // the grid's first level where it takes two, and the grid itself, twice, for the blur across and down
  const level = { texture: texture(gl.NEAREST), frame: gl.createFramebuffer() };
  const grid = [0, 1].map(() => ({ texture: texture(gl.LINEAR), frame: gl.createFramebuffer() }));
  const grainTex = texture(gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 128, 128, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, grainTile(GRAIN));
  // the gradient under, a texel a stop
  const underTex = texture(gl.NEAREST);
  const under = underStops();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, under.length / 4, 1, 0, gl.RGBA, gl.FLOAT, under);
  let size = null;
  let plan = null;
  let line = [0, 0];
  let scale = 1;

  // the frame's texture at the canvas's size, and the soft's grid for it
  const layout = (w, h, cssScale) => {
    scale = cssScale;
    if (size && size.w === w && size.h === h) return;
    size = { w, h };
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frameTex, 0);
    plan = softPlan(w, h);
    // the grid's textures, a texel each where there is no soft, so none is bound empty
    const floats = half && plan && plan.t > 1;
    const sized = (g, gw, gh) => {
      gl.bindTexture(gl.TEXTURE_2D, g.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, floats ? gl.RGBA16F : gl.RGBA8, gw, gh, 0, gl.RGBA, floats ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.texture, 0);
    };
    for (const g of grid) sized(g, plan ? plan.lw : 1, plan ? plan.lh : 1);
    sized(level, plan && plan.rest > 1 ? plan.lw * plan.rest : 1, plan && plan.rest > 1 ? plan.lh * plan.rest : 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    line = underLine(w, h);
  };

  // the soft's grid, its blur across and down, and the canvas
  const draw = () => {
    const { w, h } = size;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    // the grid's corner, a texel past the left and the top
    const corner = plan ? [-plan.t, h + plan.t - plan.lh * plan.t] : [0, 0];
    if (plan) {
      // the frame down to the grid, in one level or two
      gl.useProgram(pDown);
      gl.uniform1i(U.down.source, 0);
      const two = plan.rest > 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, two ? level.frame : grid[0].frame);
      gl.viewport(0, 0, plan.lw * plan.rest, plan.lh * plan.rest);
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      gl.uniform2f(U.down.corner, corner[0], corner[1]);
      gl.uniform1i(U.down.factor, plan.first);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (two) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, grid[0].frame);
        gl.viewport(0, 0, plan.lw, plan.lh);
        gl.bindTexture(gl.TEXTURE_2D, level.texture);
        gl.uniform2f(U.down.corner, 0, 0);
        gl.uniform1i(U.down.factor, plan.rest);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.viewport(0, 0, plan.lw, plan.lh);
      gl.useProgram(pBlur);
      gl.uniform1i(U.blur.source, 0);
      gl.uniform2fv(U.blur.taps, plan.taps);
      gl.uniform1i(U.blur.pairs, plan.pairs);
      gl.bindFramebuffer(gl.FRAMEBUFFER, grid[1].frame);
      gl.bindTexture(gl.TEXTURE_2D, grid[0].texture);
      gl.uniform2f(U.blur.along, 1, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, grid[0].frame);
      gl.bindTexture(gl.TEXTURE_2D, grid[1].texture);
      gl.uniform2f(U.blur.along, 0, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pFinal);
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.uniform1i(U.final.frame, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, grid[0].texture);
    gl.uniform1i(U.final.soft, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, grainTex);
    gl.uniform1i(U.final.grainTile, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, underTex);
    gl.uniform1i(U.final.under, 3);
    gl.uniform1f(U.final.grainScale, scale);
    gl.uniform1i(U.final.softened, plan ? 1 : 0);
    gl.uniform3f(U.final.grid, corner[0], corner[1], plan ? plan.t : 1);
    gl.uniform2f(U.final.canvas, w, h);
    gl.uniform1i(U.final.unders, plan ? UNDER.length : 0);
    gl.uniform2f(U.final.line, line[0], line[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  };
  return { frame, layout, draw };
}`;

/** The finish in a WebGPU page: \`finishing(device, format)\` makes its pipelines and textures on a device (again on a
    new one), \`layout(w, h, scale)\` at each size (scale the canvas's pixels to a CSS pixel, which a speck spans)
    gives the view the effect draws its last pass into, and \`draw(encoder, canvasView)\` lays the finish over the
    canvas. The page's modules carry the finish's under the ids finish-down, finish-blur and finish. */
export const FINISH_WEBGPU_JS = `// The finish over the canvas: the effect's last pass draws into finish.view; draw(encoder, canvas) blurs it by the soft
// on its grid, lays it over the gradient under it, and the grain over all.
function finishing(device, format) {
  const module = id => device.createShaderModule({ code: document.getElementById(id).textContent });
  const pipeline = (id, target) => {
    const code = module(id);
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module: code, entryPoint: "vs_main" },
      fragment: { module: code, entryPoint: "fs_main", targets: [{ format: target }] },
      primitive: { topology: "triangle-list" }
    });
  };
  // the soft's grid: in bytes at a texel a pixel, as Chromium keeps a blur it draws at full size, else in half floats,
  // which come nearer the blur Chromium draws on a smaller picture; a pipeline for each, made as it is first needed
  const pipelines = {};
  const passes = f => (pipelines[f] ??= { down: pipeline("finish-down", f), blur: pipeline("finish-blur", f) });
  const pFinal = pipeline("finish", format);
  const uniforms = size => device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uFirst = uniforms(16);
  const uRest = uniforms(16);
  const uAcross = uniforms(128);
  const uAlong = uniforms(128);
  const uScale = uniforms(16);
  const uFinal = uniforms(48);
  const linear = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const grain = device.createTexture({
    size: [128, 128],
    format: "r8uint",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture({ texture: grain }, grainTile(GRAIN), { bytesPerRow: 128 }, [128, 128]);
  // the gradient under, a stop each
  const under = underStops();
  const uUnder = device.createBuffer({ size: under.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(uUnder, 0, under);
  const texture = (w, h, f) =>
    device.createTexture({
      size: [w, h],
      format: f,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
  const group = (p, entries) =>
    device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({ binding, resource }))
    });
  let size = null;
  let plan = null;
  let frame = null;
  let level = null;
  let grid = [];
  let groups = null;
  let pDown = null;
  let pBlur = null;

  // the frame's texture at the canvas's size, the soft's grid for it, and their uniforms
  const layout = (w, h, cssScale) => {
    device.queue.writeBuffer(uScale, 0, new Float32Array([cssScale]));
    if (size && size.w === w && size.h === h) return;
    size = { w, h };
    frame?.destroy();
    level?.destroy();
    for (const g of grid) g.destroy();
    frame = texture(w, h, "rgba8unorm");
    plan = softPlan(w, h);
    const f = plan && plan.t > 1 ? "rgba16float" : "rgba8unorm";
    ({ down: pDown, blur: pBlur } = passes(f));
    grid = plan ? [0, 1].map(() => texture(plan.lw, plan.lh, f)) : [texture(1, 1, f)];
    level = plan && plan.rest > 1 ? texture(plan.lw * plan.rest, plan.lh * plan.rest, f) : null;
    const t = plan ? plan.t : 1;
    const down = (x, y, factor) => {
      const b = new ArrayBuffer(16);
      new Float32Array(b, 0, 2).set([x, y]);
      new Int32Array(b, 8, 1).set([factor]);
      return b;
    };
    device.queue.writeBuffer(uFirst, 0, down(-t, -t, plan ? plan.first : 1));
    device.queue.writeBuffer(uRest, 0, down(0, 0, plan ? plan.rest : 1));
    const blur = (x, y) => {
      const b = new ArrayBuffer(128);
      new Float32Array(b, 0, 2).set([x, y]);
      new Int32Array(b, 8, 1).set([plan ? plan.pairs : 0]);
      const taps = new Float32Array(b, 16, 28);
      for (let i = 0; i < 7; i++) taps.set(plan ? plan.taps.slice(2 * i, 2 * i + 2) : [0, 0], 4 * i);
      return b;
    };
    device.queue.writeBuffer(uAcross, 0, blur(1, 0));
    device.queue.writeBuffer(uAlong, 0, blur(0, 1));
    const fin = new ArrayBuffer(48);
    new Float32Array(fin, 0, 8).set([-t, -t, t, plan ? 1 : 0, w, h, ...underLine(w, h)]);
    new Int32Array(fin, 32, 1).set([plan ? UNDER.length : 0]);
    device.queue.writeBuffer(uFinal, 0, fin);
    groups = {
      view: frame.createView(),
      first: plan && group(pDown, [frame.createView(), { buffer: uFirst }]),
      rest: level && group(pDown, [level.createView(), { buffer: uRest }]),
      across: plan && group(pBlur, [grid[0].createView(), linear, { buffer: uAcross }]),
      along: plan && group(pBlur, [grid[1].createView(), linear, { buffer: uAlong }]),
      final: group(pFinal, [
        frame.createView(),
        grid[0].createView(),
        linear,
        grain.createView(),
        { buffer: uScale },
        { buffer: uFinal },
        { buffer: uUnder }
      ])
    };
  };

  // the soft's grid, its blur across and down, and the canvas, in the frame's encoder
  const draw = (encoder, canvas) => {
    const run = (view, p, bindings) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view, loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }]
      });
      pass.setPipeline(p);
      pass.setBindGroup(0, bindings);
      pass.draw(3);
      pass.end();
    };
    if (plan) {
      // the frame down to the grid, in one level or two, then the blur across and down
      run((level ?? grid[0]).createView(), pDown, groups.first);
      if (level) run(grid[0].createView(), pDown, groups.rest);
      run(grid[1].createView(), pBlur, groups.across);
      run(grid[0].createView(), pBlur, groups.along);
    }
    run(canvas, pFinal, groups.final);
  };
  return {
    layout,
    get view() {
      return groups.view;
    },
    draw
  };
}`;

/** The finish's GLSL as the effects' GLSL texts write it, a section a pass, after the effect's own. */
export const FINISH_GLSL_SECTIONS = `// ==== Finish ==== the vertex stage of the finish's passes: one triangle over the target, drawn as 3 vertices with no attributes | the effect's last pass draws into the frame: the canvas's size, RGBA8
${FINISH_VS}

// ==== Finish 1: soft's grid ==== target: ceil(W / t) + 2 x ceil(H / t) + 2 texels, RGBA8 where t is 1, else RGBA16F (RGBA8 without float targets), t a power of two, the largest at most half the soft's sigma (1 under 4 pixels), its corner a texel past the left and the top; drawn from the frame (texelFetch) a factor of t at a time up to 8, so t over 8 takes a level of (t / 8) times the grid's texels between | inputs: the frame or the level before (texelFetch); only with a soft
${FINISH_DOWN_FS}

// ==== Finish 2 and 3: soft's blur across, then down ==== target: the other grid texture, the same size | inputs: the grid (linear, clamp to edge), along (1, 0) then (0, 1), a Gaussian of sigma / t texels to three sigmas (12 at most), read in pairs: the middle's weight, then each pair's offset and weight; only with a soft
${FINISH_BLUR_FS}

// ==== Finish 4: canvas ==== target: the canvas, W x H | inputs: the frame (texelFetch), the grid after pass 3 (linear, clamp to edge), the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel), the gradient under the soft's edges (a texel a stop, RGBA32F, texelFetch)
${FINISH_FS}
`;

/** The finish's WGSL as the effects' WGSL texts write it, a section a module, after the effect's own. */
export const FINISH_WGSL_SECTIONS = `// ==== Finish 1: soft's grid ==== target: ceil(W / t) + 2 x ceil(H / t) + 2 texels, rgba8unorm where t is 1, else rgba16float, t a power of two, the largest at most half the soft's sigma (1 under 4 pixels), its corner a texel past the left and the top; drawn from the frame the effect's last pass draws into (the canvas's size, rgba8unorm) a factor of t at a time up to 8, so t over 8 takes a level of (t / 8) times the grid's texels between | inputs: the frame or the level before (textureLoad); only with a soft
${FINISH_WGSL.down}

// ==== Finish 2 and 3: soft's blur across, then down ==== target: the other grid texture, the same size | inputs: the grid (linear, clamp to edge), along (1, 0) then (0, 1), a Gaussian of sigma / t texels to three sigmas (12 at most), read in pairs: the middle's weight, then each pair's offset and weight; only with a soft
${FINISH_WGSL.blur}

// ==== Finish 4: canvas ==== target: the canvas, W x H | inputs: the frame (textureLoad), the grid after pass 3 (linear, clamp to edge), the grain's tile (128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (the canvas's pixels to a CSS pixel), the gradient under the soft's edges (a storage buffer, a stop each)
${FINISH_WGSL.final}
`;

/** The WebGL page's shader elements for the finish, by the ids FINISH_WEBGL_JS reads. */
export const FINISH_WEBGL_SHADERS = [
  ["finish-vs", "x-shader/x-vertex", FINISH_VS],
  ["finish-down-fs", "x-shader/x-fragment", FINISH_DOWN_FS],
  ["finish-blur-fs", "x-shader/x-fragment", FINISH_BLUR_FS],
  ["finish-fs", "x-shader/x-fragment", FINISH_FS]
] as const;
/** The WebGPU page's module elements for the finish, by the ids FINISH_WEBGPU_JS reads. */
export const FINISH_WEBGPU_SHADERS = [
  ["finish-down", "text/wgsl", FINISH_WGSL.down],
  ["finish-blur", "text/wgsl", FINISH_WGSL.blur],
  ["finish", "text/wgsl", FINISH_WGSL.final]
] as const;
