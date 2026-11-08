import { decodePalette } from "@grabient/engine/codec.ts";
import { EFFECT_LOOK, type Effect } from "@grabient/engine/effect.ts";
import { grainOverRgba } from "@grabient/engine/fx-finish.ts";
import { effectRgba } from "@grabient/engine/fx-frame.ts";
import { expect, test } from "vitest";
import { effectFrame } from "./effect-frame.ts";

const P = decodePalette("kUMzO5Na871ukuyhHUJA")!;
const size = { width: 120, height: 80 };
const n = size.width * size.height;
const effect = (kind: Effect["kind"], bg: string | null = null): Effect => ({
  kind,
  speed: 1,
  fps: 60,
  look: { ...EFFECT_LOOK, shape: kind === "blob" ? 7 : null, bg }
});

test("the editor's copy of an effect's frame is the server's picture of it: the same blur, the grain laid after", async () => {
  for (const kind of ["glass", "silk", "rosette"] as const)
    for (const [soft, grain] of [
      [0, 0],
      [40, 0],
      [0, 30],
      [70, 50]
    ]) {
      const finish = { ...(soft ? { soft } : {}), ...(grain ? { grain } : {}) };
      const picture = await effectFrame(P, effect(kind), 30, size, { finish });
      const copy = await effectRgba(P, effect(kind), 30, size, soft);
      expect(picture.length).toBe(n * 3);
      expect(copy.length).toBe(n * 4);
      expect(copy.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
      /* the canvas lays the tile as grainOverRgba does */
      grainOverRgba(copy, size.width, size.height, grain);
      const rgb = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) rgb.set(copy.subarray(i * 4, i * 4 + 3), i * 3);
      expect(rgb).toEqual(picture);
    }
});

test("a blob that lets the page through stays clear, finished or not; its card stands on its backdrop", async () => {
  for (const bg of [null, "#10101480"]) {
    for (const finish of [{}, { soft: 50, grain: 40 }]) {
      const picture = await effectFrame(P, effect("blob", bg), 90, size, { finish });
      expect(picture.length).toBe(n * 4);
      const alphas = new Set(Array.from({ length: n }, (_, i) => picture[i * 4 + 3]));
      expect([...alphas].some(a => a < 255)).toBe(true);
      const card = await effectFrame(P, effect("blob", bg), 90, size, { finish, card: true });
      expect(card.length).toBe(n * 3);
    }
  }
  /* on a ground that covers the box it is opaque, its soft edges going to the gradient under it */
  const grounded = await effectFrame(P, effect("blob", "#101014"), 90, size, {
    finish: { soft: 50 }
  });
  expect(grounded.length).toBe(n * 3);
});

test("the strings on a ground that lets the page through stay clear there, finished or not; their card stands on their designed ground", async () => {
  const { stringsScene, stringsSolid } = await import("@grabient/engine/strings.ts");
  const { renderStrings } = await import("@grabient/engine/strings-render.ts");
  const look = { angle: 90, shape: null, steps: null };
  for (const bg of ["#10203080", "#00000000"]) {
    for (const finish of [{}, { soft: 50, grain: 40 }]) {
      const picture = await effectFrame(P, effect("strings", bg), 90, size, { finish });
      expect(picture.length, bg).toBe(n * 4);
      const alphas = new Set(Array.from({ length: n }, (_, i) => picture[i * 4 + 3]));
      expect(
        [...alphas].some(a => a < 255),
        bg
      ).toBe(true);
      const card = await effectFrame(P, effect("strings", bg), 90, size, { finish, card: true });
      expect(card.length, bg).toBe(n * 3);
    }
    /* the card unfinished is the CPU's drawing laid over the designed ground, byte for byte */
    const card = await effectFrame(P, effect("strings", bg), 90, size, { card: true });
    const solid = renderStrings(stringsSolid(stringsScene(P, { ...look, bg }, size)), 0);
    const rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) rgb.set(solid.subarray(i * 4, i * 4 + 3), i * 3);
    expect(card).toEqual(rgb);
  }
  /* on a whole ground, light or their designed one, they are opaque, their card their picture */
  for (const bg of [null, "#f4efe6"]) {
    const picture = await effectFrame(P, effect("strings", bg), 90, size, { finish: { soft: 50 } });
    expect(picture.length).toBe(n * 3);
    expect(await effectFrame(P, effect("strings", bg), 90, size, { card: true })).toEqual(
      await effectFrame(P, effect("strings", bg), 90, size)
    );
  }
});
