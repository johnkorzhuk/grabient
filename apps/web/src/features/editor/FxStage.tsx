import type { VectorKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { EffectPlayer } from "@grabient/ui/effect-loop.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import type { FxPlay } from "./fx-draw.ts";
import styles from "./GlassStage.module.css";
import { holdGpu, stillPainted } from "./painted.ts";

/* the players: their code alone, asked for as the stage plays one */
const players = {
  silk: () => import("@grabient/ui/silk-player.ts"),
  rosette: () => import("@grabient/ui/rosette-player.ts"),
  papercut: () => import("@grabient/ui/papercut-player.ts")
};
/** The player of a kind. */
async function fxPlayer(kind: VectorKind) {
  return kind === "silk"
    ? (await players.silk()).playSilk
    : kind === "papercut"
      ? (await players.papercut()).playPapercut
      : (await players.rosette()).playRosette;
}

/** How long the canvas takes to fade in or out over the still (GlassStage.module.css). */
const FADE_MS = 700;

/* A vector effect playing (silk, rosette, papercut): its WebGL player over its still (FxLayer.tsx), loaded once the
   page is live, as the glass's is (GlassStage.tsx). Its first frame is the still's own, to about a level, and its
   canvas fades in only once that frame is drawn, so the still hands over without a seam; where WebGL is missing it
   shows nothing and the still stays. `still` (speed 0) fades it out to the still, and once it has faded the player goes back to that
   frame. `held` (the palette or the look changing) shows the canvas over a still picture too, at once. `reduced` holds
   it at its first frame. `onLive` hears whether the canvas covers the still. */
export function FxStage(props: {
  kind: VectorKind;
  palette: Palette;
  view: FxPlay;
  still: boolean;
  held: boolean;
  reduced: boolean;
  onLive: (live: boolean) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const [drawn, setDrawn] = createSignal(false);
  const shown = () => drawn() && (!props.still || props.held);
  let player: EffectPlayer<FxPlay> | null = null;
  let rewinding: ReturnType<typeof setTimeout> | undefined;
  let reduced = untrack(() => props.reduced);
  onSettled(() => {
    let gone = false;
    /* the GPU is the player's until its first frame is drawn and its canvas has faded in (painted.ts) */
    const release = holdGpu();
    const kind = untrack(() => props.kind);
    void Promise.all([stillPainted(), fxPlayer(kind)]).then(([, play]) => {
      if (gone) return;
      player = play(
        canvas,
        untrack(() => props.palette),
        untrack(() => props.view),
        () => {
          setDrawn(true);
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
