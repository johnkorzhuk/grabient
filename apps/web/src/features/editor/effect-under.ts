/* The gradient the stage lays under a soft effect, where its blurred edges thin to: the one every copy and file of it
   lays there (engine/fx-finish.ts effectUnderlay), whatever the editor's own gradient was set to before the effect was
   picked, so the stage, a reload of it and the files agree. */
import { sampleStops } from "@grabient/engine/curve.ts";
import { EFFECT_KINDS, type EffectKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_ANGLE, DEFAULT_STEPS } from "@grabient/engine/view.ts";
import { pictureCss, pictureOf } from "../../lib/picture.ts";

/** The palette's linear gradient of its steps (DEFAULT_STEPS, or its anchors where it has more) blurred by the soft,
    at the effect's angle (the blob's left to right, as it has none), as one CSS background. */
export const effectUnderCss = (
  P: Palette,
  kind: EffectKind,
  angle: number,
  soft: number,
  wide = false
): string =>
  pictureCss(
    pictureOf(
      sampleStops(P, Math.max(DEFAULT_STEPS, P.anchors.length)),
      { style: "linearGradient", soft },
      wide
    ),
    EFFECT_KINDS[kind].angle ? angle : DEFAULT_ANGLE
  );
