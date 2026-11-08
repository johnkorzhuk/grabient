import { encodePalette } from "@grabient/engine/codec.ts";
import {
  EFFECT_KINDS,
  type EffectSettings,
  effectBare,
  type FxLook,
  fxStillKey,
  type VectorKind
} from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { holdsStill } from "@grabient/ui/motion.ts";
import {
  createEffect,
  createSignal,
  Loading,
  lazy,
  onCleanup,
  onSettled,
  Show,
  untrack
} from "solid-js";
import styles from "./Editor.module.css";
import { fxLookOf, fxStillBackground, loadFx, serverFxStill } from "./fx-draw.ts";

/* A vector effect over the picture's gradient (EFFECT_KINDS): its still, the first frame as a background
   covering the box, and the WebGL player over it once the page is live and the effect moves or changes, its canvas
   fading in over the still once its first frame, the still's own, is drawn, and out again to the still at speed 0. The still is
   the server's where it shows this palette and this look: the holder names them as the first screen's does
   (Boot.tsx), and the style in the head paints both (server/fx-still.ts), so the editor arriving changes no pixel.
   Otherwise it is drawn here, the same background, once the stills' code has come. A reader who asks for less motion
   (Settings, else the device: ui/motion.ts) keeps the still. While the palette or the look changes the player shows
   it, over a still picture too, and the still is drawn for the last one once they rest, under the canvas, which then
   fades back to it. The papercut's still stands in for its first frame (its shadows stepped), so its player comes at
   speed 0 too and its exact first frame stays over the still (FxStage.tsx): the still is then the first paint and
   what a page without WebGL shows. A ground that lets the page through (the strings' on a translucent or clear one:
   engine/effect.ts effectBare) stands on the page's own, as the blob does, and its still and its canvas, both
   translucent, never show together (two over each other thicken the ground): they change places in one frame where
   they show the same frame (its first, and while the palette or the look changes), and cross-fade where they differ
   (the effect stopping, or starting again), as the blob's do (BlobLayer.tsx). */

/* the player is the browser's alone (the page stands live first): the server's build carries none of it */
const FxStage = lazy(() =>
  (import.meta.env.SSR ? (new Promise(() => {}) as never) : import("./FxStage.tsx")).then(m => ({
    default: m.FxStage
  }))
);

/** How long the palette or the look stands before the still is drawn for it under the player. */
const REST_MS = 250;

export function FxLayer(props: {
  kind: VectorKind;
  palette: Palette;
  settings: EffectSettings;
  angle: number;
}) {
  const [live, setLive] = createSignal(false);
  const [covered, setCovered] = createSignal(false);
  const [kept, setKept] = createSignal(false);
  const [held, setHeld] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const moving = () => props.settings.speed > 0 && !holdsStill();
  const look = (): FxLook => fxLookOf(props.settings, props.angle);
  const stepped = () => EFFECT_KINDS[props.kind].steppedStill;
  const bare = () => effectBare(props.kind, props.settings.look);
  /* the canvas and the still change places at once until the canvas has first shown, its first frame being the
     still's own, where they never show together (a bare ground's) */
  const [first, setFirst] = createSignal(true);
  let settling = 0;
  createEffect(covered, on => {
    if (on && untrack(first))
      settling = requestAnimationFrame(() => {
        settling = requestAnimationFrame(() => setFirst(false));
      });
  });
  createEffect(
    () => moving() || stepped(),
    on => {
      if (on) setKept(true);
    }
  );
  let holder!: HTMLDivElement;
  onSettled(() => {
    void loadFx().then(() => setReady(true));
    setLive(true);
  });
  const keyOf = (kind: VectorKind, P: Palette, l: FxLook) => fxStillKey(kind, encodePalette(P), l);
  /* the still the holder shows: the server's where the head holds it, else drawn here once the code has come */
  let shown = "";
  const still = (kind: VectorKind, P: Palette, l: FxLook) => {
    const key = keyOf(kind, P, l);
    if (key === shown) return;
    if (serverFxStill(key)) {
      shown = key;
      holder.dataset.fxStill = key;
      holder.style.background = "";
      return;
    }
    const paint = fxStillBackground(kind, P, l);
    if (!paint) return;
    shown = key;
    holder.dataset.fxStill = key;
    holder.style.background = paint;
  };
  let pending = 0;
  createEffect(
    () => (covered() || !ready() ? null : { kind: props.kind, P: props.palette, l: look() }),
    next => {
      if (!next) return;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => still(next.kind, next.P, next.l));
    }
  );
  /* a palette or a look that changes holds the player over the still until it rests */
  let resting: ReturnType<typeof setTimeout> | undefined;
  let letting = 0;
  let last: string | null = null;
  createEffect(
    () => keyOf(props.kind, props.palette, look()),
    next => {
      const was = last;
      last = next;
      if (!was || was === next) return;
      cancelAnimationFrame(letting);
      clearTimeout(resting);
      setKept(true);
      setHeld(true);
      resting = setTimeout(() => {
        /* under a papercut's first frame, which stays over it, the still waits until it shows again (the effect
           above draws it then) */
        if (!untrack(moving) && untrack(ready) && !(untrack(stepped) && untrack(covered)))
          still(
            untrack(() => props.kind),
            untrack(() => props.palette),
            untrack(look)
          );
        letting = requestAnimationFrame(() => {
          letting = requestAnimationFrame(() => setHeld(false));
        });
      }, REST_MS);
    }
  );
  onCleanup(() => {
    if (import.meta.env.SSR) return;
    cancelAnimationFrame(pending);
    cancelAnimationFrame(settling);
    cancelAnimationFrame(letting);
    clearTimeout(resting);
  });
  return (
    <div
      class={styles.fx}
      aria-hidden="true"
      data-covered={covered() ? "" : undefined}
      data-bare={bare() ? "" : undefined}
      data-cut={bare() && (first() || (held() && !moving())) ? "" : undefined}
    >
      <div
        ref={el => {
          holder = el;
          untrack(() => still(props.kind, props.palette, look()));
        }}
        class={styles.glassStill}
        data-fx-still={untrack(() => keyOf(props.kind, props.palette, look()))}
        elementtiming="effect-still"
      />
      <Show when={live() && kept()}>
        <Loading>
          <FxStage
            kind={props.kind}
            palette={props.palette}
            view={{ ...look(), speed: props.settings.speed, fps: props.settings.fps }}
            still={!moving()}
            held={held()}
            reduced={holdsStill()}
            onLive={setCovered}
          />
        </Loading>
      </Show>
    </div>
  );
}
