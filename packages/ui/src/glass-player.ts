/* The fluted glass as WebGL: engine/glass.ts's model, drawn as its SVG draws it, the one design scaled to cover the
   canvas (glassCover) at the screen's own density, as the browser draws the still SVG, so it picks up from the
   server's still without a seam: its first frame is the still's moment, and the motion eases in from rest. Each frame
   the discs go as instanced quads into a small texture (1/q of the filter's region, q set so the blur spans about
   three texels), a blur runs across and down at that size (eleven bilinear taps a pass), and one full-size pass reads
   the baked rib map (one texelFetch) and the field at the displaced pixel (one bilinear read). The rib map is baked on
   the GPU in one pass (glass-bake.ts) for each size, angle and shape, in the frame it changes, and a recolor changes
   the discs' colors alone. Nothing is allocated per frame. It stops while the canvas is out of view or the page hidden, holds the first frame for a
   reader who asks for less motion, keeps to a frame rate where one is asked, and returns null where WebGL 2 is
   missing. */
import {
  GLASS_ANGLE,
  type GlassField,
  type GlassGeometry,
  type GlassView,
  glassColors,
  glassDiscAt,
  glassField
} from "@grabient/engine/glass.ts";
import {
  type GlassPlan,
  type GlassWindow,
  glassCover,
  glassPlan
} from "@grabient/engine/glass-render.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { glassBake } from "./glass-bake.ts";
import { createPace } from "./pace.ts";

export interface GlassPlayer {
  /** a new palette or view: the motion carries on from where it is; at speed 0 it holds its frame */
  set(palette: Palette, view: GlassView): void;
  /** back to the first frame, the still's own, from which the motion eases in again */
  rewind(): void;
  destroy(): void;
}

/** The device pixels a frame, at most (a 4K screen's): the canvas is drawn at the screen's density, as the still is,
    up to this. */
const PIXELS_MAX = 8_300_000;
/** A resize settles this long before the map is baked again. */
const SETTLE_MS = 150;
/** Seconds the motion takes from rest to its pace, as it starts and as it resumes, so a still picture comes alive
    rather than jumps. */
const EASE_S = 1.6;

const DISC_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 disc;   // middle x, y and radius in field texels (y down), core
layout(location=2) in vec3 color;
uniform vec2 uField;
out vec2 vLocal; out vec3 vColor; flat out float vCore;
void main() {
  vec2 pos = disc.xy + corner * disc.z;
  vLocal = corner; vColor = color; vCore = disc.w;
  gl_Position = vec4(pos.x / uField.x * 2.0 - 1.0, 1.0 - pos.y / uField.y * 2.0, 0.0, 1.0);
}`;
const DISC_FS = `#version 300 es
precision highp float;
in vec2 vLocal; in vec3 vColor; flat in float vCore;
out vec4 o;
void main() {
  float r = length(vLocal);
  if (r >= 1.0) discard;
  float a = r <= vCore ? 1.0 : (1.0 - r) / (1.0 - vCore);
  o = vec4(vColor * a, a);
}`;
const FULL_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;
const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform vec2 uTaps[6];
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSrc, 0));
  vec3 c = texture(uSrc, uv).rgb * uTaps[0].y;
  for (int i = 1; i < 6; i++) {
    vec2 off = uStep * uTaps[i].x;
    c += (texture(uSrc, uv + off).rgb + texture(uSrc, uv - off).rgb) * uTaps[i].y;
  }
  o = vec4(c, 1.0);
}`;
const FINAL_FS = `#version 300 es
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uFieldT;
uniform float uH;
uniform vec2 uOrigin;
uniform vec2 uOffset;
uniform vec2 uInv;
uniform float uScale;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec3 m = texelFetch(uMap, p, 0).rgb;
  vec2 s = vec2(p) + uOffset + floor(uScale * (m.rg - 0.5) + 0.5);
  vec2 f = (s + 0.5 - uOrigin) * uInv;
  vec3 c = texture(uFieldT, vec2(f.x, 1.0 - f.y)).rgb;
  o = vec4(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);
}`;

const hexRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** The glass's drawing in a WebGL 2 context: its programs and textures, laid out for a size in device pixels, an angle
    and a shape (the design covering it, its rib map baked on the GPU), colored for a palette, and drawn a frame at a
    time into the context's own framebuffer, the size laid out. The player draws its canvas with one frame after frame;
    a still (glass-still.ts) draws one frame of another into a canvas the page shares. Null where WebGL 2 cannot build
    its programs. */
export interface GlassDrawing {
  /** lays the design out for the box; true where its size changed, so the canvas takes it before the next frame */
  layout(width: number, height: number, angle: number, shape: number | null): boolean;
  /** the glass's colors (glassColors) on the discs, where they changed */
  recolor(colors: readonly string[]): void;
  /** the frame at t, seconds of the loop at speed 1 */
  draw(t: number): void;
  /** laid out and colored: a frame can be drawn */
  ready(): boolean;
}

export function createGlassDrawing(gl: WebGL2RenderingContext): GlassDrawing | null {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("no shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  };
  let pDisc: WebGLProgram;
  let pBlur: WebGLProgram;
  let pFinal: WebGLProgram;
  try {
    pDisc = program(DISC_VS, DISC_FS);
    pBlur = program(FULL_VS, BLUR_FS);
    pFinal = program(FULL_VS, FINAL_FS);
  } catch {
    return null;
  }
  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const U = {
    dField: loc(pDisc, "uField"),
    bSrc: loc(pBlur, "uSrc"),
    bStep: loc(pBlur, "uStep"),
    bTaps: loc(pBlur, "uTaps"),
    fMap: loc(pFinal, "uMap"),
    fField: loc(pFinal, "uFieldT"),
    fH: loc(pFinal, "uH"),
    fOrigin: loc(pFinal, "uOrigin"),
    fOffset: loc(pFinal, "uOffset"),
    fInv: loc(pFinal, "uInv"),
    fScale: loc(pFinal, "uScale")
  };
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  const discVao = gl.createVertexArray();
  gl.bindVertexArray(discVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
  gl.vertexAttribDivisor(2, 1);
  const fullVao = gl.createVertexArray();
  gl.bindVertexArray(fullVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const texture = (filter: number) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const mapTex = texture(gl.NEAREST);
  const baker = glassBake(gl, quad);
  if (!baker) return null;
  const fieldTex = [texture(gl.LINEAR), texture(gl.LINEAR)];
  const fbo = [gl.createFramebuffer(), gl.createFramebuffer()];

  let colors_: readonly string[] = [];
  let colorsKey = "";
  /* the drawing: the geometry and its plan once a size, an angle and a shape, the field once a palette */
  let geometry: GlassGeometry | null = null;
  let window_: GlassWindow | null = null;
  let plan: GlassPlan | null = null;
  let field: GlassField | null = null;
  let data = new Float32Array(0);
  const pos = new Float32Array(2);
  const taps = new Float32Array(12);
  let base = [0, 0, 0];

  /* the discs, colored, for the geometry: its shape draws where they stand */
  const color = () => {
    if (!geometry || !plan || !colors_.length) return;
    colorsKey = colors_.join();
    field = glassField(geometry, colors_);
    if (data.length !== 7 * field.discs.length) {
      data = new Float32Array(7 * field.discs.length);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    }
    field.discs.forEach((d, i) => {
      const c = hexRgb(d.color);
      data[7 * i + 2] = d.R / plan!.q;
      data[7 * i + 3] = field!.core;
      data[7 * i + 4] = c[0];
      data[7 * i + 5] = c[1];
      data[7 * i + 6] = c[2];
    });
    base = hexRgb(field.base);
  };
  return {
    layout(width, height, angle, shape) {
      const next = glassCover({ width, height }, 1, angle, shape);
      if (
        geometry &&
        window_ &&
        geometry.width === next.geometry.width &&
        geometry.angle === next.geometry.angle &&
        geometry.shape === next.geometry.shape &&
        window_.w === next.window.w &&
        window_.h === next.window.h
      )
        return false;
      const g = next.geometry;
      const win = next.window;
      /* another angle or shape at the same size keeps the textures, and the canvas its drawing buffer: a canvas given
         its size again throws that away, and the page waits on the compositor for the new one */
      const resized = !window_ || window_.w !== win.w || window_.h !== win.h;
      const was = plan;
      geometry = g;
      window_ = win;
      plan = glassPlan(g);
      if (resized) {
        gl.bindTexture(gl.TEXTURE_2D, mapTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, win.w, win.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      baker.bake(g, win, mapTex);
      if (resized || !was || was.fw !== plan.fw || was.fh !== plan.fh) {
        for (let i = 0; i < 2; i++) {
          gl.bindTexture(gl.TEXTURE_2D, fieldTex[i]);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            plan.fw,
            plan.fh,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            fieldTex[i],
            0
          );
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        taps.fill(0);
        plan.taps.forEach(([o, w], i) => {
          taps[2 * i] = o;
          taps[2 * i + 1] = w;
        });
      }
      color();
      return resized;
    },
    recolor(colors) {
      colors_ = colors;
      if (colors.join() !== colorsKey) color();
    },
    ready: () => !!(geometry && window_ && plan && field),
    draw(t) {
      if (!geometry || !window_ || !plan || !field) return;
      const { region } = geometry;
      const win = window_;
      const q = plan.q;
      for (let i = 0; i < field.discs.length; i++) {
        glassDiscAt(geometry, field.discs[i], t, pos, 0);
        data[7 * i] = (pos[0] - region.x) / q;
        data[7 * i + 1] = (pos[1] - region.y) / q;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      /* the field */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
      gl.viewport(0, 0, plan.fw, plan.fh);
      gl.clearColor(base[0], base[1], base[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pDisc);
      gl.uniform2f(U.dField, plan.fw, plan.fh);
      gl.bindVertexArray(discVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, field.discs.length);
      gl.disable(gl.BLEND);
      /* the blur: across into the second texture, down back into the first */
      gl.useProgram(pBlur);
      gl.bindVertexArray(fullVao);
      gl.uniform2fv(U.bTaps, taps);
      gl.uniform1i(U.bSrc, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1]);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex[0]);
      gl.uniform2f(U.bStep, 1 / plan.fw, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex[1]);
      gl.uniform2f(U.bStep, 0, 1 / plan.fh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      /* the glass */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, win.w, win.h);
      gl.useProgram(pFinal);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.uniform1i(U.fMap, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex[0]);
      gl.uniform1i(U.fField, 1);
      gl.uniform1f(U.fH, win.h);
      gl.uniform2f(U.fOrigin, region.x, region.y);
      gl.uniform2f(U.fOffset, win.x, win.y);
      gl.uniform2f(U.fInv, 1 / (q * plan.fw), 1 / (q * plan.fh));
      gl.uniform1f(U.fScale, geometry.scale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.activeTexture(gl.TEXTURE0);
    }
  };
}

export function playGlass(
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: GlassView,
  onFirstFrame?: () => void,
  /** `ease: false` starts the motion at its pace, as a card's picture under the pointer does, where a page's picture
      eases in from rest */
  options: { ease?: boolean } = {}
): GlassPlayer | null {
  const easing = options.ease === false ? 0 : EASE_S;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  if (!gl) return null;
  const drawing = createGlassDrawing(gl);
  if (!drawing) return null;
  let palette_ = palette;
  let view_ = view;
  let ready = false;
  /* the canvas's size in device pixels, as the browser lays it out, where it says (devicePixelContentBoxSize) */
  let device: { w: number; h: number } | null = null;
  /** a size, an angle or a shape the canvas now has: the design covering it, its rib map baked at once */
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    const css = canvas.getBoundingClientRect();
    /* a canvas off the page or hidden has no box: it keeps the layout it had, for the box it comes back to */
    if (!css.width || !css.height) return;
    const ew = Math.round(css.width * dpr);
    const eh = Math.round(css.height * dpr);
    /* the browser's own count where it agrees with the box at this density (an emulated density reports CSS pixels) */
    const exact = device && Math.abs(device.w - ew) <= 2 && Math.abs(device.h - eh) <= 2;
    const w0 = exact && device ? device.w : ew;
    const h0 = exact && device ? device.h : eh;
    const fit = Math.min(1, Math.sqrt(PIXELS_MAX / Math.max(1, w0 * h0)));
    const w = Math.max(1, Math.round(w0 * fit));
    const h = Math.max(1, Math.round(h0 * fit));
    drawing.recolor(glassColors(palette_));
    if (drawing.layout(w, h, view_.angle ?? GLASS_ANGLE, view_.shape ?? null)) {
      canvas.width = w;
      canvas.height = h;
    }
    ready = drawing.ready();
  };
  const draw = (t: number) => drawing.draw(t);

  /* the clock: seconds of the loop at speed 1, advanced by the speed, so a change of speed never jumps. It starts once
     the first frame, the still's own, is drawn, and eases in from rest (warm) whenever the motion starts again */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let t = 0;
  let warm = 0;
  let last = performance.now();
  let lastDrawn = -1;
  let changed = true;
  let shown = true;
  let raf = 0;
  let first = true;
  let settle = 0;
  const playing = () => shown && !document.hidden && !reduced.matches;
  const pace = createPace();
  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!playing() || view_.speed === 0) warm = 0;
    else if (ready && !first) {
      warm = Math.min(easing, warm + dt);
      const e = easing ? warm / easing : 1;
      t += dt * view_.speed * e * e * (3 - 2 * e);
    }
    if (ready) {
      const at = reduced.matches ? 0 : t;
      /* a frame where the picture changed and the frame rate has one due (pace.ts) */
      if (changed || (at !== lastDrawn && pace.due(now, view_.fps))) {
        draw(at);
        lastDrawn = at;
        changed = false;
        if (first) {
          first = false;
          onFirstFrame?.();
        }
      }
    }
    /* held at speed 0, a frame comes only with a change, which wakes the loop (set, a size, the motion setting) */
    if (playing() && view_.speed > 0) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  };
  /* the first size comes with the observer's first word, which the browser gives before the next paint */
  const sizes = new ResizeObserver(entries => {
    const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
    device = box ? { w: box.inlineSize, h: box.blockSize } : null;
    clearTimeout(settle);
    settle = window.setTimeout(
      () => {
        resize();
        changed = true;
        wake();
      },
      ready ? SETTLE_MS : 0
    );
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
  const motion = () => {
    changed = true;
    wake();
  };
  reduced.addEventListener("change", motion);
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    set(palette: Palette, view: GlassView) {
      palette_ = palette;
      const turned =
        (view.angle ?? GLASS_ANGLE) !== (view_.angle ?? GLASS_ANGLE) ||
        (view.shape ?? 0) !== (view_.shape ?? 0);
      view_ = view;
      /* another angle or shape turns the ribs or draws others: their map is baked again, in this frame */
      if (turned) resize();
      drawing.recolor(glassColors(palette));
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
      reduced.removeEventListener("change", motion);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
