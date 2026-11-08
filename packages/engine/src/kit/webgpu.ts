/* A field effect in WGSL and as a WebGPU page that plays it (kit/shader.ts names every kind): the player's pass in
   WGSL (kit/wgsl.ts) on the numbers the player works out (kit/page.ts), played by the players' clock (effect-page.ts).
   A grained one lays its grain in the pass; a soft one draws the pass into the finish's frame, which the finish then
   lays over the canvas (shader-finish.ts). */
import type { EffectSettings } from "../effect.ts";
import { EFFECT_CLOCK } from "../effect-page.ts";
import type { Palette } from "../palette.ts";
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
} from "../shader-finish.ts";
import { indent, shaderPageHtml } from "../shader-shell.ts";
import { kitStepped } from "./gl.ts";
import { kitCredit, kitModel, kitSettings, kitTextHead, kitWhat } from "./page.ts";
import { KIT_STOPS } from "./scene.ts";
import type { KitKernelCode } from "./shader.ts";
import type { FieldEffect } from "./types.ts";
import {
  KIT_BYTES_WGSL,
  kitKernelLayout,
  kitWgsl,
  kitWgslBytes,
  KIT_WGSL_UNIFORMS as U
} from "./wgsl.ts";

type Mode = "plain" | "grain" | "finish";

/* the pass with the grain over its bytes, for a grain with no soft: the tile at binding 2, its scale at 3 (the scene
   and the kernel hold 0 and 1); the grain lies over the bytes the pass rounds (a tie up, as kitByte rounds), as
   fx-finish.ts lays it over the CPU's */
const grainWgsl = (module: string) =>
  grainedWgsl(
    module,
    2,
    `  return vec4f(${KIT_BYTES_WGSL} / 255.0, 1.0);`,
    `  return grainOver(vec4f(${KIT_BYTES_WGSL}, 255.0), vec2i(px)) / 255.0;`
  );

/* the WGSL's sections: the module as the WebGPU page compiles it, under the pass's header */
const wgslSections = (module: string, mode: Mode) =>
  `// ==== Pass 1: the field ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: the canvas, D, the view's turn, the colors and the frame's moves (binding 0), the design's constants and the frame's phases (binding 1)${mode === "grain" ? ", the grain's tile (binding 2: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 3: the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? grainWgsl(module) : module}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock; a grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (def: FieldEffect, mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  const K = kitKernelLayout(def);
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers.${finish ? " The finish then lays the\n// frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over\n// the picture, as the site lays it." : ""}
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

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the pass, the scene's
  // uniforms and the kernel's${finish ? ", and the finish" : grain ? ", and the grain's tile and scale" : ""}.
  let pass, sceneBuffer, kernelBuffer, group${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    const shader = gpu.createShaderModule({ code: document.getElementById("${def.kind}").textContent });
    pass = gpu.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format: ${finish ? '"rgba8unorm"' : "format"} }] },
      primitive: { topology: "triangle-list" }
    });
    sceneBuffer = gpu.createBuffer({ size: ${kitWgslBytes(def)}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    kernelBuffer = gpu.createBuffer({ size: ${K.bytes}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    group = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the effect laid out for it, and the uniforms that hold for it: the
  // canvas, the view's turn, D and the colors, each stop a vector; the design's constant lists, four numbers to a
  // vector.
  let scene = null;
  const sceneBlock = new Float32Array(${kitWgslBytes(def) / 4});
  const kernelBlock = new Float32Array(${K.bytes / 4});
  const phases = new Float32Array(${4 * Math.ceil(def.tracks / 4)});
  const move = new Float32Array(4);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = kitScene(ANGLE, w, h);
    const u = sceneUniforms(scene);
    sceneBlock.set(u.size, ${U.size / 4});
    sceneBlock.set(u.turn, ${U.turn / 4});
    sceneBlock[${U.D / 4}] = u.D;
    sceneBlock.set(u.ground, ${U.ground / 4});
    sceneBlock.set(u.shade, ${U.shade / 4});
    sceneBlock.set(u.line, ${U.line / 4});
    for (let i = 0; i < ${KIT_STOPS}; i++) sceneBlock.set(u.stops.subarray(3 * i, 3 * i + 3), ${U.stops / 4} + 4 * i);${kitStepped(def) ? `\n    sceneBlock.set(u.levels, ${U.levels / 4});` : ""}
    gpu.queue.writeBuffer(sceneBuffer, 0, sceneBlock);
${Object.entries(K.lists)
  .map(([name, at]) => `    kernelBlock.set(u.K.${name}, ${at / 4});`)
  .join("\n")}
    gpu.queue.writeBuffer(kernelBuffer, 0, kernelBlock);
    group = gpu.createBindGroup({
      layout: pass.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: sceneBuffer } },
        { binding: 1, resource: { buffer: kernelBuffer } }${grain ? ",\n        { binding: 2, resource: grainTex.createView() },\n        { binding: 3, resource: { buffer: grainScale } }" : ""}
      ]
    });
  };

  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the phases and the moves
  // at t, then the field${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = t => {
    if (!group) return;
    frameAt(t, phases, move);
    gpu.queue.writeBuffer(sceneBuffer, ${U.moves}, move);
    gpu.queue.writeBuffer(kernelBuffer, ${K.phases}, phases);
    const encoder = gpu.createCommandEncoder();
    const target = encoder.beginRenderPass({
      colorAttachments: [
        { view: ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store" }
      ]
    });
    target.setPipeline(pass);
    target.setBindGroup(0, group);
    target.draw(3);
    target.end();${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
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

/** A field effect as WGSL, its WebGPU page's module, or as that page: the player's pass on the numbers the player
    works out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes
    after it. `origin` adds the effect's address to the credit. */
export function kitWebgpu(
  def: FieldEffect,
  kernel: KitKernelCode,
  kind: "wgsl" | "webgpu",
  P: Palette,
  play: EffectSettings,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  const mode: Mode = grainOnly(finish) ? "grain" : finished(finish) ? "finish" : "plain";
  const module = kitWgsl(def, kernel.wgsl);
  if (kind === "webgpu") {
    const settings = kitSettings(def, P, play, angle);
    const model = kitModel(def, P, play.look.shape);
    return shaderPageHtml(
      kitCredit(def, seed, play, angle, `${kitWhat(def)}, drawn by WebGPU`, origin, finish),
      seed,
      [
        { id: def.kind, type: "text/wgsl", code: mode === "grain" ? grainWgsl(module) : module },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${model}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(def, mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${model}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(def, mode)}`
                : `${settings}\n\n${model}\n\n${webgpuDrawing(def, mode)}`
        }
      ]
    );
  }
  const credit = kitCredit(
    def,
    seed,
    play,
    angle,
    `${kitWhat(def)}, as WGSL, the WebGPU page's module`,
    origin,
    finish
  );
  return `${kitTextHead(def, credit, mode, play.look.steps)}

${wgslSections(module, mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
