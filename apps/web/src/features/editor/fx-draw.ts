/* The vector effects' drawing in the browser (engine/fx-still.ts), loaded on demand, as the menu opens or one of them
   is chosen, so a palette page's start carries none of it: their first frame as a background that covers any box, the
   same the server draws into a page's head (server/fx-still.ts), and their players' code. */
import {
  type EffectSettings,
  fxLookOf as engineLook,
  type FxLook,
  type VectorKind
} from "@grabient/engine/effect.ts";
import type { KitKind } from "@grabient/engine/kit/kinds.ts";
import type { Palette } from "@grabient/engine/palette.ts";

/** The id of the head's style the server writes the vector effects' stills in. */
export const FX_STILL_STYLE = "fx-still";

let fx: typeof import("@grabient/engine/fx-still.ts") | null = null;
let trace: typeof import("./fx-trace.ts") | null = null;
let loading: Promise<void> | null = null;

/** The stills' code, asked for once, with what hands a still's trace to a worker (fx-trace.ts), which a server's build
    never loads and so never carries. */
export const loadFx = (): Promise<void> =>
  (loading ??= Promise.all([
    import("@grabient/engine/fx-still.ts"),
    import.meta.env.SSR ? null : import("./fx-trace.ts")
  ]).then(([m, t]) => {
    fx = m;
    trace = t;
  }));

/** Whether the server drew the still `key` names into the page's head, which paints every holder naming it: its
    data-key names each still it holds. */
export const serverFxStill = (key: string): boolean =>
  typeof document !== "undefined" &&
  !!document.getElementById(FX_STILL_STYLE)?.dataset.key?.split(" ").includes(key);

/** A vector effect's look, as its settings and the view's angle give it: its shape, its steps and its ground. */
export const fxLookOf = (s: EffectSettings, angle: number): FxLook => engineLook(s.look, angle);

/** The still as a background for a box of any size, or null while its code loads. */
export function fxStillBackground(kind: VectorKind, P: Palette, look: FxLook): string | null {
  return fx ? fx.fxStillBackground(kind, P, look) : null;
}

/** A still's trace handed to the page's worker before its steps run (fx-trace.ts): the strings' threads at a view none
    has traced yet. The card is told (`tell`) once they are kept, or once the worker has failed; the function returned
    forgets the card. Null where the still's steps need no worker, or none takes it, so they run on the page. */
export function fxTraceAway(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  tell: () => void
): (() => void) | null {
  const stills = fx;
  const ask = stills?.fxTraceAsk(kind, P, look);
  return ask && stills && trace
    ? trace.traceAway(ask, threads => stills.fxKeepTrace(ask, threads), tell)
    : null;
}

/** The same background drawn a step at a time (a papercut's cuts traced a level at a time, where no still has shown
    its view yet), or null while its code loads. */
export function fxStillSteps(
  kind: VectorKind,
  P: Palette,
  look: FxLook
): Iterator<void, string> | null {
  return fx ? fx.fxStillSteps(kind, P, look) : null;
}

/** An effect the pointer moves (engine/effect.ts EFFECT_KINDS' motion), as a background for a box of any size with
    the pointer at a place in the design's square, 0 to 1 each way: what a card shows once its player has gone, so its
    picture stays as the pointer left it. Null while its code loads. */
export function fxPlacedBackground(
  kind: VectorKind,
  P: Palette,
  look: FxLook,
  at: readonly [number, number]
): string | null {
  return fx ? fx.fxFrameCss(kind, P, look, 0, at) : null;
}

/** How a vector effect plays: its look (its angle, shape, steps, zoom, path and ground), its pace and its frame
    rate, and whether one the pointer moves roams instead (the dimple). */
export interface FxPlay {
  roam?: boolean;
  angle: number;
  shape: number | null;
  steps: number | null;
  zoom: number | null;
  path: string | null;
  bg: string | null;
  speed: number;
  fps: number;
}

/** A field effect's player (ui/kit-player.ts), made from its definition and its kernel's GLSL, which come with it
    (engine/kit/registry.ts, kernels.ts), one kind's kernel at a time. A server's build never loads it, and its ask
    waits for ever. */
export async function kitPlayer(kind: KitKind) {
  const [{ playKit }, { kitEffect }, kernel] = await (import.meta.env.SSR
    ? (new Promise(() => {}) as never)
    : Promise.all([
        import("@grabient/ui/kit-player.ts"),
        import("@grabient/engine/kit/registry.ts"),
        import("@grabient/engine/kit/kernels.ts").then(m => m.kitKernel(kind))
      ]));
  return playKit(kitEffect(kind), kernel.glsl);
}
