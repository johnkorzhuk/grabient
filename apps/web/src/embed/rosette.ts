/* The rosette behind any page: `<script src="https://grabient.com/{seed}.js?style=rosette" async></script>`
   (mount.ts). Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=rosette. Its
   still is the stylesheet's (engine/fx-still.ts fxStillBackground), drawn by the rosette's writer alone. */
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { rosetteScene } from "@grabient/engine/rosette.ts";
import { rosetteStillSvg } from "@grabient/engine/rosette-svg.ts";
import { playRosette } from "@grabient/ui/rosette-player.ts";
import { mount } from "./mount.ts";

mount({
  kind: "rosette",
  still: (P, effect, angle) =>
    fxCover(
      rosetteStillSvg(
        rosetteScene(
          P,
          { angle, shape: effect.look.shape },
          { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
        )
      )
    ),
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playRosette(
      canvas,
      P,
      { angle, shape: effect.look.shape, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
