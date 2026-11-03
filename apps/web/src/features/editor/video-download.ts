/* The editor's Download MP4: the clip at the address its Copy link copies (formats.ts clipAddress), drawn and coded in a
   Web Worker of this browser as the server draws it (video-worker.ts, video-clip.ts), so the file is the server's clip
   byte for byte and costs the server nothing, then handed to the browser to save. This module, the worker's code and
   the module that draws come with the first press, never with a page. The page's thread only hears how far along the
   drawing is, and a stop ends the worker at once. */
import { downloadFile } from "@grabient/ui/copy.ts";
import { clipAddress, NO_VIDEO_HERE, type Taken } from "./formats.ts";
import type { ClipSaid } from "./video-clip.ts";

/** The clip of the effect taken, made in a worker of this browser and saved as a file: `progress` hears the share of
    its frames drawn, and `signal` stops it. Rejects with NO_VIDEO_HERE where this browser cannot make one, with the
    signal's reason once stopped, and with an error of its own where the drawing failed. */
export function downloadClip(
  p: Taken,
  progress: (done: number) => void,
  signal: AbortSignal
): Promise<void> {
  const effect = p.effect;
  if (!effect) return Promise.reject(new Error("No effect plays."));
  const address = clipAddress(p, effect);
  return new Promise<Blob>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./video-worker.ts", import.meta.url), {
        type: "module",
        name: "MP4"
      });
    } catch {
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
      } else if (said.said === "failed") {
        end();
        reject(new Error(said.why === "browser" ? NO_VIDEO_HERE : `Video ${said.why}`));
      }
    });
    /* a worker that cannot start, as where module workers are not run, says no more */
    worker.addEventListener("error", event => {
      event.preventDefault();
      end();
      reject(new Error(NO_VIDEO_HERE));
    });
    worker.postMessage({ address });
  }).then(file => downloadFile(`grabient-${p.seed}-${effect.kind}.mp4`, file));
}
