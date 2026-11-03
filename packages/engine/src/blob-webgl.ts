/* The blob in GLSL and as a WebGL page that plays it (blob-shader.ts names every kind): the player's own shaders
   (blob-gl.ts) on the numbers the player works out (blob-page.ts), played by the players' clock (effect-page.ts). A
   soft or grained blob draws its last pass into the finish's frame, which the finish then lays over the canvas
   (shader-finish.ts). The editor loads this module with the Shader tab's GLSL or WebGL spelling. */
import {
  BLOB_BLUR_FS,
  BLOB_DOTS_FS,
  BLOB_DOTS_VS,
  BLOB_FINAL_FS,
  BLOB_FULL_VS,
  BLOB_NOISE_FS
} from "./blob-gl.ts";
import { BLOB_MATH, BLOB_WHAT, blobSettings, blobTextHead } from "./blob-page.ts";
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
import { DEFAULT_ANGLE } from "./view.ts";

/* the blob's last pass with the grain over the canvas's bytes, for a grain with no soft, which so needs no pass of its
   own: an opaque ground's sums are whole bytes over 255, never a half */
const BLOB_FINAL_GRAIN_FS = grainedGlsl(
  BLOB_FINAL_FS,
  "  color = s + ground * (1.0 - s.a);",
  "  color = grainOver(floor((s + ground * (1.0 - s.a)) * 255.0 + 0.5), p) / 255.0;"
);

/* each shader in its own element, from the element's first character, so a GLSL one's #version leads it */
const webglShaders = (grain: boolean) =>
  [
    ["cover-vs", "x-shader/x-vertex", BLOB_FULL_VS],
    ["noise-fs", "x-shader/x-fragment", BLOB_NOISE_FS],
    ["dots-vs", "x-shader/x-vertex", BLOB_DOTS_VS],
    ["dots-fs", "x-shader/x-fragment", BLOB_DOTS_FS],
    ["blur-fs", "x-shader/x-fragment", BLOB_BLUR_FS],
    ["final-fs", "x-shader/x-fragment", grain ? BLOB_FINAL_GRAIN_FS : BLOB_FINAL_FS]
  ] as const;

/* the GLSL's sections: the shaders as the WebGL page compiles them, under one header each */
const glslSections = (grain: boolean): readonly [header: string, shaders: readonly string[]][] => [
  [
    "Cover ==== the vertex stage of passes 0, 2, 3 and 4: the quad over the target, corner (attribute 0) from 0 to 1",
    [BLOB_FULL_VS]
  ],
  [
    "Pass 0: frost noise ==== target: W x H (the canvas's device pixels), RGBA8, once a size | inputs: lattice (256 x 1, R8UI, nearest), gradients (256 x 4, RGBA8, nearest)",
    [BLOB_NOISE_FS]
  ],
  [
    "Pass 1: balls ==== target: the melt, w x h texels, RGBA16F (RGBA8 without float targets), cleared to 0, then 24 instanced quads blended (one, one minus source alpha) | inputs: corner (attribute 0), disc and paint (attributes 1 and 2, one a ball)",
    [BLOB_DOTS_VS, BLOB_DOTS_FS]
  ],
  [
    "Passes 2 and 3: blur across, then down ==== target: the other melt texture, w x h, RGBA16F | inputs: the melt (texelFetch), step_by (1, 0) across and (0, 1) down",
    [BLOB_BLUR_FS]
  ],
  [
    `Pass 4: canvas ==== target: the canvas, W x H, premultiplied alpha | inputs: the melt after pass 3 (linear, clamp to edge), the noise (texelFetch)${grain ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch)" : ""}`,
    [grain ? BLOB_FINAL_GRAIN_FS : BLOB_FINAL_FS]
  ]
];

/* The WebGL page's drawing: the player's own (ui/blob-player.ts), its calls in its order, laid out and drawn by the
   players' clock; a grained one's last pass lays the grain from its tile, and a soft one's draws into the finish's
   frame. */
const webglDrawing = (mode: "plain" | "grain" | "finish") => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The drawing, WebGL 2, as the site's player draws it: the same textures, passes and uniforms, so each frame's GPU
// work is the player's.
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
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

  // What the GPU holds, made at the start and again where a lost context comes back.
  let dots, blur, bake, final, half, U, instances, dotsVao, fullVao, melt, noise, latticeTex, gradientTex;${finish ? "\n  let finish;" : ""}${grain ? "\n  let grainTex;" : ""}
  let baked = false;
  const make = () => {
    dots = program("dots-vs", "dots-fs");
    blur = program("cover-vs", "blur-fs");
    bake = program("cover-vs", "noise-fs");
    final = program("cover-vs", "final-fs");
    // the melt in half floats where they can be drawn into, so its blur adds no rounding of its own
    half = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    const at = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
    U = {
      dots: at(dots, ["size"]),
      blur: at(blur, ["source", "step_by", "taps", "weights"]),
      bake: at(bake, ["lattice", "gradients", "scale", "offset", "frequency"]),
      final: at(final, ["melt", "noise", "canvas_h", "melt_origin", "melt_texel", "region", "scatter", "frosted", "lift", "gray", "k", "ground"${grain ? ', "grainTile"' : ""}])
    };
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    instances = gl.createBuffer();
    dotsVao = gl.createVertexArray();
    gl.bindVertexArray(dotsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    fullVao = gl.createVertexArray();
    gl.bindVertexArray(fullVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    melt = [0, 1].map(() => ({ texture: texture(gl.LINEAR), frame: gl.createFramebuffer() }));
    noise = { texture: texture(gl.NEAREST), frame: gl.createFramebuffer() };
    latticeTex = texture(gl.NEAREST);
    gradientTex = texture(gl.NEAREST);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, latticeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 256, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, lattice);
    gl.bindTexture(gl.TEXTURE_2D, gradientTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, gradients);${finish ? "\n    finish = finishing(gl);" : ""}${grain ? "\n    grainTex = grainTexture(gl);" : ""}
    baked = false;
  };
  make();

  // The canvas at its size, w by h device pixels: the design's map, as the player maps it from the canvas's CSS box
  // and the device pixels a CSS pixel (the density, or fewer where the canvas is held under PIXELS_MAX), the filter
  // region, the melt's texture and the blur's weights.
  let map = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let canvasSize = { w: 1, h: 1 };
  let meltBox = { x: 0, y: 0, texel: 1, w: 1, h: 1 };
  let regionPx = [0, 0, 1, 1];
  const weights = new Float32Array(RADIUS + 1);
  let taps = 0;
  const layout = (w, h) => {
    const css = canvas.getBoundingClientRect();
    const W = Math.max(1, css.width);
    const H = Math.max(1, css.height);
    const { kx, ky } = canvasOf(W, H, devicePixelRatio || 1, pixels);${finish ? "\n    finish.layout(w, h);" : ""}
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (canvasSize.w !== w || canvasSize.h !== h) baked = false;
    canvasSize = { w, h };
    const next = mapOf(W, H, kx, ky);
    if (next.sx !== map.sx || next.sy !== map.sy || next.tx !== map.tx || next.ty !== map.ty) baked = false;
    map = next;
    const melted = meltOf(look, map, w, h, weights);
    regionPx = melted.region;
    meltBox = melted.box;
    taps = melted.taps;
    const format = half ? gl.RGBA16F : gl.RGBA8;
    const type = half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    for (const { texture: t, frame } of melt) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, meltBox.w, meltBox.h, 0, gl.RGBA, type, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  // The frost's noise at every device pixel, once a size.
  const bakeNoise = () => {
    const u = U.bake;
    const { w, h } = canvasSize;
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, noise.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noise.texture, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bake);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, latticeTex);
    gl.uniform1i(u.lattice, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gradientTex);
    gl.uniform1i(u.gradients, 1);
    gl.uniform2f(u.scale, map.sx, map.sy);
    gl.uniform2f(u.offset, map.tx, map.ty);
    gl.uniform1f(u.frequency, look.frequency);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    baked = true;
  };

  // A frame at t seconds of the loop at speed 1: its share of the loop, as the player's.
  const draw = t => {
    const f = (t / LOOP) % 1;
    if (look.noise && !baked) bakeNoise();
    // the balls, small: each a quad its own color covers, painted in the scene's order
    const { texel } = meltBox;
    places(scene, f, data, 8);
    for (let i = 0; i < 8 * n; i += 8) {
      data[i] = (data[i] * map.sx + map.tx - meltBox.x) / texel;
      data[i + 1] = (data[i + 1] * map.sy + map.ty - meltBox.y) / texel;
      data[i + 2] = (data[i + 2] * map.sx) / texel;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.viewport(0, 0, meltBox.w, meltBox.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dots);
    gl.uniform2f(U.dots.size, meltBox.w, meltBox.h);
    gl.bindVertexArray(dotsVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.BLEND);
    // the melt: across, then down
    gl.useProgram(blur);
    gl.bindVertexArray(fullVao);
    gl.uniform1i(U.blur.taps, taps);
    gl.uniform1fv(U.blur.weights, weights);
    gl.uniform1i(U.blur.source, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[1].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform2i(U.blur.step_by, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, melt[0].frame);
    gl.bindTexture(gl.TEXTURE_2D, melt[1].texture);
    gl.uniform2i(U.blur.step_by, 0, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // every pixel: the frost's scatter, the lift of the edge, the speckle, the ground
    gl.bindFramebuffer(gl.FRAMEBUFFER, ${finish ? "finish.frame" : "null"});
    gl.viewport(0, 0, canvasSize.w, canvasSize.h);
    gl.useProgram(final);
    const u = U.final;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, melt[0].texture);
    gl.uniform1i(u.melt, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noise.texture);
    gl.uniform1i(u.noise, 1);${grain ? "\n    gl.activeTexture(gl.TEXTURE2);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1i(u.grainTile, 2);" : ""}
    gl.uniform1f(u.canvas_h, canvasSize.h);
    gl.uniform2f(u.melt_origin, meltBox.x, meltBox.y);
    gl.uniform1f(u.melt_texel, texel);
    gl.uniform4f(u.region, regionPx[0], regionPx[1], regionPx[2], regionPx[3]);
    gl.uniform2f(u.scatter, look.scatter * map.sx, look.scatter * map.sy);
    gl.uniform1i(u.frosted, look.noise ? 1 : 0);
    gl.uniform2f(u.lift, look.slope, look.lift);
    gl.uniform2f(u.gray, look.contrast, look.gray);
    gl.uniform2f(u.k, look.k1, look.k2);
    gl.uniform4f(u.ground, ground[0], ground[1], ground[2], ground[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

/** The blob as GLSL, its WebGL page's shaders, or as that page: the player's passes on the numbers the player works
    out. `origin` adds the effect's address to the credit, which names no angle: the blob has none. */
export function blobWebgl(
  kind: "glsl" | "webgl",
  P: Palette,
  effect: Effect,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  /* a grain alone in the blob's own last pass; a soft in the finish's passes after it */
  const grain = grainOnly(finish);
  const done = finished(finish) && !grain;
  if (kind === "webgl")
    return shaderPageHtml(
      effectShaderCredit(
        seed,
        effect,
        DEFAULT_ANGLE,
        `${BLOB_WHAT}, drawn by WebGL 2`,
        origin,
        finish
      ),
      seed,
      [
        ...webglShaders(grain).map(([id, type, code]) => ({ id, type, code })),
        ...(done ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code })) : []),
        {
          code: done
            ? `${blobSettings(P, effect)}\n\n${finishSettingsJs(finish, String(DEFAULT_ANGLE))}\n\n${BLOB_MATH}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing("finish")}`
            : grain
              ? `${blobSettings(P, effect)}\n\n${grainSettingsJs(finish.grain ?? 0)}\n\n${BLOB_MATH}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing("grain")}`
              : `${blobSettings(P, effect)}\n\n${BLOB_MATH}\n\n${webglDrawing("plain")}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    DEFAULT_ANGLE,
    `${BLOB_WHAT}, as GLSL ES 3.00, the WebGL page's shaders, a section a pass`,
    origin,
    finish
  );
  return `${blobTextHead(credit)}
${glslSections(grain)
  .map(([header, shaders]) => `\n// ==== ${header}\n${shaders.join("\n")}`)
  .join("\n")}
${done ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
