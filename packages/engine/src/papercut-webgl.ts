/* The papercut in GLSL and as a WebGL page that plays it (papercut-shader.ts names every kind): the player's own two
   passes (papercut-gl.ts) on the numbers the player works out (papercut-page.ts), played by the players' clock
   (effect-page.ts). A grained papercut lays its grain in the shading pass; a soft one draws that pass into the finish's
   frame, which the finish then lays over the canvas (shader-finish.ts), as the site lays its blur and grain over the
   player. The editor loads this module with the Shader tab's GLSL or WebGL spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import type { Palette } from "./palette.ts";
import { PAPERCUT_FIELD_FS, PAPERCUT_SHADE_FS, PAPERCUT_VS } from "./papercut-gl.ts";
import {
  PAPERCUT_WHAT,
  papercutModel,
  papercutSettings,
  papercutTextHead
} from "./papercut-page.ts";
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

/* the shading pass with the grain over its bytes, for a grain with no soft, which so needs no pass of its own: px is
   the pixel's place from the top left, as the grain's is, and the bytes are rounded as the canvas rounds them, a half
   to even */
const SHADE_GRAIN_FS = grainedGlsl(
  PAPERCUT_SHADE_FS,
  "  o = shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px);",
  "  o = grainOver(vec4(roundEven(clamp(shade(mix(mix(f00, f10, a.x), mix(f01, f11, a.x), a.y), px).rgb, 0.0, 1.0) * 255.0), 255.0), ivec2(px)) / 255.0;"
);

type Mode = "plain" | "grain" | "finish";

/* each shader in its own element, from the element's first character, so a GLSL one's #version leads it */
const webglShaders = (mode: Mode) =>
  [
    ["papercut-vs", "x-shader/x-vertex", PAPERCUT_VS],
    ["papercut-field-fs", "x-shader/x-fragment", PAPERCUT_FIELD_FS],
    [
      "papercut-shade-fs",
      "x-shader/x-fragment",
      mode === "grain" ? SHADE_GRAIN_FS : PAPERCUT_SHADE_FS
    ]
  ] as const;

/* the GLSL's sections: the shaders as the WebGL page compiles them, a pass a section under its header */
const glslSections = (mode: Mode) =>
  `// ==== Pass 1: the field ==== target: ceil((W - 1) / 4) + 3 x ceil((H - 1) / 4) + 3 texels (a sample every fourth pixel each way, one past each edge), RGBA32UI (each float's bits), one triangle over it (vertex ids 0 to 2, no attributes) | inputs: the ramp, the waves and the hills (uniforms)
${PAPERCUT_VS}
${PAPERCUT_FIELD_FS}

// ==== Pass 2: the sheets ==== target: ${mode === "finish" ? "the finish's frame, W x H (the canvas's device pixels), RGBA8" : "the canvas, W x H"}, the same triangle | inputs: Pass 1 (texelFetch), the levels, the sheets' colors and shadows and the light (uniforms)${mode === "grain" ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch) and its scale (the canvas's pixels to a CSS pixel)" : ""}
${mode === "grain" ? SHADE_GRAIN_FS : PAPERCUT_SHADE_FS}`;

/* The WebGL page's drawing: the player's own (ui/papercut-player.ts), laid out and drawn by the players' clock; a
   grained one's shading pass lays the grain from its tile, and a soft one's draws into the finish's frame. */
const webglDrawing = (mode: Mode) => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGL 2, as the site's player draws it: the same two passes, texture and uniforms, so each frame's GPU
// work is the player's.${finish ? " The finish then lays the frame over the canvas, soft and grained as the site lays it." : grain ? " Its shading pass lays the grain over the paper, as the site lays it." : ""}
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
  const locate = (p, names) => Object.fromEntries(names.map(name => [name, gl.getUniformLocation(p, name)]));

  // What the GPU holds, made at the start and again where a lost context comes back: the two passes, the field's
  // texture and its framebuffer${finish ? ", and the finish" : grain ? ", and the grain's tile" : ""}.
  let pField, pShade, UF, US, vao, field, target, tw, th, sent${finish ? ", finish" : grain ? ", grainTex" : ""};${grain ? "\n  let grainScale = 1;" : ""}
  const make = () => {
    pField = program("papercut-vs", "papercut-field-fs");
    pShade = program("papercut-vs", "papercut-shade-fs");
    UF = locate(pField, ["uSize", "uD", "uRamp", "uWarp", "uPhase", "uBumps", "uBump"]);
    US = locate(pShade, ["uSize", "uD", "uLight", "uSheets", "uLevel", "uFace", "uWallC", "uShade", "uSheet", "uReach", "uMisc", "uField"${grain ? ', "grainTile", "grainScale"' : ""}]);
    vao = gl.createVertexArray();
    field = gl.createTexture();
    target = gl.createFramebuffer();
    tw = 0;
    th = 0;
    sent = false;${finish ? "\n    finish = finishing(gl);" : grain ? "\n    grainTex = grainTexture(gl);" : ""}
  };
  make();

  // The canvas at its size, w by h device pixels: the papercut laid out for it, and the field's texture its size, a
  // sample every fourth pixel each way and one past each edge, each float kept whole as its bits.
  let scene = null;
  const at = new Float32Array(MAX_BUMPS * BUMP + 6);
  const bump = new Float32Array(MAX_BUMPS * BUMP);
  const rest = new Float32Array(6);
  const layout = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }${finish ? "\n    finish.layout(w, h, grainScaleOf(w));" : grain ? "\n    grainScale = grainScaleOf(w);" : ""}
    scene = papercutScene(ANGLE, SHAPE, w, h);
    const size = fieldSize(scene);
    if (size.w !== tw || size.h !== th) {
      tw = size.w;
      th = size.h;
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, tw, th, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, field, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    sent = false;
  };

  // A frame at t seconds of the loop at speed 1: the field with the hills, the waves and the light at t, then the
  // sheets shaded from it${finish ? " into the finish's frame, which the finish lays over the canvas" : " on the canvas"}. What holds for the canvas is
  // set once it is laid out.
  const draw = t => {
    gl.bindVertexArray(vao);
    if (!sent) {
      const u = sceneUniforms(scene);
      gl.useProgram(pShade);
      gl.uniform2f(US.uSize, scene.width, scene.height);
      gl.uniform1f(US.uD, scene.D);
      gl.uniform1i(US.uSheets, scene.n);
      gl.uniform1fv(US.uLevel, u.level);
      gl.uniform3fv(US.uFace, u.face);
      gl.uniform3fv(US.uWallC, u.wall);
      gl.uniform3fv(US.uShade, u.shadow);
      gl.uniform4fv(US.uSheet, u.sheet);
      gl.uniform1fv(US.uReach, u.reach);
      gl.uniform2f(US.uMisc, u.misc[0], u.misc[1]);
      gl.uniform1i(US.uField, 0);${grain ? "\n      gl.uniform1i(US.grainTile, 1);" : ""}
      gl.useProgram(pField);
      gl.uniform2f(UF.uSize, scene.width, scene.height);
      gl.uniform1f(UF.uD, scene.D);
      gl.uniform2f(UF.uRamp, scene.rx, scene.ry);
      gl.uniform4f(UF.uWarp, scene.wa, scene.wf, scene.wa2, scene.wf2);
      gl.uniform1i(UF.uBumps, scene.bumps.length);
      sent = true;
    }
    frameUniforms(scene, t, at, bump, rest);
    // the field, a sample every fourth pixel
    gl.useProgram(pField);
    gl.uniform4fv(UF.uBump, bump);
    gl.uniform4f(UF.uPhase, rest[0], rest[1], rest[2], rest[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, tw, th);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // the sheets, shaded from it
    gl.bindFramebuffer(gl.FRAMEBUFFER, ${finish ? "finish.frame" : "null"});
    gl.useProgram(pShade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, field);${grain ? "\n    gl.activeTexture(gl.TEXTURE1);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1f(US.grainScale, grainScale);\n    gl.activeTexture(gl.TEXTURE0);" : ""}
    gl.uniform2f(US.uLight, rest[4], rest[5]);
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

/** The papercut as GLSL, its WebGL page's shaders, or as that page: the player's two passes on the numbers the player
    works out, and its finish where it has a soft or a grain: a grain alone in the shading pass, a soft in the finish's
    passes after it. `origin` adds the effect's address to the credit. */
export function papercutWebgl(
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
    const settings = papercutSettings(P, effect, angle);
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, `${PAPERCUT_WHAT}, drawn by WebGL 2`, origin, finish),
      seed,
      [
        ...webglShaders(mode).map(([id, type, code]) => ({ id, type, code })),
        ...(mode === "finish"
          ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code }))
          : []),
        {
          code:
            mode === "finish"
              ? `${settings}\n\n${finishSettingsJs(finish, "ANGLE")}\n\n${papercutModel()}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing(mode)}`
              : mode === "grain"
                ? `${settings}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${papercutModel()}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing(mode)}`
                : `${settings}\n\n${papercutModel()}\n\n${webglDrawing(mode)}`
        }
      ]
    );
  }
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    `${PAPERCUT_WHAT}, as GLSL ES 3.00, the WebGL page's shaders`,
    origin,
    finish
  );
  return `${papercutTextHead(credit, mode)}

${glslSections(mode)}
${mode === "finish" ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
