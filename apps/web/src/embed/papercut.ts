/* The papercut behind any page: `<script src="https://grabient.com/{seed}.js?style=papercut" async></script>`
   (mount.ts). Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=papercut. Its
   still is the stylesheet's (engine/fx-still.ts fxStillBackground), its shadows stepped, drawn by the papercut's writer
   alone; the canvas fades in over it with the shadows soft, the player's exact first frame. Where the page paints no
   still, the script draws it a share at a time: its cuts take some 20 ms to trace on a desktop and four times that on
   a phone (engine/papercut-svg.ts), which in one task would hold the page as it loads. */
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { papercutSceneSteps } from "@grabient/engine/papercut.ts";
import { papercutStillSteps } from "@grabient/engine/papercut-svg.ts";
import { playPapercut } from "@grabient/ui/papercut-player.ts";
import { mount } from "./mount.ts";
import { inShares } from "./shares.ts";

mount({
  kind: "papercut",
  still: async (P, effect, angle) => {
    const scene = await inShares(
      papercutSceneSteps(
        P,
        { angle, shape: effect.look.shape },
        { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
      )
    );
    return fxCover(await inShares(papercutStillSteps(scene)));
  },
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playPapercut(
      canvas,
      P,
      { angle, shape: effect.look.shape, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
