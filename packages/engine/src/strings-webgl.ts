/* The strings in GLSL and as a WebGL page that plays them (strings-shader.ts names every kind): the player's own pass
   (strings-gl.ts) on the numbers the player works out (strings-page.ts), played by the players' clock
   (effect-page.ts). A grained one lays its grain in the pass; a soft one draws the pass into the finish's frame, which
   the finish then lays over the canvas (shader-finish.ts), as the site lays its blur and grain over the player. Its
   canvas is premultiplied, as the player's is, so a ground that lets the page through shows the page's own. The editor
   loads this module with the Shader tab's GLSL or WebGL spelling. */
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
import { STRINGS_FS, STRINGS_VS } from "./strings-gl.ts";
import { stringsModel, stringsSettings, stringsTextHead, stringsWhat } from "./strings-page.ts";

/* the pass with the grain over its bytes, for a grain with no soft: px is the pixel's place from the top left, as the
   grain's is, and the bytes, premultiplied, are rounded as the canvas rounds them, a half to even */
const GRAIN_FS = grainedGlsl(
  STRINGS_FS,
  "  o = shade(px);",
  "  o = grainOver(roundEven(clamp(shade(px), 0.0, 1.0) * 255.0), ivec2(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the GLSL's sections: the shaders as the WebGL page compiles them, under the pass's header */
const glslSections = (mode: Mode) =>
  `// ==== Pass 1: the threads ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), RGBA8" : "the canvas, W x H"}, one triangle over it (vertex ids 0 to 2, no attributes) | inputs: the design, the threads' width and ends, the blob, the colors and the frame's phases (uniforms)${mode === "grain" ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel)" : ""}
${STRINGS_VS}
${mode === "grain" ? GRAIN_FS : STRINGS_FS}`;

const NAMES = [
  "uSize",
  "uD",
  "uField",
  "uShear",
  "uWave",
  "uLump",
  "uPhase",
  "uLine",
  "uBlob",
  "uGround",
  "uStops"
];

/* The WebGL page's drawing: the player's own (ui/strings-player.ts), laid out and drawn by the players' clock; a
   grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webglDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGL 2, as the site's player draws it: the same pass and uniforms, so each frame's GPU work is the
// player's.${finish ? " The finish then lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over the threads, as the site lays it." : ""}
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: true,
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
    pass = program("strings-vs", "strings-fs");
    U = Object.fromEntries(${JSON.stringify(grain ? [...NAMES, "grainTile", "grainScale"] : NAMES)}.map(name => [name, gl.getUniformLocation(pass, name)]));
    vao = gl.createVertexArray();
    sent = false;${finish ? "\n    finish = finishing(gl);" : grain ? "\n    grainTex = grainTexture(gl);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the strings laid out for it.
  let scene = null;
  const at = new Float32Array(FRAME_SIZE);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    grainScale = grainScaleOf(w);" : ""}
    scene = stringsScene(ANGLE, SHAPE, w, h);
    sent = false;
  };

  // A frame at t seconds of the loop at speed 1: the phases at t, then the threads${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}. What holds for the
  // canvas is set once it is laid out.
  const draw = t => {
    gl.bindVertexArray(vao);
    gl.useProgram(pass);
    if (!sent) {
      const u = sceneUniforms(scene);
      gl.uniform2f(U.uSize, scene.width, scene.height);
      gl.uniform1f(U.uD, scene.D);
      gl.uniform2fv(U.uField, u.field);
      gl.uniform4fv(U.uShear, u.shear);
      gl.uniform4fv(U.uWave, u.wave);
      gl.uniform3fv(U.uLump, u.lump);
      gl.uniform4fv(U.uLine, u.line);
      gl.uniform4fv(U.uBlob, u.blob);
      gl.uniform4fv(U.uGround, u.ground);
      gl.uniform3fv(U.uStops, u.stops);${grain ? "\n      gl.uniform1i(U.grainTile, 1);" : ""}
      sent = true;
    }
    frameAt(scene, t, at);
    gl.uniform1fv(U.uPhase, at);${grain ? "\n    gl.activeTexture(gl.TEXTURE1);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1f(U.grainScale, grainScale);\n    gl.activeTexture(gl.TEXTURE0);" : ""}
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

/** The strings as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function stringsWebgl(
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
    const settings = stringsSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(
        seed,
        effect,
        angle,
        `${stringsWhat(effect.look.bg)}, drawn by WebGL 2`,
        origin,
        finish
      ),
      seed,
      [
        { id: "strings-vs", type: "x-shader/x-vertex", code: STRINGS_VS },
        {
          id: "strings-fs",
          type: "x-shader/x-fragment",
          code: mode === "grain" ? GRAIN_FS : STRINGS_FS
        },
        ...(mode === "finish"
          ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${stringsModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${stringsModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing(mode)}`
                : `${settings}\n\n${stringsModel()}\n\n${webglDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${stringsWhat(effect.look.bg)}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin,
    finish
  );
  return `${stringsTextHead(credit, mode)}

${glslSections(mode)}
${mode === "finish" ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
