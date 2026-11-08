/* The strings behind any page: `<script src="https://grabient.com/{seed}.js?style=strings" async></script>`
   (mount.ts). Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=strings. Its
   still is the stylesheet's (engine/fx-still.ts fxStillBackground), drawn by the strings' writer alone; the canvas
   fades in over it, the player's first frame, or takes its place in one frame where its ground lets the page through
   (mount.ts). Where the page paints no still, the script draws it a share at a time (shares.ts): its threads take some
   60 ms to trace on a desktop (engine/strings-svg.ts). Its ground (`bg`) may be written as any CSS color, which the
   stylesheet of the same address is answered at as its hex (ground.ts). */
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { stringsScene } from "@grabient/engine/strings.ts";
import { stringsStillSteps } from "@grabient/engine/strings-svg.ts";
import { playStrings } from "@grabient/ui/strings-player.ts";
import { browserGround } from "./ground.ts";
import { mount } from "./mount.ts";
import { inShares } from "./shares.ts";

mount({
  kind: "strings",
  /* a ground written as any CSS color, a clear one kept (their none is their designed ground) */
  ground: browserGround,
  still: async (P, effect, angle) =>
    fxCover(
      await inShares(
        stringsStillSteps(
          stringsScene(
            P,
            { angle, shape: effect.look.shape, bg: effect.look.bg },
            { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
          )
        )
      )
    ),
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playStrings(
      canvas,
      P,
      { angle, shape: effect.look.shape, bg: effect.look.bg, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
