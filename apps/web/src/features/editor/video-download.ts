/* The editor's Download MP4: the clip at the address its Copy link copies (formats.ts clipAddress), drawn and coded in a
   Web Worker of this browser as the server draws it (video-worker.ts, video-clip.ts), so the file is the server's clip
   byte for byte and costs the server nothing, then handed to the browser to save. This module, the worker's code and
   the module that draws come with the first press, never with a page. The page's thread only hears how far along the
   drawing is, and a stop ends the worker at once. */
import { downloadFile } from "@grabient/ui/copy.ts";
import { NO_VIDEO_HERE } from "./formats.ts";
import type { ClipSaid } from "./video-clip.ts";

/* a module of one SIMD instruction (a splat, counted), which a browser validates only where its WebAssembly has the
   SIMD the clips' module is built with: Chrome's from 91, Firefox's from 89, Safari's from 16.4 */
const SIMD = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11
]);

/** Whether this browser can make a clip: it runs Web Workers and WebAssembly with SIMD. Asked before anything loads,
    so a reader whose browser cannot is told so, and a load that fails later is never taken for it. */
export const makesClips = (): boolean =>
  typeof Worker === "function" && typeof WebAssembly === "object" && WebAssembly.validate(SIMD);

/** A clip to make: the address it is drawn from, and the name its file is saved as. */
export interface ClipFile {
  address: string;
  name: string;
}

/** The clip made in a worker of this browser and saved as a file: `progress` hears the share of its frames drawn, and
    `signal` stops it. Rejects with NO_VIDEO_HERE where this browser cannot make one, with the signal's reason once
    stopped, and with an error of its own where the worker or its module did not load or the drawing failed. */
export function downloadClip(
  clip: ClipFile,
  progress: (done: number) => void,
  signal: AbortSignal
): Promise<void> {
  if (!makesClips()) return Promise.reject(new Error(NO_VIDEO_HERE));
  return new Promise<Blob>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./video-worker.ts", import.meta.url), {
        type: "module",
        name: "MP4"
      });
    } catch {
      /* a browser that runs no module workers refuses one at once */
      return reject(new Error(NO_VIDEO_HERE));
    }
    const end = () => {
      worker.terminate();
      signal.removeEventListener("abort", stop);
    };
    function stop() {
      end();
      reject(signal.reason);
    }
    signal.addEventListener("abort", stop, { once: true });
    worker.addEventListener("message", (event: MessageEvent<ClipSaid>) => {
      const said = event.data;
      if (said.said === "progress") progress(said.done);
      else if (said.said === "done") {
        end();
        resolve(new Blob([said.file], { type: "video/mp4" }));
      } else {
        end();
        reject(new Error(said.why === "browser" ? NO_VIDEO_HERE : `Video ${said.why}`));
      }
    });
    /* a worker whose script did not load or run (no connection, or a deploy since that retired it) says no more; this
       browser runs them (makesClips), so it is the load that failed */
    worker.addEventListener("error", event => {
      event.preventDefault();
      end();
      reject(new Error("Video load"));
    });
    worker.postMessage({ address: clip.address });
  }).then(file => downloadFile(clip.name, file));
}
