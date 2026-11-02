import type { GlassView } from "@grabient/engine/glass.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type GlassPlayer, playGlass } from "@grabient/ui/glass-player.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./GlassStage.module.css";
import { holdGpu, stillPainted } from "./painted.ts";

/** How long the canvas takes to fade in or out over the still (GlassStage.module.css). */
const FADE_MS = 700;

/* The picture's fluted glass playing: the WebGL player, over the glass's still (GlassLayer.tsx), loaded once the page
   is live. It draws the still's frame (to about a level) first and fades its canvas in only once that frame is drawn,
   so the still hands over without a seam; where WebGL is missing it shows nothing and the still stays. `still` (speed
   0) fades it out to the still, the first frame, and once it has faded the player goes back to that frame, so the
   motion picks up from the still again as it did at first. `held` (the palette changing) shows the canvas over a still
   glass too, at once, since its frame is the still's own: a recolor is a frame of the player, where the still is its
   whole filter drawn again. `reduced` holds it at its first frame, the still's. `onLive` hears whether the canvas
   covers the still. */
export function GlassStage(props: {
  palette: Palette;
  view: GlassView;
  still: boolean;
  held: boolean;
  /** the reader asks for less motion: the player holds its first frame, which a held canvas shows */
  reduced: boolean;
  onLive: (live: boolean) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const [drawn, setDrawn] = createSignal(false);
  const shown = () => drawn() && (!props.still || props.held);
  let player: GlassPlayer | null = null;
  let rewinding: ReturnType<typeof setTimeout> | undefined;
  /* what the player reads for the reader's motion, told of each change */
  let reduced = untrack(() => props.reduced);
  onSettled(() => {
    let gone = false;
    /* the GPU is the player's until its first frame is drawn and its canvas has faded in: what can wait for it does
       (painted.ts) */
    const release = holdGpu();
    /* its context once the still is painted, which it would otherwise wait on (painted.ts) */
    void stillPainted().then(() => {
      if (gone) return;
      player = playGlass(
        canvas,
        untrack(() => props.palette),
        untrack(() => props.view),
        () => {
          setDrawn(true);
          /* the frame's work on the GPU is done well before its canvas has faded in */
          setTimeout(release, FADE_MS);
        },
        { reduced: () => reduced }
      );
      if (!player) release();
    });
    return () => {
      gone = true;
      release();
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
    () => props.reduced,
    on => {
      reduced = on;
      player?.motion();
    }
  );
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
