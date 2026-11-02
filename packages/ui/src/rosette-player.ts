/* The rosette as WebGL: engine/rosette-gl.ts's one full-screen pass, its uniforms set once a palette, a view or a size
   changes and the loop's zoom and turn each frame (rosetteGroup), on effect-loop.ts's clock. Its frame at t = 0 is the
   still's (engine/rosette-svg.ts) within a level, so it takes over the still without a seam, and a loop ends on its
   first frame, the rings rippling out from the heart as the petals grow. About 0.11 ms a 1080p frame on an RTX 2080 Ti
   (ANGLE, D3D12): about two dozen petals tried a pixel, front to back, stopped once one covers it. */
import type { Palette } from "@grabient/engine/palette.ts";
import { type RosetteScene, rosetteScene } from "@grabient/engine/rosette.ts";
import {
  ROSETTE_FS,
  ROSETTE_VS,
  rosetteGroup,
  rosetteUniforms
} from "@grabient/engine/rosette-gl.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** The rosette as it plays: its turn (90 as designed), its shape (0 or none as designed), its pace and frame rate. */
export interface RosettePlay {
  angle: number;
  shape: number | null;
  speed: number;
  fps: number;
}

type Uniforms = ReturnType<typeof rosetteUniforms>;
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
] as const;

/** The rosette's drawing on a context, at any time of its loop: also what tests and checks draw with. */
export function createRosetteDrawing(gl: WebGL2RenderingContext): EffectDrawing<RosettePlay> {
  const programs = buildPrograms(gl, [[ROSETTE_VS, ROSETTE_FS]]);
  const program = programs.list[0];
  const vao = gl.createVertexArray();
  let U: Record<(typeof NAMES)[number], WebGLUniformLocation | null> | null = null;
  let scene: RosetteScene | null = null;
  let values: Uniforms | null = null;
  let width = 1;
  let height = 1;
  /* the uniforms the context holds are this layout's */
  let sent = false;
  const send = (u: NonNullable<typeof U>, v: Uniforms) => {
    gl.uniform2f(u.uBox, v.uBox[0], v.uBox[1]);
    gl.uniform1f(u.uS, v.uS);
    gl.uniform1f(u.uK, v.uK);
    gl.uniform1f(u.uEk, v.uEk);
    gl.uniform1f(u.uAlpha, v.uAlpha);
    gl.uniform1f(u.uTurn0, v.uTurn0);
    gl.uniform2i(u.uRange, v.uRange[0], v.uRange[1]);
    gl.uniform4f(u.uLens, v.uLens[0], v.uLens[1], v.uLens[2], v.uLens[3]);
    gl.uniform2f(u.uLensMid, v.uLensMid[0], v.uLensMid[1]);
    gl.uniform1f(u.uAngMax, v.uAngMax);
    gl.uniform4f(u.uGrad, v.uGrad[0], v.uGrad[1], v.uGrad[2], v.uGrad[3]);
    gl.uniform4f(u.uStopAt, v.uStopAt[0], v.uStopAt[1], v.uStopAt[2], v.uStopAt[3]);
    gl.uniform3fv(u.uStop, v.uStop);
    gl.uniform1iv(u.uKeyOfSlot, v.uKeyOfSlot);
    gl.uniform1i(u.uFlow, v.uFlow);
    gl.uniform1i(u.uPhase, v.uPhase);
    gl.uniform3f(u.uGround, v.uGround[0], v.uGround[1], v.uGround[2]);
    gl.uniform3f(u.uHeart, v.uHeart[0], v.uHeart[1], v.uHeart[2]);
    gl.uniform2f(u.uHeartR, v.uHeartR[0], v.uHeartR[1]);
  };
  return {
    layout(palette, view, w, h) {
      width = w;
      height = h;
      scene = rosetteScene(
        palette,
        { angle: view.angle, shape: view.shape },
        { width: w, height: h }
      );
      values = rosetteUniforms(scene);
      sent = false;
    },
    built: () => programs.built(),
    draw(t) {
      if (!scene || !values || programs.built() !== true) return;
      gl.useProgram(program);
      /* read once the program is built: reading them before waits for it */
      U ??= Object.fromEntries(
        NAMES.map(n => [n, gl.getUniformLocation(program, n)])
      ) as NonNullable<typeof U>;
      if (!sent) {
        send(U, values);
        sent = true;
      }
      const L = scene.design.loop;
      const [zoom, turn] = rosetteGroup(scene, t / L - Math.floor(t / L));
      gl.uniform2f(U.uGroup, zoom, turn);
      gl.viewport(0, 0, width, height);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
    }
  };
}

/** Plays a palette's rosette into a canvas the page sizes with CSS (effect-loop.ts). */
export const playRosette = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: RosettePlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<RosettePlay> | null =>
  playEffect(canvas, palette, view, createRosetteDrawing, onFirstFrame, options);
