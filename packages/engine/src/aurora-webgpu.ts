/* The aurora in WGSL and as a WebGPU page that plays it (aurora-shader.ts names every kind): the player's pass in WGSL
   (aurora-wgsl.ts) on the numbers the player works out (aurora-page.ts), played by the players' clock (effect-page.ts).
   Its uniforms at binding 0, its table at 1, its two tiles of noise at 2 and 3 and their sampler at 4; a grained one
   lays its grain in the pass, from a tile at binding 5 and its scale at 6; a soft one draws the pass into the
   finish's frame, which the finish then lays over the canvas (shader-finish.ts). Its canvas is premultiplied, as the
   player's is, so a range that lets the page through shows the page's own. The editor loads this module with the
   Shader tab's WGSL or WebGPU spelling. */
import { AURORA_TABLE } from "./aurora-gl.ts";
import { auroraModel, auroraSettings, auroraTextHead, auroraWhat } from "./aurora-page.ts";
import { AURORA_WGSL, AURORA_WGSL_UNIFORMS as U } from "./aurora-wgsl.ts";
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

/* the pass with the grain over its bytes, for a grain with no soft: the tile at binding 5, its scale at 6; the bytes,
   premultiplied, rounded as the canvas rounds them, a half to even (WGSL's round) */
const GRAIN_WGSL = grainedWgsl(
  AURORA_WGSL,
  5,
  "  return shade(px);",
  "  return grainOver(round(clamp(shade(px), vec4f(0.0), vec4f(1.0)) * 255.0), vec2i(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's sections: the module as the WebGPU page compiles it, under the pass's header */
const wgslSections = (mode: Mode) =>
  `// ==== Pass 1: the light and the range ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, one triangle over it (vertex indexes 0 to 2) | inputs: the frame, the path, the range, the fan, the sheets and the loop's share (binding 0), the table (binding 1: ${AURORA_TABLE.width} x ${AURORA_TABLE.height}, rgba32float, textureLoad: the ramp, the path's pieces, the slots they are looked up by and the line the light rises from), the noise and its soft copy (bindings 2 and 3: 256 x 256, rgba8unorm) and their sampler (binding 4: linear, repeat)${mode === "grain" ? ", the grain's tile (binding 5: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 6: the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? GRAIN_WGSL : AURORA_WGSL}`;

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock; a grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers.${finish ? " The finish then lays the\n// frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over\n// the light, as the site lays it." : ""}
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
  // The noise, made once: the same two tiles for every aurora.
  const made = auroraTiles();

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the pass and its
  // uniforms, the table, the two tiles and their sampler${finish ? ", and the finish" : grain ? ", and the grain's tile and scale" : ""}.
  let pass, buffer, table, tiles, sampler, group${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "premultiplied" });
    const shader = gpu.createShaderModule({ code: document.getElementById("aurora").textContent });
    pass = gpu.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format: ${finish ? '"rgba8unorm"' : "format"} }] },
      primitive: { topology: "triangle-list" }
    });
    buffer = gpu.createBuffer({ size: ${U.bytes}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    table = gpu.createTexture({
      size: [SLOTS, TABLE_ROWS],
      format: "rgba32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    tiles = [made.noise, made.soft].map(bytes => {
      const t = gpu.createTexture({
        size: [TILE, TILE],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      gpu.queue.writeTexture({ texture: t }, bytes, { bytesPerRow: TILE * 4 }, [TILE, TILE]);
      return t;
    });
    sampler = gpu.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat"
    });
    group = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the aurora laid out for it, the table, and the uniforms that hold
  // for it: the canvas, the frame, the path, the range, the fan and the sheets a vector each.
  let scene = null;
  const block = new ArrayBuffer(${U.bytes});
  const F = new Float32Array(block);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = auroraScene(ANGLE, SHAPE, w, h);
    const u = sceneUniforms(scene);
    F.set([scene.width, scene.height], ${U.size / 4});
    F.set(u.frame, ${U.frame / 4});
    F.set(u.path, ${U.path / 4});
    F.set(u.range, ${U.range / 4});
    F.set(u.fan, ${U.fan / 4});
    F.set(u.sheets, ${U.sheets / 4});
    gpu.queue.writeTexture({ texture: table }, auroraTableOf(scene), { bytesPerRow: SLOTS * 16 }, [SLOTS, TABLE_ROWS]);
    group = gpu.createBindGroup({
      layout: pass.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: table.createView() },
        { binding: 2, resource: tiles[0].createView() },
        { binding: 3, resource: tiles[1].createView() },
        { binding: 4, resource: sampler }${grain ? ",\n        { binding: 5, resource: grainTex.createView() },\n        { binding: 6, resource: { buffer: grainScale } }" : ""}
      ]
    });
  };

  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the loop's share at t,
  // then the light and the range${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
  const draw = t => {
    if (!group) return;
    F[${U.time / 4}] = auroraTime(t);
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

/** The aurora as WGSL, its WebGPU page's module, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function auroraWebgpu(
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
    const settings = auroraSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(
        seed,
        effect,
        angle,
        `${auroraWhat(effect.look.bg)}, drawn by WebGPU`,
        origin,
        finish
      ),
      seed,
      [
        { id: "aurora", type: "text/wgsl", code: mode === "grain" ? GRAIN_WGSL : AURORA_WGSL },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${auroraModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${auroraModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${auroraModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${auroraWhat(effect.look.bg)}, as WGSL, the WebGPU page's module`,
    origin,
    finish
  );
  return `${auroraTextHead(credit, mode)}

${wgslSections(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
