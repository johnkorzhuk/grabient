/* The silk behind any page: `<script src="https://grabient.com/{seed}.js?style=silk" async></script>` (mount.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=silk. Its still is the
   stylesheet's (engine/fx-still.ts fxStillBackground), drawn by the silk's writer alone. */
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { silkStillSvg } from "@grabient/engine/silk-svg.ts";
import { playSilk } from "@grabient/ui/silk-player.ts";
import { mount } from "./mount.ts";

mount({
  kind: "silk",
  still: (P, effect, angle) =>
    fxCover(
      silkStillSvg(
        P,
        { angle, shape: effect.look.shape },
        { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
      )
    ),
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playSilk(
      canvas,
      P,
      { angle, shape: effect.look.shape, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
