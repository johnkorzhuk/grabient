/* The silk in WGSL and as a WebGPU page that plays it (silk-shader.ts names every kind): the player's pass in WGSL
   (silk-wgsl.ts) on the numbers the player works out (silk-page.ts), played by the players' clock (effect-page.ts). A
   grained silk lays its grain in that pass; a soft one draws the pass into the finish's frame, which the finish then
   lays over the canvas (shader-finish.ts). The editor loads this module with the Shader tab's WGSL or WebGPU
   spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import {
  type EffectShaderFinish,
  FINISH_MATH_JS,
  FINISH_WEBGPU_JS,
  FINISH_WEBGPU_SHADERS,
  FINISH_WGSL_SECTIONS,
  finished,
  finishSettingsJs,
  GRAIN_TILE_JS,
  GRAIN_WEBGPU_JS,
  grainedWgsl,
  grainOnly,
  grainSettingsJs
} from "./shader-finish.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";
import { SILK_WHAT, silkModel, silkSettings, silkTextHead } from "./silk-page.ts";
import { SILK_WGSL } from "./silk-wgsl.ts";

/* the silk's pass with the grain over its bytes, for a grain with no soft: the tile at binding 4, its scale at 5; the
   bytes rounded as the canvas rounds them, a half to even (WGSL's round) */
const SILK_GRAIN_WGSL = grainedWgsl(
  SILK_WGSL,
  4,
  "  return vec4f(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), 1.0);",
  "  return grainOver(vec4f(round(clamp(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), vec3f(0.0), vec3f(1.0)) * 255.0), 255.0), vec2i(p)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's section: the module as the WebGPU page compiles it, under its header */
const wgslSection = (mode: Mode) =>
  `// ==== Pass 1: the silk ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: T, the dye (32 x 3, rgba8unorm; rows dyed, shade, light), S, the profiles (65 x 1, rg16float; valley, crest), both through one sampler (linear, clamp to edge)${mode === "grain" ? ", the grain's tile (binding 4: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 5: the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? SILK_GRAIN_WGSL : SILK_WGSL}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock; a grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass, tables and numbers.${finish ? " The finish then\n// lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the\n// grain over the cloth, as the site lays it." : ""}
const canvas = document.querySelector("canvas");
const request = async () => {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  return (await adapter?.requestDevice().catch(() => null)) ?? null;
};
let gpu = await request();
if (gpu) play();
else document.body.textContent = "This page needs WebGPU, which this browser does not have.";

// A float as a half float's bits, to nearest even, as the browser rounds the player's RG16F table when it takes it.
function halves(values) {
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  return Uint16Array.from(values, v => {
    f[0] = v;
    const x = u[0];
    const sign = (x >>> 16) & 0x8000;
    const abs = x & 0x7fffffff;
    if (abs > 0x7f800000) return 0x7fff;
    if (abs > 0x47ffefff) return sign | 0x7c00;
    if (abs < 0x38800000) {
      const e = 113 - (abs >>> 23);
      const m = e < 24 ? ((abs & 0x7fffff) | 0x800000) >>> e : 0;
      return sign | ((m + 0xfff + ((m >>> 13) & 1)) >>> 13);
    }
    return sign | (((abs + 0xc8000000 + 0xfff + ((abs >>> 13) & 1)) >>> 0) >>> 13);
  });
}

function play() {
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const pipeline = (id, target) => {
    const shader = gpu.createShaderModule({ code: document.getElementById(id).textContent });
    return gpu.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format: target }] },
      primitive: { topology: "triangle-list" }
    });
  };
  const table = (w, h, format, data, bytesPerRow) => {
    const t = gpu.createTexture({ size: [w, h], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    gpu.queue.writeTexture({ texture: t }, data, { bytesPerRow }, [w, h]);
    return t;
  };

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the pass, the
  // uniforms, the dye's table and the profiles'${finish ? ", and the finish" : grain ? ", and the grain's tile and scale" : ""}.
  let silk, uniforms, dye, profiles, lerped, groups${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    silk = pipeline("silk", ${finish ? '"rgba8unorm"' : "format"});
    uniforms = gpu.createBuffer({ size: 224, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dye = table(LUT_N, 3, "rgba8unorm", colorTexels(), 4 * LUT_N);
    profiles = table(PROF_N, 1, "rg16float", halves(profileTexels()), 4 * PROF_N);
    lerped = gpu.createSampler({ magFilter: "linear", minFilter: "linear" });
    groups = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the cloth laid out for it and the uniforms that hold for it. The
  // uniforms: D (16 bytes), F (8 vec4), G (4 vec4), N.
  let scene = null;
  const block = new ArrayBuffer(224);
  const SU = new Float32Array(block, 0, 4);
  const FU = new Float32Array(block, 16, 4 * MAX_FOLDS);
  const GU = new Float32Array(block, 144, 2 * MAX_FOLDS);
  const NU = new Int32Array(block, 208, 1);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = silkScene(ANGLE, SHAPE, w, h);
    sceneUniforms(scene, SU);
    bandUniforms(scene, GU);
    NU[0] = scene.folds.length;
    groups = {
      silk: gpu.createBindGroup({
        layout: silk.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: dye.createView() },
          { binding: 2, resource: profiles.createView() },
          { binding: 3, resource: lerped }${grain ? ",\n          { binding: 4, resource: grainTex.createView() },\n          { binding: 5, resource: { buffer: grainScale } }" : ""}
        ]
      })
    };
  };

  const pass = (encoder, view, p, bindings) => {
    const at = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store" }]
    });
    at.setPipeline(p);
    at.setBindGroup(0, bindings);
    at.draw(3);
    at.end();
  };
  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the rings swung to t, the
  // cloth drawn${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = t => {
    if (!groups) return;
    foldUniforms(scene, t, FU);
    gpu.queue.writeBuffer(uniforms, 0, block);
    const encoder = gpu.createCommandEncoder();
    pass(encoder, ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, silk, groups.silk);${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
    gpu.queue.submit([encoder.finish()]);
  };

${indent(EFFECT_CLOCK)}
  // A device lost draws nothing: the page asks for another, three times at most, makes everything the GPU held again
  // on it and goes on, or says so.
  let again = 0;
  const watch = one =>
    one.lost.then(async () => {
      lose();
      const next = ++again <= 3 ? await request() : null;
      if (!next) {
        document.body.textContent = "This page lost its GPU device, and the browser gave it no other.";
        return;
      }
      gpu = next;
      make();
      watch(next);
      found();
    });
  watch(gpu);
}`;
};

/** The silk as WGSL, its WebGPU page's modules, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function silkWebgpu(
  kind: "wgsl" | "webgpu",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  const mode: Mode = grainOnly(finish) ? "grain" : finished(finish) ? "finish" : "plain";
  if (kind === "webgpu") {
    const settings = silkSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${SILK_WHAT}, drawn by WebGPU`, origin, finish),
      seed,
      [
        { id: "silk", type: "text/wgsl", code: mode === "grain" ? SILK_GRAIN_WGSL : SILK_WGSL },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${silkModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${silkModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${silkModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${SILK_WHAT}, as WGSL, the WebGPU page's module, a section a pass`,
    origin,
    finish
  );
  return `${silkTextHead(credit, mode)}

${wgslSection(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
