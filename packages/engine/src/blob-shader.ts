/* The blob's shader in each kind the Shader tab offers (shader-kinds.ts): Shadertoy's tabs (blob-shadertoy.ts), the
   GLSL ES 3.00 its WebGL page runs, which is the site's player's own (blob-gl.ts), the WGSL its WebGPU page runs
   (blob-wgsl.ts), and the two pages (blob-page.ts), each drawing what the player draws, pixel for pixel. The blob is
   no one shader: each frame draws its balls into a small texture, blurs it across and down, and lays it over every
   pixel of the canvas through the frost's noise, which is baked once a size; so each text is its passes, each under a
   header naming its target and its inputs. Loaded with the Shader tab, never with a page. */
import {
  BLOB_BLUR_FS,
  BLOB_DOTS_FS,
  BLOB_DOTS_VS,
  BLOB_FINAL_FS,
  BLOB_FULL_VS,
  BLOB_NOISE_FS
} from "./blob-gl.ts";
import { BLOB_CLOCK, BLOB_MATH, blobSettings } from "./blob-page.ts";
import { blobShadertoy } from "./blob-shadertoy.ts";
import { BLOB_WGSL } from "./blob-wgsl.ts";
import type { Effect } from "./effect.ts";
import { effectPage } from "./effect-code.ts";
import type { Palette } from "./palette.ts";
import type { ShaderKind, ShaderPageKind } from "./shader-kinds.ts";

const WHAT: Record<ShaderKind, string> = {
  shadertoy: "for Shadertoy, a section a tab, each tab's channels as its header says",
  glsl: "as GLSL ES 3.00, the WebGL page's shaders, a section a pass",
  wgsl: "as WGSL, the WebGPU page's modules, a section a pass",
  webgl: "drawn by WebGL 2",
  webgpu: "drawn by WebGPU"
};

/** The credit each kind carries, as the gradient's shaders do (shader.ts shaderCredit), so a text found later says
    where it came from: the seed, the effect's page where an origin is given (its address with how it plays), and what
    the text is. Lines without their comment marks. */
export function blobCredit(
  kind: ShaderKind,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string[] {
  return [
    `grabient ${seed}`,
    ...(origin ? [effectPage(origin, seed, effect, angle, true)] : []),
    `the blob, the palette's balls melted and frosted, ${WHAT[kind]}`
  ];
}
const comments = (lines: readonly string[]) =>
  lines.map(line => (line ? `// ${line}` : "//")).join("\n");

const FRAME = [
  "",
  "Each frame draws the balls into the melt, a small texture, blurs it across and then down, and draws every pixel",
  "of the canvas from it through the frost's noise, which is baked once a size. The uniforms' values are the page's."
];

/* the GLSL's sections: the shaders as the WebGL page compiles them, under one header each */
const GLSL_SECTIONS: readonly [header: string, shaders: readonly string[]][] = [
  [
    "Cover ==== the vertex stage of passes 0, 2, 3 and 4: the quad over the target, corner (attribute 0) from 0 to 1",
    [BLOB_FULL_VS]
  ],
  [
    "Pass 0: frost noise ==== target: W x H (the canvas's device pixels), RGBA8, once a size | inputs: lattice (256 x 1, R8UI, nearest), gradients (256 x 4, RGBA8, nearest)",
    [BLOB_NOISE_FS]
  ],
  [
    "Pass 1: balls ==== target: the melt, w x h texels, RGBA16F (RGBA8 without float targets), cleared to 0, then 24 instanced quads blended (one, one minus source alpha) | inputs: corner (attribute 0), disc and paint (attributes 1 and 2, one a ball)",
    [BLOB_DOTS_VS, BLOB_DOTS_FS]
  ],
  [
    "Passes 2 and 3: blur across, then down ==== target: the other melt texture, w x h, RGBA16F | inputs: the melt (texelFetch), step_by (1, 0) across and (0, 1) down",
    [BLOB_BLUR_FS]
  ],
  [
    "Pass 4: canvas ==== target: the canvas, W x H, premultiplied alpha | inputs: the melt after pass 3 (linear, clamp to edge), the noise (texelFetch)",
    [BLOB_FINAL_FS]
  ]
];

const WGSL_SECTIONS: readonly [header: string, module: string][] = [
  [
    "Pass 0: frost noise ==== target: W x H (the canvas's device pixels), rgba8unorm, once a size | inputs: lattice (256 x 1, r8uint), gradients (256 x 4, rgba8unorm)",
    BLOB_WGSL.noise
  ],
  [
    "Pass 1: balls ==== target: the melt, w x h texels, rgba16float, cleared to 0, then 24 instanced quads blended (one, one minus source alpha) | inputs: corner (location 0), disc and paint (locations 1 and 2, one a ball)",
    BLOB_WGSL.dots
  ],
  [
    "Passes 2 and 3: blur across, then down ==== target: the other melt texture, w x h, rgba16float | inputs: the melt (textureLoad), step_by (1, 0) across and (0, 1) down",
    BLOB_WGSL.blur
  ],
  [
    "Pass 4: canvas ==== target: the canvas, W x H, premultiplied alpha | inputs: the melt after pass 3 (linear, clamp to edge), the noise (textureLoad)",
    BLOB_WGSL.final
  ]
];

function glslText(credit: string[]): string {
  return `${comments([...credit, ...FRAME])}
${GLSL_SECTIONS.map(([header, shaders]) => `\n// ==== ${header}\n${shaders.join("\n")}`).join("\n")}
`;
}

function wgslText(credit: string[]): string {
  return `${comments([...credit, ...FRAME])}
${WGSL_SECTIONS.map(([header, module]) => `\n// ==== ${header}\n${module}`).join("\n")}
`;
}

/* The WebGL page's drawing: the player's own (ui/blob-player.ts), its calls in its order. */
const WEBGL = `// The drawing, WebGL 2, as the site's player draws it.
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false
});
if (gl) play();
else document.body.textContent = "This page needs WebGL 2, which this browser does not have.";

function play() {
  const program = (vertex, fragment) => {
    const p = gl.createProgram();
    for (const [type, id] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, document.getElementById(id).textContent);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p, shader);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
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

  // The scene, its colors and its numbers, and the noise's tables.
  const scene = blobScene();
  const look = blobFilter(scene);
  const n = scene.blobs.reduce((sum, b) => sum + b.balls.length, 0);
  const data = new Float32Array(8 * n);
  let i = 0;
  for (const blob of scene.blobs)
    for (const b of blob.balls) {
      const [r, g, bl] = colorAt(b.at).map(v => v / 255);
      data[8 * i + 4] = r;
      data[8 * i + 5] = g;
      data[8 * i + 6] = bl;
      data[8 * i + 7] = 1;
      i++;
    }
  const ground = groundOf(BG);
  const { lattice, gradients } = noiseTables(look.seed);

  // What the GPU holds, made at the start and again where a lost context comes back.
  let dots, blur, bake, final, half, U, instances, dotsVao, fullVao, melt, noise, latticeTex, gradientTex;
  let baked = false;
  const make = () => {
    dots = program("dots-vs", "dots-fs");
    blur = program("cover-vs", "blur-fs");
    bake = program("cover-vs", "noise-fs");
    final = program("cover-vs", "final-fs");
    // the melt in half floats where they can be drawn into, so its blur adds no rounding of its own
    half = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    const at = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    U = {
      dots: at(dots, ["size"]),
      blur: at(blur, ["source", "step_by", "taps", "weights"]),
      bake: at(bake, ["lattice", "gradients", "scale", "offset", "frequency"]),
      final: at(final, ["melt", "noise", "canvas_h", "melt_origin", "melt_texel", "region", "scatter", "frosted", "lift", "gray", "k", "ground"])
    };
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    instances = gl.createBuffer();
    dotsVao = gl.createVertexArray();
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
    fullVao = gl.createVertexArray();
    gl.bindVertexArray(fullVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    melt = [0, 1].map(() => ({ texture: texture(gl.LINEAR), frame: gl.createFramebuffer() }));
    noise = { texture: texture(gl.NEAREST), frame: gl.createFramebuffer() };
    latticeTex = texture(gl.NEAREST);
    gradientTex = texture(gl.NEAREST);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, latticeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 256, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, lattice);
    gl.bindTexture(gl.TEXTURE_2D, gradientTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, gradients);
    baked = false;
  };
  make();

  // The canvas at its size: the design's map, the filter region, the melt's texture and the blur's weights.
  let map = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let canvasSize = { w: 1, h: 1 };
  let meltBox = { x: 0, y: 0, texel: 1, w: 1, h: 1 };
  let regionPx = [0, 0, 1, 1];
  const weights = new Float32Array(RADIUS + 1);
  let taps = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const { w: cw, h: ch, kx, ky } = canvasOf(W, H, devicePixelRatio || 1, device);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (canvasSize.w !== cw || canvasSize.h !== ch) baked = false;
    canvasSize = { w: cw, h: ch };
    const next = mapOf(W, H, kx, ky);
    if (next.sx !== map.sx || next.sy !== map.sy || next.tx !== map.tx || next.ty !== map.ty) baked = false;
    map = next;
    const melted = meltOf(look, map, cw, ch, weights);
    regionPx = melted.region;
    meltBox = melted.box;
    taps = melted.taps;
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

  // The frost's noise at every device pixel, once a size.
  const bakeNoise = () => {
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

  // A frame at a share f of the loop.
  const draw = f => {
    if (look.noise && !baked) bakeNoise();
    // the balls, small: each a quad its own color covers, painted in the scene's order
    const { texel } = meltBox;
    places(scene, f, data, 8);
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
    // the melt: across, then down
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
    // every pixel: the frost's scatter, the lift of the edge, the speckle, the ground
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
  // A lost context stops the clock; where the browser gives it back, everything the GPU held is made again and the
  // frame drawn at once.
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    make();
    if (resize()) {
      changed = true;
      wake();
    }
  });

${indent(BLOB_CLOCK)}
}`;

/* The WebGPU page's drawing: the same passes and the same numbers, in WebGPU's calls. */
const WEBGPU = `// The drawing, WebGPU, as the site's player draws it with WebGL.
const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
let gpu = await adapter?.requestDevice().catch(() => null);
if (gpu) play();
else document.body.textContent = "This page needs WebGPU, which this browser does not have.";

function play() {
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const module = id => gpu.createShaderModule({ code: document.getElementById(id).textContent });
  const quadLayout = { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] };
  const pipeline = (id, target, extra = {}) => {
    const shader = module(id);
    return gpu.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main", buffers: extra.buffers ?? [quadLayout] },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format: target, blend: extra.blend }] },
      primitive: { topology: "triangle-strip" }
    });
  };
  const over = { operation: "add", srcFactor: "one", dstFactor: "one-minus-src-alpha" };
  const buffer = (usage, data) => {
    const b = gpu.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    gpu.queue.writeBuffer(b, 0, data);
    return b;
  };
  const uniforms = size => gpu.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const group = (p, entries) =>
    gpu.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({ binding, resource: resource.size ? { buffer: resource } : resource }))
    });
  const texture = (w, h, format, usage) =>
    gpu.createTexture({ size: [w, h], format, usage: usage | GPUTextureUsage.TEXTURE_BINDING });

  // The scene, its colors and its numbers, and the noise's tables.
  const scene = blobScene();
  const look = blobFilter(scene);
  const n = scene.blobs.reduce((sum, b) => sum + b.balls.length, 0);
  const data = new Float32Array(8 * n);
  let i = 0;
  for (const blob of scene.blobs)
    for (const b of blob.balls) {
      const [r, g, bl] = colorAt(b.at).map(v => v / 255);
      data[8 * i + 4] = r;
      data[8 * i + 5] = g;
      data[8 * i + 6] = bl;
      data[8 * i + 7] = 1;
      i++;
    }
  const ground = groundOf(BG);
  const { lattice, gradients } = noiseTables(look.seed);

  // What the GPU holds, made at the start and again on a new device where the old one is lost.
  let dots, blur, bake, final, quad, dotsU, acrossU, downU, bakeU, finalU, linear, instances, latticeTex, gradientTex;
  let melt = [];
  let noise = null;
  let groups = null;
  let baked = false;
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "premultiplied" });
    dots = pipeline("dots", "rgba16float", {
      blend: { color: over, alpha: over },
      buffers: [
        quadLayout,
        {
          arrayStride: 32,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x4" },
            { shaderLocation: 2, offset: 16, format: "float32x4" }
          ]
        }
      ]
    });
    blur = pipeline("blur", "rgba16float");
    bake = pipeline("noise", "rgba8unorm");
    final = pipeline("final", format);
    quad = buffer(GPUBufferUsage.VERTEX, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
    dotsU = uniforms(16);
    acrossU = uniforms(96);
    downU = uniforms(96);
    bakeU = uniforms(32);
    finalU = uniforms(96);
    linear = gpu.createSampler({ magFilter: "linear", minFilter: "linear" });
    instances = buffer(GPUBufferUsage.VERTEX, data);
    latticeTex = texture(256, 1, "r8uint", GPUTextureUsage.COPY_DST);
    gpu.queue.writeTexture({ texture: latticeTex }, lattice, { bytesPerRow: 256 }, [256, 1]);
    gradientTex = texture(256, 4, "rgba8unorm", GPUTextureUsage.COPY_DST);
    gpu.queue.writeTexture({ texture: gradientTex }, gradients, { bytesPerRow: 1024 }, [256, 4]);
    melt = [];
    noise = null;
    groups = null;
    baked = false;
  };
  make();

  // The canvas at its size: the design's map, the filter region, the melt's textures and the blur's weights.
  let map = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let canvasSize = { w: 1, h: 1 };
  let meltBox = { x: 0, y: 0, texel: 1, w: 1, h: 1 };
  let regionPx = [0, 0, 1, 1];
  const weights = new Float32Array(RADIUS + 1);
  let taps = 0;
  const target = usage => GPUTextureUsage.RENDER_ATTACHMENT | usage;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const { w: cw, h: ch, kx, ky } = canvasOf(W, H, devicePixelRatio || 1, device);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (canvasSize.w !== cw || canvasSize.h !== ch) baked = false;
    canvasSize = { w: cw, h: ch };
    const next = mapOf(W, H, kx, ky);
    if (next.sx !== map.sx || next.sy !== map.sy || next.tx !== map.tx || next.ty !== map.ty) baked = false;
    map = next;
    const melted = meltOf(look, map, cw, ch, weights);
    regionPx = melted.region;
    meltBox = melted.box;
    taps = melted.taps;
    for (const t of melt) t.destroy();
    melt = [0, 1].map(() => texture(meltBox.w, meltBox.h, "rgba16float", target(0)));
    if (!baked) {
      noise?.destroy();
      noise = texture(cw, ch, "rgba8unorm", target(0));
    }
    // the uniforms that change only with the size
    gpu.queue.writeBuffer(dotsU, 0, new Float32Array([meltBox.w, meltBox.h, 0, 0]));
    const blurU = (to, x, y) => {
      const b = new ArrayBuffer(96);
      new Int32Array(b, 0, 3).set([x, y, taps]);
      new Float32Array(b, 16, RADIUS + 1).set(weights);
      gpu.queue.writeBuffer(to, 0, b);
    };
    blurU(acrossU, 1, 0);
    blurU(downU, 0, 1);
    gpu.queue.writeBuffer(bakeU, 0, new Float32Array([map.sx, map.sy, map.tx, map.ty, look.frequency, 0, 0, 0]));
    const f = new ArrayBuffer(96);
    new Float32Array(f, 0, 19).set([
      ...regionPx,
      ...ground,
      meltBox.x,
      meltBox.y,
      look.scatter * map.sx,
      look.scatter * map.sy,
      look.slope,
      look.lift,
      look.contrast,
      look.gray,
      look.k1,
      look.k2,
      meltBox.texel
    ]);
    new Uint32Array(f, 76, 1).set([look.noise ? 1 : 0]);
    gpu.queue.writeBuffer(finalU, 0, f);
    groups = {
      dots: group(dots, [dotsU]),
      across: group(blur, [acrossU, melt[0].createView()]),
      down: group(blur, [downU, melt[1].createView()]),
      bake: group(bake, [bakeU, latticeTex.createView(), gradientTex.createView()]),
      final: group(final, [finalU, melt[0].createView(), linear, noise.createView()])
    };
    return true;
  };

  const pass = (encoder, view, p, bindings, draw) => {
    const at = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }]
    });
    at.setPipeline(p);
    at.setBindGroup(0, bindings);
    at.setVertexBuffer(0, quad);
    draw(at);
    at.end();
  };
  // A frame at a share f of the loop, once the canvas has a size on this device.
  const draw = f => {
    if (!groups) return;
    const encoder = gpu.createCommandEncoder();
    // the frost's noise at every device pixel, once a size
    if (look.noise && !baked) {
      pass(encoder, noise.createView(), bake, groups.bake, at => at.draw(4));
      baked = true;
    }
    // the balls, small: each a quad its own color covers, painted in the scene's order
    const { texel } = meltBox;
    places(scene, f, data, 8);
    for (let i = 0; i < 8 * n; i += 8) {
      data[i] = (data[i] * map.sx + map.tx - meltBox.x) / texel;
      data[i + 1] = (data[i + 1] * map.sy + map.ty - meltBox.y) / texel;
      data[i + 2] = (data[i + 2] * map.sx) / texel;
    }
    gpu.queue.writeBuffer(instances, 0, data);
    pass(encoder, melt[0].createView(), dots, groups.dots, at => {
      at.setVertexBuffer(1, instances);
      at.draw(4, n);
    });
    // the melt: across, then down
    pass(encoder, melt[1].createView(), blur, groups.across, at => at.draw(4));
    pass(encoder, melt[0].createView(), blur, groups.down, at => at.draw(4));
    // every pixel: the frost's scatter, the lift of the edge, the speckle, the ground
    pass(encoder, context.getCurrentTexture().createView(), final, groups.final, at => at.draw(4));
    gpu.queue.submit([encoder.finish()]);
  };
  // A device lost for any reason but the page's own stops the clock; a new one is asked for, everything the GPU held
  // made again on it and the frame drawn at once.
  const watch = () =>
    gpu.lost.then(async info => {
      if (info.reason === "destroyed") return;
      cancelAnimationFrame(raf);
      raf = 0;
      const next = await (await navigator.gpu.requestAdapter().catch(() => null))?.requestDevice().catch(() => null);
      if (!next) {
        document.body.textContent = "This page lost its GPU and could not get it back.";
        return;
      }
      gpu = next;
      make();
      watch();
      if (resize()) {
        changed = true;
        wake();
      }
    });
  watch();

${indent(BLOB_CLOCK)}
}`;

function indent(text: string): string {
  return text
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");
}

const SCRIPTS = {
  webgl: [
    ["x-shader/x-vertex", "cover-vs", BLOB_FULL_VS],
    ["x-shader/x-fragment", "noise-fs", BLOB_NOISE_FS],
    ["x-shader/x-vertex", "dots-vs", BLOB_DOTS_VS],
    ["x-shader/x-fragment", "dots-fs", BLOB_DOTS_FS],
    ["x-shader/x-fragment", "blur-fs", BLOB_BLUR_FS],
    ["x-shader/x-fragment", "final-fs", BLOB_FINAL_FS]
  ],
  webgpu: [
    ["text/wgsl", "noise", BLOB_WGSL.noise],
    ["text/wgsl", "dots", BLOB_WGSL.dots],
    ["text/wgsl", "blur", BLOB_WGSL.blur],
    ["text/wgsl", "final", BLOB_WGSL.final]
  ]
} as const;

function page(
  kind: ShaderPageKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  const credit = blobCredit(kind, effect, angle, seed, origin);
  /* each shader from its element's first character, so a GLSL one's #version leads it */
  const scripts = SCRIPTS[kind]
    .map(([type, id, code]) => `<script type="${type}" id="${id}">${code}</script>`)
    .join("\n");
  return `<!doctype html>
<!--
${credit.map(line => `  ${line}`).join("\n")}
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>grabient ${seed}</title>
<style>
  html, body { margin: 0; height: 100%; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<canvas></canvas>
${scripts}
${kind === "webgl" ? "<script>" : '<script type="module">'}
${blobSettings(P, effect, angle)}

${BLOB_MATH}

${kind === "webgl" ? WEBGL : WEBGPU}
</script>
</body>
</html>
`;
}

/** The blob's shader in a kind: Shadertoy's tabs, the GLSL or the WGSL its pages run, or one of the pages. `origin`
    adds the effect's address to the credit. */
export function blobShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "webgl" || kind === "webgpu") return page(kind, P, effect, angle, seed, origin);
  const credit = blobCredit(kind, effect, angle, seed, origin);
  if (kind === "glsl") return glslText(credit);
  if (kind === "wgsl") return wgslText(credit);
  return blobShadertoy(P, effect, angle, credit);
}
