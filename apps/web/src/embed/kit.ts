/* A field effect behind any page (engine/kit): what each kit effect's script (strata.ts) mounts, its
   definition and its kernel's GLSL handed in, so each script carries its own kind and no other. Its still is the
   stylesheet's (engine/fx-still.ts fxStillBackground), drawn by the kit's writer (engine/kit/svg.ts); the canvas fades
   in over it, the player's first frame (ui/kit-player.ts). Where the page paints no still, the script draws it a
   share at a time (shares.ts): its levels take some tens of milliseconds to trace on a desktop. */
import { fxLookOf } from "@grabient/engine/effect.ts";
import { fxCover } from "@grabient/engine/fx-still.ts";
import type { KitKind } from "@grabient/engine/kit/kinds.ts";
import { kitStillSteps } from "@grabient/engine/kit/svg.ts";
import type { FieldEffect } from "@grabient/engine/kit/types.ts";
import { playKit } from "@grabient/ui/kit-player.ts";
import { mount } from "./mount.ts";
import { inShares } from "./shares.ts";

/** Plays a field effect behind the page its script is on. */
export function mountKit(def: FieldEffect, kernelGlsl: string): void {
  const play = playKit(def, kernelGlsl);
  mount({
    kind: def.kind as KitKind,
    still: async (P, effect, angle) =>
      fxCover(await inShares(kitStillSteps(def, P, fxLookOf(effect.look, angle)))),
    play: (canvas, P, effect, angle, drawn, reduced) =>
      play(
        canvas,
        P,
        { ...fxLookOf(effect.look, angle), speed: effect.speed, fps: effect.fps },
        drawn,
        { reduced }
      )
  });
}
