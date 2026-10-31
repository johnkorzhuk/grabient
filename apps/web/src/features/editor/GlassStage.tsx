import type { GlassView } from "@grabient/engine/glass.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type GlassPlayer, playGlass } from "@grabient/ui/glass-player.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./GlassStage.module.css";

/** How long the canvas takes to fade in or out over the still (GlassStage.module.css). */
const FADE_MS = 700;

/* The picture's fluted glass playing: the WebGL player, over the glass's still (GlassLayer.tsx), loaded once the page
   is live. It draws the still's frame (to about a level) first and fades its canvas in only once that frame is drawn,
   so the still hands over without a seam; where WebGL is missing it shows nothing and the still stays. `still` (speed
   0) fades it out to the still, the first frame, and once it has faded the player goes back to that frame, so the
   motion picks up from the still again as it did at first. `held` (the palette changing) shows the canvas over a still
   glass too, at once, since its frame is the still's own: a recolor is a frame of the player, where the still is its
   whole filter drawn again. `onLive` hears whether the canvas covers the still. */
export function GlassStage(props: {
  palette: Palette;
  view: GlassView;
  still: boolean;
  held: boolean;
  onLive: (live: boolean) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const [drawn, setDrawn] = createSignal(false);
  const shown = () => drawn() && (!props.still || props.held);
  let player: GlassPlayer | null = null;
  let rewinding: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => {
    player = playGlass(
      canvas,
      untrack(() => props.palette),
      untrack(() => props.view),
      () => setDrawn(true)
    );
    return () => {
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
