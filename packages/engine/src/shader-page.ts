/* The palette's shader as a page that runs it as pasted: the GLSL drawn by WebGL 2, the WGSL by WebGPU, each the
   Shader tab's own text (shader.ts) inside a script element, so it reads as the tab shows it. The page covers the
   window with one triangle the shader colors, at the screen's density (the canvas's device pixels, as the browser
   lays it out), draws again as the window's size changes, and says in a sentence where the browser lacks WebGL 2 or
   WebGPU. A grained shader's speck spans the canvas's pixels to a CSS pixel, which the page hands it, as the site's
   speck is a CSS pixel. The gradient holds still, so it draws only then. The editor loads this module with the
   shader's texts once its Shader tab shows, never with a page's start. */
import type { Palette } from "./palette.ts";
import { type ShaderFinish, type ShaderView, shaderCredit, shaderText } from "./shader.ts";
import type { ShaderPageKind } from "./shader-kinds.ts";
import { shaderPageHtml } from "./shader-shell.ts";

/* the canvas's size in device pixels, as the browser lays it out, where it says (devicePixelContentBoxSize), and for a
   grained shader its pixels to a CSS pixel, which a speck spans, as the site's speck is a CSS pixel */
const sizes = (grain: boolean) =>
  grain
    ? `// The canvas's size in device pixels, as the browser lays it out, and its pixels to a CSS pixel, which a speck of
// the grain spans, as on the site.
const sizes = new ResizeObserver(([entry]) => {
  const box = entry.devicePixelContentBoxSize?.[0];
  const width = Math.max(1, box ? box.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio));
  draw(
    width,
    Math.max(1, box ? box.blockSize : Math.round(entry.contentRect.height * devicePixelRatio)),
    entry.contentRect.width ? width / entry.contentRect.width : devicePixelRatio
  );
});
try {
  sizes.observe(canvas, { box: "device-pixel-content-box" });
} catch {
  sizes.observe(canvas);
}`
    : `// The canvas's size in device pixels, as the browser lays it out.
const sizes = new ResizeObserver(([entry]) => {
  const box = entry.devicePixelContentBoxSize?.[0];
  draw(
    Math.max(1, box ? box.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio)),
    Math.max(1, box ? box.blockSize : Math.round(entry.contentRect.height * devicePixelRatio))
  );
});
try {
  sizes.observe(canvas, { box: "device-pixel-content-box" });
} catch {
  sizes.observe(canvas);
}`;

const indent = (text: string) =>
  text
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");

/* the WebGL page's script, which sets a grained shader's uGrainScale too */
const webgl = (
  grain: boolean
) => `// The shader above over the whole window, drawn again as its size changes.
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) {
  document.body.textContent = "This page needs WebGL 2, which this browser does not have.";
} else {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  // One triangle over the whole canvas; the shader colors each pixel.
  const vertex = \`#version 300 es
void main() {
  gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0);
}\`;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, document.getElementById("shader").textContent));
  gl.linkProgram(program);
  gl.useProgram(program);
  const resolution = gl.getUniformLocation(program, "uResolution");${grain ? '\n  const grainScale = gl.getUniformLocation(program, "uGrainScale");' : ""}
  const draw = (width, height${grain ? ", scale" : ""}) => {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(resolution, width, height);${grain ? "\n    gl.uniform1f(grainScale, scale);" : ""}
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
${indent(sizes(grain))}
}`;

/* the WebGPU page's script, which binds a grained shader's uGrainScale too */
const webgpu = (
  grain: boolean
) => `// The shader above over the whole window, drawn again as its size changes.
const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
const device = await adapter?.requestDevice().catch(() => null);
if (!device) {
  document.body.textContent = "This page needs WebGPU, which this browser does not have.";
} else {
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  // One triangle over the whole canvas; the shader colors each pixel.
  const vertex = device.createShaderModule({
    code: \`@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(select(-1.0, 3.0, i == 1u), select(-1.0, 3.0, i == 2u), 0.0, 1.0);
}\`
  });
  const fragment = device.createShaderModule({ code: document.getElementById("shader").textContent });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: vertex, entryPoint: "vs_main" },
    fragment: { module: fragment, entryPoint: "fs_main", targets: [{ format }] }
  });
  // uResolution, the canvas's size in device pixels: group 0, binding 0.${grain ? "\n  // uGrainScale, its pixels to a CSS pixel, which a speck spans: group 0, binding 1." : ""}
  const resolution = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });${grain ? "\n  const grainScale = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });" : ""}
  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resolution } }${grain ? ", { binding: 1, resource: { buffer: grainScale } }" : ""}]
  });
  const draw = (width, height${grain ? ", scale" : ""}) => {
    canvas.width = width;
    canvas.height = height;
    device.queue.writeBuffer(resolution, 0, new Float32Array([width, height]));${grain ? "\n    device.queue.writeBuffer(grainScale, 0, new Float32Array([scale]));" : ""}
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };
${indent(sizes(grain))}
}`;

const PAGE = {
  webgl: {
    api: "WebGL 2",
    shader: "glsl",
    type: "x-shader/x-fragment",
    script: undefined,
    code: webgl
  },
  webgpu: {
    api: "WebGPU",
    shader: "wgsl",
    type: "text/wgsl",
    script: "module",
    code: webgpu
  }
} as const;

/** The palette's shader as a complete page: `kind` "webgl" runs the GLSL, "webgpu" the WGSL, `steps` stops in the
    view's style. `origin` adds the palette's address to the credit, as the shader's own has it; `finish` is the
    shader's (a soft view's stops, the grain). */
export function shaderPage(
  kind: ShaderPageKind,
  P: Palette,
  view: ShaderView,
  steps: number,
  seed: string,
  origin?: string,
  finish: ShaderFinish = {}
): string {
  const page = PAGE[kind];
  const credit = shaderCredit(seed, view, steps, origin);
  credit[credit.length - 1] += `, drawn by ${page.api}`;
  /* the shader's text as the tab writes it, from the element's first character, so its #version leads the GLSL */
  const shader = shaderText(page.shader, P, view, steps, seed, origin, finish);
  return shaderPageHtml(credit, seed, [
    { type: page.type, id: "shader", code: shader },
    { type: page.script, code: page.code(!!finish.grain) }
  ]);
}
