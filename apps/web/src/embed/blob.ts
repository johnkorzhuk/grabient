/* The blob behind any page: `<script src="https://grabient.com/{seed}.js?style=blob" async></script>` (mount.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=blob. */
import { blobStillBackground } from "@grabient/engine/blob.ts";
import { playBlob } from "@grabient/ui/blob-player.ts";
import { mount } from "./mount.ts";

mount({
  kind: "blob",
  still: (P, effect, angle) =>
    blobStillBackground(P, { speed: 1, fps: null, still: true, angle, ...effect.look }),
  play: (canvas, P, effect, angle, drawn) =>
    playBlob(
      canvas,
      P,
      { speed: effect.speed, fps: effect.fps, still: false, angle, ...effect.look },
      drawn
    )
});
