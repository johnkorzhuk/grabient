/* The rosette in WGSL and as a WebGPU page that plays it (rosette-shader.ts names every kind): the player's pass in
   WGSL (rosette-wgsl.ts) on the numbers the player works out (rosette-page.ts), played by the players' clock
   (effect-page.ts). A grained rosette lays its grain in that pass; a soft one draws the pass into the finish's frame,
   which the finish then lays over the canvas (shader-finish.ts). The editor loads this module with the Shader tab's
   WGSL or WebGPU spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { ROSETTE_WHAT, rosetteModel, rosetteSettings, rosetteTextHead } from "./rosette-page.ts";
import { ROSETTE_UNIFORMS, ROSETTE_WGSL } from "./rosette-wgsl.ts";
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

/* the rosette's pass with the grain over its bytes, for a grain with no soft: the tile at binding 1, its scale at 2;
   the bytes rounded as the canvas rounds them, a half to even (WGSL's round) */
const ROSETTE_GRAIN_WGSL = grainedWgsl(
  ROSETTE_WGSL,
  1,
  "  return vec4f(col, 1.0);",
  "  return grainOver(vec4f(round(clamp(col, vec3f(0.0), vec3f(1.0)) * 255.0), 255.0), vec2i(position.xy)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's section: the module as the WebGPU page compiles it, under its header */
const wgslSection = (mode: Mode) =>
  `// ==== Pass 1: the rosette ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: the uniforms${mode === "grain" ? ", the grain's tile (binding 1: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 2: the canvas's pixels to a CSS pixel)" : " alone"}
${mode === "grain" ? ROSETTE_GRAIN_WGSL : ROSETTE_WGSL}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock; a grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers.${finish ? " The finish then lays the\n// frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over\n// the flower, as the site lays it." : ""}
const canvas = document.querySelector("canvas");
const request = async () => {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  return (await adapter?.requestDevice().catch(() => null)) ?? null;
};
let gpu = await request();
if (gpu) play();
else document.body.textContent = "This page needs WebGPU, which this browser does not have.";

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

  // What the GPU holds, made at the start and again on a new device where the old one is lost${finish ? ": the finish too" : grain ? ": the grain's tile\n  // and scale too" : ""}.
  let rosette, uniforms, groups${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    rosette = pipeline("rosette", ${finish ? '"rgba8unorm"' : "format"});
    uniforms = gpu.createBuffer({ size: ${ROSETTE_UNIFORMS.size}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    groups = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the flower laid out for it and its uniforms in the struct's order.
  let scene = null;
  const block = new ArrayBuffer(${ROSETTE_UNIFORMS.size});
  const F = new Float32Array(block);
  const I = new Int32Array(block);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = rosetteScene(ANGLE, SHAPE, w, h);
    const v = rosetteUniforms(scene);
    F.set([...v.uBox, v.uS, v.uK, v.uAlpha, v.uTurn0], 0);
    F.set([v.uEk, v.uAngMax], 8);
    I.set(v.uRange, 10);
    F.set([...v.uLens, ...v.uLensMid, ...v.uHeartR, ...v.uGrad, ...v.uStopAt, ...v.uGround], 12);
    I[31] = v.uFlow;
    F.set(v.uHeart, 32);
    I[35] = v.uPhase;
    I.set(v.uKeyOfSlot, ${ROSETTE_UNIFORMS.keys / 4});
    for (let i = 0; i < v.uStop.length / 3; i++) F.set(v.uStop.subarray(3 * i, 3 * i + 3), ${ROSETTE_UNIFORMS.stops / 4} + 4 * i);
    groups = {
      rosette: gpu.createBindGroup({
        layout: rosette.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } }${grain ? ",\n          { binding: 1, resource: grainTex.createView() },\n          { binding: 2, resource: { buffer: grainScale } }" : ""}
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
  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the petals' group zoomed
  // and turned to t, the flower drawn${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = t => {
    if (!groups) return;
    F.set(rosetteGroup(scene, t), 6);
    gpu.queue.writeBuffer(uniforms, 0, block);
    const encoder = gpu.createCommandEncoder();
    pass(encoder, ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, rosette, groups.rosette);${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
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

/** The rosette as WGSL, its WebGPU page's module, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function rosetteWebgpu(
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
    const settings = rosetteSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${ROSETTE_WHAT}, drawn by WebGPU`, origin, finish),
      seed,
      [
        {
          id: "rosette",
          type: "text/wgsl",
          code: mode === "grain" ? ROSETTE_GRAIN_WGSL : ROSETTE_WGSL
        },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${rosetteModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${rosetteModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${rosetteModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${ROSETTE_WHAT}, as WGSL, the WebGPU page's module, a section a pass`,
    origin,
    finish
  );
  return `${rosetteTextHead(credit, mode)}

${wgslSection(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
