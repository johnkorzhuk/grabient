import { decodePalette } from "@grabient/engine/codec.ts";
import { demo } from "@grabient/engine/kit/fields/demo.ts";
import { KERNEL_GLSL } from "@grabient/engine/kit/gen/demo.ts";
import { kitFrameUniforms, kitSceneUniforms } from "@grabient/engine/kit/gl.ts";
import { kitScene } from "@grabient/engine/kit/scene.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { expect, test } from "vitest";
import { createKitDrawing } from "../src/kit-player.ts";

/* A field effect's player on a stand-in for WebGL that keeps every uniform it is given: the scene's are set once a
   palette, a view or a size is laid out, and a frame sets the phases and the moves alone, from the same two lists
   each frame, with the numbers kitFrameUniforms gives. */

const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ") as Palette;

function recordingGl() {
  const set: { name: string; data: number[]; list: unknown }[] = [];
  const uniform = (location: { name: string } | null, data: ArrayLike<number> | number) => {
    if (location)
      set.push({
        name: location.name,
        data: typeof data === "number" ? [data] : Array.from(data),
        list: data
      });
  };
  const own: Record<string, unknown> = {
    getExtension: () => null,
    isContextLost: () => false,
    getProgramParameter: () => true,
    getUniformLocation: (_: unknown, name: string) => ({ name }),
    uniform1f: uniform,
    uniform2fv: uniform,
    uniform3fv: uniform,
    uniform4fv: uniform
  };
  const gl = new Proxy(own, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      return /^[A-Z0-9_]+$/.test(key) ? 1 : () => ({});
    }
  }) as unknown as WebGL2RenderingContext;
  return { gl, set };
}

test("the player sets the scene's uniforms once a layout, and a frame's phases and moves alone each frame", () => {
  const { gl, set } = recordingGl();
  const drawing = createKitDrawing(demo, KERNEL_GLSL)(gl);
  const view = { angle: 137, shape: 7, speed: 1, fps: 60 };
  drawing.layout(P, view, 320, 180);
  expect(drawing.built()).toBe(true);
  drawing.draw(0);
  const scene = kitScene(demo, P, { angle: 137, shape: 7 }, { width: 320, height: 180 });
  const u = kitSceneUniforms(scene);
  const first = Object.fromEntries(set.map(s => [s.name, s.data]));
  expect(first).toEqual({
    uSize: Array.from(u.size),
    uD: [u.D],
    uTurn: Array.from(u.turn),
    uGround: Array.from(u.ground),
    uShade: Array.from(u.shade),
    uLine: Array.from(u.line),
    uStops: Array.from(u.stops),
    uK_shear: Array.from(u.K.shear),
    uK_wave: Array.from(u.K.wave),
    uKF: Array.from(kitFrameUniforms(scene, 0).phases),
    uMove: Array.from(kitFrameUniforms(scene, 0).move)
  });
  /* a frame: the phases and the moves alone, the same lists as the first frame's, filled anew */
  const lists = set.filter(s => s.name === "uKF" || s.name === "uMove").map(s => s.list);
  for (const t of [1 / 60, 23.7, 59.9]) {
    set.length = 0;
    drawing.draw(t);
    expect(set.map(s => s.name)).toEqual(["uKF", "uMove"]);
    expect(set.map((s, i) => s.list === lists[i])).toEqual([true, true]);
    const frame = kitFrameUniforms(scene, t);
    expect(set[0].data).toEqual(Array.from(frame.phases));
    expect(set[1].data).toEqual(Array.from(frame.move));
  }
  /* a new layout sends the scene again, once */
  drawing.layout(P, { ...view, angle: 90 }, 640, 360);
  set.length = 0;
  drawing.draw(5);
  drawing.draw(6);
  expect(set.filter(s => s.name === "uSize").map(s => s.data)).toEqual([[640, 360]]);
  expect(set.filter(s => s.name === "uKF")).toHaveLength(2);
});
