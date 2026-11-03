/* The silk in GLSL and as a WebGL page that plays it (silk-shader.ts names every kind): the player's own shader
   (silk-gl.ts) on the numbers the player works out (silk-page.ts), played by the players' clock (effect-page.ts). A
   grained silk lays its grain in that pass; a soft one draws the pass into the finish's frame, which the finish then
   lays over the canvas (shader-finish.ts), as the site lays its blur and grain over the player. The editor loads this
   module with the Shader tab's GLSL or WebGL spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import {
  type EffectShaderFinish,
  FINISH_GLSL_SECTIONS,
  FINISH_MATH_JS,
  FINISH_WEBGL_JS,
  FINISH_WEBGL_SHADERS,
  finished,
  finishSettingsJs,
  GRAIN_TILE_JS,
  GRAIN_WEBGL_JS,
  grainedGlsl,
  grainOnly,
  grainSettingsJs
} from "./shader-finish.ts";
import { effectShaderCredit, indent, shaderPageHtml } from "./shader-shell.ts";
import { SILK_FS, SILK_VS } from "./silk-gl.ts";
import { SILK_WHAT, silkModel, silkSettings, silkTextHead } from "./silk-page.ts";

/* the silk's pass with the grain over its bytes, for a grain with no soft, which so needs no pass of its own: p is the
   pixel's place from the top left, as the grain's is, and the bytes are rounded as the canvas rounds them, a half to
   even */
const SILK_GRAIN_FS = grainedGlsl(
  SILK_FS,
  "  outColor = vec4(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), 1.0);",
  "  outColor = grainOver(vec4(roundEven(clamp(mix(mix(b, s, 1.0 - tv), l, 1.0 - tc), 0.0, 1.0) * 255.0), 255.0), ivec2(p)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* each shader in its own element, from the element's first character, so a GLSL one's #version leads it */
const webglShaders = (mode: Mode) =>
  [
    ["silk-vs", "x-shader/x-vertex", SILK_VS],
    ["silk-fs", "x-shader/x-fragment", mode === "grain" ? SILK_GRAIN_FS : SILK_FS]
  ] as const;

/* the GLSL's section: the shaders as the WebGL page compiles them, under its header */
const glslSection = (mode: Mode) =>
  `// ==== Pass 1: the silk ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), RGBA8" : "the canvas, W x H"}, one triangle over it (vertex ids 0 to 2, no attributes) | inputs: T, the dye (32 x 3, RGBA8, linear, clamp to edge; rows dyed, shade, light), S, the profiles (65 x 1, RG16F, linear, clamp to edge; valley, crest)${mode === "grain" ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel)" : ""}
${SILK_VS}
${mode === "grain" ? SILK_GRAIN_FS : SILK_FS}`;

/* The WebGL page's drawing: the player's own (ui/silk-player.ts), laid out and drawn by the players' clock; a grained
   one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webglDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGL 2, as the site's player draws it: the same pass, tables and uniforms, so each frame's GPU work is
// the player's.${finish ? " The finish then lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over the cloth, as the site lays it." : ""}
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

  // What the GPU holds, made at the start and again where a lost context comes back: the pass, the dye's table and
  // the profiles'${finish ? ", and the finish" : grain ? ", and the grain's tile" : ""}.
  let silk, U, vao, dye, profiles${finish ? ", finish" : grain ? ", grainTex" : ""};${grain ? "\n  let grainScale = 1;" : ""}
  const make = () => {
    silk = program("silk-vs", "silk-fs");
    U = Object.fromEntries(${grain ? '["D", "F", "G", "N", "T", "S", "grainTile", "grainScale"]' : '["D", "F", "G", "N", "T", "S"]'}.map(name => [name, gl.getUniformLocation(silk, name)]));
    gl.useProgram(silk);
    gl.uniform1i(U.T, 0);
    gl.uniform1i(U.S, 1);${grain ? "\n    gl.uniform1i(U.grainTile, 2);" : ""}
    vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    dye = texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_N, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorTexels());
    profiles = texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, PROF_N, 1, 0, gl.RG, gl.FLOAT, profileTexels());${finish ? "\n    finish = finishing(gl);" : grain ? "\n    grainTex = grainTexture(gl);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the cloth laid out for it and the uniforms that hold for it.
  let scene = null;
  const SU = new Float32Array(4);
  const GU = new Float32Array(2 * MAX_FOLDS);
  const FU = new Float32Array(4 * MAX_FOLDS);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    grainScale = grainScaleOf(w);" : ""}
    scene = silkScene(ANGLE, SHAPE, w, h);
    sceneUniforms(scene, SU);
    bandUniforms(scene, GU);
  };

  // A frame at t seconds of the loop at speed 1: the rings swung to t, the cloth drawn${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}.
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
    gl.bindTexture(gl.TEXTURE_2D, profiles);${grain ? "\n    gl.activeTexture(gl.TEXTURE2);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1f(U.grainScale, grainScale);" : ""}
    gl.bindFramebuffer(gl.FRAMEBUFFER, ${finish ? "finish.frame" : "null"});
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);${finish ? "\n    finish.draw();" : ""}
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
};

/** The silk as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function silkWebgl(
  kind: "glsl" | "webgl",
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  const mode: Mode = grainOnly(finish) ? "grain" : finished(finish) ? "finish" : "plain";
  if (kind === "webgl") {
    const settings = silkSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${SILK_WHAT}, drawn by WebGL 2`, origin, finish),
      seed,
      [
        ...webglShaders(mode).map(([id, type, code]) => ({ id, type, code })),
        ...(mode === "finish"
          ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${silkModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${silkModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing(mode)}`
                : `${settings}\n\n${silkModel()}\n\n${webglDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${SILK_WHAT}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin,
    finish
  );
  return `${silkTextHead(credit, mode)}

${glslSection(mode)}
${mode === "finish" ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
