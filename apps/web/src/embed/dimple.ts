/* The dimple behind any page: `<script src="https://grabient.com/{seed}.js?style=dimple" async></script>` (mount.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=dimple. Its still is the
   stylesheet's (engine/fx-still.ts fxStillBackground), drawn by the dimple's writer alone: the hollow at its rest.
   The canvas fades in over it on that picture, and from there the hollow follows the pointer over the page, whatever
   of the page lies over the canvas, and stays where the pointer left it (ui/dimple-player.ts): nothing in it moves by
   itself, so it draws no frame while the pointer is still. */
import { dimpleStillSvg } from "@grabient/engine/dimple-svg.ts";
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { playDimple } from "@grabient/ui/dimple-player.ts";
import { mount } from "./mount.ts";

mount({
  kind: "dimple",
  still: (P, effect, angle) =>
    fxCover(
      dimpleStillSvg(
        P,
        { angle, zoom: effect.look.zoom },
        { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
      )
    ),
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playDimple(
      canvas,
      P,
      { angle, zoom: effect.look.zoom, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
