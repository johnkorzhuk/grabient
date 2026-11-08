/* The strings in WGSL and as a WebGPU page that plays them (strings-shader.ts names every kind): the player's pass in
   WGSL (strings-wgsl.ts) on the numbers the player works out (strings-page.ts), played by the players' clock
   (effect-page.ts). A grained one lays its grain in the pass; a soft one draws the pass into the finish's frame, which
   the finish then lays over the canvas (shader-finish.ts). Its canvas is premultiplied, as the player's is, so a
   ground that lets the page through shows the page's own. The editor loads this module with the Shader tab's WGSL or
   WebGPU spelling. */
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
import { STRINGS_LUMPS, STRINGS_STOPS } from "./strings.ts";
import { stringsModel, stringsSettings, stringsTextHead, stringsWhat } from "./strings-page.ts";
import { STRINGS_WGSL, STRINGS_WGSL_UNIFORMS as U } from "./strings-wgsl.ts";

/* the pass with the grain over its bytes, for a grain with no soft: the tile at binding 1, its scale at 2; the bytes,
   premultiplied, rounded as the canvas rounds them, a half to even (WGSL's round) */
const GRAIN_WGSL = grainedWgsl(
  STRINGS_WGSL,
  1,
  "  return shade(px);",
  "  return grainOver(round(clamp(shade(px), vec4f(0.0), vec4f(1.0)) * 255.0), vec2i(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's sections: the module as the WebGPU page compiles it, under the pass's header */
const wgslSections = (mode: Mode) =>
  `// ==== Pass 1: the threads ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: the design, the threads' width and ends, the blob, the colors and the frame's phases (binding 0)${mode === "grain" ? ", the grain's tile (binding 1: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 2: the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? GRAIN_WGSL : STRINGS_WGSL}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock; a grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers.${finish ? " The finish then lays the\n// frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over\n// the threads, as the site lays it." : ""}
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
    context.configure({ device: gpu, format, alphaMode: "premultiplied" });
    const shader = gpu.createShaderModule({ code: document.getElementById("strings").textContent });
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

  // The canvas at its size, w by h device pixels: the strings laid out for it, and the uniforms that hold for it: the
  // canvas, D, N and the field's saturation, the threads' width and ends, the blob, the
  // ground, the shears, waves and lumps a vector each, the stops a vector each.
  let scene = null;
  const block = new ArrayBuffer(${U.bytes});
  const F = new Float32Array(block);
  const at = new Float32Array(FRAME_SIZE);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = stringsScene(ANGLE, SHAPE, w, h);
    const u = sceneUniforms(scene);
    F.set([scene.width, scene.height, scene.D, u.field[0], u.field[1]]);
    F.set(u.line, ${U.line / 4});
    F.set(u.blob, ${U.blob / 4});
    F.set(u.ground, ${U.ground / 4});
    F.set(u.shear, ${U.shear / 4});
    F.set(u.wave, ${U.wave / 4});
    for (let i = 0; i < ${STRINGS_LUMPS}; i++) F.set(u.lump.subarray(3 * i, 3 * i + 3), ${U.lump / 4} + 4 * i);
    for (let i = 0; i < ${STRINGS_STOPS}; i++) F.set(u.stops.subarray(3 * i, 3 * i + 3), ${U.stops / 4} + 4 * i);
    group = gpu.createBindGroup({
      layout: pass.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } }${grain ? ",\n        { binding: 1, resource: grainTex.createView() },\n        { binding: 2, resource: { buffer: grainScale } }" : ""}
      ]
    });
  };

  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the phases at t, then the
  // threads${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = t => {
    if (!group) return;
    frameAt(scene, t, at);
    F.set(at, ${U.phase / 4});
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

/** The strings as WGSL, its WebGPU page's module, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function stringsWebgpu(
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
    const settings = stringsSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(
        seed,
        effect,
        angle,
        `${stringsWhat(effect.look.bg)}, drawn by WebGPU`,
        origin,
        finish
      ),
      seed,
      [
        { id: "strings", type: "text/wgsl", code: mode === "grain" ? GRAIN_WGSL : STRINGS_WGSL },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${stringsModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${stringsModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${stringsModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${stringsWhat(effect.look.bg)}, as WGSL, the WebGPU page's module`,
    origin,
    finish
  );
  return `${stringsTextHead(credit, mode)}

${wgslSections(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
