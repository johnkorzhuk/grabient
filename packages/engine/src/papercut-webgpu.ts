/* The papercut in WGSL and as a WebGPU page that plays it (papercut-shader.ts names every kind): the player's two passes
   in WGSL (papercut-wgsl.ts) on the numbers the player works out (papercut-page.ts), played by the players' clock
   (effect-page.ts). A grained papercut lays its grain in the shading pass; a soft one draws that pass into the finish's
   frame, which the finish then lays over the canvas (shader-finish.ts). The editor loads this module with the Shader
   tab's WGSL or WebGPU spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import {
  PAPERCUT_WHAT,
  papercutModel,
  papercutSettings,
  papercutTextHead
} from "./papercut-page.ts";
import {
  PAPERCUT_FIELD_UNIFORMS as FIELD,
  PAPERCUT_FIELD_WGSL,
  PAPERCUT_SHADE_WGSL,
  PAPERCUT_SHADE_UNIFORMS as SHADE
} from "./papercut-wgsl.ts";
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

/* the shading pass with the grain over its bytes, for a grain with no soft: the tile at binding 2, its scale at 3;
   the bytes rounded as the canvas rounds them, a half to even (WGSL's round) */
const SHADE_GRAIN_WGSL = grainedWgsl(
  PAPERCUT_SHADE_WGSL,
  2,
  "  return shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px);",
  "  return grainOver(vec4f(round(clamp(shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px).rgb, vec3f(0.0), vec3f(1.0)) * 255.0), 255.0), vec2i(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the WGSL's sections: the modules as the WebGPU page compiles them, a pass a section under its header */
const wgslSections = (mode: Mode) =>
  `// ==== Pass 1: the field ==== target: ceil((W - 1) / 4) + 3 x ceil((H - 1) / 4) + 3 texels (a sample every fourth pixel each way, one past each edge), rgba32uint (each float's bits), one triangle over it (vertex indexes 0 to 2) | inputs: the ramp, the waves and the hills (binding 0)
${PAPERCUT_FIELD_WGSL}

// ==== Pass 2: the sheets ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), rgba8unorm" : "the canvas, W x H"}, the same triangle | inputs: the levels, the sheets' colors and shadows and the light (binding 0), Pass 1 (binding 1, textureLoad)${mode === "grain" ? ", the grain's tile (binding 2: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 3: the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? SHADE_GRAIN_WGSL : PAPERCUT_SHADE_WGSL}`;

/* The WebGPU page's drawing: the same passes and the same numbers, in WebGPU's calls, laid out and drawn by the
   players' clock; a grained one's shading pass lays the grain from its tile, and a soft one's draws into the finish's
   frame. */
const webgpuDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGPU, as the site's player draws it with WebGL: the same two passes and numbers.${finish ? " The finish then\n// lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its shading pass lays\n// the grain over the paper, as the site lays it." : ""}
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

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the two passes and
  // their uniforms${finish ? ", and the finish" : grain ? ", and the grain's tile and scale" : ""}.
  let pField, pShade, fieldBuffer, shadeBuffer, field, groups${finish ? ", finish" : grain ? ", grainTex, grainScale" : ""};
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    pField = pipeline("papercut-field", "rgba32uint");
    pShade = pipeline("papercut-shade", ${finish ? '"rgba8unorm"' : "format"});
    fieldBuffer = gpu.createBuffer({ size: ${FIELD.bytes}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    shadeBuffer = gpu.createBuffer({ size: ${SHADE.bytes}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    field = null;
    groups = null;${finish ? "\n    finish = finishing(gpu, format);" : grain ? "\n    grainTex = grainTexture(gpu);\n    grainScale = grainScaleBuffer(gpu);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the papercut laid out for it, the field's texture its size, and the
  // uniforms that hold for it. The field pass's: the canvas and D (12 bytes), the hills' count, the ramp, the waves,
  // their phases, the hills. The shading pass's: the canvas, D, the sheets' count, the light, the contact's opacity and
  // the lit cut's width, then the levels and the reaches four to a vector, the colors and each sheet's shadows a
  // vector a sheet.
  let scene = null;
  const fieldBlock = new ArrayBuffer(${FIELD.bytes});
  const FU = new Float32Array(fieldBlock);
  const FN = new Int32Array(fieldBlock, ${FIELD.bumps}, 1);
  const shadeBlock = new ArrayBuffer(${SHADE.bytes});
  const SU = new Float32Array(shadeBlock);
  const SN = new Int32Array(shadeBlock, ${SHADE.sheets}, 1);
  const at = new Float32Array(MAX_BUMPS * BUMP + 6);
  const bump = new Float32Array(MAX_BUMPS * BUMP);
  const rest = new Float32Array(6);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    gpu.queue.writeBuffer(grainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    scene = papercutScene(ANGLE, SHAPE, w, h);
    const size = fieldSize(scene);
    field?.destroy();
    field = gpu.createTexture({
      size: [size.w, size.h],
      format: "rgba32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    FU.set([scene.width, scene.height, scene.D]);
    FN[0] = scene.bumps.length;
    FU.set([scene.rx, scene.ry], ${FIELD.ramp / 4});
    FU.set([scene.wa, scene.wf, scene.wa2, scene.wf2], ${FIELD.warp / 4});
    const u = sceneUniforms(scene);
    SU.set([scene.width, scene.height, scene.D]);
    SN[0] = scene.n;
    SU.set(u.misc, ${SHADE.misc / 4});
    SU.set(u.level, ${SHADE.level / 4});
    SU.set(u.reach, ${SHADE.reach / 4});
    for (let k = 0; k < MAX_SHEETS; k++) {
      SU.set(u.face.subarray(3 * k, 3 * k + 3), ${SHADE.face / 4} + 4 * k);
      SU.set(u.wall.subarray(3 * k, 3 * k + 3), ${SHADE.wallC / 4} + 4 * k);
      SU.set(u.shadow.subarray(3 * k, 3 * k + 3), ${SHADE.shade / 4} + 4 * k);
    }
    SU.set(u.sheet, ${SHADE.sheet / 4});
    groups = {
      field: gpu.createBindGroup({
        layout: pField.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: fieldBuffer } }]
      }),
      shade: gpu.createBindGroup({
        layout: pShade.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: shadeBuffer } },
          { binding: 1, resource: field.createView() }${grain ? ",\n          { binding: 2, resource: grainTex.createView() },\n          { binding: 3, resource: { buffer: grainScale } }" : ""}
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
  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the field with the hills,
  // the waves and the light at t, then the sheets shaded from it${finish ? " into the finish's frame, which the finish lays over\n  // the canvas" : " on the canvas"}.
  const draw = t => {
    if (!groups) return;
    frameUniforms(scene, t, at, bump, rest);
    FU.set(rest.subarray(0, 4), ${FIELD.phase / 4});
    FU.set(bump, ${FIELD.bump / 4});
    SU.set(rest.subarray(4, 6), ${SHADE.light / 4});
    gpu.queue.writeBuffer(fieldBuffer, 0, fieldBlock);
    gpu.queue.writeBuffer(shadeBuffer, 0, shadeBlock);
    const encoder = gpu.createCommandEncoder();
    pass(encoder, field.createView(), pField, groups.field);
    pass(encoder, ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, pShade, groups.shade);${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
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

/** The papercut as WGSL, its WebGPU page's modules, or as that page: the player's two passes on the numbers the player
    works out, and its finish where it has a soft or a grain: a grain alone in the shading pass, a soft in the finish's
    passes after it. `origin` adds the effect's address to the credit. */
export function papercutWebgpu(
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
    const settings = papercutSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${PAPERCUT_WHAT}, drawn by WebGPU`, origin, finish),
      seed,
      [
        { id: "papercut-field", type: "text/wgsl", code: PAPERCUT_FIELD_WGSL },
        {
          id: "papercut-shade",
          type: "text/wgsl",
          code: mode === "grain" ? SHADE_GRAIN_WGSL : PAPERCUT_SHADE_WGSL
        },
        ...(mode === "finish"
          ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          type: "module",
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${papercutModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${papercutModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing(mode)}`
                : `${settings}\n\n${papercutModel()}\n\n${webgpuDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${PAPERCUT_WHAT}, as WGSL, the WebGPU page's modules, a section a pass`,
    origin,
    finish
  );
  return `${papercutTextHead(credit, mode)}

${wgslSections(mode)}
${mode === "finish" ? `\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
