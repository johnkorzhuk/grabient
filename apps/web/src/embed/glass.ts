/* The fluted glass behind any page: `<script src="https://grabient.com/{seed}.js?style=glass" async></script>`
   (mount.ts). Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=glass. */
import { glassStillBackground } from "@grabient/engine/glass.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { playGlass } from "@grabient/ui/glass-player.ts";
import { mount } from "./mount.ts";

mount({
  kind: "glass",
  still: (P, _effect, angle) => glassStillBackground(glassColors(P), angle),
  play: (canvas, P, effect, angle, drawn) =>
    playGlass(canvas, P, { speed: effect.speed, fps: effect.fps, angle }, drawn)
});
