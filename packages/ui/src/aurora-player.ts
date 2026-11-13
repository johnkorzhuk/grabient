/* The aurora as WebGL: engine/aurora-gl.ts's one pass on effect-loop.ts. The pass reads the scene's numbers from one
   float texture, sent whenever a palette, a view or a size is laid out, and the noise from two tiles of bytes that
   are the same for every aurora, sent once. The tiles take tens of milliseconds to make, so they are made a few
   milliseconds a frame while the GPU builds the program, and the scene, which reads them, is laid out only once they
   are there: no frame is held for them, and the still stays until the first is drawn. The canvas keeps its alpha, so
   a range that is clear or lets the page through shows what is under it. */
import {
  AURORA_TILE,
  type AuroraScene,
  type AuroraTiles,
  auroraScene,
  auroraTilesSteps,
  auroraTime
} from "@grabient/engine/aurora.ts";
import {
  AURORA_FS,
  AURORA_TABLE,
  AURORA_VS,
  auroraSceneUniforms,
  auroraTable
} from "@grabient/engine/aurora-gl.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  type EffectDrawing,
  type EffectPlayer,
  type PlayOptions,
  playEffect
} from "./effect-loop.ts";
import { buildPrograms } from "./gl-build.ts";

/** The aurora as it plays: the angle its picture is turned to (90 as designed), its light's shape (none as designed),
    its range's path (none as designed) and color (none clear), its pace and its frames a second at most. */
export interface AuroraPlay {
  angle: number;
  shape: number | null;
  path: string | null;
  bg: string | null;
  speed: number;
  fps: number;
}

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
] as const;
type Locations = Record<(typeof NAMES)[number], WebGLUniformLocation | null>;

/** How long the tiles are worked at each time the loop asks whether the drawing is built, twice a frame. */
const TILES_SLICE_MS = 3;

/** The aurora's drawing on a context. */
export function createAuroraDrawing(gl: WebGL2RenderingContext): EffectDrawing<AuroraPlay> {
  const programs = buildPrograms(gl, [[AURORA_VS, AURORA_FS]]);
  const [program] = programs.list;
  const vao = gl.createVertexArray();
  /* the table on unit 0, read texel by texel; the tiles on units 1 and 2, read between their pixels, repeating */
  const texture = (unit: number, filter: number, wrap: number) => {
    const made = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return made;
  };
  const textures = [
    texture(0, gl.NEAREST, gl.CLAMP_TO_EDGE),
    texture(1, gl.LINEAR, gl.REPEAT),
    texture(2, gl.LINEAR, gl.REPEAT)
  ];
  const tile = (unit: number, bytes: Uint8Array) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      AURORA_TILE,
      AURORA_TILE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes
    );
  };
  const making = auroraTilesSteps();
  let tiles: AuroraTiles | null = null;
  let U: Locations | null = null;
  let laid: { palette: Palette; view: AuroraPlay; width: number; height: number } | null = null;
  let scene: AuroraScene | null = null;
  return {
    layout(palette, view, width, height) {
      laid = { palette, view, width, height };
      scene = null;
    },
    built() {
      if (!tiles) {
        const until = performance.now() + TILES_SLICE_MS;
        do {
          const step = making.next();
          if (step.done) {
            tiles = step.value;
            tile(1, tiles.noise);
            tile(2, tiles.soft);
          }
        } while (!tiles && performance.now() < until);
      }
      const built = programs.built();
      return built === true && !tiles ? false : built;
    },
    draw(t) {
      if (!laid || !tiles || programs.built() !== true) return;
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      if (!U) {
        U = Object.fromEntries(NAMES.map(n => [n, gl.getUniformLocation(program, n)])) as Locations;
        gl.uniform1i(U.uTable, 0);
        gl.uniform1i(U.uNoise, 1);
        gl.uniform1i(U.uSoft, 2);
      }
      if (!scene) {
        const { palette, view, width, height } = laid;
        scene = auroraScene(palette, view, { width, height });
        const u = auroraSceneUniforms(scene);
        gl.uniform2f(U.uSize, width, height);
        gl.uniform3fv(U.uFrame, u.frame);
        gl.uniform3fv(U.uPath, u.path);
        gl.uniform4fv(U.uRange, u.range);
        gl.uniform2fv(U.uFan, u.fan);
        gl.uniform4fv(U.uSheets, u.sheets);
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          AURORA_TABLE.width,
          AURORA_TABLE.height,
          0,
          gl.RGBA,
          gl.FLOAT,
          auroraTable(scene)
        );
      }
      gl.uniform1f(U.uTime, auroraTime(t));
      gl.viewport(0, 0, scene.width, scene.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      for (const p of programs.list) gl.deleteProgram(p);
      for (const made of textures) gl.deleteTexture(made);
      gl.deleteVertexArray(vao);
    }
  };
}

/** Plays the aurora into a canvas the page sizes with CSS (effect-loop.ts). `onFirstFrame` is told once the first
    frame is on the canvas, so a page can fade it in over the still it drew before. Null where WebGL 2 is missing or
    drawn in software. */
export const playAurora = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: AuroraPlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
): EffectPlayer<AuroraPlay> | null =>
  playEffect(canvas, palette, view, createAuroraDrawing, onFirstFrame, { ...options, alpha: true });
