/* The blob as WebGL: the same scene the SVG draws (engine/blob.ts), the one design scaled to cover the canvas as the
   SVG scales it, at the screen's own density, and drawn by the SVG's own filter as
   Chromium's GPU raster runs it, so its first frame is the still's to about a level and it takes over without a
   seam. Measured stage by stage against Chromium (W/blob-ref/proto/blob-parity):
     - the frost is feTurbulence exactly: Skia's tables (blobNoiseTables) read as Ganesh reads them, each device
       pixel's center mapped into the design, plus half a unit, times the base frequency, two octaves of four
       channels, premultiplied and kept as 8 bits. It never moves, so it is baked once a size into a texture, one
       pass on the GPU, and a frame reads it with one texelFetch;
     - the melt is a Gaussian of the filter's deviation, truncated at three, which is what Ganesh's halvings, its
       sigma-4 blur and its bilinear upscale come to: the balls are drawn small (the deviation spans TEXELS texels), the
       texture is blurred across and down, and read bilinearly at device pixels, kept as 8 bits as Chromium resolves it.
       The filter region crops what the blur gives, not what it reads;
     - feDisplacementMap reads the noise unpremultiplied and saturated and the melt at the nearest device pixel,
       floor(p + 0.5 + scale * (noise - 0.5)); the lift and the speckle are the filter's color matrices and arithmetic
       composite in float on those 8-bit values, the result kept as 8 bits and laid on the ground, which may let what is
       behind the canvas through.
   A frame costs the balls (24 instanced quads into a texture of a few thousand texels), two blur passes there,
   and one full-size pass of two texture reads and a few dozen operations. Nothing is allocated per frame. It stops
   while the canvas is out of view or the page hidden, draws the first frame alone for a reader who asks for less
   motion, and returns null where WebGL 2 is missing, which leaves whatever the page drew under it. */
import {
  BLOB_DESIGN,
  BLOB_LOOP,
  type BlobScene,
  type BlobView,
  blobFilter,
  blobFit,
  blobNoiseTables,
  blobPlaces,
  blobScene
} from "@grabient/engine/blob.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { groundParts } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { buildPrograms, knownSoftwareRenderer, softwareContext } from "./gl-build.ts";
import { createPace } from "./pace.ts";

export interface BlobPlayer {
  /** a new palette or view: the motion carries on from where it is; at speed 0 it holds its frame */
  set(palette: Palette, view: BlobView): void;
  /** back to the first frame, the still's own, from which the motion eases in again */
  rewind(): void;
  /** stop and let the context go */
  destroy(): void;
}

/** Seconds the motion takes from rest to its pace, as it starts and as it resumes, so a still picture comes alive
    rather than jumps. */
const EASE_S = 1.6;
/** The device pixels a frame, at most (a 4K screen's): the canvas is drawn at the screen's density, as the still is,
    up to this; past it the browser scales a smaller drawing up. */
const PIXELS_MAX = 8_300_000;
/** The melt's deviation in texels of its small texture: its bilinear read then errs by under a tenth of a level. */
const TEXELS = 6;
/** How much wider Ganesh's blur is than the deviation it is given: its halvings and its bilinear upscale add a little
    to the sigma-4 Gaussian between them. Fitted to Chromium's blur of a disc at densities 1, 1.5 and 2 (1.0046,
    1.0029, 1.0045); it takes the handover's mean difference down by about a sixth. */
const GANESH_WIDTH = 1.004;
/** The blur's taps either side, at most: three deviations. */
const RADIUS = 3 * TEXELS + 1;
/** A resize settles this long before the noise is baked again; the last frame covers the box meanwhile. */
const SETTLE_MS = 150;

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const DOTS_VS = `#version 300 es
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
const DOTS_FS = `#version 300 es
precision highp float;
in vec2 here;
in vec3 center;
in vec4 tint;
out vec4 color;
void main() {
  float cover = clamp(center.z - distance(floor(here) + 0.5, center.xy) + 0.5, 0.0, 1.0);
  color = vec4(tint.rgb * cover, cover);
}`;
const FULL_VS = `#version 300 es
layout(location = 0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
const BLUR_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform ivec2 step_by;
uniform int taps;
uniform float weights[${RADIUS + 1}];
out vec4 color;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(source, 0);
  vec4 sum = texelFetch(source, at, 0) * weights[0];
  for (int i = 1; i <= ${RADIUS}; i++) {
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
const NOISE_FS = `#version 300 es
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
const FINAL_FS = `#version 300 es
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

/** Plays a palette's blob into a canvas the page sizes with CSS. `onFirstFrame` is told once the first frame is on the
    canvas, so a page can fade it in over what it drew before. */
export function playBlob(
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: BlobView,
  onFirstFrame?: () => void,
  /** `ease: false` starts the motion at its pace, as a card's picture under the pointer does, where a page's picture
      eases in from rest */
  options: { ease?: boolean } = {}
): BlobPlayer | null {
  const easing = options.ease === false ? 0 : EASE_S;
  /* a renderer the page has found on the CPU plays nothing, no context made: the still stays (gl-build.ts) */
  if (knownSoftwareRenderer()) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;
  /* a renderer on the CPU plays nothing: the still stays (gl-build.ts) */
  if (softwareContext(gl)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  /* built as the GPU gets to them (gl-build.ts): the first frame waits for them, the still covering the box */
  const programs = buildPrograms(gl, [
    [DOTS_VS, DOTS_FS],
    [FULL_VS, BLUR_FS],
    [FULL_VS, NOISE_FS],
    [FULL_VS, FINAL_FS]
  ]);
  const [dots, blur, bake, final] = programs.list as [
    WebGLProgram,
    WebGLProgram,
    WebGLProgram,
    WebGLProgram
  ];
  /* the melt in half floats where they can be drawn into, so its blur adds no rounding of its own */
  const half = !!(
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
  );
  const at = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  /* read once the programs are built: reading them before waits for them */
  const locations = () => ({
    dots: at(dots, ["size"]),
    blur: at(blur, ["source", "step_by", "taps", "weights"]),
    bake: at(bake, ["lattice", "gradients", "scale", "offset", "frequency"]),
    final: at(final, [
      "melt",
      "noise",
      "canvas_h",
      "melt_origin",
      "melt_texel",
      "region",
      "scatter",
      "frosted",
      "lift",
      "gray",
      "k",
      "ground"
    ])
  });
  let U = null as ReturnType<typeof locations> | null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const instances = gl.createBuffer();
  const dotsVao = gl.createVertexArray();
  gl.bindVertexArray(dotsVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);
  const fullVao = gl.createVertexArray();
  gl.bindVertexArray(fullVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const texture = (filter: number) => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const melt = [0, 1].map(() => ({ texture: texture(gl.LINEAR), frame: gl.createFramebuffer()! }));
  const noise = { texture: texture(gl.NEAREST), frame: gl.createFramebuffer()! };
  const latticeTex = texture(gl.NEAREST);
  const gradientTex = texture(gl.NEAREST);

  /* everything a frame needs that changes only with the palette, the view or the box */
  let palette_ = palette;
  let view_ = view;
  let scene: BlobScene;
  let look: ReturnType<typeof blobFilter>;
  let tablesSeed = -1;
  let data = new Float32Array(0);
  let ground = [0, 0, 0, 0];
  /* the device map: a design unit is (sx, sy) device pixels, its corner at (tx, ty) */
  let map = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let canvasSize = { w: 1, h: 1 };
  let meltBox = { x: 0, y: 0, texel: 1, w: 1, h: 1 };
  /* the melt textures' size as last made */
  let made = { w: 0, h: 0 };
  let regionPx = [0, 0, 1, 1];
  const weights = new Float32Array(RADIUS + 1);
  let taps = 0;
  /* whether the noise texture holds this size's and this seed's noise */
  let baked = false;

  /** the scene, its colors and its numbers, for the palette and the view */
  const prepare = () => {
    scene = blobScene(palette_, BLOB_DESIGN, view_);
    look = blobFilter(view_, BLOB_DESIGN, scene);
    const n = scene.blobs.reduce((sum, b) => sum + b.balls.length, 0);
    if (data.length !== 8 * n) {
      data = new Float32Array(8 * n);
      gl.bindBuffer(gl.ARRAY_BUFFER, instances);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    }
    let i = 0;
    for (const blob of scene.blobs)
      for (const b of blob.balls) {
        const [r, g, bl] = hexBytes(scene.color(b.at)).map(v => v / 255);
        data[8 * i + 4] = r;
        data[8 * i + 5] = g;
        data[8 * i + 6] = bl;
        data[8 * i + 7] = 1;
        i++;
      }
    if (scene.backdrop) {
      const { hex, alpha } = groundParts(scene.backdrop);
      ground = [...hexBytes(hex).map(v => (v / 255) * alpha), alpha];
    } else ground = [0, 0, 0, 0];
    if (look.seed !== tablesSeed) {
      const { lattice, gradients } = blobNoiseTables(look.seed);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, latticeTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8UI,
        256,
        1,
        0,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        lattice
      );
      gl.bindTexture(gl.TEXTURE_2D, gradientTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, gradients);
      tablesSeed = look.seed;
      baked = false;
    }
  };

  /* the canvas's size in device pixels, as the browser lays it out, where it says (devicePixelContentBoxSize) */
  let device: { w: number; h: number } | null = null;
  /* the box last measured, in CSS pixels, and device pixels a CSS pixel */
  let box = { W: 1, H: 1, kx: 1, ky: 1 };
  /** the canvas at its size: the design's map to its pixels, as Chromium maps the SVG (its viewBox scaled to the CSS
      box times the density, the box's corner on the device pixel the canvas's is), the filter region, the melt's
      texture and the blur's weights. `measure` reads the box again and sizes the canvas to it; a palette or a look
      alone (set) keeps the box measured last, whose read would lay the page out in the middle of a drag, and makes
      the textures again only for another size. */
  const layout = (measure = true): boolean => {
    if (measure) {
      const rect = canvas.getBoundingClientRect();
      /* a canvas off the page or hidden has no box: it keeps the layout it had, for the box it comes back to */
      if (!rect.width || !rect.height) return false;
      const W = Math.max(1, rect.width);
      const H = Math.max(1, rect.height);
      const dpr = devicePixelRatio || 1;
      const ew = Math.round(W * dpr);
      const eh = Math.round(H * dpr);
      const exact = device && Math.abs(device.w - ew) <= 2 && Math.abs(device.h - eh) <= 2;
      let cw = exact && device ? device.w : ew;
      let ch = exact && device ? device.h : eh;
      const fit = Math.min(1, Math.sqrt(PIXELS_MAX / Math.max(1, cw * ch)));
      cw = Math.max(1, Math.round(cw * fit));
      ch = Math.max(1, Math.round(ch * fit));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      if (canvasSize.w !== cw || canvasSize.h !== ch) baked = false;
      canvasSize = { w: cw, h: ch };
      /* device pixels a CSS pixel: the density, or less where the canvas is held under PIXELS_MAX */
      box = { W, H, kx: fit < 1 ? cw / W : dpr, ky: fit < 1 ? ch / H : dpr };
    }
    const { W, H, kx, ky } = box;
    const cw = canvasSize.w;
    const ch = canvasSize.h;
    const f = blobFit({ width: W, height: H });
    const next = { sx: f.scale * kx, sy: f.scale * ky, tx: f.x * kx, ty: f.y * ky };
    if (next.sx !== map.sx || next.sy !== map.sy || next.tx !== map.tx || next.ty !== map.ty)
      baked = false;
    map = next;
    /* the filter region, rounded to whole device pixels as Chromium crops it */
    const { pad } = look;
    regionPx = [
      Math.floor(-pad * map.sx + map.tx + 0.5),
      Math.floor(-pad * map.sy + map.ty + 0.5),
      Math.floor((BLOB_DESIGN.width + pad) * map.sx + map.tx + 0.5),
      Math.floor((BLOB_DESIGN.height + pad) * map.sy + map.ty + 0.5)
    ];
    /* the melt: over what the canvas reads of the region (its pixels and the farthest scatter), and the blur's reach
       around that, where balls past the region still count, each texel TEXELS-th of the deviation */
    const sigma = look.melt * Math.max(map.sx, map.sy) * GANESH_WIDTH;
    const texel = Math.max(0.5, sigma / TEXELS);
    const reach = Math.ceil(look.scatter * Math.max(map.sx, map.sy)) + 2;
    const x0 = Math.max(regionPx[0], -reach);
    const y0 = Math.max(regionPx[1], -reach);
    const x1 = Math.min(regionPx[2], cw + reach);
    const y1 = Math.min(regionPx[3], ch + reach);
    const margin = 3 * sigma + 2 * texel;
    meltBox = {
      x: x0 - margin,
      y: y0 - margin,
      texel,
      w: Math.max(1, Math.ceil((Math.max(x1, x0) - x0 + 2 * margin) / texel)),
      h: Math.max(1, Math.ceil((Math.max(y1, y0) - y0 + 2 * margin) / texel))
    };
    /* the blur's weights: a Gaussian of the deviation in texels, less what drawing at a texel and reading between
       texels add (a twelfth and a sixth of a texel squared), truncated at three deviations as Chromium's is */
    const s = Math.sqrt(Math.max(0.25, (sigma / texel) ** 2 - 0.25));
    taps = Math.min(RADIUS, Math.ceil(3 * (sigma / texel)));
    let total = 0;
    for (let i = 0; i <= RADIUS; i++) {
      weights[i] = i <= taps ? Math.exp(-(i * i) / (2 * s * s)) : 0;
      total += i ? 2 * weights[i] : weights[i];
    }
    for (let i = 0; i <= RADIUS; i++) weights[i] /= total;
    if (!measure && meltBox.w === made.w && meltBox.h === made.h) return true;
    made = { w: meltBox.w, h: meltBox.h };
    const format = half ? gl.RGBA16F : gl.RGBA8;
    const type = half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    for (const { texture: t, frame } of melt) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, meltBox.w, meltBox.h, 0, gl.RGBA, type, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  };

  /** the frost's noise at every device pixel, once a size and seed */
  const bakeNoise = () => {
    U ??= locations();
    const u = U.bake;
    const { w, h } = canvasSize;
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, noise.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noise.texture, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bake);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, latticeTex);
    gl.uniform1i(u.lattice, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gradientTex);
    gl.uniform1i(u.gradients, 1);
    gl.uniform2f(u.scale, map.sx, map.sy);
    gl.uniform2f(u.offset, map.tx, map.ty);
    gl.uniform1f(u.frequency, look.frequency);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    baked = true;
  };

  const draw = (f: number) => {
    U ??= locations();
    if (look.noise && !baked) bakeNoise();
    /* the balls, small: each a quad its own color covers, painted in the file's order */
    const { texel } = meltBox;
    const n = data.length / 8;
    blobPlaces(scene, f, data, 8);
    for (let i = 0; i < 8 * n; i += 8) {
      data[i] = (data[i] * map.sx + map.tx - meltBox.x) / texel;
      data[i + 1] = (data[i + 1] * map.sy + map.ty - meltBox.y) / texel;
      data[i + 2] = (data[i + 2] * map.sx) / texel;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.viewport(0, 0, meltBox.w, meltBox.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dots);
    gl.uniform2f(U.dots.size, meltBox.w, meltBox.h);
    gl.bindVertexArray(dotsVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.BLEND);
    /* the melt: across, then down */
    gl.useProgram(blur);
    gl.bindVertexArray(fullVao);
    gl.uniform1i(U.blur.taps, taps);
    gl.uniform1fv(U.blur.weights, weights);
    gl.uniform1i(U.blur.source, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[1].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform2i(U.blur.step_by, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[1].texture);
    gl.uniform2i(U.blur.step_by, 0, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    /* every pixel: the frost's scatter, the lift of the edge, the speckle, the ground */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasSize.w, canvasSize.h);
    gl.useProgram(final);
    const u = U.final;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform1i(u.melt, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.uniform1i(u.noise, 1);
    gl.uniform1f(u.canvas_h, canvasSize.h);
    gl.uniform2f(u.melt_origin, meltBox.x, meltBox.y);
    gl.uniform1f(u.melt_texel, texel);
    gl.uniform4f(u.region, regionPx[0], regionPx[1], regionPx[2], regionPx[3]);
    gl.uniform2f(u.scatter, look.scatter * map.sx, look.scatter * map.sy);
    gl.uniform1i(u.frosted, look.noise ? 1 : 0);
    gl.uniform2f(u.lift, look.slope, look.lift);
    gl.uniform2f(u.gray, look.contrast, look.gray);
    gl.uniform2f(u.k, look.k1, look.k2);
    gl.uniform4f(u.ground, ground[0], ground[1], ground[2], ground[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  };

  /* the clock: seconds of the loop at speed 1, advanced by the speed, so a change of speed never jumps. It starts once
     the first frame, the still's own, is drawn, eases in from rest (warm) whenever the motion starts again, and holds
     at speed 0. A frame is drawn when it changes and the frame rate has one due (pace.ts) */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let t = 0;
  let warm = 0;
  let last = performance.now();
  let shown = true;
  let raf = 0;
  let first = true;
  let drawn = -1;
  let changed = true;
  let settle = 0;
  /* whether the canvas has its size: the observer's first word, which the browser gives before the next paint */
  let sized = false;
  const moving = () => shown && !document.hidden && !reduced.matches && view_.speed > 0;
  const pace = createPace();
  const share = () => (reduced.matches ? 0 : (t / BLOB_LOOP) % 1);
  const tick = (now: number) => {
    raf = 0;
    if (!sized) return;
    /* the programs: each frame asks again while the GPU builds them; where they failed, the still stays */
    const built = programs.built();
    if (!built) {
      if (built === false) raf = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!moving()) warm = 0;
    else if (!first) {
      warm = Math.min(easing, warm + dt);
      const e = easing ? warm / easing : 1;
      t += dt * view_.speed * e * e * (3 - 2 * e);
    }
    const at = share();
    if (changed || (at !== drawn && pace.due(now, view_.fps))) {
      draw(at);
      drawn = at;
      changed = false;
    }
    if (first) {
      first = false;
      onFirstFrame?.();
    }
    if (moving()) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  prepare();

  /* the size the observer reports in device pixels, the canvas's own: its first word with a box is taken at once,
     before the first frame, and later ones settle before the noise is baked again, the last frame covering the box
     meanwhile. A canvas made off the page (a card's player made ahead) hears a first word with no box, and draws
     nothing until it has one: its textures are made with its first layout */
  const sizes = new ResizeObserver(entries => {
    const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
    device = box ? { w: box.inlineSize, h: box.blockSize } : null;
    clearTimeout(settle);
    const apply = () => {
      if (!layout() && !sized) return;
      sized = true;
      changed = true;
      wake();
    };
    if (!sized) apply();
    else settle = window.setTimeout(apply, SETTLE_MS);
  });
  try {
    sizes.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    sizes.observe(canvas);
  }
  const sight = new IntersectionObserver(entries => {
    shown = entries.some(e => e.isIntersecting);
    if (shown) wake();
  });
  sight.observe(canvas);
  const visible = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener("visibilitychange", visible);
  reduced.addEventListener("change", wake);
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    set(palette: Palette, view: BlobView) {
      palette_ = palette;
      view_ = view;
      prepare();
      if (sized) layout(false);
      changed = true;
      wake();
    },
    rewind() {
      t = 0;
      warm = 0;
      changed = true;
      wake();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(settle);
      sizes.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", visible);
      reduced.removeEventListener("change", wake);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
