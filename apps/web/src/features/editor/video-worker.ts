/* The Web Worker that draws and codes an effect's MP4 for the editor's Download (video-download.ts starts one a clip and
   ends it when the file is made or the reader stops it), so the page's thread never waits on a frame. The module the
   Worker draws clips with comes with the worker, its address from the build (video-clip.ts's clipModule). */
import wasmAddress from "@grabient/engine/video/video.wasm?url";
import { answerClip, type ClipAsk, type ClipSaid, clipModule } from "./video-clip.ts";

addEventListener("message", (event: MessageEvent<ClipAsk>) => {
  void answerClip(
    event.data,
    () => clipModule(wasmAddress),
    (said: ClipSaid, transfer: Transferable[] = []) => postMessage(said, { transfer })
  );
});
