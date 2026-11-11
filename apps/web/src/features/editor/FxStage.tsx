import { EFFECT_KINDS, type VectorKind } from "@grabient/engine/effect.ts";
import { kitRecord } from "@grabient/engine/kit/kinds.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { EffectPlayer, PlayOptions } from "@grabient/ui/effect-loop.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { type FxPlay, kitPlayer } from "./fx-draw.ts";
import styles from "./GlassStage.module.css";
import { holdGpu, stillPainted } from "./painted.ts";

/** A vector effect's player, as each kind's module names its own: they play alike (ui/effect-loop.ts). */
type FxPlayer = (
  canvas: HTMLCanvasElement,
  palette: Palette,
  view: FxPlay,
  onFirstFrame?: () => void,
  options?: PlayOptions
) => EffectPlayer<FxPlay> | null;
/* the players: their code alone, asked for as the stage plays one; every vector kind its own, so a kind left out is a
   type error rather than another kind's player */
const players: Record<VectorKind, () => Promise<FxPlayer>> = {
  silk: async () => (await import("@grabient/ui/silk-player.ts")).playSilk,
  rosette: async () => (await import("@grabient/ui/rosette-player.ts")).playRosette,
  papercut: async () => (await import("@grabient/ui/papercut-player.ts")).playPapercut,
  strings: async () => (await import("@grabient/ui/strings-player.ts")).playStrings,
  dimple: async () => (await import("@grabient/ui/dimple-player.ts")).playDimple,
  aurora: async () => (await import("@grabient/ui/aurora-player.ts")).playAurora,
  ...kitRecord(kind => () => kitPlayer(kind))
};
/** The player of a kind. */
const fxPlayer = (kind: VectorKind): Promise<FxPlayer> => players[kind]();

/** How long the canvas takes to fade in or out over the still (GlassStage.module.css). */
const FADE_MS = 700;

/* A vector effect playing (EFFECT_KINDS): its WebGL player over its still (FxLayer.tsx), loaded once the
   page is live, as the glass's is (GlassStage.tsx). Its first frame is the still's own, to about a level, and its
   canvas fades in only once that frame is drawn, so the still hands over without a seam; where WebGL is missing it
   shows nothing and the still stays. `still` (speed 0) fades it out to the still, and once it has faded the player goes
   back to that frame. A kind whose still stands in for its first frame (the papercut's stepped shadows: effect.ts's
   steppedStill) shows the canvas again once it is back there, its exact first frame over the still, at speed 0 as in
   motion. `held` (the palette or the look changing) shows the canvas over a still picture too, at once. `reduced`
   holds it at its first frame. `onLive` hears whether the canvas covers the still. */
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
  /* the player shows its first frame: it has not moved since it was drawn, or it has been sent back to it */
  const [first, setFirst] = createSignal(true);
  const stepped = EFFECT_KINDS[untrack(() => props.kind)].steppedStill;
  const shown = () => drawn() && (!props.still || props.held || (stepped && first()));
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
  createEffect(
    () => props.still,
    still => {
      if (!still) setFirst(false);
    }
  );
  createEffect(shown, on => {
    props.onLive(on);
    clearTimeout(rewinding);
    if (!on)
      rewinding = setTimeout(() => {
        player?.rewind();
        /* back at its first frame, where it stays while held still */
        if (player && untrack(() => props.still)) setFirst(true);
      }, FADE_MS);
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
