/* The fluted glass in WGSL and as a WebGPU page that plays it (glass-shader.ts names every kind): the player's passes
   in WGSL (glass-wgsl.ts) on the numbers the player works out (glass-page.ts), played by the players' clock
   (effect-page.ts). A soft or grained glass draws its last pass into the finish's frame, which the finish then lays
   over the canvas (shader-finish.ts). The editor loads this module with the Shader tab's WGSL or WebGPU spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import { GLASS_MODEL, glassSettingsJs } from "./glass-page.ts";
import {
  GLASS_BAKE_WGSL,
  GLASS_BLUR_WGSL,
  GLASS_DISC_WGSL,
  GLASS_FINAL_WGSL
} from "./glass-wgsl.ts";
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

/* the glass's last pass with the grain over its bytes, for a grain with no soft: the tile at binding 4, its scale at 5 */
const GLASS_FINAL_GRAIN_WGSL = grainedWgsl(
  GLASS_FINAL_WGSL,
  4,
  "  return vec4f(min(vec3f(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);",
  "  return grainOver(vec4f(floor(min(vec3f(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)) * 255.0 + 0.5), 255.0), p) / 255.0;"
);

const webgpuShaders = (grain: boolean) =>
  [
    ["disc", "text/wgsl", GLASS_DISC_WGSL],
    ["blur", "text/wgsl", GLASS_BLUR_WGSL],
    ["glass", "text/wgsl", grain ? GLASS_FINAL_GRAIN_WGSL : GLASS_FINAL_WGSL],
    ["bake", "text/wgsl", GLASS_BAKE_WGSL]
  ] as const;

/* The player's drawing in WebGPU: the same textures, laid out as the player's, the same passes and the same numbers; a
   grained one's last pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webgpuDrawing = (mode: "plain" | "grain" | "finish") => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The player's drawing in WebGPU: the same textures, laid out as the player's, the same passes and the same numbers. A
// device the browser loses is asked for again, and the new one gets a drawing of its own.
const canvas = document.querySelector("canvas");
const context = canvas.getContext("webgpu");
const gpu = async () => {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  return (await adapter?.requestDevice().catch(() => null)) ?? null;
};
const device = await gpu();
if (device) play(device);
else document.body.textContent = "This page needs WebGPU, which this browser does not have.";

function drawing(device) {
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = id => device.createShaderModule({ code: document.getElementById(id).textContent });
  // Two triangles over a target, and the discs as instances of them: middle, radius and core, then color.
  const QUAD = [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }];
  const pipeline = (id, target, buffers, blend) => {
    const code = module(id);
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module: code, entryPoint: "vs_main", buffers },
      fragment: { module: code, entryPoint: "fs_main", targets: [{ format: target, blend }] },
      primitive: { topology: "triangle-strip" }
    });
  };
  const over = { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" };
  const pDisc = pipeline(
    "disc",
    "rgba8unorm",
    [
      ...QUAD,
      {
        arrayStride: 28,
        stepMode: "instance",
        attributes: [
          { shaderLocation: 1, offset: 0, format: "float32x4" },
          { shaderLocation: 2, offset: 16, format: "float32x3" }
        ]
      }
    ],
    { color: over, alpha: over }
  );
  const pBlur = pipeline("blur", "rgba8unorm", QUAD);
  const pFinal = pipeline("glass", ${finish ? '"rgba8unorm"' : "format"}, QUAD);
  const pBake = pipeline("bake", "rgba8unorm", QUAD);${finish ? "\n  const finish = finishing(device, format);" : ""}
  const buffer = (size, usage) => device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST });
  const quad = buffer(32, GPUBufferUsage.VERTEX);
  device.queue.writeBuffer(quad, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  const uField = buffer(16, GPUBufferUsage.UNIFORM);
  const uAcross = buffer(112, GPUBufferUsage.UNIFORM);
  const uDown = buffer(112, GPUBufferUsage.UNIFORM);
  const uGlass = buffer(32, GPUBufferUsage.UNIFORM);
  const uBake = buffer(576, GPUBufferUsage.UNIFORM);
  const bilinear = device.createSampler({ magFilter: "linear", minFilter: "linear" });${grain ? "\n  const grainTex = grainTexture(device);\n  const uGrainScale = grainScaleBuffer(device);" : ""}
  const target = (w, h) =>
    device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
  const group = (p, entries) =>
    device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({ binding, resource }))
    });

  let geo = null;
  let win = null;
  let pl = null;
  let fld = null;
  let stale = false;
  let data = new Float32Array(0);
  let inst = null;
  const pos = new Float32Array(2);
  let base = [0, 0, 0];
  let mapTex = null;
  let fieldTex = [];
  let groups = null;

  // The colors' discs for the layout.
  const color = () => {
    fld = field(geo, COLORS);
    if (data.length !== 7 * fld.discs.length) {
      data = new Float32Array(7 * fld.discs.length);
      inst?.destroy();
      inst = buffer(data.byteLength, GPUBufferUsage.VERTEX);
    }
    fld.discs.forEach((d, i) => {
      const c = hexRgb(d.color);
      data[7 * i + 2] = d.R / pl.q;
      data[7 * i + 3] = fld.core;
      data[7 * i + 4] = c[0];
      data[7 * i + 5] = c[1];
      data[7 * i + 6] = c[2];
    });
    base = hexRgb(fld.base);
  };

  // The design covering the canvas, the textures its size, and the rib map baked with the next frame.
  const layout = (w, h) => {${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : ""}${grain ? "\n    device.queue.writeBuffer(uGrainScale, 0, new Float32Array([grainScaleOf(w)]));" : ""}
    const next = cover(w, h, ANGLE, SHAPE);
    if (
      geo &&
      geo.width === next.geometry.width &&
      geo.angle === next.geometry.angle &&
      geo.shape === next.geometry.shape &&
      win.w === next.window.w &&
      win.h === next.window.h
    )
      return;
    const resized = !win || win.w !== next.window.w || win.h !== next.window.h;
    const was = pl;
    geo = next.geometry;
    win = next.window;
    pl = plan(geo);
    if (resized) {
      mapTex?.destroy();
      mapTex = target(win.w, win.h);
    }
    stale = true;
    if (resized || !was || was.fw !== pl.fw || was.fh !== pl.fh) {
      for (const t of fieldTex) t.destroy();
      fieldTex = [target(pl.fw, pl.fh), target(pl.fw, pl.fh)];
      const taps = new Float32Array(24);
      pl.taps.forEach(([o, w], i) => {
        taps[4 * i] = o;
        taps[4 * i + 1] = w;
      });
      const blur = (x, y) => {
        const values = new Float32Array(28);
        values[0] = x;
        values[1] = y;
        values.set(taps, 4);
        return values;
      };
      device.queue.writeBuffer(uAcross, 0, blur(1 / pl.fw, 0));
      device.queue.writeBuffer(uDown, 0, blur(0, 1 / pl.fh));
      device.queue.writeBuffer(uField, 0, new Float32Array([pl.fw, pl.fh, 0, 1]));
    }
    color();
    const views = { map: mapTex.createView(), field: fieldTex.map(t => t.createView()) };
    groups = {
      disc: group(pDisc, [{ buffer: uField }]),
      across: group(pBlur, [views.field[0], bilinear, { buffer: uAcross }]),
      down: group(pBlur, [views.field[1], bilinear, { buffer: uDown }]),
      glass: group(pFinal, [views.map, views.field[0], bilinear, { buffer: uGlass }${grain ? ", grainTex.createView(), { buffer: uGrainScale }" : ""}]),
      views
    };
    const { region } = geo;
    device.queue.writeBuffer(
      uGlass,
      0,
      new Float32Array([region.x, region.y, win.x, win.y, 1 / (pl.q * pl.fw), 1 / (pl.q * pl.fh), win.h, geo.scale])
    );
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  // The rib map: each pixel's displacement and light, in one pass.
  const bake = encoder => {
    const list = geo.ribs;
    const stops = list[0]?.stops.length ?? 0;
    const width = 1 + stops;
    const rows = new Float32Array(Math.max(1, width * list.length) * 4);
    list.forEach((r, i) => {
      const row = i * width * 4;
      rows[row] = r.cx;
      rows[row + 1] = r.cy;
      rows[row + 2] = r.r * r.r;
      r.stops.forEach(([o, v], k) => {
        rows[row + 4 * (1 + k)] = o;
        rows[row + 4 * (1 + k) + 1] = v;
      });
    });
    const ribsBuffer = buffer(rows.byteLength, GPUBufferUsage.STORAGE);
    device.queue.writeBuffer(ribsBuffer, 0, rows);
    const values = new ArrayBuffer(576);
    const f = new Float32Array(values);
    const n = geo.normal;
    f.set([win.x, win.y], 0);
    new Int32Array(values, 8, 2).set([list.length, stops]);
    f.set([n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1], 4);
    n.stops.forEach(([o, r, g], k) => f.set([o, r, g], 8 + 4 * k));
    geo.shadeTable.forEach((v, k) => {
      f[76 + 4 * k] = v;
    });
    device.queue.writeBuffer(uBake, 0, values);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: groups.views.map, loadOp: "clear", storeOp: "store" }]
    });
    pass.setPipeline(pBake);
    pass.setBindGroup(0, group(pBake, [{ buffer: ribsBuffer }, { buffer: uBake }]));
    pass.setVertexBuffer(0, quad);
    pass.draw(4);
    pass.end();
    return ribsBuffer;
  };

  const run = (encoder, view, p, bindGroup, load) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: "clear", clearValue: load, storeOp: "store" }]
    });
    pass.setPipeline(p);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, quad);
    return pass;
  };

  // A frame: the discs into the field, the blur across and down, and the glass over the canvas.
  const draw = t => {
    const encoder = device.createCommandEncoder();
    const ribsBuffer = stale ? bake(encoder) : null;
    stale = false;
    const { region } = geo;
    const q = pl.q;
    for (let i = 0; i < fld.discs.length; i++) {
      discAt(geo, fld.discs[i], t, pos, 0);
      data[7 * i] = (pos[0] - region.x) / q;
      data[7 * i + 1] = (pos[1] - region.y) / q;
    }
    device.queue.writeBuffer(inst, 0, data);
    const discs = run(encoder, groups.views.field[0], pDisc, groups.disc, { r: base[0], g: base[1], b: base[2], a: 1 });
    discs.setVertexBuffer(1, inst);
    discs.draw(4, fld.discs.length);
    discs.end();
    let pass = run(encoder, groups.views.field[1], pBlur, groups.across);
    pass.draw(4);
    pass.end();
    pass = run(encoder, groups.views.field[0], pBlur, groups.down);
    pass.draw(4);
    pass.end();
    pass = run(encoder, ${finish ? "finish.view" : "context.getCurrentTexture().createView()"}, pFinal, groups.glass);
    pass.draw(4);
    pass.end();${finish ? "\n    finish.draw(encoder, context.getCurrentTexture().createView());" : ""}
    device.queue.submit([encoder.finish()]);
    ribsBuffer?.destroy();
  };
  return { layout, draw };
}

function play(device) {
  let drawn = drawing(device);
  const layout = (w, h) => drawn?.layout(w, h);
  const draw = t => drawn?.draw(t);
${indent(EFFECT_CLOCK)}
  // A device lost draws nothing: the page asks for another, three times at most, and goes on with it, or says so.
  let again = 0;
  const watch = one =>
    one.lost.then(async () => {
      lose();
      drawn = null;
      const next = ++again <= 3 ? await gpu() : null;
      if (!next) {
        document.body.textContent = "This page lost its GPU device, and the browser gave it no other.";
        return;
      }
      drawn = drawing(next);
      watch(next);
      found();
    });
  watch(device);
}`;
};

const wgslSections = (
  grain: boolean
) => `// ==== Pass 1: discs ==== target: the field, fw x fh texels (1/q of the filter's region), rgba8unorm, cleared to the base color, blended one, one-minus-src-alpha | inputs: the twelve discs as instanced quads (a triangle strip of 4 vertices)
${GLASS_DISC_WGSL}
// ==== Passes 2 and 3: blur ==== target: across into a second field texture, then down into the first, rgba8unorm, step (1 / fw, 0) then (0, 1 / fh) | inputs: the field before (linear, clamp to edge)
${GLASS_BLUR_WGSL}
// ==== Pass 4: glass ==== target: the canvas, W x H | inputs: the rib map (textureLoad), Pass 3 (linear, clamp to edge)${grain ? ", the grain's tile (binding 4: 128 x 128, r8uint, a speck's alpha with white in its lowest bit, textureLoad) and its scale (binding 5: the canvas's pixels to a CSS pixel)" : ""}
${grain ? GLASS_FINAL_GRAIN_WGSL : GLASS_FINAL_WGSL}
// ==== Bake: rib map ==== target: W x H, rgba8unorm, once for each size, angle and shape, before the frame that needs it | inputs: the ribs, a row each (a storage buffer)
${GLASS_BAKE_WGSL}`;

/** The glass as WGSL, its WebGPU page's passes, or as that page: the player's passes on the numbers the player works
    out. `origin` adds the effect's address to the credit. */
export function glassWebgpu(
  kind: "wgsl" | "webgpu",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  /* a grain alone in the glass's own last pass; a soft in the finish's passes after it */
  const grain = grainOnly(finish);
  const done = finished(finish) && !grain;
  if (kind === "webgpu")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, "fluted glass, drawn by WebGPU", origin, finish),
      seed,
      [
        {
          code: done
            ? `${glassSettingsJs(P, effect, angle)}\n\n${finishSettingsJs(finish, "ANGLE")}`
            : grain
              ? `${glassSettingsJs(P, effect, angle)}\n\n${grainSettingsJs(finish.grain ?? 0)}`
              : glassSettingsJs(P, effect, angle)
        },
        ...webgpuShaders(grain).map(([id, type, code]) => ({ id, type, code })),
        ...(done ? FINISH_WEBGPU_SHADERS.map(([id, type, code]) => ({ id, type, code })) : []),
        {
          type: "module",
          code: done
            ? `${GLASS_MODEL}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGPU_JS}\n\n${webgpuDrawing("finish")}`
            : grain
              ? `${GLASS_MODEL}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGPU_JS}\n\n${webgpuDrawing("grain")}`
              : `${GLASS_MODEL}\n\n${webgpuDrawing("plain")}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    "fluted glass: the WGSL passes its WebGPU page runs",
    origin,
    finish
  );
  return `${credit.map(line => `// ${line}`).join("\n")}
// The page's JavaScript works out each frame's numbers as the site's player does: the ribs and their stops, the
// discs' places, the blur's taps and the uniforms below.

${wgslSections(grain)}${done ? `\n\n${FINISH_WGSL_SECTIONS}` : ""}`;
}
