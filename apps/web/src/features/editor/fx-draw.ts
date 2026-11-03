/* The vector effects' drawing in the browser (silk, rosette, papercut: engine/fx-still.ts), loaded on demand, as the
   menu opens or one of them is chosen, so a palette page's start carries none of it: their first frame as a background
   that covers any box, the same the server draws into a page's head (server/fx-still.ts), and their players' code. */
import type { EffectSettings, FxLook, VectorKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";

/** The id of the head's style the server writes the vector effects' stills in. */
export const FX_STILL_STYLE = "fx-still";

let fx: typeof import("@grabient/engine/fx-still.ts") | null = null;
let loading: Promise<void> | null = null;

/** The stills' code, asked for once. */
export const loadFx = (): Promise<void> =>
  (loading ??= import("@grabient/engine/fx-still.ts").then(m => {
    fx = m;
  }));

/** Whether the server drew the still `key` names into the page's head, which paints every holder naming it: its
    data-key names each still it holds. */
export const serverFxStill = (key: string): boolean =>
  typeof document !== "undefined" &&
  !!document.getElementById(FX_STILL_STYLE)?.dataset.key?.split(" ").includes(key);

/** A vector effect's look, as its settings and the view's angle give it. */
export const fxLookOf = (s: EffectSettings, angle: number): FxLook => ({
  angle,
  shape: s.look.shape
});

/** The still as a background for a box of any size, or null while its code loads. */
export function fxStillBackground(kind: VectorKind, P: Palette, look: FxLook): string | null {
  return fx ? fx.fxStillBackground(kind, P, look) : null;
}

/** How a vector effect plays: its look, its pace and its frame rate. */
export interface FxPlay {
  angle: number;
  shape: number | null;
  speed: number;
  fps: number;
}
