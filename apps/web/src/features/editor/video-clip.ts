/* The editor's Download MP4, as a Web Worker of the reader's browser draws it (video-worker.ts): the clip at the address
   its Copy link copies (/{seed}.mp4, engine/effect.ts's effectFileAddress), read as the Worker reads that address
   (engine/video.ts's videoAt, lib/picture-size.ts), finished, drawn and coded by the same code and module
   (engine/video-finish.ts, video.ts, video/video.wasm) in one stream from its key frame, which is the stream the
   Worker's parts join into, so the file is the server's clip byte for byte, made at no cost to the server. Nothing
   here touches a page: the worker loads it, and tests drive it as the worker does. */
import { decodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type VideoAt, videoAt, videoFile, videoFrames } from "@grabient/engine/video.ts";
import { videoFinish } from "@grabient/engine/video-finish.ts";
import { pictureSize } from "../../lib/picture-size.ts";

/** What the page asks the worker for: the clip at an MP4's address. */
export interface ClipAsk {
  address: string;
}

/** What the worker answers, in order: how far along its drawing is (the share of its frames coded, said as each whole
    percent passes), then its file, or why there is none: an address that names no clip, a browser that cannot run
    the module, a module that did not load (no connection, or a deploy since that retired it), or a drawing that
    failed. */
export type ClipSaid =
  | { said: "progress"; done: number }
  | { said: "done"; file: ArrayBuffer }
  | { said: "failed"; why: "address" | "browser" | "load" | "drawing" };

/** A clip as its address asks for it, with its palette. */
export interface Clip extends VideoAt {
  palette: Palette;
}

/** The clip an MP4's address asks for, as /{seed}.mp4 reads it; null for an address of no clip (a palette no seed
    names, a gradient's style, an effect no clip is drawn of). The editor writes a palette's seed as it is, so the
    seed reads as the Worker's own reading of it does. */
export function clipAt(address: string): Clip | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const seed = /^\/([^/]+)\.mp4$/.exec(url.pathname)?.[1];
  let palette: Palette | null = null;
  try {
    palette = seed ? decodePalette(decodeURIComponent(seed)) : null;
  } catch {
    return null;
  }
  const asked = palette ? videoAt(url.searchParams, pictureSize(url.searchParams)) : null;
  return palette && asked ? { ...asked, palette } : null;
}

/** The clip's MP4, drawn and coded by the module in one stream, finished as its parts are on the server (the finish
    worked out once, none for a clip with neither soft nor grain); `progress` hears the share of its frames coded as
    each whole percent passes. */
export function drawClip(
  wasm: WebAssembly.Module,
  clip: Clip,
  progress?: (done: number) => void
): Uint8Array<ArrayBuffer> {
  const { palette, kind, effect, angle, finish, size, fps, plan } = clip;
  const ask = {
    kind,
    palette,
    look: effect.look,
    angle,
    size,
    fps,
    finish:
      finish.soft || finish.grain
        ? videoFinish(palette, { kind, look: effect.look }, angle, finish, size)
        : {}
  };
  let said = 0;
  const { frames } = videoFrames(wasm, ask, plan, 0, plan.frames, null, undefined, coded => {
    const share = Math.floor((100 * coded) / plan.frames);
    if (share > said) {
      said = share;
      progress?.(share / 100);
    }
  });
  return videoFile({ size, fps }, frames);
}

/* a WebAssembly module's first eight bytes: its magic word, then its version */
const MODULE_HEAD = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

/** The clips' module, fetched from its address and compiled. A fetch that fails or answers anything but the module (a
    page in its place, as for a module a deploy since retired) is a load that failed; only the module's own bytes reach
    the compiler, so a refusal there (a CompileError) is the browser's, one without the WebAssembly it is built with. */
export async function clipModule(
  address: string,
  get: typeof fetch = fetch
): Promise<WebAssembly.Module> {
  const answer = await get(address);
  const bytes = answer.ok ? new Uint8Array(await answer.arrayBuffer()) : null;
  if (!bytes || MODULE_HEAD.some((byte, i) => bytes[i] !== byte))
    throw new Error(`The clips' module did not load: ${answer.status} at ${address}`);
  return WebAssembly.compile(bytes);
}

/** The worker's answer to an ask, said through `say` (the file's bytes handed over, not copied); `wasm` loads the
    module (clipModule), which a browser without WebAssembly's SIMD refuses to compile. */
export async function answerClip(
  ask: ClipAsk,
  wasm: () => Promise<WebAssembly.Module>,
  say: (said: ClipSaid, transfer?: Transferable[]) => void
): Promise<void> {
  const clip = clipAt(ask.address);
  if (!clip) return say({ said: "failed", why: "address" });
  let module: WebAssembly.Module;
  try {
    module = await wasm();
  } catch (error) {
    const refused = typeof WebAssembly === "undefined" || error instanceof WebAssembly.CompileError;
    return say({ said: "failed", why: refused ? "browser" : "load" });
  }
  try {
    const file = drawClip(module, clip, done => say({ said: "progress", done }));
    say({ said: "done", file: file.buffer }, [file.buffer]);
  } catch (error) {
    console.error("Video failed", error);
    say({ said: "failed", why: "drawing" });
  }
}
