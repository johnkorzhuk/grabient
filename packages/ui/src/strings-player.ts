/* The strings as WebGL: engine/strings-gl.ts's one pass, each pixel shaded from the stirred field there, on
   effect-loop.ts's clock. The scene's uniforms (the design, the threads' width and ends, the blob, the colors) are set
   once a palette, a view or a size changes, and a frame sets the shears', waves' and lumps' phases alone, with nothing
   allocated. Its frame at t = 0 is the CPU drawing's (engine/strings-render.ts) and the still's threads, so it takes
   over the still without a seam. Its canvas keeps its alpha, premultiplied, so a ground that lets the page through
   (the look's `bg`) shows what is under the canvas. */
import type { Palette } from "@grabient/engine/palette.ts";
import {
  STRINGS_FRAME_SIZE,
  type StringsScene,
  stringsFrameAt,
  stringsScene
} from "@grabient/engine/strings.ts";
import { STRINGS_FS, STRINGS_VS, stringsSceneUniforms } from "@grabient/engine/strings-gl.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** The strings as they play: the angle the palette runs toward across its threads (90 as designed), its shape (0 or none
    as designed), its ground (none as designed), its pace and frame rate. */
export interface StringsPlay {
  angle: number;
  shape: number | null;
  bg: string | null;
  speed: number;
  fps: number;
}

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
] as const;
type Locations = Record<(typeof NAMES)[number], WebGLUniformLocation | null>;

/** The strings' drawing on a context, at any time of its loop: also what tests and checks draw with. */
export function createStringsDrawing(gl: WebGL2RenderingContext): EffectDrawing<StringsPlay> {
  const programs = buildPrograms(gl, [[STRINGS_VS, STRINGS_FS]]);
  const [program] = programs.list;
  const vao = gl.createVertexArray();
  let U: Locations | null = null;
  let scene: StringsScene | null = null;
  let sent = false;
  const at = new Float32Array(STRINGS_FRAME_SIZE);
  return {
    layout(palette, view, w, h) {
      scene = stringsScene(
        palette,
        { angle: view.angle, shape: view.shape, bg: view.bg },
        { width: w, height: h }
      );
      sent = false;
    },
    built: () => programs.built(),
    draw(t) {
      if (!scene || programs.built() !== true) return;
      U ??= Object.fromEntries(NAMES.map(n => [n, gl.getUniformLocation(program, n)])) as Locations;
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      if (!sent) {
        const u = stringsSceneUniforms(scene);
        gl.uniform2f(U.uSize, scene.width, scene.height);
        gl.uniform1f(U.uD, scene.D);
        gl.uniform2fv(U.uField, u.field);
        gl.uniform4fv(U.uShear, u.shear);
        gl.uniform4fv(U.uWave, u.wave);
        gl.uniform3fv(U.uLump, u.lump);
        gl.uniform4fv(U.uLine, u.line);
        gl.uniform4fv(U.uBlob, u.blob);
        gl.uniform4fv(U.uGround, u.ground);
        gl.uniform3fv(U.uStops, u.stops);
        sent = true;
      }
      stringsFrameAt(scene, t, at);
      gl.uniform1fv(U.uPhase, at);
      gl.viewport(0, 0, scene.width, scene.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      for (const p of programs.list) gl.deleteProgram(p);
      gl.deleteVertexArray(vao);
    }
  };
}

/** Plays a palette's strings into a canvas the page sizes with CSS (effect-loop.ts). */
export const playStrings = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: StringsPlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<StringsPlay> | null =>
  playEffect(canvas, palette, view, createStringsDrawing, onFirstFrame, {
    ...options,
    alpha: true
  });
