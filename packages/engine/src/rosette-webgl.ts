/* The rosette in GLSL and as a WebGL page that plays it (rosette-shader.ts names every kind): the player's own shader
   (rosette-gl.ts) on the numbers the player works out (rosette-page.ts), played by the players' clock
   (effect-page.ts). The page draws each frame into a texture of its own and copies it onto the canvas, the place where
   a finish (a soft blur, a grain) would take the frame. The editor loads this module with the Shader tab's GLSL or
   WebGL spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { ROSETTE_FS, ROSETTE_VS } from "./rosette-gl.ts";
import { ROSETTE_WHAT, rosetteModel, rosetteSettings } from "./rosette-page.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines. */
export function rosetteTextHead(credit: readonly string[]): string {
  return [
    ...credit,
    "",
    "Each frame is one pass over the canvas: each pixel taken back through the loop's zoom and turn into the petals'",
    "own place, the petals that can reach it tried inner first, front to back, each laying its ring's gradient under",
    "those above it until the pixel is covered, then the ground and the heart's glow. Nothing is baked: a frame sets",
    "only the loop's zoom and turn. The uniforms' values are the page's."
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

const WEBGL_SHADERS = [
  ["rosette-vs", "x-shader/x-vertex", ROSETTE_VS],
  ["rosette-fs", "x-shader/x-fragment", ROSETTE_FS]
] as const;

const GLSL_SECTIONS: readonly [header: string, shaders: readonly string[]][] = [
  [
    "Pass 1: the rosette ==== target: the frame, W x H (the canvas's device pixels), RGBA8, one triangle over it (vertex ids 0 to 2, no attributes), then copied onto the canvas | inputs: the uniforms alone",
    [ROSETTE_VS, ROSETTE_FS]
  ]
];

/* the uniforms' names in ROSETTE_FS */
const NAMES = [
  "uBox",
  "uS",
  "uK",
  "uEk",
  "uAlpha",
  "uTurn0",
  "uGroup",
  "uRange",
  "uLens",
  "uLensMid",
  "uAngMax",
  "uGrad",
  "uStopAt",
  "uStop",
  "uKeyOfSlot",
  "uFlow",
  "uPhase",
  "uGround",
  "uHeart",
  "uHeartR"
];

/* The WebGL page's drawing: the player's own (ui/rosette-player.ts), laid out and drawn by the players' clock. */
const WEBGL_DRAWING = `// The drawing, WebGL 2, as the site's player draws it: the same pass and uniforms, so each frame's GPU work is the
// player's. Each frame is drawn into a texture of its own and copied onto the canvas: a finish (a soft blur, a grain)
// would take the frame's texture there.
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

  // What the GPU holds, made at the start and again where a lost context comes back: the pass and the frame's texture.
  let rosette, U, vao, frame;
  const make = () => {
    rosette = program("rosette-vs", "rosette-fs");
    U = Object.fromEntries(${JSON.stringify(NAMES)}.map(name => [name, gl.getUniformLocation(rosette, name)]));
    vao = gl.createVertexArray();
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    frame = { texture: t, buffer: gl.createFramebuffer(), w: 0, h: 0 };
  };
  make();

  // The canvas at its size, w by h device pixels: the flower laid out for it, its uniforms, and the frame's texture.
  let scene = null;
  let values = null;
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scene = rosetteScene(ANGLE, SHAPE, w, h);
    values = rosetteUniforms(scene);
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    frame.w = w;
    frame.h = h;
  };

  // A frame at t seconds of the loop at speed 1: the petals' group zoomed and turned to t, the flower drawn into the
  // frame, the frame copied onto the canvas.
  const draw = t => {
    const v = values;
    gl.useProgram(rosette);
    gl.uniform2f(U.uBox, v.uBox[0], v.uBox[1]);
    gl.uniform1f(U.uS, v.uS);
    gl.uniform1f(U.uK, v.uK);
    gl.uniform1f(U.uEk, v.uEk);
    gl.uniform1f(U.uAlpha, v.uAlpha);
    gl.uniform1f(U.uTurn0, v.uTurn0);
    gl.uniform2i(U.uRange, v.uRange[0], v.uRange[1]);
    gl.uniform4f(U.uLens, v.uLens[0], v.uLens[1], v.uLens[2], v.uLens[3]);
    gl.uniform2f(U.uLensMid, v.uLensMid[0], v.uLensMid[1]);
    gl.uniform1f(U.uAngMax, v.uAngMax);
    gl.uniform4f(U.uGrad, v.uGrad[0], v.uGrad[1], v.uGrad[2], v.uGrad[3]);
    gl.uniform4f(U.uStopAt, v.uStopAt[0], v.uStopAt[1], v.uStopAt[2], v.uStopAt[3]);
    gl.uniform3fv(U.uStop, v.uStop);
    gl.uniform1iv(U.uKeyOfSlot, v.uKeyOfSlot);
    gl.uniform1i(U.uFlow, v.uFlow);
    gl.uniform1i(U.uPhase, v.uPhase);
    gl.uniform3f(U.uGround, v.uGround[0], v.uGround[1], v.uGround[2]);
    gl.uniform3f(U.uHeart, v.uHeart[0], v.uHeart[1], v.uHeart[2]);
    gl.uniform2f(U.uHeartR, v.uHeartR[0], v.uHeartR[1]);
    const [zoom, turn] = rosetteGroup(scene, t);
    gl.uniform2f(U.uGroup, zoom, turn);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.buffer);
    gl.viewport(0, 0, frame.w, frame.h);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frame.buffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, frame.w, frame.h, 0, 0, frame.w, frame.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

/** The rosette as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player works
    out. `origin` adds the effect's address to the credit. */
export function rosetteWebgl(
  kind: "glsl" | "webgl",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "webgl")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${ROSETTE_WHAT}, drawn by WebGL 2`, origin),
      seed,
      [
        ...WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code })),
        { code: `${rosetteSettings(P, effect, angle)}\n\n${rosetteModel()}\n\n${WEBGL_DRAWING}` }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${ROSETTE_WHAT}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin
  );
  return `${rosetteTextHead(credit)}
${GLSL_SECTIONS.map(([header, shaders]) => `\n// ==== ${header}\n${shaders.join("\n")}`).join("\n")}
`;
}
