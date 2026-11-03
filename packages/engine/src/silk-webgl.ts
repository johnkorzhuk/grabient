/* The silk in GLSL and as a WebGL page that plays it (silk-shader.ts names every kind): the player's own shader
   (silk-gl.ts) on the numbers the player works out (silk-page.ts), played by the players' clock (effect-page.ts). The
   page draws each frame into a texture of its own and copies it onto the canvas, the place where a finish (a soft
   blur, a grain) would take the frame. The editor loads this module with the Shader tab's GLSL or WebGL spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";
import { SILK_FS, SILK_VS } from "./silk-gl.ts";
import { SILK_WHAT, silkModel, silkSettings } from "./silk-page.ts";

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines. */
export function silkTextHead(credit: readonly string[]): string {
  return [
    ...credit,
    "",
    "Each frame is one pass over the canvas: the folds' rings tested by squared distance, a pixel in a ring's band",
    "reading the valley's and the crest's profiles across it, then the dye's three rows at the pixel's place along the",
    "dye's line, lerp(lerp(dyed, shade, valley), light, crest). The tables are baked once a palette; a frame sets only",
    "the rings' middles. The uniforms' values are the page's."
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

/* each shader in its own element, from the element's first character, so a GLSL one's #version leads it */
const WEBGL_SHADERS = [
  ["silk-vs", "x-shader/x-vertex", SILK_VS],
  ["silk-fs", "x-shader/x-fragment", SILK_FS]
] as const;

/* the GLSL's section: the shaders as the WebGL page compiles them, under its header */
const GLSL_SECTIONS: readonly [header: string, shaders: readonly string[]][] = [
  [
    "Pass 1: the silk ==== target: the frame, W x H (the canvas's device pixels), RGBA8, one triangle over it (vertex ids 0 to 2, no attributes), then copied onto the canvas | inputs: T, the dye (32 x 3, RGBA8, linear, clamp to edge; rows dyed, shade, light), S, the profiles (65 x 1, RG16F, linear, clamp to edge; valley, crest)",
    [SILK_VS, SILK_FS]
  ]
];

/* The WebGL page's drawing: the player's own (ui/silk-player.ts), laid out and drawn by the players' clock. */
const WEBGL_DRAWING = `// The drawing, WebGL 2, as the site's player draws it: the same pass, tables and uniforms, so each frame's GPU work is
// the player's. Each frame is drawn into a texture of its own and copied onto the canvas: a finish (a soft blur, a
// grain) would take the frame's texture there.
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false
});
if (gl) play();
else document.body.textContent = "This page needs WebGL 2, which this browser does not have.";

function play() {
  const program = (vertex, fragment) => {
    const p = gl.createProgram();
    for (const [type, id] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, document.getElementById(id).textContent);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p, shader);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const texture = filter => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  // What the GPU holds, made at the start and again where a lost context comes back: the pass, the dye's table, the
  // profiles' and the frame's texture.
  let silk, U, vao, dye, profiles, frame;
  const make = () => {
    silk = program("silk-vs", "silk-fs");
    U = Object.fromEntries(["D", "F", "G", "N", "T", "S"].map(name => [name, gl.getUniformLocation(silk, name)]));
    gl.useProgram(silk);
    gl.uniform1i(U.T, 0);
    gl.uniform1i(U.S, 1);
    vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    dye = texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_N, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorTexels());
    profiles = texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, PROF_N, 1, 0, gl.RG, gl.FLOAT, profileTexels());
    frame = { texture: texture(gl.NEAREST), buffer: gl.createFramebuffer(), w: 0, h: 0 };
  };
  make();

  // The canvas at its size, w by h device pixels: the cloth laid out for it, the uniforms that hold for it, and the
  // frame's texture.
  let scene = null;
  const SU = new Float32Array(4);
  const GU = new Float32Array(2 * MAX_FOLDS);
  const FU = new Float32Array(4 * MAX_FOLDS);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scene = silkScene(ANGLE, SHAPE, w, h);
    sceneUniforms(scene, SU);
    bandUniforms(scene, GU);
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    frame.w = w;
    frame.h = h;
  };

  // A frame at t seconds of the loop at speed 1: the rings swung to t, the cloth drawn into the frame, the frame copied
  // onto the canvas.
  const draw = t => {
    gl.useProgram(silk);
    gl.uniform4fv(U.D, SU);
    gl.uniform2fv(U.G, GU);
    gl.uniform1i(U.N, scene.folds.length);
    foldUniforms(scene, t, FU);
    gl.uniform4fv(U.F, FU);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, profiles);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.buffer);
    gl.viewport(0, 0, frame.w, frame.h);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frame.buffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, frame.w, frame.h, 0, 0, frame.w, frame.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  };

${indent(EFFECT_CLOCK)}
  // A lost context draws nothing until the browser gives it back: everything the GPU held is then made again on it.
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lose();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    make();
    found();
  });
}`;

/** The silk as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player works
    out. `origin` adds the effect's address to the credit. */
export function silkWebgl(
  kind: "glsl" | "webgl",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "webgl")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${SILK_WHAT}, drawn by WebGL 2`, origin),
      seed,
      [
        ...WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code })),
        { code: `${silkSettings(P, effect, angle)}\n\n${silkModel()}\n\n${WEBGL_DRAWING}` }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${SILK_WHAT}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin
  );
  return `${silkTextHead(credit)}
${GLSL_SECTIONS.map(([header, shaders]) => `\n// ==== ${header}\n${shaders.join("\n")}`).join("\n")}
`;
}
