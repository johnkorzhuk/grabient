/* The blob behind any page: `<script src="https://grabient.com/{seed}.js?style=blob" async></script>` (mount.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=blob. */
import { blobStillBackground } from "@grabient/engine/blob.ts";
import { playBlob } from "@grabient/ui/blob-player.ts";
import { browserGround } from "./ground.ts";
import { mount } from "./mount.ts";

mount({
  kind: "blob",
  /* a ground written as any CSS color, which the stylesheet of the same address is answered at as its hex */
  ground: browserGround,
  still: (P, effect) =>
    blobStillBackground(P, { speed: 1, fps: null, still: true, ...effect.look }),
  /* the blob has no angle: its palette lies from left to right whatever the address says */
  play: (canvas, P, effect, _angle, drawn, reduced) =>
    playBlob(
      canvas,
      P,
      { speed: effect.speed, fps: effect.fps, still: false, ...effect.look },
      drawn,
      { reduced }
    )
});
