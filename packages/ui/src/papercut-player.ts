/* Papercut as WebGL: engine/papercut-gl.ts's two passes, the field at a quarter of the resolution into an RGBA32UI
   texture and the sheets shaded from it at full resolution, on effect-loop.ts's clock. The scene's uniforms (the
   levels, the sheets' colors and shadows) are set once a palette, a view or a size changes, and a frame sets the hills,
   the waves' phases and the light (papercutFrameUniforms), with nothing allocated. Its frame at t = 0 is the CPU
   drawing's (engine/papercut-render.ts) and the still's cuts, so it takes over the still without a seam. About 0.1 ms
   a 1080p frame on an RTX 2080 Ti (ANGLE, D3D12): the field's few hills at a sixteenth of the pixels, then a few
   texel reads and two or three sheets' shading a pixel. */
import type { Palette } from "@grabient/engine/palette.ts";
import {
  PAPERCUT_MAX_BUMPS,
  type PapercutScene,
  papercutFrameSize,
  papercutScene
} from "@grabient/engine/papercut.ts";
import {
  PAPERCUT_FIELD_FS,
  PAPERCUT_SHADE_FS,
  PAPERCUT_VS,
  papercutFieldSize,
  papercutFrameUniforms,
  papercutSceneUniforms
} from "@grabient/engine/papercut-gl.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** Papercut as it plays: the angle its sheets climb toward (90 as designed), its shape (0 or none as designed), its pace
    and frame rate. */
export interface PapercutPlay {
  angle: number;
  shape: number | null;
  speed: number;
  fps: number;
}

const FIELD_NAMES = ["uSize", "uD", "uRamp", "uWarp", "uPhase", "uBumps", "uBump"] as const;
const SHADE_NAMES = [
  "uSize",
  "uD",
  "uLight",
  "uSheets",
  "uLevel",
  "uFace",
  "uWallC",
  "uShade",
  "uSheet",
  "uReach",
  "uMisc",
  "uField"
] as const;
type Locations<N extends readonly string[]> = Record<N[number], WebGLUniformLocation | null>;

/** Papercut's drawing on a context, at any time of its loop: also what tests and checks draw with. */
export function createPapercutDrawing(gl: WebGL2RenderingContext): EffectDrawing<PapercutPlay> {
  const programs = buildPrograms(gl, [
    [PAPERCUT_VS, PAPERCUT_FIELD_FS],
    [PAPERCUT_VS, PAPERCUT_SHADE_FS]
  ]);
  const [pField, pShade] = programs.list;
  const vao = gl.createVertexArray();
  const texture = gl.createTexture();
  const target = gl.createFramebuffer();
  let UF: Locations<typeof FIELD_NAMES> | null = null;
  let US: Locations<typeof SHADE_NAMES> | null = null;
  let scene: PapercutScene | null = null;
  let tw = 0;
  let th = 0;
  let sent = false;
  let at = new Float32Array(PAPERCUT_MAX_BUMPS * 4 + 6);
  const bump = new Float32Array(PAPERCUT_MAX_BUMPS * 4);
  const rest = new Float32Array(6);
  const locate = <N extends readonly string[]>(p: WebGLProgram, names: N) =>
    Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)])) as Locations<N>;
  return {
    layout(palette, view, w, h) {
      scene = papercutScene(
        palette,
        { angle: view.angle, shape: view.shape },
        { width: w, height: h }
      );
      if (at.length < papercutFrameSize(scene)) at = new Float32Array(papercutFrameSize(scene));
      const size = papercutFieldSize(scene);
      if (size.w !== tw || size.h !== th) {
        tw = size.w;
        th = size.h;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32UI,
          tw,
          th,
          0,
          gl.RGBA_INTEGER,
          gl.UNSIGNED_INT,
          null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      sent = false;
    },
    built: () => programs.built(),
    draw(t) {
      if (!scene || programs.built() !== true) return;
      UF ??= locate(pField, FIELD_NAMES);
      US ??= locate(pShade, SHADE_NAMES);
      gl.bindVertexArray(vao);
      if (!sent) {
        const u = papercutSceneUniforms(scene);
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
        gl.uniform1i(US.uField, 0);
        gl.useProgram(pField);
        gl.uniform2f(UF.uSize, scene.width, scene.height);
        gl.uniform1f(UF.uD, scene.D);
        gl.uniform2f(UF.uRamp, scene.rx, scene.ry);
        gl.uniform4f(UF.uWarp, scene.wa, scene.wf, scene.wa2, scene.wf2);
        gl.uniform1i(UF.uBumps, scene.bumps.length);
        sent = true;
      }
      papercutFrameUniforms(scene, t, at, bump, rest);
      /* the field, a texel every fourth pixel */
      gl.useProgram(pField);
      gl.uniform4fv(UF.uBump, bump);
      gl.uniform4f(UF.uPhase, rest[0], rest[1], rest[2], rest[3]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, tw, th);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      /* the sheets, shaded from it */
      gl.useProgram(pShade);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(US.uLight, rest[4], rest[5]);
      gl.viewport(0, 0, scene.width, scene.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      for (const p of programs.list) gl.deleteProgram(p);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(target);
    }
  };
}

/** Plays a palette's papercut into a canvas the page sizes with CSS (effect-loop.ts). */
export const playPapercut = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: PapercutPlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<PapercutPlay> | null =>
  playEffect(canvas, palette, view, createPapercutDrawing, onFirstFrame, options);
