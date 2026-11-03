import { readFileSync } from "node:fs";
import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { videoFit } from "@grabient/engine/video.ts";
import { describe, expect, test } from "vitest";
import { CARD_SIZE } from "../../lib/picture-size.ts";
import { answerClip, type ClipSaid, clipAt, drawClip } from "./video-clip.ts";

/* The editor's Download MP4 as its worker draws it: the clip at the address its Copy link copies, read as the Worker
   reads it, and what the worker says as it goes. The Worker's own answer at the same address is the same file, byte
   for byte (server/images/video.test.ts). */

const ORIGIN = "https://grabient.test";
const SEED = "kWnCIwwC47igfOklkTlShq44";
const P = decodePalette(SEED)!;
const wasm = new WebAssembly.Module(
  readFileSync(new URL("../../../../../packages/engine/src/video/video.wasm", import.meta.url))
);
const at = (query: string) => clipAt(`${ORIGIN}/${SEED}.mp4?${query}`);

describe("the clip at an MP4's address", () => {
  test("is the effect it names, its angle, soft and grain, fitted from the size it asks for", () => {
    const clip = at("style=glass&angle=135&soft=40&grain=30&speed=2&fps=30&shape=417&w=640&h=360");
    const effect = parseEffect(new URLSearchParams("style=glass&speed=2&fps=30&shape=417"))!;
    const finish = { soft: 40, grain: 30 };
    expect(clip).toEqual({
      palette: P,
      effect,
      kind: "glass",
      angle: 135,
      finish,
      duration: null,
      ...videoFit({ kind: "glass", look: effect.look, finish }, 2, 30, null, {
        width: 640,
        height: 360
      })
    });
    expect(clip?.size).toEqual({ width: 640, height: 360 });
  });

  test("with no size is the card's, fitted within the clips' limits, and with no style the glass", () => {
    const clip = at("speed=1");
    expect(clip?.kind).toBe("glass");
    const look = { shape: null, frost: 1, bg: null };
    /* the glass's loop of 56 seconds at 60 frames a second is past the work a clip may be at the card's size */
    expect(clip?.size).toEqual(videoFit({ kind: "glass", look }, 1, 60, null, CARD_SIZE).size);
    expect(clip?.size).toEqual({ width: 952, height: 500 });
  });

  test("of the blob is one for every angle, and a size past a picture's bounds is fitted as the Worker bounds it", () => {
    expect(at("style=blob&angle=10")?.angle).toBe(90);
    /* 1700 by 2001 is a picture's 1602 by 1886 (lib/picture-size.ts), which the glass's limits fit at 634 by 748, where
       the size asked would fit at 636 by 748 */
    const look = { shape: null, frost: 1, bg: null };
    expect(
      videoFit({ kind: "glass", look }, 1, 60, null, { width: 1700, height: 2001 }).size
    ).toEqual({ width: 636, height: 748 });
    expect(at("style=glass&w=1700&h=2001")?.size).toEqual({ width: 634, height: 748 });
  });

  test("names no clip for a gradient, an effect no clip is drawn of, or no palette", () => {
    expect(at("style=linearGradient")).toBeNull();
    expect(at("style=papercut")).toBeNull();
    expect(clipAt(`${ORIGIN}/nothing.mp4?style=glass`)).toBeNull();
    expect(clipAt(`${ORIGIN}/${SEED}.png?style=glass`)).toBeNull();
    expect(clipAt("not an address")).toBeNull();
  });
});

describe("the worker", () => {
  const address = `${ORIGIN}/${SEED}.mp4?style=silk&angle=20&grain=50&speed=10&fps=10&w=64&h=48`;
  const run = async (asked: string, module: () => Promise<WebAssembly.Module>) => {
    const said: { said: ClipSaid; transfer?: Transferable[] }[] = [];
    await answerClip({ address: asked }, module, (each, transfer) =>
      said.push({ said: each, transfer })
    );
    return said;
  };

  test("says the clip's plan, then how far along it is by whole percents, then hands over its file", async () => {
    const said = await run(address, async () => wasm);
    const clip = clipAt(address)!;
    expect(said[0].said).toEqual({
      said: "plan",
      width: 64,
      height: 48,
      fps: 10,
      frames: clip.plan.frames,
      seconds: clip.plan.seconds
    });
    const progress = said.flatMap(({ said }) => (said.said === "progress" ? [said.done] : []));
    expect(progress.length).toBeGreaterThan(10);
    expect(progress).toEqual([...new Set(progress)].sort((a, b) => a - b));
    expect(progress.every(done => Math.abs(done * 100 - Math.round(done * 100)) < 1e-9)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    const last = said.at(-1)!;
    if (last.said.said !== "done") throw new Error(`the worker said ${last.said.said} last`);
    /* the file's bytes are handed over, not copied */
    expect(last.transfer).toEqual([last.said.file]);
    expect(new Uint8Array(last.said.file)).toEqual(drawClip(wasm, clip));
    expect(said.length).toBe(progress.length + 2);
  });

  test("says why there is no file: an address of no clip, a browser that refuses the module, a drawing that failed", async () => {
    const empty = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const refused = async (): Promise<WebAssembly.Module> => {
      throw new WebAssembly.CompileError("no SIMD here");
    };
    const failed = (said: { said: ClipSaid }[]) => said.at(-1)?.said;
    expect(failed(await run(`${ORIGIN}/${SEED}.mp4?style=papercut`, async () => wasm))).toEqual({
      said: "failed",
      why: "address"
    });
    expect(failed(await run(address, refused))).toEqual({ said: "failed", why: "browser" });
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(failed(await run(address, async () => empty))).toEqual({
        said: "failed",
        why: "drawing"
      });
    } finally {
      console.error = quiet;
    }
  });
});
