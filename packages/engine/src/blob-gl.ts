/* The blob's WebGL: the shaders the site's player draws it with (ui/blob-player.ts) and the numbers it lays them out
   by, here so the player and the shader exports (blob-shader.ts) run one source, and an export draws what the player
   draws. Nothing here touches a page: the player measures the canvas and hands these the sizes. Its ease, pixel cap
   and settle are every effect's (effect.ts). */
import { BLOB_DESIGN, type blobFilter, blobFit } from "./blob.ts";
import { EFFECT_PIXELS_MAX } from "./effect.ts";

/** The melt's deviation in texels of its small texture: its bilinear read then errs by under a tenth of a level. */
export const BLOB_TEXELS = 6;
/** How much wider Ganesh's blur is than the deviation it is given: its halvings and its bilinear upscale add a little
    to the sigma-4 Gaussian between them. Fitted to Chromium's blur of a disc at densities 1, 1.5 and 2 (1.0046,
    1.0029, 1.0045); it takes the handover's mean difference down by about a sixth. */
export const BLOB_GANESH_WIDTH = 1.004;
/** The blur's taps either side, at most: three deviations. */
export const BLOB_RADIUS = 3 * BLOB_TEXELS + 1;

export const BLOB_DOTS_VS = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 disc;  // middle x, y and radius in texels (y down), and 0
layout(location = 2) in vec4 paint; // color, and 1
uniform vec2 size;                  // the melt's texels
out vec2 here;
out vec3 center;
out vec4 tint;
void main() {
  vec2 at = disc.xy + (corner * 2.0 - 1.0) * (disc.z + 1.0);
  here = at;
  center = disc.xyz;
  tint = paint;
  gl_Position = vec4(at / size * 2.0 - 1.0, 0.0, 1.0);
}`;
/* each texel as much as the disc covers it. Not clipped to the filter region: Chromium crops the blur's output to the
   region, not its input, so balls past the region still melt into it (filled, where the design reaches past a box) */
export const BLOB_DOTS_FS = `#version 300 es
precision highp float;
in vec2 here;
in vec3 center;
in vec4 tint;
out vec4 color;
void main() {
  float cover = clamp(center.z - distance(floor(here) + 0.5, center.xy) + 0.5, 0.0, 1.0);
  color = vec4(tint.rgb * cover, cover);
}`;
export const BLOB_FULL_VS = `#version 300 es
layout(location = 0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
export const BLOB_BLUR_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform ivec2 step_by;
uniform int taps;
uniform float weights[${BLOB_RADIUS + 1}];
out vec4 color;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(source, 0);
  vec4 sum = texelFetch(source, at, 0) * weights[0];
  for (int i = 1; i <= ${BLOB_RADIUS}; i++) {
    if (i > taps) break;
    ivec2 a = at + step_by * i;
    ivec2 b = at - step_by * i;
    if (a.x < size.x && a.y < size.y) sum += texelFetch(source, a, 0) * weights[i];
    if (b.x >= 0 && b.y >= 0) sum += texelFetch(source, b, 0) * weights[i];
  }
  color = sum;
}`;
/* feTurbulence fractalNoise, two octaves, as Ganesh's GrPerlinNoise2Effect computes it: the lattice read as a byte
   and the index rebuilt as floor(256 * L / 255) (so 255 wraps to 0, as Ganesh's does), the gradients decoded from
   Skia's two bytes each; the result clamped and premultiplied, written to an 8-bit texture. Rows run down from the
   top, as the canvas's do. */
export const BLOB_NOISE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D lattice;   // 256 x 1
uniform sampler2D gradients;        // 256 x 4, Skia's noise bitmap
uniform vec2 scale;                 // device pixels a design unit, across and down
uniform vec2 offset;                // the design's corner in device pixels
uniform float frequency;
out vec4 color;
vec2 gradient(int index, int channel) {
  vec4 g = texelFetch(gradients, ivec2(index & 255, channel), 0);
  return (g.ga + g.rb * 0.00390625) * 2.0 - 1.0;
}
int selector(float x) {
  int l = int(texelFetch(lattice, ivec2(int(x) & 255, 0), 0).r);
  return l == 255 ? 256 : l;
}
void main() {
  vec2 v = ((gl_FragCoord.xy - offset) / scale + 0.5) * frequency;
  vec4 sum = vec4(0.0);
  float ratio = 1.0;
  for (int octave = 0; octave < 2; octave++) {
    vec2 f0 = floor(v);
    vec2 f = v - f0;
    vec2 s = f * f * (3.0 - 2.0 * f);
    int i = selector(f0.x);
    int j = selector(f0.x + 1.0);
    int y = int(f0.y);
    int b00 = i + y, b10 = j + y, b01 = i + y + 1, b11 = j + y + 1;
    vec4 n;
    for (int c = 0; c < 4; c++) {
      float u = dot(gradient(b00, c), f);
      float w = dot(gradient(b10, c), f - vec2(1.0, 0.0));
      float a = mix(u, w, s.x);
      w = dot(gradient(b11, c), f - vec2(1.0));
      u = dot(gradient(b01, c), f - vec2(0.0, 1.0));
      float b = mix(u, w, s.x);
      n[c] = mix(a, b, s.y);
    }
    sum += n * ratio;
    v *= 2.0;
    ratio *= 0.5;
  }
  vec4 c = clamp(sum * 0.5 + 0.5, 0.0, 1.0);
  color = vec4(c.rgb * c.a, c.a);
}`;
/* every pixel: the scatter (feDisplacementMap), the lift of the edge (feColorMatrix), the speckle (feColorMatrix on
   the noise, then feComposite arithmetic), each as Chromium computes it on 8-bit values; then the ground */
export const BLOB_FINAL_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D melt;
uniform sampler2D noise;
uniform float canvas_h;
uniform vec2 melt_origin;           // device pixels of the melt's corner
uniform float melt_texel;           // device pixels a texel spans
uniform vec4 region;                // the filter region, whole device pixels [x0, y0, x1, y1)
uniform vec2 scatter;               // the displacement's scale in device pixels, across and down
uniform bool frosted;
uniform vec2 lift;                  // alpha * lift.x + lift.y
uniform vec2 gray;                  // blue * gray.x + gray.y
uniform vec2 k;                     // the arithmetic's k1 and k2
uniform vec4 ground;                // the ground, premultiplied: its color times its alpha, and its alpha; 0s for none
out vec4 color;
bool within(vec2 p) { return all(greaterThanEqual(p, region.xy)) && all(lessThan(p, region.zw)); }
vec4 bytes(vec4 v) { return floor(clamp(v, 0.0, 1.0) * 255.0 + 0.5) / 255.0; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, canvas_h - gl_FragCoord.y);
  vec2 at = vec2(p);
  vec4 n = frosted ? texelFetch(noise, p, 0) : vec4(0.0);
  vec3 un = clamp(n.rgb / max(n.a, 0.0001), 0.0, 1.0);
  vec2 q = frosted ? floor(at + 0.5 + scatter * (un.rg - 0.5)) : at;
  vec4 d = within(q) ? bytes(texture(melt, (q + 0.5 - melt_origin) / melt_texel / vec2(textureSize(melt, 0)))) : vec4(0.0);
  float a = clamp(d.a * lift.x + lift.y, 0.0, 1.0);
  vec4 g = vec4(clamp(d.rgb / max(d.a, 0.0001), 0.0, 1.0) * a, a);
  vec4 s = g;
  if (frosted) {
    float grain = clamp(un.b * gray.x + gray.y, 0.0, 1.0);
    s = clamp(k.x * g * vec4(vec3(grain), 1.0) + k.y * g, 0.0, 1.0);
    s.rgb = min(s.rgb, s.a);
  }
  s = within(at) ? bytes(s) : vec4(0.0);
  color = s + ground * (1.0 - s.a);
}`;

/** The canvas a box draws at: its size in device pixels, as the browser lays it out where it says (`device`, the
    observer's devicePixelContentBoxSize) and the CSS box times the density else, held under EFFECT_PIXELS_MAX (past
    it the browser scales a smaller drawing up), and the device pixels a CSS pixel across and down. */
export function blobCanvas(
  W: number,
  H: number,
  dpr: number,
  device: { w: number; h: number } | null
): { w: number; h: number; kx: number; ky: number } {
  const ew = Math.round(W * dpr);
  const eh = Math.round(H * dpr);
  const exact = device && Math.abs(device.w - ew) <= 2 && Math.abs(device.h - eh) <= 2;
  let cw = exact && device ? device.w : ew;
  let ch = exact && device ? device.h : eh;
  const fit = Math.min(1, Math.sqrt(EFFECT_PIXELS_MAX / Math.max(1, cw * ch)));
  cw = Math.max(1, Math.round(cw * fit));
  ch = Math.max(1, Math.round(ch * fit));
  /* device pixels a CSS pixel: the density, or less where the canvas is held under EFFECT_PIXELS_MAX */
  return { w: cw, h: ch, kx: fit < 1 ? cw / W : dpr, ky: fit < 1 ? ch / H : dpr };
}

/** The design's map to a canvas's device pixels: a design unit is (sx, sy) device pixels, its corner at (tx, ty). */
export interface BlobMap {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}
/** The melt's texture: its corner in device pixels, the device pixels a texel spans, and its size in texels. */
export interface BlobMeltBox {
  x: number;
  y: number;
  texel: number;
  w: number;
  h: number;
}

/** The design's map for a CSS box W x H drawn at kx, ky device pixels a CSS pixel, as Chromium maps the SVG: its
    viewBox scaled to the CSS box times the density, the box's corner on the device pixel the canvas's is. */
export function blobMap(W: number, H: number, kx: number, ky: number): BlobMap {
  const f = blobFit({ width: W, height: H });
  return { sx: f.scale * kx, sy: f.scale * ky, tx: f.x * kx, ty: f.y * ky };
}

/** What a canvas of cw x ch device pixels draws through: the filter region, rounded to whole device pixels as Chromium
    crops it; the melt's texture, over what the canvas reads of the region (its pixels and the farthest scatter) and
    the blur's reach around that, where balls past the region still count, each texel BLOB_TEXELS-th of the
    deviation; and the blur's taps, its weights written into `weights` (BLOB_RADIUS + 1 of them): a Gaussian of the
    deviation in texels, less what drawing at a texel and reading between texels add (a twelfth and a sixth of a texel
    squared), truncated at three deviations as Chromium's is. */
export function blobMelt(
  look: Pick<ReturnType<typeof blobFilter>, "pad" | "melt" | "scatter">,
  map: BlobMap,
  cw: number,
  ch: number,
  weights: Float32Array
): { region: [number, number, number, number]; box: BlobMeltBox; taps: number } {
  const { pad } = look;
  const region: [number, number, number, number] = [
    Math.floor(-pad * map.sx + map.tx + 0.5),
    Math.floor(-pad * map.sy + map.ty + 0.5),
    Math.floor((BLOB_DESIGN.width + pad) * map.sx + map.tx + 0.5),
    Math.floor((BLOB_DESIGN.height + pad) * map.sy + map.ty + 0.5)
  ];
  const sigma = look.melt * Math.max(map.sx, map.sy) * BLOB_GANESH_WIDTH;
  const texel = Math.max(0.5, sigma / BLOB_TEXELS);
  const reach = Math.ceil(look.scatter * Math.max(map.sx, map.sy)) + 2;
  const x0 = Math.max(region[0], -reach);
  const y0 = Math.max(region[1], -reach);
  const x1 = Math.min(region[2], cw + reach);
  const y1 = Math.min(region[3], ch + reach);
  const margin = 3 * sigma + 2 * texel;
  const box = {
    x: x0 - margin,
    y: y0 - margin,
    texel,
    w: Math.max(1, Math.ceil((Math.max(x1, x0) - x0 + 2 * margin) / texel)),
    h: Math.max(1, Math.ceil((Math.max(y1, y0) - y0 + 2 * margin) / texel))
  };
  const s = Math.sqrt(Math.max(0.25, (sigma / texel) ** 2 - 0.25));
  const taps = Math.min(BLOB_RADIUS, Math.ceil(3 * (sigma / texel)));
  let total = 0;
  for (let i = 0; i <= BLOB_RADIUS; i++) {
    weights[i] = i <= taps ? Math.exp(-(i * i) / (2 * s * s)) : 0;
    total += i ? 2 * weights[i] : weights[i];
  }
  for (let i = 0; i <= BLOB_RADIUS; i++) weights[i] /= total;
  return { region, box, taps };
}
