/* The Web Worker that draws and codes an effect's MP4 for the editor's Download (video-download.ts starts one a clip and
   ends it when the file is made or the reader stops it), so the page's thread never waits on a frame. The module the
   Worker draws clips with comes with the worker, its address from the build; a server that names its type wrongly is
   read the slow way, and a module this browser cannot compile (no WebAssembly SIMD) is not asked for again. */
import wasmAddress from "@grabient/engine/video/video.wasm?url";
import { answerClip, type ClipAsk, type ClipSaid } from "./video-clip.ts";

const compiled = async (): Promise<WebAssembly.Module> => {
  try {
    return await WebAssembly.compileStreaming(fetch(wasmAddress));
  } catch (error) {
    if (error instanceof WebAssembly.CompileError) throw error;
    return WebAssembly.compile(await (await fetch(wasmAddress)).arrayBuffer());
  }
};

addEventListener("message", (event: MessageEvent<ClipAsk>) => {
  void answerClip(event.data, compiled, (said: ClipSaid, transfer: Transferable[] = []) =>
    postMessage(said, { transfer })
  );
});
