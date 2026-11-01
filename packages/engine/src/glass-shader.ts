/* The fluted glass as shader code, each text drawing what the site's player draws (ui/glass-player.ts) at the same size
   and time: its WebGL page runs the player's own GLSL (glass-gl.ts) on the numbers the player works out, its WebGPU
   page the same passes in WGSL, and its Shadertoy tabs work the numbers out on the GPU. Each starts with the credit
   the palette's shaders carry (shader.ts): the seed, the effect's address and what the text is. The editor loads this
   module with the Shader tab of an effect, never with a page's start. */
import { type Effect, effectAddressParts } from "./effect.ts";
import { GLASS_ANGLE } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import {
  GLASS_BAKE_FS,
  GLASS_BLUR_FS,
  GLASS_DISC_FS,
  GLASS_DISC_VS,
  GLASS_FINAL_FS,
  GLASS_FULL_VS
} from "./glass-gl.ts";
import { GLASS_CLOCK, GLASS_MODEL, glassPageHtml } from "./glass-page.ts";
import { glassShadertoy } from "./glass-shadertoy.ts";
import {
  GLASS_BAKE_WGSL,
  GLASS_BLUR_WGSL,
  GLASS_DISC_WGSL,
  GLASS_FINAL_WGSL
} from "./glass-wgsl.ts";
import type { Palette } from "./palette.ts";

/** The kinds of glass shader code: three texts and two pages that run them, as the palette's Shader tab offers. */
export type GlassShaderKind = "shadertoy" | "glsl" | "wgsl" | "webgl" | "webgpu";
export const GLASS_SHADER_KINDS: readonly GlassShaderKind[] = [
  "shadertoy",
  "glsl",
  "wgsl",
  "webgl",
  "webgpu"
];

/** Seconds the motion takes from rest to its pace, as the site's player eases in. */
const EASE_S = 1.6;

const WHAT: Record<GlassShaderKind, string> = {
  shadertoy:
    "fluted glass in Shadertoy: paste each section into the tab it names and set its channels as its header says",
  glsl: "fluted glass: the GLSL ES 3.00 passes its WebGL page runs",
  wgsl: "fluted glass: the WGSL passes its WebGPU page runs",
  webgl: "fluted glass, drawn by WebGL 2",
  webgpu: "fluted glass, drawn by WebGPU"
};

/** The credit every text carries: the seed, the effect's address where an origin is given, and what the text is. */
export function glassShaderCredit(
  kind: GlassShaderKind,
  seed: string,
  effect: Effect,
  angle: number,
  origin?: string
): string[] {
  const lines = [`grabient ${seed}`];
  if (origin)
    lines.push(
      `${origin.replace(/\/$/, "")}/${seed}?${effectAddressParts(effect, angle).join("&")}`
    );
  lines.push(WHAT[kind]);
  return lines;
}

/** The settings a reader edits, as the page's JavaScript names them. */
function settingsJs(P: Palette, effect: Effect, angle: number): string {
  return `// The glass's colors, the angle its ribs run at (${GLASS_ANGLE} as designed), its shape (0 as designed, up to 999), how fast
// it plays (1 as designed, 0 holds the first frame), frames a second at most, and the seconds it takes to ease in.
const COLORS = [${glassColors(P)
    .map(c => `"${c}"`)
    .join(", ")}];
const ANGLE = ${angle};
const SHAPE = ${effect.look.shape ?? 0};
const SPEED = ${effect.speed};
const FPS = ${effect.fps};
const EASE = ${EASE_S};`;
}

const WEBGL_SHADERS = [
  ["disc-vs", "x-shader/x-vertex", GLASS_DISC_VS],
  ["disc-fs", "x-shader/x-fragment", GLASS_DISC_FS],
  ["full-vs", "x-shader/x-vertex", GLASS_FULL_VS],
  ["blur-fs", "x-shader/x-fragment", GLASS_BLUR_FS],
  ["final-fs", "x-shader/x-fragment", GLASS_FINAL_FS],
  ["bake-fs", "x-shader/x-fragment", GLASS_BAKE_FS]
] as const;

/* The player's drawing (ui/glass-player.ts createGlassDrawing, glass-bake.ts) in the page: the same textures, passes
   and uniforms, so each frame's GPU work is the player's. */
const WEBGL_DRAWING = `const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false
});
if (gl) play(gl);
else document.body.textContent = "This page needs WebGL 2, which this browser does not have.";

function play(gl) {
  const compile = (type, id) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, document.getElementById(id).textContent);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const link = (vertex, fragment) => {
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  };
  const full = compile(gl.VERTEX_SHADER, "full-vs");
  const pDisc = link(compile(gl.VERTEX_SHADER, "disc-vs"), compile(gl.FRAGMENT_SHADER, "disc-fs"));
  const pBlur = link(full, compile(gl.FRAGMENT_SHADER, "blur-fs"));
  const pFinal = link(full, compile(gl.FRAGMENT_SHADER, "final-fs"));
  const pBake = link(full, compile(gl.FRAGMENT_SHADER, "bake-fs"));
  const at = (program, name) => gl.getUniformLocation(program, name);
  const U = {
    dField: at(pDisc, "uField"),
    bSrc: at(pBlur, "uSrc"),
    bStep: at(pBlur, "uStep"),
    bTaps: at(pBlur, "uTaps"),
    fMap: at(pFinal, "uMap"),
    fField: at(pFinal, "uFieldT"),
    fH: at(pFinal, "uH"),
    fOrigin: at(pFinal, "uOrigin"),
    fOffset: at(pFinal, "uOffset"),
    fInv: at(pFinal, "uInv"),
    fScale: at(pFinal, "uScale"),
    kRibs: at(pBake, "uRibs"),
    kCount: at(pBake, "uCount"),
    kStops: at(pBake, "uStops"),
    kOrigin: at(pBake, "uOrigin"),
    kLine: at(pBake, "uLine"),
    kNormals: at(pBake, "uNormals"),
    kShade: at(pBake, "uShade")
  };
  // Two triangles over a target, and the discs as instances of them: middle, radius and core, then color.
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
  const texture = filter => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // The rib map (the window's size), the ribs and their stops a row each, and the field and its blur.
  const mapTex = texture(gl.NEAREST);
  const ribsTex = texture(gl.NEAREST);
  const bakeFbo = gl.createFramebuffer();
  const fieldTex = [texture(gl.LINEAR), texture(gl.LINEAR)];
  const fbo = [gl.createFramebuffer(), gl.createFramebuffer()];

  let geo = null;
  let win = null;
  let pl = null;
  let fld = null;
  let stale = false;
  let data = new Float32Array(0);
  const pos = new Float32Array(2);
  const taps = new Float32Array(12);
  let base = [0, 0, 0];

  // The colors' discs for the layout.
  const color = () => {
    fld = field(geo, COLORS);
    if (data.length !== 7 * fld.discs.length) {
      data = new Float32Array(7 * fld.discs.length);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    }
    fld.discs.forEach((d, i) => {
      const c = hexRgb(d.color);
      data[7 * i + 2] = d.R / pl.q;
      data[7 * i + 3] = fld.core;
      data[7 * i + 4] = c[0];
      data[7 * i + 5] = c[1];
      data[7 * i + 6] = c[2];
    });
    base = hexRgb(fld.base);
  };

  // The design covering the canvas, the textures its size, and the rib map baked with the next frame.
  const layout = (w, h) => {
    const next = cover(w, h, ANGLE, SHAPE);
    if (
      geo &&
      geo.width === next.geometry.width &&
      geo.angle === next.geometry.angle &&
      geo.shape === next.geometry.shape &&
      win.w === next.window.w &&
      win.h === next.window.h
    )
      return;
    const resized = !win || win.w !== next.window.w || win.h !== next.window.h;
    const was = pl;
    geo = next.geometry;
    win = next.window;
    pl = plan(geo);
    if (resized) {
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, win.w, win.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    stale = true;
    if (resized || !was || was.fw !== pl.fw || was.fh !== pl.fh) {
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, fieldTex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pl.fw, pl.fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex[i], 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      taps.fill(0);
      pl.taps.forEach(([o, w], i) => {
        taps[2 * i] = o;
        taps[2 * i + 1] = w;
      });
    }
    color();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  // The rib map: each pixel's displacement and light, in one pass.
  const normals = new Float32Array(17 * 3);
  const shade = new Float32Array(17);
  const bake = () => {
    const list = geo.ribs;
    const stops = list[0]?.stops.length ?? 0;
    const width = 1 + stops;
    const rows = new Float32Array(width * list.length * 4);
    list.forEach((r, i) => {
      const row = i * width * 4;
      rows[row] = r.cx;
      rows[row + 1] = r.cy;
      rows[row + 2] = r.r * r.r;
      r.stops.forEach(([o, v], k) => {
        rows[row + 4 * (1 + k)] = o;
        rows[row + 4 * (1 + k) + 1] = v;
      });
    });
    gl.bindTexture(gl.TEXTURE_2D, ribsTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, Math.max(1, list.length), 0, gl.RGBA, gl.FLOAT, rows);
    geo.normal.stops.forEach(([o, r, g], k) => {
      normals[3 * k] = o;
      normals[3 * k + 1] = r;
      normals[3 * k + 2] = g;
    });
    geo.shadeTable.forEach((v, k) => {
      shade[k] = v;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mapTex, 0);
    gl.viewport(0, 0, win.w, win.h);
    gl.disable(gl.BLEND);
    gl.useProgram(pBake);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ribsTex);
    gl.uniform1i(U.kRibs, 0);
    gl.uniform1i(U.kCount, list.length);
    gl.uniform1i(U.kStops, stops);
    gl.uniform2f(U.kOrigin, win.x, win.y);
    const n = geo.normal;
    gl.uniform4f(U.kLine, n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
    gl.uniform3fv(U.kNormals, normals);
    gl.uniform1fv(U.kShade, shade);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  // A frame: the discs into the field, the blur across and down, and the glass over the canvas.
  const draw = t => {
    if (stale) {
      bake();
      stale = false;
    }
    const { region } = geo;
    const q = pl.q;
    for (let i = 0; i < fld.discs.length; i++) {
      discAt(geo, fld.discs[i], t, pos, 0);
      data[7 * i] = (pos[0] - region.x) / q;
      data[7 * i + 1] = (pos[1] - region.y) / q;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
    gl.viewport(0, 0, pl.fw, pl.fh);
    gl.clearColor(base[0], base[1], base[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pDisc);
    gl.uniform2f(U.dField, pl.fw, pl.fh);
    gl.bindVertexArray(discVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fld.discs.length);
    gl.disable(gl.BLEND);
    gl.useProgram(pBlur);
    gl.bindVertexArray(fullVao);
    gl.uniform2fv(U.bTaps, taps);
    gl.uniform1i(U.bSrc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1]);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[0]);
    gl.uniform2f(U.bStep, 1 / pl.fw, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[1]);
    gl.uniform2f(U.bStep, 0, 1 / pl.fh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    gl.uniform2f(U.fInv, 1 / (q * pl.fw), 1 / (q * pl.fh));
    gl.uniform1f(U.fScale, geo.scale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  };

${indent(GLASS_CLOCK)}
}`;

function indent(text: string): string {
  return text
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");
}

/** The WebGL page: the player's passes (glass-gl.ts) on the numbers the player works out. */
function webglPage(
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  const code = `${settingsJs(P, effect, angle)}

${GLASS_MODEL}

${WEBGL_DRAWING}`;
  return glassPageHtml(
    glassShaderCredit("webgl", seed, effect, angle, origin),
    seed,
    WEBGL_SHADERS,
    code,
    false
  );
}

const WEBGPU_SHADERS = [
  ["disc", "text/wgsl", GLASS_DISC_WGSL],
  ["blur", "text/wgsl", GLASS_BLUR_WGSL],
  ["glass", "text/wgsl", GLASS_FINAL_WGSL],
  ["bake", "text/wgsl", GLASS_BAKE_WGSL]
] as const;

/* The player's drawing in WebGPU: the same textures, laid out as the player's, the same passes and the same numbers. */
const WEBGPU_DRAWING = `const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
const device = await adapter?.requestDevice().catch(() => null);
if (device) play(device);
else document.body.textContent = "This page needs WebGPU, which this browser does not have.";

function play(device) {
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = id => device.createShaderModule({ code: document.getElementById(id).textContent });
  // Two triangles over a target, and the discs as instances of them: middle, radius and core, then color.
  const QUAD = [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }];
  const pipeline = (id, target, buffers, blend) => {
    const code = module(id);
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module: code, entryPoint: "vs_main", buffers },
      fragment: { module: code, entryPoint: "fs_main", targets: [{ format: target, blend }] },
      primitive: { topology: "triangle-strip" }
    });
  };
  const over = { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" };
  const pDisc = pipeline(
    "disc",
    "rgba8unorm",
    [
      ...QUAD,
      {
        arrayStride: 28,
        stepMode: "instance",
        attributes: [
          { shaderLocation: 1, offset: 0, format: "float32x4" },
          { shaderLocation: 2, offset: 16, format: "float32x3" }
        ]
      }
    ],
    { color: over, alpha: over }
  );
  const pBlur = pipeline("blur", "rgba8unorm", QUAD);
  const pFinal = pipeline("glass", format, QUAD);
  const pBake = pipeline("bake", "rgba8unorm", QUAD);
  const buffer = (size, usage) => device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST });
  const quad = buffer(32, GPUBufferUsage.VERTEX);
  device.queue.writeBuffer(quad, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  const uField = buffer(16, GPUBufferUsage.UNIFORM);
  const uAcross = buffer(112, GPUBufferUsage.UNIFORM);
  const uDown = buffer(112, GPUBufferUsage.UNIFORM);
  const uGlass = buffer(32, GPUBufferUsage.UNIFORM);
  const uBake = buffer(576, GPUBufferUsage.UNIFORM);
  const bilinear = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const target = (w, h) =>
    device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
  const group = (p, entries) =>
    device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({ binding, resource }))
    });

  let geo = null;
  let win = null;
  let pl = null;
  let fld = null;
  let stale = false;
  let data = new Float32Array(0);
  let inst = null;
  const pos = new Float32Array(2);
  let base = [0, 0, 0];
  let mapTex = null;
  let fieldTex = [];
  let groups = null;

  // The colors' discs for the layout.
  const color = () => {
    fld = field(geo, COLORS);
    if (data.length !== 7 * fld.discs.length) {
      data = new Float32Array(7 * fld.discs.length);
      inst?.destroy();
      inst = buffer(data.byteLength, GPUBufferUsage.VERTEX);
    }
    fld.discs.forEach((d, i) => {
      const c = hexRgb(d.color);
      data[7 * i + 2] = d.R / pl.q;
      data[7 * i + 3] = fld.core;
      data[7 * i + 4] = c[0];
      data[7 * i + 5] = c[1];
      data[7 * i + 6] = c[2];
    });
    base = hexRgb(fld.base);
  };

  // The design covering the canvas, the textures its size, and the rib map baked with the next frame.
  const layout = (w, h) => {
    const next = cover(w, h, ANGLE, SHAPE);
    if (
      geo &&
      geo.width === next.geometry.width &&
      geo.angle === next.geometry.angle &&
      geo.shape === next.geometry.shape &&
      win.w === next.window.w &&
      win.h === next.window.h
    )
      return;
    const resized = !win || win.w !== next.window.w || win.h !== next.window.h;
    const was = pl;
    geo = next.geometry;
    win = next.window;
    pl = plan(geo);
    if (resized) {
      mapTex?.destroy();
      mapTex = target(win.w, win.h);
    }
    stale = true;
    if (resized || !was || was.fw !== pl.fw || was.fh !== pl.fh) {
      for (const t of fieldTex) t.destroy();
      fieldTex = [target(pl.fw, pl.fh), target(pl.fw, pl.fh)];
      const taps = new Float32Array(24);
      pl.taps.forEach(([o, w], i) => {
        taps[4 * i] = o;
        taps[4 * i + 1] = w;
      });
      const blur = (x, y) => {
        const values = new Float32Array(28);
        values[0] = x;
        values[1] = y;
        values.set(taps, 4);
        return values;
      };
      device.queue.writeBuffer(uAcross, 0, blur(1 / pl.fw, 0));
      device.queue.writeBuffer(uDown, 0, blur(0, 1 / pl.fh));
      device.queue.writeBuffer(uField, 0, new Float32Array([pl.fw, pl.fh, 0, 1]));
    }
    color();
    const views = { map: mapTex.createView(), field: fieldTex.map(t => t.createView()) };
    groups = {
      disc: group(pDisc, [{ buffer: uField }]),
      across: group(pBlur, [views.field[0], bilinear, { buffer: uAcross }]),
      down: group(pBlur, [views.field[1], bilinear, { buffer: uDown }]),
      glass: group(pFinal, [views.map, views.field[0], bilinear, { buffer: uGlass }]),
      views
    };
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  // The rib map: each pixel's displacement and light, in one pass.
  const bake = encoder => {
    const list = geo.ribs;
    const stops = list[0]?.stops.length ?? 0;
    const width = 1 + stops;
    const rows = new Float32Array(Math.max(1, width * list.length) * 4);
    list.forEach((r, i) => {
      const row = i * width * 4;
      rows[row] = r.cx;
      rows[row + 1] = r.cy;
      rows[row + 2] = r.r * r.r;
      r.stops.forEach(([o, v], k) => {
        rows[row + 4 * (1 + k)] = o;
        rows[row + 4 * (1 + k) + 1] = v;
      });
    });
    const ribsBuffer = buffer(rows.byteLength, GPUBufferUsage.STORAGE);
    device.queue.writeBuffer(ribsBuffer, 0, rows);
    const values = new ArrayBuffer(576);
    const f = new Float32Array(values);
    const n = geo.normal;
    f.set([win.x, win.y], 0);
    new Int32Array(values, 8, 2).set([list.length, stops]);
    f.set([n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1], 4);
    n.stops.forEach(([o, r, g], k) => f.set([o, r, g], 8 + 4 * k));
    geo.shadeTable.forEach((v, k) => {
      f[76 + 4 * k] = v;
    });
    device.queue.writeBuffer(uBake, 0, values);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: groups.views.map, loadOp: "clear", storeOp: "store" }]
    });
    pass.setPipeline(pBake);
    pass.setBindGroup(0, group(pBake, [{ buffer: ribsBuffer }, { buffer: uBake }]));
    pass.setVertexBuffer(0, quad);
    pass.draw(4);
    pass.end();
    return ribsBuffer;
  };

  const run = (encoder, view, p, bindGroup, load) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: "clear", clearValue: load, storeOp: "store" }]
    });
    pass.setPipeline(p);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, quad);
    return pass;
  };

  // A frame: the discs into the field, the blur across and down, and the glass over the canvas.
  const draw = t => {
    const encoder = device.createCommandEncoder();
    const ribsBuffer = stale ? bake(encoder) : null;
    stale = false;
    const { region } = geo;
    const q = pl.q;
    for (let i = 0; i < fld.discs.length; i++) {
      discAt(geo, fld.discs[i], t, pos, 0);
      data[7 * i] = (pos[0] - region.x) / q;
      data[7 * i + 1] = (pos[1] - region.y) / q;
    }
    device.queue.writeBuffer(inst, 0, data);
    device.queue.writeBuffer(
      uGlass,
      0,
      new Float32Array([region.x, region.y, win.x, win.y, 1 / (q * pl.fw), 1 / (q * pl.fh), win.h, geo.scale])
    );
    const discs = run(encoder, groups.views.field[0], pDisc, groups.disc, { r: base[0], g: base[1], b: base[2], a: 1 });
    discs.setVertexBuffer(1, inst);
    discs.draw(4, fld.discs.length);
    discs.end();
    let pass = run(encoder, groups.views.field[1], pBlur, groups.across);
    pass.draw(4);
    pass.end();
    pass = run(encoder, groups.views.field[0], pBlur, groups.down);
    pass.draw(4);
    pass.end();
    pass = run(encoder, context.getCurrentTexture().createView(), pFinal, groups.glass);
    pass.draw(4);
    pass.end();
    device.queue.submit([encoder.finish()]);
    ribsBuffer?.destroy();
  };

${indent(GLASS_CLOCK)}
}`;

/** The WebGPU page: the player's passes in WGSL (glass-wgsl.ts) on the numbers the player works out. */
function webgpuPage(
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  const code = `${settingsJs(P, effect, angle)}

${GLASS_MODEL}

${WEBGPU_DRAWING}`;
  return glassPageHtml(
    glassShaderCredit("webgpu", seed, effect, angle, origin),
    seed,
    WEBGPU_SHADERS,
    code,
    true
  );
}

const GLSL_SECTIONS = `// ==== Vertex: full target ==== the quad over a whole target, for passes 2 to 4 and the bake
${GLASS_FULL_VS}

// ==== Pass 1: discs ==== target: the field, fw x fh texels (1/q of the filter's region), RGBA8, cleared to the base color, blended ONE, ONE_MINUS_SRC_ALPHA | inputs: the twelve discs as instanced quads (a triangle strip of 4 vertices)
${GLASS_DISC_VS}
${GLASS_DISC_FS}

// ==== Pass 2: blur across ==== target: a second field texture, fw x fh, RGBA8, uStep (1 / fw, 0) | inputs: Pass 1 (linear, clamp to edge)
${GLASS_BLUR_FS}

// ==== Pass 3: blur down ==== target: the first field texture, fw x fh, RGBA8, the shader of Pass 2 with uStep (0, 1 / fh) | inputs: Pass 2 (linear, clamp to edge)

// ==== Pass 4: glass ==== target: the canvas, W x H | inputs: the rib map (nearest, clamp to edge), Pass 3 (linear, clamp to edge)
${GLASS_FINAL_FS}

// ==== Bake: rib map ==== target: W x H, RGBA8, once for each size, angle and shape, before the frame that needs it | inputs: the ribs, a row each (RGBA32F, nearest)
${GLASS_BAKE_FS}
`;

const WGSL_SECTIONS = `// ==== Pass 1: discs ==== target: the field, fw x fh texels (1/q of the filter's region), rgba8unorm, cleared to the base color, blended one, one-minus-src-alpha | inputs: the twelve discs as instanced quads (a triangle strip of 4 vertices)
${GLASS_DISC_WGSL}
// ==== Passes 2 and 3: blur ==== target: across into a second field texture, then down into the first, rgba8unorm, step (1 / fw, 0) then (0, 1 / fh) | inputs: the field before (linear, clamp to edge)
${GLASS_BLUR_WGSL}
// ==== Pass 4: glass ==== target: the canvas, W x H | inputs: the rib map (textureLoad), Pass 3 (linear, clamp to edge)
${GLASS_FINAL_WGSL}
// ==== Bake: rib map ==== target: W x H, rgba8unorm, once for each size, angle and shape, before the frame that needs it | inputs: the ribs, a row each (a storage buffer)
${GLASS_BAKE_WGSL}`;

/** The glass in a kind of shader code, for its palette, effect and angle. `origin` adds the effect's address to the
    credit. */
export function glassShader(
  kind: GlassShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  const credit = glassShaderCredit(kind, seed, effect, angle, origin);
  const head = credit.map(line => `// ${line}`).join("\n");
  if (kind === "webgl") return webglPage(P, effect, angle, seed, origin);
  if (kind === "webgpu") return webgpuPage(P, effect, angle, seed, origin);
  if (kind === "glsl")
    return `${head}
// The page's JavaScript works out each frame's numbers as the site's player does: the ribs and their stops, the
// discs' places, the blur's taps and the uniforms below.

${GLSL_SECTIONS}`;
  if (kind === "shadertoy")
    return `${head}

${glassShadertoy(glassColors(P), angle, effect.look.shape ?? 0, effect.speed, effect.fps)}`;
  return `${head}
// The page's JavaScript works out each frame's numbers as the site's player does: the ribs and their stops, the
// discs' places, the blur's taps and the uniforms below.

${WGSL_SECTIONS}`;
}
