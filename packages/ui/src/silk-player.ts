/* Silk lite as WebGL: engine/silk-gl.ts's one full-screen pass over the same layers the SVG draws. The dye's three rows
   (dyed, shaded, lifted) are a 32 x 3 table and the folds' two profiles a 65 x 1 one, baked once a palette, a view or a
   size changes; a frame sets only the folds' centres, each swung about the gather by its keys (effect-loop.ts keeps the
   clock). Its frame at t = 0 is the still's within a level. About 0.05 ms a 1080p frame on an RTX 2080 Ti (ANGLE,
   D3D12): seven band tests by squared distance, two or so profiles read where a pixel lies in a band, three palette
   rows. */
import type { Palette } from "@grabient/engine/palette.ts";
import { LUT_N, MAX_FOLDS, PROF_N, type SilkScene, silkScene } from "@grabient/engine/silk.ts";
import {
  bandUniforms,
  colorTexels,
  foldUniforms,
  profileTexels,
  SILK_FS,
  SILK_VS,
  sceneUniforms
} from "@grabient/engine/silk-gl.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** The silk as it plays: its turn (90 as designed), its shape (0 or none as designed), its pace and frame rate. */
export interface SilkPlay {
  angle: number;
  shape: number | null;
  speed: number;
  fps: number;
}

/** The silk's drawing on a context, at any time of its loop: also what tests and checks draw with. */
export function createSilkDrawing(gl: WebGL2RenderingContext): EffectDrawing<SilkPlay> {
  const programs = buildPrograms(gl, [[SILK_VS, SILK_FS]]);
  const program = programs.list[0];
  const vao = gl.createVertexArray();
  const texture = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const lut = texture();
  const prof = texture();
  const SU = new Float32Array(4);
  const GU = new Float32Array(2 * MAX_FOLDS);
  const FU = new Float32Array(4 * MAX_FOLDS);
  let U: Record<"D" | "F" | "G" | "N" | "T" | "S", WebGLUniformLocation | null> | null = null;
  let scene: SilkScene | null = null;
  let width = 1;
  let height = 1;
  let sent = false;
  return {
    layout(palette, view, w, h) {
      width = w;
      height = h;
      scene = silkScene(palette, { angle: view.angle, shape: view.shape }, { width: w, height: h });
      sent = false;
    },
    built: () => programs.built(),
    draw(t) {
      if (!scene || programs.built() !== true) return;
      gl.useProgram(program);
      if (!U) {
        U = {
          D: gl.getUniformLocation(program, "D"),
          F: gl.getUniformLocation(program, "F"),
          G: gl.getUniformLocation(program, "G"),
          N: gl.getUniformLocation(program, "N"),
          T: gl.getUniformLocation(program, "T"),
          S: gl.getUniformLocation(program, "S")
        };
        gl.uniform1i(U.T, 0);
        gl.uniform1i(U.S, 1);
      }
      if (!sent) {
        /* the tables for this palette, view and box: a bake of about a millisecond */
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lut);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          LUT_N,
          3,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          colorTexels(scene)
        );
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, prof);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RG16F,
          PROF_N,
          1,
          0,
          gl.RG,
          gl.FLOAT,
          profileTexels(scene)
        );
        sceneUniforms(scene, SU);
        gl.uniform4fv(U.D, SU);
        bandUniforms(scene, GU);
        gl.uniform2fv(U.G, GU);
        gl.uniform1i(U.N, scene.folds.length);
        sent = true;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lut);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prof);
      foldUniforms(scene, t, FU);
      gl.uniform4fv(U.F, FU);
      gl.viewport(0, 0, width, height);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(lut);
      gl.deleteTexture(prof);
    }
  };
}

/** Plays a palette's silk into a canvas the page sizes with CSS (effect-loop.ts). */
export const playSilk = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: SilkPlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<SilkPlay> | null =>
  playEffect(canvas, palette, view, createSilkDrawing, onFirstFrame, options);
