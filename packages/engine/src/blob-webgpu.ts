/* The blob in WGSL and as a WebGPU page that plays it (blob-shader.ts names every kind): the player's passes in WGSL
   (blob-wgsl.ts) on the numbers the player works out (blob-page.ts), played by the player's clock. The editor loads
   this module with the Shader tab's WGSL or WebGPU spelling. */
import { BLOB_CLOCK, BLOB_MATH, BLOB_WHAT, blobSettings, blobTextHead } from "./blob-page.ts";
import { BLOB_WGSL } from "./blob-wgsl.ts";
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";
import { DEFAULT_ANGLE } from "./view.ts";

const WEBGPU_SHADERS = [
  ["noise", "text/wgsl", BLOB_WGSL.noise],
  ["dots", "text/wgsl", BLOB_WGSL.dots],
  ["blur", "text/wgsl", BLOB_WGSL.blur],
  ["final", "text/wgsl", BLOB_WGSL.final]
] as const;

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

/* The WebGPU page's drawing: the same passes and the same numbers, in WebGPU's calls. */
const WEBGPU_DRAWING = `// The drawing, WebGPU, as the site's player draws it with WebGL.
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

/** The blob as WGSL, its WebGPU page's modules, or as that page: the player's passes on the numbers the player works
    out. `origin` adds the effect's address to the credit, which names no angle: the blob has none. */
export function blobWebgpu(
  kind: "wgsl" | "webgpu",
  P: Palette,
  effect: Effect,
  seed: string,
  origin?: string
): string {
  if (kind === "webgpu")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, DEFAULT_ANGLE, `${BLOB_WHAT}, drawn by WebGPU`, origin),
      seed,
      [
        ...WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code })),
        {
          type: "module",
          code: `${blobSettings(P, effect)}\n\n${BLOB_MATH}\n\n${WEBGPU_DRAWING}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    DEFAULT_ANGLE,
    `${BLOB_WHAT}, as WGSL, the WebGPU page's modules, a section a pass`,
    origin
  );
  return `${blobTextHead(credit)}
${WGSL_SECTIONS.map(([header, module]) => `\n// ==== ${header}\n${module}`).join("\n")}
`;
}
