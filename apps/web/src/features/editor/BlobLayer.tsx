import { encodePalette } from "@grabient/engine/codec.ts";
import { blobStillKey, type EffectSettings } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
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
import { blobStillBackground, blobViewOf, loadBlob, serverBlobStill } from "./blob-draw.ts";
import styles from "./Editor.module.css";

/* The blob over the picture's gradient, on the page's own ground unless it has one: its still, the first frame as a
   background that fits the box, and the WebGL player over it once the page is live and the blob moves or changes, its
   canvas fading in over the still once its first frame, the still's own, is drawn, and out again to the still at speed
   0. The still is the server's where it shows this palette and this look: the holder names them as the first screen's
   does (Boot.tsx), and the style in the head paints both (server/blob-still.ts), so the editor arriving changes no
   pixel. Otherwise it is drawn here, the same background, once the blob's code has come. A reader who asks for less
   motion keeps the still. While the palette or the look changes the player shows it, over a still blob too, and the
   still is drawn for the last one once they rest, under the canvas, which then fades back to it. */

/* the player is the browser's alone (the page stands live first): the server's build carries none of it */
const BlobStage = lazy(() =>
  (import.meta.env.SSR ? (new Promise(() => {}) as never) : import("./BlobStage.tsx")).then(m => ({
    default: m.BlobStage
  }))
);

/** How long the palette or the look stands before the still is drawn for it under the player, which then lets it
    show. */
const REST_MS = 250;

export function BlobLayer(props: { palette: Palette; settings: EffectSettings; angle: number }) {
  const [live, setLive] = createSignal(false);
  const [covered, setCovered] = createSignal(false);
  const [reduced, setReduced] = createSignal(false);
  /* once the blob has moved or changed its player stays */
  const [kept, setKept] = createSignal(false);
  /* the palette or the look is changing: the player shows it */
  const [held, setHeld] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const moving = () => props.settings.speed > 0 && !reduced();
  /* the canvas and the still change places at once until the canvas has first shown, its first frame being the
     still's own (the layer's data-cut, Editor.module.css), and with a fade from then on */
  const [first, setFirst] = createSignal(true);
  let settling = 0;
  createEffect(covered, on => {
    if (on && untrack(first))
      settling = requestAnimationFrame(() => {
        settling = requestAnimationFrame(() => setFirst(false));
      });
  });
  createEffect(moving, on => {
    if (on) setKept(true);
  });
  let holder!: HTMLDivElement;
  onSettled(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(motion.matches);
    read();
    motion.addEventListener("change", read);
    void loadBlob().then(() => setReady(true));
    setLive(true);
    return () => motion.removeEventListener("change", read);
  });
  const keyOf = (P: Palette, s: EffectSettings, angle: number) =>
    blobStillKey(encodePalette(P), s.look, angle);
  /* the still the holder shows: the server's where the head holds it, else drawn here once the code has come; a name
     is only taken with its picture, so the holder never stands empty between two */
  let shown = "";
  const still = (P: Palette, s: EffectSettings, angle: number) => {
    const key = keyOf(P, s, angle);
    if (key === shown) return;
    if (serverBlobStill(key)) {
      shown = key;
      holder.dataset.blobStill = key;
      holder.style.background = "";
      return;
    }
    const paint = blobStillBackground(P, s, angle);
    if (!paint) return;
    shown = key;
    holder.dataset.blobStill = key;
    holder.style.background = paint;
  };
  /* the still, drawn again as the palette or the look change while it is the picture, once a frame at most */
  let pending = 0;
  createEffect(
    () =>
      covered() || !ready() ? null : { P: props.palette, s: props.settings, angle: props.angle },
    next => {
      if (!next) return;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => still(next.P, next.s, next.angle));
    }
  );
  /* a palette, a look or an angle that changes holds the player over the still until it rests, and the still is drawn
     for the last one under it */
  let resting: ReturnType<typeof setTimeout> | undefined;
  let letting = 0;
  let last: { P: Palette; look: string } | null = null;
  createEffect(
    () => ({ P: props.palette, look: JSON.stringify([props.settings.look, props.angle]) }),
    next => {
      const was = last;
      last = next;
      if (!was || (was.P === next.P && was.look === next.look)) return;
      cancelAnimationFrame(letting);
      clearTimeout(resting);
      setKept(true);
      setHeld(true);
      resting = setTimeout(() => {
        /* under a moving blob the still is never seen, and speed 0 draws it as the canvas fades */
        if (!untrack(moving) && untrack(ready))
          still(
            untrack(() => props.palette),
            untrack(() => props.settings),
            untrack(() => props.angle)
          );
        letting = requestAnimationFrame(() => {
          letting = requestAnimationFrame(() => setHeld(false));
        });
      }, REST_MS);
    }
  );
  onCleanup(() => {
    cancelAnimationFrame(pending);
    cancelAnimationFrame(settling);
    cancelAnimationFrame(letting);
    clearTimeout(resting);
  });
  return (
    <div
      class={styles.blob}
      aria-hidden="true"
      data-covered={covered() ? "" : undefined}
      data-cut={first() || (held() && !moving()) ? "" : undefined}
    >
      <div
        ref={el => {
          holder = el;
          /* the still at once: the server's where it drew this one, else drawn here where the code has come (a blob
             page asks for it with the editor's), so the holder stands painted from its first frame */
          untrack(() => still(props.palette, props.settings, props.angle));
        }}
        class={styles.glassStill}
      />
      <Show when={live() && kept()}>
        <Loading>
          <BlobStage
            palette={props.palette}
            view={blobViewOf(props.settings, props.angle)}
            still={!moving()}
            held={held()}
            onLive={setCovered}
          />
        </Loading>
      </Show>
    </div>
  );
}
