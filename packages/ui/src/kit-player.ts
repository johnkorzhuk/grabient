/* A field effect as WebGL (engine/kit): engine/kit/gl.ts's one pass for the effect's recipe around its compiled
   kernel, each pixel shaded from the field there, on effect-loop.ts's clock. The scene's uniforms (the canvas, D, the
   view's turn, the colors, the levels as the view's steps space them, the design's constant lists) are set once a
   palette, a view or a size changes, and a frame sets the phases and the shadow's and the rim's moves alone, with
   nothing allocated. Its frame at t is the CPU drawing's (engine/kit/render.ts kitRender), so its first frame takes
   over the still without a seam. */
import {
  KIT_VS,
  kitFragment,
  kitFrameScratch,
  kitFrameUniforms,
  kitSceneUniforms
} from "@grabient/engine/kit/gl.ts";
import { type KitScene, kitScene } from "@grabient/engine/kit/scene.ts";
import type { FieldEffect } from "@grabient/engine/kit/types.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** A field effect as it plays: the angle its design is turned to (90 as designed), its shape (0 or none as
    designed), its steps where it takes them (none as designed: engine/kit/scene.ts KitView), its pace and frame
    rate. */
export interface KitPlay {
  angle: number;
  shape: number | null;
  steps?: number | null;
  speed: number;
  fps: number;
}

const SCENE = ["uSize", "uD", "uTurn", "uGround", "uShade", "uLine", "uStops", "uLevels"] as const;

/** An effect's drawing on a context, at any time of its loop, from its kernel's GLSL (kit/gen): also what tests and
    checks draw with. A uniform the effect's pass does not read has no place, and setting it does nothing. */
export function createKitDrawing(
  def: FieldEffect,
  kernelGlsl: string
): (gl: WebGL2RenderingContext) => EffectDrawing<KitPlay> {
  const fragment = kitFragment(def, kernelGlsl);
  const lists = Object.keys(def.uniforms);
  return gl => {
    const programs = buildPrograms(gl, [[KIT_VS, fragment]]);
    const [program] = programs.list;
    const vao = gl.createVertexArray();
    let U: Record<string, WebGLUniformLocation | null> | null = null;
    let scene: KitScene | null = null;
    let sent = false;
    const frame = kitFrameScratch(def);
    return {
      layout(palette, view, w, h) {
        scene = kitScene(
          def,
          palette,
          { angle: view.angle, shape: view.shape, steps: view.steps },
          { width: w, height: h }
        );
        sent = false;
      },
      built: () => programs.built(),
      draw(t) {
        if (!scene || programs.built() !== true) return;
        U ??= Object.fromEntries(
          [...SCENE, "uKF", "uMove", ...lists.map(name => `uK_${name}`)].map(n => [
            n,
            gl.getUniformLocation(program, n)
          ])
        );
        gl.bindVertexArray(vao);
        gl.useProgram(program);
        if (!sent) {
          const u = kitSceneUniforms(scene);
          gl.uniform2fv(U.uSize, u.size);
          gl.uniform1f(U.uD, u.D);
          gl.uniform2fv(U.uTurn, u.turn);
          gl.uniform3fv(U.uGround, u.ground);
          gl.uniform3fv(U.uShade, u.shade);
          gl.uniform3fv(U.uLine, u.line);
          gl.uniform3fv(U.uStops, u.stops);
          /* the levels as the view's steps space them, where the effect takes steps */
          if (u.levels) gl.uniform4fv(U.uLevels, u.levels);
          for (const name of lists) gl.uniform4fv(U[`uK_${name}`], u.K[name]);
          sent = true;
        }
        kitFrameUniforms(scene, t, frame);
        gl.uniform4fv(U.uKF, frame.phases);
        gl.uniform4fv(U.uMove, frame.move);
        gl.viewport(0, 0, scene.width, scene.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      destroy() {
        for (const p of programs.list) gl.deleteProgram(p);
        gl.deleteVertexArray(vao);
      }
    };
  };
}

/** The player of an effect, from its kernel's GLSL: it plays a palette's effect into a canvas the page sizes with CSS
    (effect-loop.ts), as each kind's own player does. */
export function playKit(def: FieldEffect, kernelGlsl: string) {
  const make = createKitDrawing(def, kernelGlsl);
  return (
    canvas: HTMLCanvasElement,
    palette: Palette,
    view: KitPlay,
    onFirstFrame?: () => void,
    options?: PlayOptions
  ): EffectPlayer<KitPlay> | null => playEffect(canvas, palette, view, make, onFirstFrame, options);
}
