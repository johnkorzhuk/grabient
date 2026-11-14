/* The aurora in GLSL and as a WebGL page that plays it (aurora-shader.ts names every kind): the player's own pass
   (aurora-gl.ts) on the numbers the player works out (aurora-page.ts), played by the players' clock (effect-page.ts).
   Its table on texture unit 0 and its two tiles of noise on 1 and 2, as the player binds them; a grained one lays its
   grain in the pass, from a tile on unit 3; a soft one draws the pass into the finish's frame, which the finish then
   lays over the canvas (shader-finish.ts), as the site lays its blur and grain over the player. Its canvas is
   premultiplied, as the player's is, so a range that lets the page through shows the page's own. The editor loads this
   module with the Shader tab's GLSL or WebGL spelling. */
import { AURORA_FS, AURORA_TABLE, AURORA_VS } from "./aurora-gl.ts";
import { auroraModel, auroraSettings, auroraTextHead, auroraWhat } from "./aurora-page.ts";
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

/* the pass with the grain over its bytes, for a grain with no soft: px is the pixel's place from the top left, as the
   grain's is, and the bytes, premultiplied, are rounded as the canvas rounds them, a half to even */
const GRAIN_FS = grainedGlsl(
  AURORA_FS,
  "  o = shade(px);",
  "  o = grainOver(roundEven(clamp(shade(px), 0.0, 1.0) * 255.0), ivec2(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* the GLSL's sections: the shaders as the WebGL page compiles them, under the pass's header */
const glslSections = (mode: Mode) =>
  `// ==== Pass 1: the light and the range ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), RGBA8" : "the canvas, W x H"}, one triangle over it (vertex ids 0 to 2, no attributes) | inputs: the frame, the path, the range, the fan, the sheets and the loop's share (uniforms), the table (uTable, unit 0: ${AURORA_TABLE.width} x ${AURORA_TABLE.height}, RGBA32F, texelFetch: the ramp, the path's pieces, the slots they are looked up by and the line the light rises from), the noise and its soft copy (uNoise and uSoft, units 1 and 2: 256 x 256, RGBA8, LINEAR, REPEAT)${mode === "grain" ? ", the grain's tile (unit 3: 128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel)" : ""}
${AURORA_VS}
${mode === "grain" ? GRAIN_FS : AURORA_FS}`;

const NAMES = [
  "uSize",
  "uFrame",
  "uPath",
  "uRange",
  "uFan",
  "uSheets",
  "uTime",
  "uTable",
  "uNoise",
  "uSoft"
];

/* The WebGL page's drawing: the player's own (ui/aurora-player.ts), laid out and drawn by the players' clock; a
   grained one's pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webglDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGL 2, as the site's player draws it: the same pass, uniforms and textures, so each frame's GPU work
// is the player's.${finish ? " The finish then lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its pass lays the grain over the light, as the site lays it." : ""}
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
  // The noise, made once: the same two tiles for every aurora.
  const tiles = auroraTiles();

  // What the GPU holds, made at the start and again where a lost context comes back: the pass, the table and the two
  // tiles${finish ? ", and the finish" : grain ? ", and the grain's tile" : ""}.
  let pass, U, vao, textures, sent${finish ? ", finish" : grain ? ", grainTex" : ""};${grain ? "\n  let grainScale = 1;" : ""}
  const make = () => {
    pass = program("aurora-vs", "aurora-fs");
    U = Object.fromEntries(${JSON.stringify(grain ? [...NAMES, "grainTile", "grainScale"] : NAMES)}.map(name => [name, gl.getUniformLocation(pass, name)]));
    vao = gl.createVertexArray();
    // the table, read texel by texel, sent with each layout; the tiles read between their pixels, repeating
    const texture = (filter, wrap) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    };
    textures = [texture(gl.NEAREST, gl.CLAMP_TO_EDGE)];
    for (const bytes of [tiles.noise, tiles.soft]) {
      const t = texture(gl.LINEAR, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TILE, TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      textures.push(t);
    }
    sent = false;${finish ? "\n    finish = finishing(gl);" : grain ? "\n    grainTex = grainTexture(gl);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the aurora laid out for it.
  let scene = null;
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    grainScale = grainScaleOf(w);" : ""}
    scene = auroraScene(ANGLE, SHAPE, w, h);
    sent = false;
  };

  // A frame at t seconds of the loop at speed 1: the loop's share at t, then the light and the range${finish ? " into the finish's\n  // frame, which the finish lays over the canvas" : " on the canvas"}. What holds for the canvas is set once it is laid out.
  const draw = t => {
    gl.bindVertexArray(vao);
    gl.useProgram(pass);
    if (!sent) {
      const u = sceneUniforms(scene);
      gl.uniform2f(U.uSize, scene.width, scene.height);
      gl.uniform3fv(U.uFrame, u.frame);
      gl.uniform3fv(U.uPath, u.path);
      gl.uniform4fv(U.uRange, u.range);
      gl.uniform2fv(U.uFan, u.fan);
      gl.uniform4fv(U.uSheets, u.sheets);
      gl.uniform1i(U.uTable, 0);
      gl.uniform1i(U.uNoise, 1);
      gl.uniform1i(U.uSoft, 2);${grain ? "\n      gl.uniform1i(U.grainTile, 3);" : ""}
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[0]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SLOTS, TABLE_ROWS, 0, gl.RGBA, gl.FLOAT, auroraTableOf(scene));
      sent = true;
    }
    // the table and the tiles on units 0, 1 and 2, bound each frame${finish ? ", since the finish binds its own there" : ""}
    for (const [unit, texture] of textures.entries()) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }${grain ? "\n    gl.activeTexture(gl.TEXTURE3);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1f(U.grainScale, grainScale);" : ""}
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(U.uTime, auroraTime(t));
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

/** The aurora as GLSL, its WebGL page's shaders, or as that page: the player's pass on the numbers the player works
    out, and its finish where it has a soft or a grain: a grain alone in the pass, a soft in the finish's passes after
    it. `origin` adds the effect's address to the credit. */
export function auroraWebgl(
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
    const settings = auroraSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(
        seed,
        effect,
        angle,
        `${auroraWhat(effect.look.bg)}, drawn by WebGL 2`,
        origin,
        finish
      ),
      seed,
      [
        { id: "aurora-vs", type: "x-shader/x-vertex", code: AURORA_VS },
        {
          id: "aurora-fs",
          type: "x-shader/x-fragment",
          code: mode === "grain" ? GRAIN_FS : AURORA_FS
        },
        ...(mode === "finish"
          ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${auroraModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${auroraModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing(mode)}`
                : `${settings}\n\n${auroraModel()}\n\n${webglDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${auroraWhat(effect.look.bg)}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin,
    finish
  );
  return `${auroraTextHead(credit, mode)}

${glslSections(mode)}
${mode === "finish" ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
