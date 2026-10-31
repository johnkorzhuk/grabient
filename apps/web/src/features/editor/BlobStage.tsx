import type { BlobView } from "@grabient/engine/blob.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type BlobPlayer, playBlob } from "@grabient/ui/blob-player.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./BlobStage.module.css";
import { stillPainted } from "./painted.ts";

/** How long the canvas takes to fade in or out over the still (GlassStage.module.css). */
const FADE_MS = 700;

/* The picture's blob playing: the WebGL player over the blob's still (BlobLayer.tsx), loaded once the page is live. It
   fades its canvas in once its first frame, the still's own, is drawn; at speed 0 it fades out to the still, and then
   goes back to that frame, so the motion picks up from the still again as it did at first. `held` (the palette or the
   look changing) shows the canvas over a still blob too, at once, since its frame is the still's own. `onLive` hears
   whether the canvas covers the still. */
export function BlobStage(props: {
  palette: Palette;
  view: BlobView;
  still: boolean;
  held: boolean;
  onLive: (live: boolean) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const [drawn, setDrawn] = createSignal(false);
  const shown = () => drawn() && (!props.still || props.held);
  let player: BlobPlayer | null = null;
  let rewinding: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => {
    let gone = false;
    /* its context once the still is painted, which it would otherwise wait on (painted.ts) */
    void stillPainted().then(() => {
      if (gone) return;
      player = playBlob(
        canvas,
        untrack(() => props.palette),
        untrack(() => props.view),
        /* a frame after the canvas came: its first frame can be drawn in the frame it comes in, and a canvas shown
           before it was ever drawn hidden would not fade in */
        () => requestAnimationFrame(() => setDrawn(true))
      );
    });
    return () => {
      gone = true;
      clearTimeout(rewinding);
      player?.destroy();
      player = null;
      props.onLive(false);
    };
  });
  createEffect(shown, on => {
    props.onLive(on);
    clearTimeout(rewinding);
    if (!on) rewinding = setTimeout(() => player?.rewind(), FADE_MS);
  });
  onCleanup(() => clearTimeout(rewinding));
  createEffect(
    () => [props.palette, props.view] as const,
    ([palette, view]) => {
      player?.set(palette, view);
    }
  );
  return (
    <canvas
      ref={canvas}
      class={styles.canvas}
      data-live={shown() ? "" : undefined}
      data-held={props.held && props.still ? "" : undefined}
    />
  );
}
