/* The silk in WGSL and as a WebGPU page that plays it (silk-shader.ts names every kind): the player's pass in WGSL
   (silk-wgsl.ts) on the numbers the player works out (silk-page.ts), played by the players' clock (effect-page.ts). The
   page draws each frame into a texture of its own and a second pass shows it on the canvas, the place where a finish
   (a soft blur, a grain) would take the frame. The editor loads this module with the Shader tab's WGSL or WebGPU
   spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";
import { SILK_WHAT, silkModel, silkSettings } from "./silk-page.ts";
import { silkTextHead } from "./silk-webgl.ts";
import { SILK_WGSL } from "./silk-wgsl.ts";

const WEBGPU_SHADERS = [
  ["silk", "text/wgsl", SILK_WGSL.silk],
  ["show", "text/wgsl", SILK_WGSL.show]
] as const;

const WGSL_SECTIONS: readonly [header: string, module: string][] = [
  [
    "Pass 1: the silk ==== target: the frame, W x H (the canvas's device pixels), rgba8unorm, one triangle over it (vertex indexes 0 to 2) | inputs: T, the dye (32 x 3, rgba8unorm; rows dyed, shade, light), S, the profiles (65 x 1, rg16float; valley, crest), both through one sampler (linear, clamp to edge)",
    SILK_WGSL.silk
  ],
  [
    "Pass 2: the canvas ==== target: the canvas, W x H | inputs: the frame (textureLoad)",
    SILK_WGSL.show
  ]
];

/* The WebGPU page's drawing: the same pass and the same numbers, in WebGPU's calls, laid out and drawn by the players'
   clock. */
const WEBGPU_DRAWING = `// The drawing, WebGPU, as the site's player draws it with WebGL: the same pass, tables and numbers. Each frame is drawn
// into a texture of its own and shown on the canvas by a second pass: a finish (a soft blur, a grain) would take the
// frame's texture there.
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

  // What the GPU holds, made at the start and again on a new device where the old one is lost: the passes, the
  // uniforms, the dye's table and the profiles'.
  let silk, show, uniforms, dye, profiles, lerped, frame, groups;
  const make = () => {
    context.configure({ device: gpu, format, alphaMode: "opaque" });
    silk = pipeline("silk", "rgba8unorm");
    show = pipeline("show", format);
    uniforms = gpu.createBuffer({ size: 224, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dye = table(LUT_N, 3, "rgba8unorm", colorTexels(), 4 * LUT_N);
    profiles = table(PROF_N, 1, "rg16float", halves(profileTexels()), 4 * PROF_N);
    lerped = gpu.createSampler({ magFilter: "linear", minFilter: "linear" });
    frame = null;
    groups = null;
  };
  make();

  // The canvas at its size, w by h device pixels: the cloth laid out for it, the uniforms that hold for it, and the
  // frame's texture. The uniforms: D (16 bytes), F (8 vec4), G (4 vec4), N.
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
    }
    scene = silkScene(ANGLE, SHAPE, w, h);
    sceneUniforms(scene, SU);
    bandUniforms(scene, GU);
    NU[0] = scene.folds.length;
    frame?.destroy();
    frame = gpu.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    groups = {
      silk: gpu.createBindGroup({
        layout: silk.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: dye.createView() },
          { binding: 2, resource: profiles.createView() },
          { binding: 3, resource: lerped }
        ]
      }),
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
  // A frame at t seconds of the loop at speed 1, once the canvas has a size on this device: the rings swung to t, the
  // cloth drawn into the frame, the frame shown on the canvas.
  const draw = t => {
    if (!groups) return;
    foldUniforms(scene, t, FU);
    gpu.queue.writeBuffer(uniforms, 0, block);
    const encoder = gpu.createCommandEncoder();
    pass(encoder, frame.createView(), silk, groups.silk);
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

/** The silk as WGSL, its WebGPU page's modules, or as that page: the player's pass on the numbers the player works
    out. `origin` adds the effect's address to the credit. */
export function silkWebgpu(
  kind: "wgsl" | "webgpu",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "webgpu")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${SILK_WHAT}, drawn by WebGPU`, origin),
      seed,
      [
        ...WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code })),
        {
          type: "module",
          code: `${silkSettings(P, effect, angle)}\n\n${silkModel()}\n\n${WEBGPU_DRAWING}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${SILK_WHAT}, as WGSL, the WebGPU page's modules, a section a pass`,
    origin
  );
  return `${silkTextHead(credit)}
${WGSL_SECTIONS.map(([header, module]) => `\n// ==== ${header}\n${module}`).join("\n")}
`;
}
