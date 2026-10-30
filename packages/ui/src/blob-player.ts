/* The blob as WebGL: the same scene the SVG draws (engine/blob.ts), played by the GPU at any size. Each frame the balls
   are drawn small into a texture, the texture is blurred across and down, and one pass over every pixel reads the melt
   through the frost's scatter, lifts its edge and speckles it, as the SVG's filter and the still frame do. The melt is
   blurred at a scale where its blur is a few texels wide, so a full screen costs a texture of a few thousand texels and
   one cheap pass. It stops while the canvas is out of view or the page hidden, draws the first frame alone for a reader
   who asks for less motion, and returns null where WebGL 2 is missing, which leaves whatever the page drew under it. */
import {
  BLOB_LOOP,
  type BlobScene,
  type BlobView,
  blobFrame,
  blobLook,
  blobScene
} from "@grabient/engine/blob.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import type { Palette } from "@grabient/engine/palette.ts";

export interface BlobPlayer {
  /** a new palette or view: the motion carries on from where it is */
  set(palette: Palette, view: BlobView): void;
  /** stop and let the context go */
  destroy(): void;
}

/** How many device pixels a canvas draws at most: a larger box draws fewer, and the browser scales them up. */
const BUDGET = 4_200_000;
/** The melt's blur, in texels of the small texture: wide enough that the texture's own pixels never show. */
const TEXELS = 6;
const MAX_TAPS = 24;

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const DOTS_VS = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 disc;  // middle x, y and radius, in texels, and 0
layout(location = 2) in vec4 paint; // color, and 1
uniform vec2 texture_size;
out vec2 here;
out vec3 center;
out vec4 tint;
void main() {
  vec2 at = disc.xy + (corner * 2.0 - 1.0) * (disc.z + 1.0);
  here = at;
  center = disc.xyz;
  tint = paint;
  gl_Position = vec4(at / texture_size * 2.0 - 1.0, 0.0, 1.0);
}`;
const DOTS_FS = `#version 300 es
precision highp float;
in vec2 here;
in vec3 center;
in vec4 tint;
out vec4 color;
void main() {
  float cover = clamp(center.z - distance(here, center.xy) + 0.5, 0.0, 1.0);
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
uniform float weights[${MAX_TAPS + 1}];
out vec4 color;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(source, 0);
  vec4 sum = vec4(0.0);
  for (int i = -${MAX_TAPS}; i <= ${MAX_TAPS}; i++) {
    if (abs(i) > taps) continue;
    ivec2 p = at + step_by * i;
    if (p.x < 0 || p.y < 0 || p.x >= size.x || p.y >= size.y) continue;
    sum += texelFetch(source, p, 0) * weights[abs(i)];
  }
  color = sum;
}`;
const FINAL_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D melt;
uniform vec2 canvas_size;   // device pixels
uniform float pad;          // device pixels past the box the texture reaches
uniform float texel;        // device pixels a texel spans
uniform float scatter;      // device pixels
uniform float slope;
uniform float speckle;
uniform float contrast;
uniform uint seed;
uniform vec4 ground;        // the ground's color and 1, or 0s for none
out vec4 color;
uint mixbits(uint n) {
  n = (n ^ (n >> 16u)) * 0x7feb352du;
  n = (n ^ (n >> 15u)) * 0x846ca68bu;
  return n ^ (n >> 16u);
}
float near(uint bits) {
  return 0.5 + (float(bits & 255u) + float((bits >> 8u) & 255u) - 255.0) * (0.292 / 255.0);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, canvas_size.y - gl_FragCoord.y);
  uint p = uint(px.y) * 65536u + uint(px.x);
  uint a = mixbits((2u * p) ^ seed);
  uint b = mixbits((2u * p + 1u) ^ seed);
  vec2 shift = scatter * vec2(near(a) - 0.5, near(a >> 16u) - 0.5);
  vec2 uv = (px + shift + pad) / texel / vec2(textureSize(melt, 0));
  vec4 m = texture(melt, uv);
  float lift = m.a > 0.0 ? clamp(slope * m.a + 0.5 - slope / 2.0, 0.0, 1.0) : 0.0;
  float alpha = min(1.0, lift * (1.0 + speckle));
  float grain = 1.0 - speckle + 2.0 * speckle * clamp(0.5 + contrast * (near(b) - 0.5), 0.0, 1.0);
  vec3 lit = alpha > 0.0 ? min(vec3(alpha), m.rgb / max(m.a, 1e-5) * lift * grain) : vec3(0.0);
  color = ground.a > 0.0 ? vec4(lit + ground.rgb * (1.0 - alpha), 1.0) : vec4(lit, alpha);
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

/** Plays a palette's blob into a canvas the page sizes with CSS. `onFirstFrame` is told once the first frame is on the
    canvas, so a page can fade it in over what it drew before. */
export function playBlob(
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: BlobView,
  onFirstFrame?: () => void
): BlobPlayer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false
  });
  if (!gl) return null;
  let dots: WebGLProgram;
  let blur: WebGLProgram;
  let final: WebGLProgram;
  try {
    dots = program(gl, DOTS_VS, DOTS_FS);
    blur = program(gl, FULL_VS, BLUR_FS);
    final = program(gl, FULL_VS, FINAL_FS);
  } catch {
    return null;
  }

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

  const target = () => {
    const texture = gl.createTexture()!;
    const frame = gl.createFramebuffer()!;
    return { texture, frame };
  };
  const melt = [target(), target()];

  /* everything a frame needs that changes only with the palette, the view or the box */
  let palette_ = palette;
  let view_ = view;
  let scene: BlobScene;
  let look: ReturnType<typeof blobLook>;
  let rgb = new Map<string, number[]>();
  let size = { width: 1, height: 1 };
  let dpr = 1;
  let texel = 1;
  let padPx = 0;
  let small = { width: 1, height: 1 };
  let weights = new Float32Array(MAX_TAPS + 1);
  let taps = 0;
  let ground = [0, 0, 0, 0];

  const layout = () => {
    const box = canvas.getBoundingClientRect();
    size = {
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height))
    };
    dpr = Math.min(devicePixelRatio || 1, 2);
    const area = size.width * size.height * dpr * dpr;
    if (area > BUDGET) dpr *= Math.sqrt(BUDGET / area);
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    scene = blobScene(palette_, size, view_);
    look = blobLook(view_, size, scene);
    rgb = new Map();
    for (const blob of scene.blobs)
      for (const b of blob.balls) {
        const hex = scene.color(b.at);
        rgb.set(
          hex,
          hexBytes(hex).map(v => v / 255)
        );
      }
    ground = scene.backdrop ? [...hexBytes(scene.backdrop).map(v => v / 255), 1] : [0, 0, 0, 0];
    const meltPx = look.melt * dpr;
    texel = Math.max(1, meltPx / TEXELS);
    padPx = look.pad * dpr;
    small = {
      width: Math.ceil((canvas.width + 2 * padPx) / texel),
      height: Math.ceil((canvas.height + 2 * padPx) / texel)
    };
    const sigma = meltPx / texel;
    taps = Math.min(MAX_TAPS, Math.ceil(3 * sigma));
    weights = new Float32Array(MAX_TAPS + 1);
    let total = 0;
    for (let i = 0; i <= taps; i++) {
      weights[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
      total += i ? 2 * weights[i] : weights[i];
    }
    for (let i = 0; i <= taps; i++) weights[i] /= total;
    for (const { texture, frame } of melt) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        small.width,
        small.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const draw = (f: number) => {
    /* the balls, small: each a quad its own color covers, painted in the file's order */
    const frame = blobFrame(scene, f, view_.depth);
    const data = new Float32Array(frame.length * 8);
    frame.forEach((d, i) => {
      const [r, g, b] = rgb.get(d.color) ?? [0, 0, 0];
      data.set(
        [
          (d.x * dpr + padPx) / texel,
          (d.y * dpr + padPx) / texel,
          (d.r * dpr) / texel,
          0,
          r,
          g,
          b,
          1
        ],
        i * 8
      );
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.viewport(0, 0, small.width, small.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dots);
    gl.uniform2f(gl.getUniformLocation(dots, "texture_size"), small.width, small.height);
    gl.bindVertexArray(dotsVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.length);
    gl.disable(gl.BLEND);
    /* the melt: across, then down */
    gl.useProgram(blur);
    gl.bindVertexArray(fullVao);
    gl.uniform1i(gl.getUniformLocation(blur, "taps"), taps);
    gl.uniform1fv(gl.getUniformLocation(blur, "weights"), weights);
    gl.uniform1i(gl.getUniformLocation(blur, "source"), 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const [from, to, step] of [
      [0, 1, [1, 0]],
      [1, 0, [0, 1]]
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, melt[to].frame);
      gl.bindTexture(gl.TEXTURE_2D, melt[from].texture);
      gl.uniform2i(gl.getUniformLocation(blur, "step_by"), step[0], step[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    /* every pixel: the frost's scatter, the lift of the edge, the speckle, the ground */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(final);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    const u = (name: string) => gl.getUniformLocation(final, name);
    gl.uniform1i(u("melt"), 0);
    gl.uniform2f(u("canvas_size"), canvas.width, canvas.height);
    gl.uniform1f(u("pad"), padPx);
    gl.uniform1f(u("texel"), texel);
    gl.uniform1f(u("scatter"), look.scatter * dpr);
    gl.uniform1f(u("slope"), look.slope);
    gl.uniform1f(u("speckle"), look.speckle);
    gl.uniform1f(u("contrast"), look.contrast);
    gl.uniform1ui(u("seed"), Math.imul(scene.seed + 1, 0x9e3779b1) >>> 0);
    gl.uniform4f(u("ground"), ground[0], ground[1], ground[2], ground[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  /* the clock: a share of the loop, carried over when the speed changes so the motion never jumps */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let started = performance.now();
  let shown = true;
  let raf = 0;
  let first = true;
  const share = (now: number) =>
    reduced.matches ? 0 : ((((now - started) / 1000) * view_.speed) / BLOB_LOOP) % 1;
  const tick = (now: number) => {
    raf = 0;
    draw(share(now));
    if (first) {
      first = false;
      onFirstFrame?.();
    }
    if (shown && !reduced.matches && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  layout();
  wake();

  const sizes = new ResizeObserver(() => {
    layout();
    wake();
  });
  sizes.observe(canvas);
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
      const now = performance.now();
      const at = share(now);
      palette_ = palette;
      if (view.speed !== view_.speed) started = now - ((at * BLOB_LOOP) / view.speed) * 1000;
      view_ = view;
      layout();
      wake();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      sizes.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", visible);
      reduced.removeEventListener("change", wake);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
