/* A field effect in GLSL and as a WebGL page that plays it (kit/shader.ts names every kind): the player's own pass
   (kit/gl.ts) on the numbers the player works out (kit/page.ts), played by the players' clock (effect-page.ts). A
   grained one lays its grain in the pass; a soft one draws the pass into the finish's frame, which the finish then
   lays over the canvas (shader-finish.ts), as the site lays its blur and grain over the player. */
import type { EffectSettings } from "../effect.ts";
import { EFFECT_CLOCK } from "../effect-page.ts";
import type { Palette } from "../palette.ts";
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
} from "../shader-finish.ts";
import { indent, shaderPageHtml } from "../shader-shell.ts";
import {
  KIT_BYTES_GLSL,
  KIT_VS,
  kitFragment,
  kitLineFixed,
  kitMoves,
  kitShadowInk,
  kitStepped,
  kitUniformNames
} from "./gl.ts";
import { kitCredit, kitModel, kitSettings, kitTextHead, kitWhat } from "./page.ts";
import type { KitKernelCode } from "./shader.ts";
import type { FieldEffect } from "./types.ts";

type Mode = "plain" | "grain" | "finish";

/* the pass with the grain over its bytes, for a grain with no soft: px is the pixel's place from the top left, as the
   grain's is, and the grain lies over the bytes the pass rounds (a tie up, as kitByte rounds), as fx-finish.ts lays it
   over the CPU's */
const grainFs = (fs: string) =>
  grainedGlsl(
    fs,
    `  o = vec4(${KIT_BYTES_GLSL} / 255.0, 1.0);`,
    `  o = grainOver(vec4(${KIT_BYTES_GLSL}, 255.0), ivec2(px)) / 255.0;`
  );

/* the GLSL's sections: the shaders as the WebGL page compiles them, under the pass's header */
const glslSections = (fs: string, mode: Mode) =>
  `// ==== Pass 1: the field ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), RGBA8" : "the canvas, W x H"}, one triangle over it (vertex ids 0 to 2, no attributes) | inputs: the canvas, D, the view's turn, the colors, the design's constants and the frame's phases and moves (uniforms)${mode === "grain" ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel)" : ""}
${KIT_VS}
${mode === "grain" ? grainFs(fs) : fs}`;

/* The WebGL page's drawing: the player's own (ui/kit-player.ts), laid out and drawn by the players' clock; a grained
   one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webglDrawing = (def: FieldEffect, mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  const names = kitUniformNames(def);
  return `// The drawing, WebGL 2, as the site's player draws it: the same pass and uniforms, so each frame's GPU work is the
// player's.${finish ? " The finish then lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over the picture, as the site lays it." : ""}
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

  // What the GPU holds, made at the start and again where a lost context comes back: the pass${finish ? " and the finish" : grain ? " and the grain's tile" : ""}.
  let pass, U, vao, sent${finish ? ", finish" : grain ? ", grainTex" : ""};${grain ? "\n  let grainScale = 1;" : ""}
  const make = () => {
    pass = program("${def.kind}-vs", "${def.kind}-fs");
    U = Object.fromEntries(${JSON.stringify(grain ? [...names, "grainTile", "grainScale"] : names)}.map(name => [name, gl.getUniformLocation(pass, name)]));
    vao = gl.createVertexArray();
    sent = false;${finish ? "\n    finish = finishing(gl);" : grain ? "\n    grainTex = grainTexture(gl);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the effect laid out for it.
  let scene = null;
  const phases = new Float32Array(${4 * Math.ceil(def.tracks / 4)});
  const move = new Float32Array(4);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    grainScale = grainScaleOf(w);" : ""}
    scene = kitScene(ANGLE, w, h);
    sent = false;
  };

  // A frame at t seconds of the loop at speed 1: the phases${kitMoves(def) ? " and the moves" : ""} at t, then the field${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}. What holds
  // for the canvas is set once it is laid out.
  const draw = t => {
    gl.bindVertexArray(vao);
    gl.useProgram(pass);
    if (!sent) {
      const u = sceneUniforms(scene);
      gl.uniform2fv(U.uSize, u.size);
      gl.uniform1f(U.uD, u.D);
      gl.uniform2fv(U.uTurn, u.turn);
      gl.uniform3fv(U.uGround, u.ground);${kitShadowInk(def) ? "\n      gl.uniform3fv(U.uShade, u.shade);" : ""}${kitLineFixed(def) ? "\n      gl.uniform3fv(U.uLine, u.line);" : ""}
      gl.uniform3fv(U.uStops, u.stops);${kitStepped(def) ? "\n      gl.uniform4fv(U.uLevels, u.levels);" : ""}
      for (const name in u.K) gl.uniform4fv(U[\`uK_\${name}\`], u.K[name]);${grain ? "\n      gl.uniform1i(U.grainTile, 1);" : ""}
      sent = true;
    }
    frameAt(t, phases, move);
    gl.uniform4fv(U.uKF, phases);${kitMoves(def) ? "\n    gl.uniform4fv(U.uMove, move);" : ""}${grain ? "\n    gl.activeTexture(gl.TEXTURE1);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1f(U.grainScale, grainScale);\n    gl.activeTexture(gl.TEXTURE0);" : ""}
    gl.bindFramebuffer(gl.FRAMEBUFFER, ${finish ? "finish.frame" : "null"});
    gl.viewport(0, 0, scene.width, scene.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);${finish ? "\n    finish.draw();" : ""}
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

/** A field effect as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player
    works out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes
    after it. `origin` adds the effect's address to the credit. */
export function kitWebgl(
  def: FieldEffect,
  kernel: KitKernelCode,
  kind: "glsl" | "webgl",
  P: Palette,
  play: EffectSettings,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  const mode: Mode = grainOnly(finish) ? "grain" : finished(finish) ? "finish" : "plain";
  const fs = kitFragment(def, kernel.glsl);
  if (kind === "webgl") {
    const settings = kitSettings(def, P, play, angle);
    const model = kitModel(def, P, play.look.shape);
    return shaderPageHtml(
      kitCredit(def, seed, play, angle, `${kitWhat(def)}, drawn by WebGL 2`, origin, finish),
      seed,
      [
        { id: `${def.kind}-vs`, type: "x-shader/x-vertex", code: KIT_VS },
        {
          id: `${def.kind}-fs`,
          type: "x-shader/x-fragment",
          code: mode === "grain" ? grainFs(fs) : fs
        },
        ...(mode === "finish"
          ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${model}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing(def, mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${model}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing(def, mode)}`
                : `${settings}\n\n${model}\n\n${webglDrawing(def, mode)}`
        }
      ]
    );
  }
  const credit = kitCredit(
    def,
    seed,
    play,
    angle,
    `${kitWhat(def)}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin,
    finish
  );
  return `${kitTextHead(def, credit, mode, play.look.steps)}

${glslSections(fs, mode)}
${mode === "finish" ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
