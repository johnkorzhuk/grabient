/* The dimple in WGSL and as a WebGPU page that plays it (dimple-shader.ts names every kind): the player's pass in
   WGSL (dimple-wgsl.ts) on the numbers the player works out (dimple-page.ts), its hollow following the pointer as the
   player's does (dimple-page.ts DIMPLE_FOLLOW). A grained one lays its grain in the pass; a soft one draws the pass
   into the finish's frame, which the finish then lays over the canvas (shader-finish.ts). The editor loads this
   module with the Shader tab's WGSL or WebGPU spelling. */
import { DIMPLE_GROUND_STEPS, DIMPLE_STOPS } from "./dimple.ts";
import {
  DIMPLE_FOLLOW,
  DIMPLE_WHAT,
  dimpleModel,
  dimpleSettings,
  dimpleTextHead
} from "./dimple-page.ts";
import { DIMPLE_WGSL, DIMPLE_WGSL_UNIFORMS as U } from "./dimple-wgsl.ts";
import type { Effect } from "./effect.ts";
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

/* the pass with the grain over its bytes, for a grain with no soft: the tile at binding 1, its scale at 2; the bytes
   rounded as the canvas rounds them, a half to even (WGSL's round) */
const GRAIN_WGSL = grainedWgsl(
  DIMPLE_WGSL,
  1,
  "  return shade(px);",
  "  return grainOver(round(clamp(shade(px), vec4f(0.0), vec4f(1.0)) * 255.0), vec2i(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's sections: the module as the WebGPU page compiles it, under the pass's header */
const wgslSections = (mode: Mode) =>
  `// ==== Pass 1: the sheet ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: the design, where the hollow is, the ground about it and the palette's stops, one uniform struct${mode === "grain" ? ", and the grain's tile and scale" : ""}
${mode === "grain" ? GRAIN_WGSL : DIMPLE_WGSL}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out by the canvas's size and
   drawn as the hollow moves; a grained one's pass lays the grain from its tile, and a soft one's draws into the
   finish's frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers.${finish ? " The finish then lays the\n// frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over\n// the sheet, as the site lays it." : ""}
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

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the pass and its
  // uniforms${finish ? ", and the finish" : grain ? ", and the grain's tile and scale" : ""}.
  let pass, buffer, group${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    const shader = gpu.createShaderModule({ code: document.getElementById("dimple").textContent });
    pass = gpu.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format: ${finish ? '"rgba8unorm"' : "format"} }] },
      primitive: { topology: "triangle-list" }
    });
    buffer = gpu.createBuffer({ size: ${U.bytes}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    group = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the dimple laid out for it, and the uniforms that hold for it: the
  // canvas, the hollow's rest, the lattice's steps and the way back, the bowl, a disc, and the stops a vector each.
  let scene = null;
  const block = new ArrayBuffer(${U.bytes});
  const F = new Float32Array(block);
  const ground = new Float32Array((GROUND_STEPS + 1) * 3);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = dimpleScene(ANGLE, SHAPE, w, h);
    const u = sceneUniforms(scene);
    F.set([scene.width, scene.height]);
    F.set(u.rest, ${U.rest / 4});
    F.set(u.lattice, ${U.lattice / 4});
    F.set(u.back, ${U.back / 4});
    F.set(u.bowl, ${U.bowl / 4});
    F.set(u.disc, ${U.disc / 4});
    for (let i = 0; i < ${DIMPLE_STOPS}; i++) F.set(u.stops.subarray(3 * i, 3 * i + 3), ${U.stops / 4} + 4 * i);
    group = gpu.createBindGroup({
      layout: pass.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } }${grain ? ",\n        { binding: 1, resource: grainTex.createView() },\n        { binding: 2, resource: { buffer: grainScale } }" : ""}
      ]
    });
  };

  // The picture with the hollow at (cx, cy), in the canvas's pixels, once the canvas has a size on this device: where
  // the hollow is, how far its ground reaches and the ground's colors a vector each, then the sheet${finish ? " into the finish's\n  // frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = (cx, cy) => {
    if (!group) return;
    F[${U.hollow / 4}] = cx;
    F[${U.hollow / 4 + 1}] = cy;
    F[${U.far / 4}] = hollowUniforms(scene, cx, cy, ground);
    for (let i = 0; i <= ${DIMPLE_GROUND_STEPS}; i++) F.set(ground.subarray(3 * i, 3 * i + 3), ${U.ground / 4} + 4 * i);
    gpu.queue.writeBuffer(buffer, 0, block);
    const encoder = gpu.createCommandEncoder();
    const target = encoder.beginRenderPass({
      colorAttachments: [
        { view: ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }
      ]
    });
    target.setPipeline(pass);
    target.setBindGroup(0, group);
    target.draw(3);
    target.end();${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
    gpu.queue.submit([encoder.finish()]);
  };

${indent(DIMPLE_FOLLOW)}
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

/** The dimple as WGSL, its WebGPU page's module, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function dimpleWebgpu(
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
    const settings = dimpleSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${DIMPLE_WHAT}, drawn by WebGPU`, origin, finish),
      seed,
      [
        { id: "dimple", type: "text/wgsl", code: mode === "grain" ? GRAIN_WGSL : DIMPLE_WGSL },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${dimpleModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${dimpleModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${dimpleModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${DIMPLE_WHAT}, as WGSL, the WebGPU page's module`,
    origin,
    finish
  );
  return `${dimpleTextHead(credit, mode)}

${wgslSections(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
