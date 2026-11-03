/* The rosette in WGSL and as a WebGPU page that plays it (rosette-shader.ts names every kind): the player's pass in
   WGSL (rosette-wgsl.ts) on the numbers the player works out (rosette-page.ts), played by the players' clock
   (effect-page.ts). The page draws each frame into a texture of its own and a second pass shows it on the canvas, the
   place where a finish (a soft blur, a grain) would take the frame. The editor loads this module with the Shader tab's
   WGSL or WebGPU spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { ROSETTE_WHAT, rosetteModel, rosetteSettings } from "./rosette-page.ts";
import { rosetteTextHead } from "./rosette-webgl.ts";
import { ROSETTE_UNIFORMS, ROSETTE_WGSL } from "./rosette-wgsl.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";

const WEBGPU_SHADERS = [
  ["rosette", "text/wgsl", ROSETTE_WGSL.rosette],
  ["show", "text/wgsl", ROSETTE_WGSL.show]
] as const;

const WGSL_SECTIONS: readonly [header: string, module: string][] = [
  [
    "Pass 1: the rosette ==== target: the frame, W x H (the canvas's device pixels), rgba8unorm, one triangle over it (vertex indexes 0 to 2) | inputs: the uniforms alone",
    ROSETTE_WGSL.rosette
  ],
  [
    "Pass 2: the canvas ==== target: the canvas, W x H | inputs: the frame (textureLoad)",
    ROSETTE_WGSL.show
  ]
];

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock. */
const WEBGPU_DRAWING = `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass and numbers. Each frame is drawn into a
// texture of its own and shown on the canvas by a second pass: a finish (a soft blur, a grain) would take the frame's
// texture there.
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

  // What the GPU holds, made at the start and again on a new device where the old one is lost.
  let rosette, show, uniforms, frame, groups;
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    rosette = pipeline("rosette", "rgba8unorm");
    show = pipeline("show", format);
    uniforms = gpu.createBuffer({ size: ${ROSETTE_UNIFORMS.size}, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    frame = null;
    groups = null;
  };
  make();

  // The canvas at its size, w by h device pixels: the flower laid out for it, its uniforms in the struct's order, and
  // the frame's texture.
  let scene = null;
  const block = new ArrayBuffer(${ROSETTE_UNIFORMS.size});
  const F = new Float32Array(block);
  const I = new Int32Array(block);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
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
    frame?.destroy();
    frame = gpu.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    groups = {
      rosette: gpu.createBindGroup({ layout: rosette.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] }),
      show: gpu.createBindGroup({ layout: show.getBindGroupLayout(0), entries: [{ binding: 0, resource: frame.createView() }] })
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
  // and turned to t, the flower drawn into the frame, the frame shown on the canvas.
  const draw = t => {
    if (!groups) return;
    F.set(rosetteGroup(scene, t), 6);
    gpu.queue.writeBuffer(uniforms, 0, block);
    const encoder = gpu.createCommandEncoder();
    pass(encoder, frame.createView(), rosette, groups.rosette);
    pass(encoder, context.getCurrentTexture().createView(), show, groups.show);
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

/** The rosette as WGSL, its WebGPU page's modules, or as that page: the player's pass on the numbers the player works
    out. `origin` adds the effect's address to the credit. */
export function rosetteWebgpu(
  kind: "wgsl" | "webgpu",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "webgpu")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${ROSETTE_WHAT}, drawn by WebGPU`, origin),
      seed,
      [
        ...WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code })),
        {
          type: "module",
          code: `${rosetteSettings(P, effect, angle)}\n\n${rosetteModel()}\n\n${WEBGPU_DRAWING}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${ROSETTE_WHAT}, as WGSL, the WebGPU page's modules, a section a pass`,
    origin
  );
  return `${rosetteTextHead(credit)}
${WGSL_SECTIONS.map(([header, module]) => `\n// ==== ${header}\n${module}`).join("\n")}
`;
}
