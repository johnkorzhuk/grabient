/* The dimple as WebGL: engine/dimple-gl.ts's one pass on effect-loop.ts, which it leads rather than clocks: it has no
   loop, so a frame is drawn only while its hollow is on its way to where the pointer last was over its canvas, and
   none once it is there. The hollow goes to the pointer (John, 9 Nov 2026: "a simple animation the follows the users
   cursor") and stays where the pointer left it ("just have it hold its last posisiion instead of resetting to the
   center"); before any pointer it is at its rest, the still's own picture, so the canvas takes over the still without
   a seam. The pointer is read from the window, so a canvas under a page's content (an embed's, a card's under its
   link) follows it all the same. The scene's uniforms are set once a palette, a view or a size changes, and a frame
   sets where the hollow is and the ground about it, with nothing allocated. */
import { DIMPLE_EASE_S, type DimpleScene, dimpleScene } from "@grabient/engine/dimple.ts";
import {
  DIMPLE_FS,
  DIMPLE_GROUND_SIZE,
  DIMPLE_VS,
  dimpleHollowUniforms,
  dimpleSceneUniforms
} from "@grabient/engine/dimple-gl.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** The dimple as it plays: the angle its sheet and its light are turned to (90 as designed), its zoom (none as
    designed), how fast its hollow follows the pointer (1 as designed, 0 not at all: its still) and its frames a
    second at most. */
export interface DimplePlay {
  angle: number;
  zoom: number | null;
  speed: number;
  fps: number;
}

const NAMES = [
  "uSize",
  "uRest",
  "uHollow",
  "uFar",
  "uLattice",
  "uBack",
  "uBowl",
  "uDisc",
  "uGround",
  "uStops"
] as const;
type Locations = Record<(typeof NAMES)[number], WebGLUniformLocation | null>;

/** A dimple's drawing, its hollow read and put by hand too: what a card's still takes over from, and what a test
    or a check draws with. */
export interface DimpleDrawing extends EffectDrawing<DimplePlay> {
  /** where the hollow is in the box, 0 to 1 each way; null at its rest */
  where(): readonly [number, number] | null;
  /** the hollow at once at a place in the box, 0 to 1 each way; null back at its rest */
  put(place: readonly [number, number] | null): void;
}

/** The dimple's drawing on a context. `wake` is what its loop gave it to say the pointer has led it somewhere. */
export function createDimpleDrawing(
  gl: WebGL2RenderingContext,
  wake: () => void = () => {}
): DimpleDrawing {
  const programs = buildPrograms(gl, [[DIMPLE_VS, DIMPLE_FS]]);
  const [program] = programs.list;
  const vao = gl.createVertexArray();
  let U: Locations | null = null;
  let scene: DimpleScene | null = null;
  let sent = false;
  const ground = new Float32Array(DIMPLE_GROUND_SIZE);
  /* where the hollow is and where it is going, in the box, 0 to 1 each way, so a new size keeps its place: at its
     rest until a pointer has been over the canvas */
  let led = false;
  let hu = 0;
  let hv = 0;
  let gu = 0;
  let gv = 0;
  const canvas = gl.canvas;
  const point = (event: PointerEvent) => {
    /* a canvas on the page: one off it (an OffscreenCanvas) has no box for a pointer to be over */
    if (!scene || !("getBoundingClientRect" in canvas)) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const u = (event.clientX - box.left) / box.width;
    const v = (event.clientY - box.top) / box.height;
    /* off the picture the pointer is not followed: the hollow keeps the last place it was given */
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    if (!led) {
      hu = scene.ox / scene.width;
      hv = scene.oy / scene.height;
      led = true;
    }
    gu = u;
    gv = v;
    wake();
  };
  if (typeof addEventListener === "function") {
    addEventListener("pointermove", point, { passive: true });
    addEventListener("pointerdown", point, { passive: true });
  }
  return {
    layout(palette, view, w, h) {
      scene = dimpleScene(palette, { angle: view.angle, zoom: view.zoom }, { width: w, height: h });
      sent = false;
    },
    built: () => programs.built(),
    lead(seconds) {
      if (!scene || !led) return false;
      const du = gu - hu;
      const dv = gv - hv;
      /* how far it has to go, in the canvas's pixels: within a twentieth of one it is there */
      const left = Math.abs(du) * scene.width + Math.abs(dv) * scene.height;
      if (left === 0) return false;
      const share = left < 0.05 ? 1 : 1 - Math.exp(-seconds / DIMPLE_EASE_S);
      hu += du * share;
      hv += dv * share;
      return true;
    },
    home() {
      led = false;
    },
    where: () => (led ? [hu, hv] : null),
    put(place) {
      led = place !== null;
      if (place) {
        hu = gu = place[0];
        hv = gv = place[1];
      }
    },
    draw() {
      if (!scene || programs.built() !== true) return;
      U ??= Object.fromEntries(NAMES.map(n => [n, gl.getUniformLocation(program, n)])) as Locations;
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      if (!sent) {
        const u = dimpleSceneUniforms(scene);
        gl.uniform2f(U.uSize, scene.width, scene.height);
        gl.uniform2fv(U.uRest, u.rest);
        gl.uniform4fv(U.uLattice, u.lattice);
        gl.uniform4fv(U.uBack, u.back);
        gl.uniform4fv(U.uBowl, u.bowl);
        gl.uniform4fv(U.uDisc, u.disc);
        gl.uniform3fv(U.uStops, u.stops);
        sent = true;
      }
      const cx = led ? hu * scene.width : scene.ox;
      const cy = led ? hv * scene.height : scene.oy;
      gl.uniform2f(U.uHollow, cx, cy);
      gl.uniform1f(U.uFar, dimpleHollowUniforms(scene, cx, cy, ground));
      gl.uniform3fv(U.uGround, ground);
      gl.viewport(0, 0, scene.width, scene.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      if (typeof removeEventListener === "function") {
        removeEventListener("pointermove", point);
        removeEventListener("pointerdown", point);
      }
      for (const p of programs.list) gl.deleteProgram(p);
      gl.deleteVertexArray(vao);
    }
  };
}

/** Plays a palette's dimple into a canvas the page sizes with CSS (effect-loop.ts). */
export const playDimple = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: DimplePlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<DimplePlay> | null =>
  playEffect(canvas, palette, view, createDimpleDrawing, onFirstFrame, options);
