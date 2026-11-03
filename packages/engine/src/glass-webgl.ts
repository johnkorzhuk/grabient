/* The fluted glass in GLSL and as a WebGL page that plays it (glass-shader.ts names every kind): the player's own passes
   (glass-gl.ts) on the numbers the player works out (glass-page.ts), played by the players' clock (effect-page.ts).
   A soft or grained glass draws its last pass into the finish's frame, which the finish then lays over the canvas
   (shader-finish.ts), as the site lays its blur and grain over the player. The editor loads this module with the
   Shader tab's GLSL or WebGL spelling. */
import type { Effect } from "./effect.ts";
import { EFFECT_CLOCK } from "./effect-page.ts";
import {
  GLASS_BAKE_FS,
  GLASS_BLUR_FS,
  GLASS_DISC_FS,
  GLASS_DISC_VS,
  GLASS_FINAL_FS,
  GLASS_FULL_VS
} from "./glass-gl.ts";
import { GLASS_MODEL, glassSettingsJs } from "./glass-page.ts";
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

/* the glass's last pass with the grain over its bytes, for a grain with no soft, which so needs no pass of its own:
   the glass's values never fall on a half, so its bytes are the canvas's own */
const GLASS_FINAL_GRAIN_FS = grainedGlsl(
  GLASS_FINAL_FS,
  "  o = vec4(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)), 1.0);",
  "  o = grainOver(vec4(floor(min(vec3(1.0), floor(c * 255.0 + 0.5) / 255.0 * (2.0 * m.b)) * 255.0 + 0.5), 255.0), p) / 255.0;"
);

const webglShaders = (grain: boolean) =>
  [
    ["disc-vs", "x-shader/x-vertex", GLASS_DISC_VS],
    ["disc-fs", "x-shader/x-fragment", GLASS_DISC_FS],
    ["full-vs", "x-shader/x-vertex", GLASS_FULL_VS],
    ["blur-fs", "x-shader/x-fragment", GLASS_BLUR_FS],
    ["final-fs", "x-shader/x-fragment", grain ? GLASS_FINAL_GRAIN_FS : GLASS_FINAL_FS],
    ["bake-fs", "x-shader/x-fragment", GLASS_BAKE_FS]
  ] as const;

/* The player's drawing (ui/glass-player.ts createGlassDrawing, glass-bake.ts) in the page: the same textures, passes
   and uniforms, so each frame's GPU work is the player's; a grained one's last pass lays the grain from its tile, and
   a soft one's draws into the finish's frame. */
const webglDrawing = (mode: "plain" | "grain" | "finish") => {
  const finish = mode === "finish";
  const grain = mode === "grain";
  return `// The player's drawing: the same textures, passes and uniforms, so each frame's GPU work is the player's. A context the
// browser gives back after losing it gets a drawing of its own.
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

function drawing() {
  const compile = (type, id) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, document.getElementById(id).textContent);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const link = (vertex, fragment) => {
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  };
  const full = compile(gl.VERTEX_SHADER, "full-vs");
  const pDisc = link(compile(gl.VERTEX_SHADER, "disc-vs"), compile(gl.FRAGMENT_SHADER, "disc-fs"));
  const pBlur = link(full, compile(gl.FRAGMENT_SHADER, "blur-fs"));
  const pFinal = link(full, compile(gl.FRAGMENT_SHADER, "final-fs"));
  const pBake = link(full, compile(gl.FRAGMENT_SHADER, "bake-fs"));
  const at = (program, name) => gl.getUniformLocation(program, name);
  const U = {
    dField: at(pDisc, "uField"),
    bSrc: at(pBlur, "uSrc"),
    bStep: at(pBlur, "uStep"),
    bTaps: at(pBlur, "uTaps"),
    fMap: at(pFinal, "uMap"),
    fField: at(pFinal, "uFieldT"),
    fH: at(pFinal, "uH"),
    fOrigin: at(pFinal, "uOrigin"),
    fOffset: at(pFinal, "uOffset"),
    fInv: at(pFinal, "uInv"),
    fScale: at(pFinal, "uScale"),${grain ? '\n    fGrain: at(pFinal, "grainTile"),' : ""}
    kRibs: at(pBake, "uRibs"),
    kCount: at(pBake, "uCount"),
    kStops: at(pBake, "uStops"),
    kOrigin: at(pBake, "uOrigin"),
    kLine: at(pBake, "uLine"),
    kNormals: at(pBake, "uNormals"),
    kShade: at(pBake, "uShade")
  };
  // Two triangles over a target, and the discs as instances of them: middle, radius and core, then color.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  const discVao = gl.createVertexArray();
  gl.bindVertexArray(discVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
  gl.vertexAttribDivisor(2, 1);
  const fullVao = gl.createVertexArray();
  gl.bindVertexArray(fullVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const texture = filter => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // The rib map (the window's size), the ribs and their stops a row each, and the field and its blur.
  const mapTex = texture(gl.NEAREST);
  const ribsTex = texture(gl.NEAREST);
  const bakeFbo = gl.createFramebuffer();
  const fieldTex = [texture(gl.LINEAR), texture(gl.LINEAR)];
  const fbo = [gl.createFramebuffer(), gl.createFramebuffer()];${finish ? "\n  const finish = finishing(gl);" : ""}${grain ? "\n  const grainTex = grainTexture(gl);" : ""}

  let geo = null;
  let win = null;
  let pl = null;
  let fld = null;
  let stale = false;
  let data = new Float32Array(0);
  const pos = new Float32Array(2);
  const taps = new Float32Array(12);
  let base = [0, 0, 0];

  // The colors' discs for the layout.
  const color = () => {
    fld = field(geo, COLORS);
    if (data.length !== 7 * fld.discs.length) {
      data = new Float32Array(7 * fld.discs.length);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
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
  const layout = (w, h) => {${finish ? "\n    finish.layout(w, h);" : ""}
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
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, win.w, win.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    stale = true;
    if (resized || !was || was.fw !== pl.fw || was.fh !== pl.fh) {
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, fieldTex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pl.fw, pl.fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex[i], 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      taps.fill(0);
      pl.taps.forEach(([o, w], i) => {
        taps[2 * i] = o;
        taps[2 * i + 1] = w;
      });
    }
    color();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  // The rib map: each pixel's displacement and light, in one pass.
  const normals = new Float32Array(17 * 3);
  const shade = new Float32Array(17);
  const bake = () => {
    const list = geo.ribs;
    const stops = list[0]?.stops.length ?? 0;
    const width = 1 + stops;
    const rows = new Float32Array(width * list.length * 4);
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
    gl.bindTexture(gl.TEXTURE_2D, ribsTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, Math.max(1, list.length), 0, gl.RGBA, gl.FLOAT, rows);
    geo.normal.stops.forEach(([o, r, g], k) => {
      normals[3 * k] = o;
      normals[3 * k + 1] = r;
      normals[3 * k + 2] = g;
    });
    geo.shadeTable.forEach((v, k) => {
      shade[k] = v;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mapTex, 0);
    gl.viewport(0, 0, win.w, win.h);
    gl.disable(gl.BLEND);
    gl.useProgram(pBake);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ribsTex);
    gl.uniform1i(U.kRibs, 0);
    gl.uniform1i(U.kCount, list.length);
    gl.uniform1i(U.kStops, stops);
    gl.uniform2f(U.kOrigin, win.x, win.y);
    const n = geo.normal;
    gl.uniform4f(U.kLine, n.x1, n.y1, n.x2 - n.x1, n.y2 - n.y1);
    gl.uniform3fv(U.kNormals, normals);
    gl.uniform1fv(U.kShade, shade);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  // A frame: the discs into the field, the blur across and down, and the glass over the canvas.
  const draw = t => {
    if (stale) {
      bake();
      stale = false;
    }
    const { region } = geo;
    const q = pl.q;
    for (let i = 0; i < fld.discs.length; i++) {
      discAt(geo, fld.discs[i], t, pos, 0);
      data[7 * i] = (pos[0] - region.x) / q;
      data[7 * i + 1] = (pos[1] - region.y) / q;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
    gl.viewport(0, 0, pl.fw, pl.fh);
    gl.clearColor(base[0], base[1], base[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pDisc);
    gl.uniform2f(U.dField, pl.fw, pl.fh);
    gl.bindVertexArray(discVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fld.discs.length);
    gl.disable(gl.BLEND);
    gl.useProgram(pBlur);
    gl.bindVertexArray(fullVao);
    gl.uniform2fv(U.bTaps, taps);
    gl.uniform1i(U.bSrc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1]);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[0]);
    gl.uniform2f(U.bStep, 1 / pl.fw, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[1]);
    gl.uniform2f(U.bStep, 0, 1 / pl.fh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ${finish ? "finish.frame" : "null"});
    gl.viewport(0, 0, win.w, win.h);
    gl.useProgram(pFinal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mapTex);
    gl.uniform1i(U.fMap, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[0]);
    gl.uniform1i(U.fField, 1);${grain ? "\n    gl.activeTexture(gl.TEXTURE2);\n    gl.bindTexture(gl.TEXTURE_2D, grainTex);\n    gl.uniform1i(U.fGrain, 2);" : ""}
    gl.uniform1f(U.fH, win.h);
    gl.uniform2f(U.fOrigin, region.x, region.y);
    gl.uniform2f(U.fOffset, win.x, win.y);
    gl.uniform2f(U.fInv, 1 / (q * pl.fw), 1 / (q * pl.fh));
    gl.uniform1f(U.fScale, geo.scale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);${finish ? "\n    finish.draw();" : ""}
  };
  return { layout, draw };
}

function play() {
  let drawn = drawing();
  const layout = (w, h) => drawn?.layout(w, h);
  const draw = t => drawn?.draw(t);
${indent(EFFECT_CLOCK)}
  // A lost context draws nothing until the browser gives it back; a drawing is then made on it.
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lose();
    drawn = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    drawn = drawing();
    found();
  });
}`;
};

const glslSections = (
  grain: boolean
) => `// ==== Vertex: full target ==== the quad over a whole target, for passes 2 to 4 and the bake
${GLASS_FULL_VS}

// ==== Pass 1: discs ==== target: the field, fw x fh texels (1/q of the filter's region), RGBA8, cleared to the base color, blended ONE, ONE_MINUS_SRC_ALPHA | inputs: the twelve discs as instanced quads (a triangle strip of 4 vertices)
${GLASS_DISC_VS}
${GLASS_DISC_FS}

// ==== Pass 2: blur across ==== target: a second field texture, fw x fh, RGBA8, uStep (1 / fw, 0) | inputs: Pass 1 (linear, clamp to edge)
${GLASS_BLUR_FS}

// ==== Pass 3: blur down ==== target: the first field texture, fw x fh, RGBA8, the shader of Pass 2 with uStep (0, 1 / fh) | inputs: Pass 2 (linear, clamp to edge)

// ==== Pass 4: glass ==== target: the canvas, W x H | inputs: the rib map (nearest, clamp to edge), Pass 3 (linear, clamp to edge)${grain ? ", the grain's tile (128 x 128, R8UI, a speck's alpha with white in its lowest bit, texelFetch)" : ""}
${grain ? GLASS_FINAL_GRAIN_FS : GLASS_FINAL_FS}

// ==== Bake: rib map ==== target: W x H, RGBA8, once for each size, angle and shape, before the frame that needs it | inputs: the ribs, a row each (RGBA32F, nearest)
${GLASS_BAKE_FS}
`;

/** The glass as GLSL, its WebGL page's passes, or as that page: the player's passes on the numbers the player works
    out, and its finish after them where it has a soft or a grain. `origin` adds the effect's address to the
    credit. */
export function glassWebgl(
  kind: "glsl" | "webgl",
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
  if (kind === "webgl")
    return shaderPageHtml(
      effectShaderCredit(seed, effect, angle, "fluted glass, drawn by WebGL 2", origin, finish),
      seed,
      [
        {
          code: done
            ? `${glassSettingsJs(P, effect, angle)}\n\n${finishSettingsJs(finish, "ANGLE")}`
            : grain
              ? `${glassSettingsJs(P, effect, angle)}\n\n${grainSettingsJs(finish.grain ?? 0)}`
              : glassSettingsJs(P, effect, angle)
        },
        ...webglShaders(grain).map(([id, type, code]) => ({ id, type, code })),
        ...(done ? FINISH_WEBGL_SHADERS.map(([id, type, code]) => ({ id, type, code })) : []),
        {
          code: done
            ? `${GLASS_MODEL}\n\n${FINISH_MATH_JS}\n\n${FINISH_WEBGL_JS}\n\n${webglDrawing("finish")}`
            : grain
              ? `${GLASS_MODEL}\n\n${GRAIN_TILE_JS}\n\n${GRAIN_WEBGL_JS}\n\n${webglDrawing("grain")}`
              : `${GLASS_MODEL}\n\n${webglDrawing("plain")}`
        }
      ]
    );
  const credit = effectShaderCredit(
    seed,
    effect,
    angle,
    "fluted glass: the GLSL ES 3.00 passes its WebGL page runs",
    origin,
    finish
  );
  return `${credit.map(line => `// ${line}`).join("\n")}
// The page's JavaScript works out each frame's numbers as the site's player does: the ribs and their stops, the
// discs' places, the blur's taps and the uniforms below.

${glslSections(grain)}${done ? `\n${FINISH_GLSL_SECTIONS}` : ""}`;
}
